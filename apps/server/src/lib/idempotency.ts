// P1-B2: Idempotency-Key cache with 24h TTL, per-workspace isolation.
//
// Design:
// - Request-hash is a SHA-256 of the raw request body (no S0/S1 stored).
// - Response-body is the exact JSON the API already returned (safety-gated).
// - Path is used as an additional partition so the same key across different
//   endpoints doesn't cross-contaminate.
// - Header name follows RFC draft: Idempotency-Key.
//
// Behavior:
// - HIT + same hash + same path/method → replay cached response (with header).
// - HIT + different hash → 409 conflict.
// - MISS → downstream handler runs; caller must call `storeIdempotent(...)`
//   after producing a successful (2xx) response.

import type { Context, MiddlewareHandler } from "hono";
import { createHash } from "node:crypto";
import { openDb } from "../db/connection.js";
import { conflict, err } from "./response.js";

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const IDEM_HEADER = "Idempotency-Key";
const KEY_PATTERN = /^[A-Za-z0-9._~+/=-]{8,128}$/;

export function hashBody(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

interface CacheRow {
  request_hash: string;
  response_body: string;
  status_code: number;
  expires_at: string;
}

export interface IdempotencyContext {
  key: string;
  requestHash: string;
  method: string;
  path: string;
  rawBody: string;
}

/**
 * Middleware: attach idempotency context to `c.get("idempotency")`.
 * If a matching cached response is found, short-circuits with it.
 * Only wraps POST requests when Idempotency-Key header is present.
 */
export function idempotencyMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method !== "POST") {
      return next();
    }
    const key = c.req.header(IDEM_HEADER);
    if (!key) {
      return next();
    }
    if (!KEY_PATTERN.test(key)) {
      return err(
        c,
        "invalid_input",
        "Idempotency-Key must match [A-Za-z0-9._~+/=-]{8,128}",
        400,
        IDEM_HEADER
      );
    }

    // Only hash JSON bodies. Multipart/form-data (used by /batches) is not
    // safely re-parseable after text() consumes it — those routes fall back to
    // non-idempotent semantics unless the caller sends JSON.
    const contentType = (c.req.header("content-type") ?? "").toLowerCase();
    if (!contentType.startsWith("application/json")) {
      return next();
    }

    // Consume raw body once; downstream handlers use `readJson(c)` to get it.
    const rawBody = await c.req.text();
    const requestHash = hashBody(rawBody);
    const wsId = c.get("workspaceId") as string;
    const path = new URL(c.req.url).pathname;

    const db = openDb(wsId);
    // Prune expired rows (cheap; index on expires_at).
    db.prepare("DELETE FROM idempotency_key WHERE expires_at <= datetime('now')").run();

    const cached = db
      .prepare(
        `SELECT request_hash, response_body, status_code, expires_at
         FROM idempotency_key
         WHERE workspace_id = ? AND method = ? AND path = ? AND key = ?`
      )
      .get(wsId, c.req.method, path, key) as CacheRow | undefined;
    db.close();

    if (cached) {
      if (cached.request_hash !== requestHash) {
        return conflict(
          c,
          "Idempotency-Key already used with a different request payload"
        );
      }
      // Replay: emit the exact cached body & status.
      return new Response(cached.response_body, {
        status: cached.status_code,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "Idempotency-Replay": "true",
        },
      });
    }

    // MISS: keep the raw body on context so the handler can still parse it,
    // and stash idem context for the handler to store on success.
    (c.req as unknown as { _idemRawBody: string })._idemRawBody = rawBody;
    c.set("idempotency", {
      key,
      requestHash,
      method: c.req.method,
      path,
      rawBody,
    } satisfies IdempotencyContext);
    await next();
  };
}

/**
 * After a POST handler produces a successful response, persist it under
 * the idempotency key so replays return the same body.
 * Only stores 2xx responses.
 */
export function storeIdempotent(
  c: Context,
  response: Response,
  resourceId: string | undefined
): Response {
  const ctx = c.get("idempotency") as IdempotencyContext | undefined;
  if (!ctx) return response;
  if (response.status < 200 || response.status >= 300) return response;

  // Response body is a stream; clone before reading so the caller can still return it.
  return cloneAndStore(response, ctx, c.get("workspaceId") as string, resourceId);
}

function cloneAndStore(
  response: Response,
  ctx: IdempotencyContext,
  workspaceId: string,
  resourceId: string | undefined
): Response {
  const [forCaller, forStore] = tapBody(response);

  // Fire-and-forget storage (we don't want to delay the response).
  forStore
    .text()
    .then((body) => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + TTL_MS)
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z");
      const db = openDb(workspaceId);
      db.prepare(
        `INSERT OR REPLACE INTO idempotency_key
         (workspace_id, method, path, key, request_hash, response_body,
          resource_id, status_code, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        workspaceId,
        ctx.method,
        ctx.path,
        ctx.key,
        ctx.requestHash,
        body,
        resourceId ?? null,
        response.status,
        expiresAt
      );
      db.close();
    })
    .catch((error) => {
      // Idempotency storage is best-effort; log but don't fail the request.
      console.error("[idempotency] failed to store:", error);
    });

  return forCaller;
}

function tapBody(response: Response): [Response, Response] {
  // Use .clone() so the original response body is preserved for the caller.
  const cloned = response.clone();
  return [response, cloned];
}

/**
 * Helper for routes that need to read the JSON body after the middleware ran.
 * Falls back to c.req.json() when no idempotency raw body was captured.
 */
export async function readJson<T = unknown>(c: Context): Promise<T> {
  const raw = (c.req as unknown as { _idemRawBody?: string })._idemRawBody;
  if (typeof raw === "string" && raw.length > 0) {
    return JSON.parse(raw) as T;
  }
  return (await c.req.json()) as T;
}

import { Hono } from "hono";
import type { Context } from "hono";
import { openDb } from "../db/connection.js";
import { ok, notFound, invalidInput, err, conflict } from "../lib/response.js";
import { writeAudit } from "../lib/audit.js";
import { hashBody, idempotencyMiddleware, readJson, storeIdempotent } from "../lib/idempotency.js";
import {
  buildAgentCandidates,
  createSubagent,
  deleteSubagent,
  deriveSubagentFromChannelObject,
  getSubagentById,
  listSubagents,
  runSimulatedMarket,
  toTargetUserAgent,
  updateSubagent,
  type CreateSubagentInput,
  type SimulatedMarketSubagent,
  type UpdateSubagentInput,
  type SimulationRun,
  type SimulatedMarketInput,
  type TargetAgentSourceType,
  type TargetUserAgent,
} from "../services/simulated-market-adapter.js";

const simulatedMarket = new Hono();

const VALID_AGENT_SOURCE_TYPES: TargetAgentSourceType[] = [
  "three_audience_segment",
  "manual_persona",
  "saved_subagent",
  "channel_audience_profile",
];

const CREATE_SUBAGENT_SOURCE_TYPES: TargetAgentSourceType[] = [
  "manual_persona",
  "saved_subagent",
  "channel_audience_profile",
];

function makeRunId(): string {
  return `sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function parseResult(raw: unknown): SimulationRun["result"] {
  if (raw === null || raw === undefined) return undefined;
  const str = String(raw);
  if (str === "" || str === "null") return undefined;
  return JSON.parse(str) as SimulationRun["result"];
}

function rowToRun(row: Record<string, unknown>): SimulationRun {
  return {
    runId: row.run_id as string,
    workspaceId: row.workspace_id as string,
    status: row.status as SimulationRun["status"],
    inputSnapshot: JSON.parse(row.input_snapshot as string),
    result: parseResult(row.result),
    provider: row.provider as string,
    modelVersion: row.model_version as string,
    generatedAt: row.generated_at as string,
    qualityFlags: JSON.parse(row.quality_flags as string),
  };
}

function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const IDEM_KEY_PATTERN = /^[A-Za-z0-9._~+/=-]{8,128}$/;
const IDEM_TTL_MS = 24 * 60 * 60 * 1000;

async function readIdempotencyCache(
  wsId: string,
  method: string,
  path: string,
  key: string
): Promise<{ cached: string; statusCode: number } | null> {
  const db = openDb(wsId);
  try {
    try {
      db.prepare("DELETE FROM idempotency_key WHERE expires_at <= datetime('now')").run();
    } catch { /* table may not exist */ }
    const row = db
      .prepare(
        `SELECT response_body, status_code FROM idempotency_key
         WHERE workspace_id = ? AND method = ? AND path = ? AND key = ?`
      )
      .get(wsId, method, path, key) as { response_body: string; status_code: number } | undefined;
    return row ? { cached: row.response_body, statusCode: row.status_code } : null;
  } finally {
    db.close();
  }
}

async function checkIdempotencyConflict(
  wsId: string,
  method: string,
  path: string,
  key: string,
  requestHash: string
): Promise<boolean> {
  const db = openDb(wsId);
  try {
    const row = db
      .prepare(
        `SELECT request_hash FROM idempotency_key
         WHERE workspace_id = ? AND method = ? AND path = ? AND key = ?`
      )
      .get(wsId, method, path, key) as { request_hash: string } | undefined;
    return row ? row.request_hash !== requestHash : false;
  } finally {
    db.close();
  }
}

function storeIdempotencyCache(
  wsId: string,
  method: string,
  path: string,
  key: string,
  requestHash: string,
  responseBody: string,
  statusCode: number,
  resourceId?: string
): void {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + IDEM_TTL_MS)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
  const db = openDb(wsId);
  try {
    db.prepare(
      `INSERT OR REPLACE INTO idempotency_key
       (workspace_id, method, path, key, request_hash, response_body,
        resource_id, status_code, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(wsId, method, path, key, requestHash, responseBody, resourceId ?? null, statusCode, expiresAt);
  } finally {
    db.close();
  }
}

async function handleIdempotentWrite(
  c: Context,
  handler: () => Promise<Response> | Response
): Promise<Response> {
  const key = c.req.header("Idempotency-Key");
  if (!key) return handler();
  if (!IDEM_KEY_PATTERN.test(key)) {
    return invalidInput(c, "Idempotency-Key must match [A-Za-z0-9._~+/=-]{8,128}", "Idempotency-Key");
  }

  const method = c.req.method;
  const wsId = c.get("workspaceId") as string;
  const path = new URL(c.req.url).pathname;

  // For POST/PATCH, require JSON body. For DELETE, body is optional.
  const contentType = (c.req.header("content-type") ?? "").toLowerCase();
  const hasJsonBody = contentType.startsWith("application/json");

  if (method !== "DELETE" && !hasJsonBody) {
    return handler();
  }

  // Read request body (empty string for DELETE without body)
  let rawBody = "";
  if (method !== "DELETE") {
    rawBody = await c.req.text();
  }
  const requestHash = hashBody(rawBody);

  // Check for conflict (different body, same key)
  const isConflict = await checkIdempotencyConflict(wsId, method, path, key, requestHash);
  if (isConflict) {
    return conflict(c, "Idempotency-Key already used with a different request payload");
  }

  // Check for cache hit
  const cached = await readIdempotencyCache(wsId, method, path, key);
  if (cached) {
    return new Response(cached.cached, {
      status: cached.statusCode,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "Idempotency-Replay": "true",
      },
    });
  }

  // Cache miss: run handler and get response
  if (method !== "DELETE") {
    (c.req as unknown as { _idemRawBody: string })._idemRawBody = rawBody;
  }
  const response = await handler();

  // Store successful responses synchronously before returning
  if (response.status >= 200 && response.status < 300) {
    const cloned = response.clone();
    const bodyText = await cloned.text();
    storeIdempotencyCache(wsId, method, path, key, requestHash, bodyText, response.status);
  }

  return response;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validateProfile(value: unknown): TargetUserAgent["profile"] {
  if (!isRecord(value)) {
    throw new Error("profile must be an object");
  }
  const profile = value as TargetUserAgent["profile"];
  if (profile.demographics !== undefined && !isStringArray(profile.demographics)) {
    throw new Error("profile.demographics must be an array of strings");
  }
  if (profile.preferences !== undefined && !isStringArray(profile.preferences)) {
    throw new Error("profile.preferences must be an array of strings");
  }
  if (profile.concerns !== undefined && !isStringArray(profile.concerns)) {
    throw new Error("profile.concerns must be an array of strings");
  }
  if (profile.decisionFactors !== undefined && !isStringArray(profile.decisionFactors)) {
    throw new Error("profile.decisionFactors must be an array of strings");
  }
  return profile;
}

function validateCreateSubagent(body: unknown): CreateSubagentInput {
  if (!isRecord(body)) {
    throw new Error("request body must be a JSON object");
  }
  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    throw new Error("name is required and must be a non-empty string");
  }
  const profile = validateProfile(body.profile);

  const input: CreateSubagentInput = {
    name: body.name.trim(),
    profile,
  };

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      throw new Error("enabled must be a boolean");
    }
    input.enabled = body.enabled;
  }
  if (body.persona !== undefined) {
    if (typeof body.persona !== "string") {
      throw new Error("persona must be a string");
    }
    input.persona = body.persona;
  }
  if (body.sourceType !== undefined) {
    if (!CREATE_SUBAGENT_SOURCE_TYPES.includes(body.sourceType as TargetAgentSourceType)) {
      throw new Error(
        `Invalid sourceType: ${body.sourceType}; allowed values: ${CREATE_SUBAGENT_SOURCE_TYPES.join(", ")}`
      );
    }
    input.sourceType = body.sourceType as TargetAgentSourceType;
  }
  if (body.sourceRef !== undefined) {
    if (!isRecord(body.sourceRef)) {
      throw new Error("sourceRef must be an object");
    }
    input.sourceRef = body.sourceRef as TargetUserAgent["sourceRef"];
  }
  if (body.weight !== undefined) {
    if (typeof body.weight !== "number" || !Number.isFinite(body.weight)) {
      throw new Error("weight must be a finite number");
    }
    input.weight = body.weight;
  }

  return input;
}

function validateUpdateSubagent(body: unknown): UpdateSubagentInput {
  if (!isRecord(body)) {
    throw new Error("request body must be a JSON object");
  }

  const input: UpdateSubagentInput = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      throw new Error("name must be a non-empty string");
    }
    input.name = body.name.trim();
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      throw new Error("enabled must be a boolean");
    }
    input.enabled = body.enabled;
  }
  if (body.persona !== undefined) {
    if (typeof body.persona !== "string") {
      throw new Error("persona must be a string");
    }
    input.persona = body.persona;
  }
  if (body.profile !== undefined) {
    input.profile = validateProfile(body.profile);
  }
  if (body.weight !== undefined) {
    if (typeof body.weight !== "number" || !Number.isFinite(body.weight)) {
      throw new Error("weight must be a finite number");
    }
    input.weight = body.weight;
  }

  return input;
}

function validateFromChannelObject(body: unknown): {
  canonicalObjectKey: string;
  profileId?: string;
  name?: string;
  enabled?: boolean;
} {
  if (!isRecord(body)) {
    throw new Error("request body must be a JSON object");
  }
  if (typeof body.canonicalObjectKey !== "string" || body.canonicalObjectKey.trim().length === 0) {
    throw new Error("canonicalObjectKey is required and must be a non-empty string");
  }
  const input: ReturnType<typeof validateFromChannelObject> = {
    canonicalObjectKey: body.canonicalObjectKey.trim(),
  };
  if (body.profileId !== undefined) {
    if (typeof body.profileId !== "string") {
      throw new Error("profileId must be a string");
    }
    input.profileId = body.profileId;
  }
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      throw new Error("name must be a non-empty string");
    }
    input.name = body.name.trim();
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      throw new Error("enabled must be a boolean");
    }
    input.enabled = body.enabled;
  }
  return input;
}

function subagentToResponse(subagent: SimulatedMarketSubagent): Record<string, unknown> {
  return {
    agentId: subagent.agentId,
    name: subagent.name,
    enabled: subagent.enabled,
    persona: subagent.persona ?? null,
    profile: subagent.profile,
    sourceType: subagent.sourceType,
    sourceRef: subagent.sourceRef ?? null,
    weight: subagent.weight ?? null,
    createdAt: subagent.createdAt,
    updatedAt: subagent.updatedAt,
  };
}

// GET /simulated-market/agent-templates
simulatedMarket.get("/agent-templates", (c) => {
  const wsId = c.get("workspaceId") as string;
  const db = openDb(wsId);
  try {
    const candidates = buildAgentCandidates(db, wsId);
    return ok(c, { agents: candidates.templates, subagents: candidates.subagents });
  } finally {
    db.close();
  }
});

// GET /simulated-market/subagents
simulatedMarket.get("/subagents", (c) => {
  const wsId = c.get("workspaceId") as string;
  const enabledRaw = c.req.query("enabled");
  const enabled = enabledRaw === undefined ? undefined : enabledRaw === "true";

  const db = openDb(wsId);
  try {
    const items = listSubagents(db, wsId, { enabled });
    return ok(c, { items: items.map(subagentToResponse) });
  } finally {
    db.close();
  }
});

// GET /simulated-market/subagents/:agentId
simulatedMarket.get("/subagents/:agentId", (c) => {
  const wsId = c.get("workspaceId") as string;
  const agentId = c.req.param("agentId");

  const db = openDb(wsId);
  let subagent: SimulatedMarketSubagent | null;
  try {
    subagent = getSubagentById(db, wsId, agentId);
  } finally {
    db.close();
  }

  if (!subagent) return notFound(c, `Subagent ${agentId} not found`);
  return ok(c, subagentToResponse(subagent));
});

// POST /simulated-market/subagents
simulatedMarket.post("/subagents", idempotencyMiddleware(), async (c) => {
  const wsId = c.get("workspaceId") as string;
  const requestId = (c.get("requestId") as string) ?? "";

  let body: unknown;
  try {
    body = await readJson<unknown>(c);
  } catch {
    return invalidInput(c, "request body must be valid JSON");
  }

  let input: CreateSubagentInput;
  try {
    input = validateCreateSubagent(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return invalidInput(c, message);
  }

  const db = openDb(wsId);
  let subagent: SimulatedMarketSubagent;
  try {
    subagent = createSubagent(db, wsId, input);
    writeAudit(db, {
      workspaceId: wsId,
      actor: "api",
      requestId,
      resourceType: "simulated_market_subagent",
      resourceId: subagent.agentId,
      event: "create",
      meta: {
        sourceType: subagent.sourceType,
        sourceRef: subagent.sourceRef,
      },
    });
  } finally {
    db.close();
  }

  return storeIdempotent(c, ok(c, subagentToResponse(subagent)), subagent.agentId);
});

// PATCH /simulated-market/subagents/:agentId
simulatedMarket.patch("/subagents/:agentId", async (c) => {
  return handleIdempotentWrite(c, async () => {
    const wsId = c.get("workspaceId") as string;
    const agentId = c.req.param("agentId");
    const requestId = (c.get("requestId") as string) ?? "";

    let body: unknown;
    try {
      body = await readJson<unknown>(c);
    } catch {
      return invalidInput(c, "request body must be valid JSON");
    }

    let input: UpdateSubagentInput;
    try {
      input = validateUpdateSubagent(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return invalidInput(c, message);
    }

    const db = openDb(wsId);
    let subagent: SimulatedMarketSubagent | null;
    try {
      subagent = updateSubagent(db, wsId, agentId, input);
      if (subagent) {
        writeAudit(db, {
          workspaceId: wsId,
          actor: "api",
          requestId,
          resourceType: "simulated_market_subagent",
          resourceId: agentId,
          event: "update",
          meta: { updatedFields: Object.keys(input) },
        });
      }
    } finally {
      db.close();
    }

    if (!subagent) return notFound(c, `Subagent ${agentId} not found`);
    return ok(c, subagentToResponse(subagent));
  });
});

// DELETE /simulated-market/subagents/:agentId
simulatedMarket.delete("/subagents/:agentId", async (c) => {
  return handleIdempotentWrite(c, async () => {
    const wsId = c.get("workspaceId") as string;
    const agentId = c.req.param("agentId");
    const requestId = (c.get("requestId") as string) ?? "";

    const db = openDb(wsId);
    let deleted: boolean;
    try {
      deleted = deleteSubagent(db, wsId, agentId);
      if (deleted) {
        writeAudit(db, {
          workspaceId: wsId,
          actor: "api",
          requestId,
          resourceType: "simulated_market_subagent",
          resourceId: agentId,
          event: "delete",
        });
      }
    } finally {
      db.close();
    }

    if (!deleted) return notFound(c, `Subagent ${agentId} not found`);
    return ok(c, { agentId, deleted: true });
  });
});

// POST /simulated-market/subagents/from-channel-object
simulatedMarket.post("/subagents/from-channel-object", idempotencyMiddleware(), async (c) => {
  const wsId = c.get("workspaceId") as string;
  const requestId = (c.get("requestId") as string) ?? "";

  let body: unknown;
  try {
    body = await readJson<unknown>(c);
  } catch {
    return invalidInput(c, "request body must be valid JSON");
  }

  let input: ReturnType<typeof validateFromChannelObject>;
  try {
    input = validateFromChannelObject(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return invalidInput(c, message);
  }

  const db = openDb(wsId);
  let subagent: SimulatedMarketSubagent | null;
  try {
    subagent = deriveSubagentFromChannelObject(db, wsId, input);
    if (subagent) {
      writeAudit(db, {
        workspaceId: wsId,
        actor: "api",
        requestId,
        resourceType: "simulated_market_subagent",
        resourceId: subagent.agentId,
        event: "create",
        meta: {
          sourceType: subagent.sourceType,
          sourceRef: subagent.sourceRef,
          derivedFrom: "channel_audience_profile",
        },
      });
    }
  } finally {
    db.close();
  }

  if (!subagent) {
    return err(
      c,
      "unprocessable",
      `No audience profile available for channel object ${input.canonicalObjectKey}`,
      422
    );
  }

  return storeIdempotent(c, ok(c, subagentToResponse(subagent)), subagent.agentId);
});

// POST /simulated-market/runs
simulatedMarket.post("/runs", idempotencyMiddleware(), async (c) => {
  const wsId = c.get("workspaceId") as string;
  const requestId = (c.get("requestId") as string) ?? "";

  let body: SimulatedMarketInput;
  try {
    body = await readJson<SimulatedMarketInput>(c);
  } catch {
    return invalidInput(c, "request body must be valid JSON");
  }

  const runId = makeRunId();
  const generatedAt = nowIso();

  let run: SimulationRun;
  try {
    run = await runSimulatedMarket(body, { workspaceId: wsId, runId, generatedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return invalidInput(c, message);
  }

  const db = openDb(wsId);
  try {
    db.prepare(
      `INSERT INTO simulation_run (run_id, workspace_id, status, input_snapshot, result,
        provider, model_version, quality_flags, generated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      run.runId,
      run.workspaceId,
      run.status,
      JSON.stringify(run.inputSnapshot),
      run.result === undefined ? null : JSON.stringify(run.result),
      run.provider,
      run.modelVersion,
      JSON.stringify(run.qualityFlags),
      run.generatedAt
    );

    writeAudit(db, {
      workspaceId: wsId,
      actor: "api",
      requestId,
      resourceType: "simulated_market_run",
      resourceId: run.runId,
      event: "create",
      meta: {
        provider: run.provider,
        modelVersion: run.modelVersion,
        qualityFlags: run.qualityFlags,
      },
    });
  } finally {
    db.close();
  }

  return storeIdempotent(c, ok(c, run), run.runId);
});

// GET /simulated-market/runs
simulatedMarket.get("/runs", (c) => {
  const wsId = c.get("workspaceId") as string;
  const cursor = c.req.query("cursor");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);

  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params: (string | number | null)[] = [wsId];

  if (cursor) {
    conditions.push("generated_at < ?");
    params.push(cursor);
  }

  const rows = db
    .prepare(
      `SELECT * FROM simulation_run
       WHERE ${conditions.join(" AND ")}
       ORDER BY generated_at DESC
       LIMIT ?`
    )
    .all(...params, pageSize + 1) as Array<Record<string, unknown>>;

  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map(rowToRun);

  db.close();
  return ok(c, {
    items,
    page: {
      cursor: null,
      nextCursor: hasMore ? (items[items.length - 1]?.generatedAt) ?? null : null,
      pageSize,
      hasMore,
    },
  });
});

// GET /simulated-market/runs/:runId
simulatedMarket.get("/runs/:runId", (c) => {
  const wsId = c.get("workspaceId") as string;
  const runId = c.req.param("runId");

  const db = openDb(wsId);
  const row = db
    .prepare("SELECT * FROM simulation_run WHERE run_id = ? AND workspace_id = ?")
    .get(runId, wsId) as Record<string, unknown> | undefined;
  db.close();

  if (!row) return notFound(c, `Simulation run ${runId} not found`);
  return ok(c, rowToRun(row));
});

export default simulatedMarket;

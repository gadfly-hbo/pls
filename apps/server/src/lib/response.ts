import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface ApiResponse<T = unknown> {
  code: string;
  requestId: string;
  generatedAt: string;
  data?: T;
  error?: {
    message: string;
    field?: string;
    hint?: string;
  };
}

export interface PageInfo {
  cursor: string | null;
  nextCursor: string | null;
  pageSize: number;
  hasMore: boolean;
}

export interface ListResponse<T> {
  items: T[];
  page: PageInfo;
}

function requestId(c: Context): string {
  return (c.get("requestId") as string) ?? (c.req.header("X-PLS-Request-Id") as string) ?? `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200): Response {
  return c.json(
    { code: "ok", requestId: requestId(c), generatedAt: now(), data },
    status
  );
}

export function accepted(c: Context, data: unknown): Response {
  return c.json(
    { code: "accepted", requestId: requestId(c), generatedAt: now(), data },
    202
  );
}

export function err(
  c: Context,
  code: string,
  message: string,
  status: ContentfulStatusCode,
  field?: string,
  hint?: string
): Response {
  return c.json(
    {
      code,
      requestId: requestId(c),
      generatedAt: now(),
      error: { message, ...(field ? { field } : {}), ...(hint ? { hint } : {}) },
    },
    status
  );
}

// Common error helpers
export const notFound = (c: Context, message: string) =>
  err(c, "not_found", message, 404);

export const invalidInput = (c: Context, message: string, field?: string) =>
  err(c, "invalid_input", message, 400, field);

export const unauthorized = (c: Context) =>
  err(c, "unauthorized", "invalid or missing token", 401);

export const conflict = (c: Context, message: string) =>
  err(c, "conflict", message, 409);

export const taxonomyViolation = (c: Context, message: string, field?: string) =>
  err(c, "taxonomy_violation", message, 422, field);

export const dependencyFailed = (c: Context, message: string) =>
  err(c, "dependency_failed", message, 424);

export const internalError = (c: Context, message: string) =>
  err(c, "internal_error", message, 500);

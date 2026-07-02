import type { Context, Next } from "hono";

export async function requestId(c: Context, next: Next) {
  const id = (c.req.header("X-PLS-Request-Id") as string) ?? `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  c.set("requestId", id);
  await next();
}

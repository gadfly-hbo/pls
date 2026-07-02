import type { Context, Next } from "hono";
import { unauthorized } from "../lib/response.js";

const STATIC_TOKEN = "pls-p0-demo-token";

export async function auth(c: Context, next: Next) {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return unauthorized(c);
  }
  const token = header.slice(7);
  if (token !== STATIC_TOKEN) {
    return unauthorized(c);
  }
  await next();
}

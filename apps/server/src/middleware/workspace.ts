import type { Context, Next } from "hono";
import { invalidInput } from "../lib/response.js";

export async function workspace(c: Context, next: Next) {
  const wsId = c.req.header("X-PLS-Workspace");
  if (!wsId) {
    return invalidInput(c, "X-PLS-Workspace header is required", "workspaceId");
  }
  c.set("workspaceId", wsId);
  await next();
}

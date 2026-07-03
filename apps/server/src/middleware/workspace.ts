import type { Context, Next } from "hono";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { invalidInput } from "../lib/response.js";

export async function workspace(c: Context, next: Next) {
  const wsId = c.req.header("X-PLS-Workspace");
  if (!wsId) {
    return invalidInput(c, "X-PLS-Workspace header is required", "workspaceId");
  }
  // Ensure workspace directory exists so new workspaces can be used immediately.
  const wsDir = resolve(import.meta.dirname, "../../../../data/workspaces", wsId);
  mkdirSync(wsDir, { recursive: true });
  c.set("workspaceId", wsId);
  await next();
}

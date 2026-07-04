import { Hono, type Context, type Next } from "hono";
import { ok, notFound, invalidInput, internalError, unauthorized } from "../lib/response.js";
import { listTools, getTool } from "../lib/tools/registry.js";
import { runTool, dryRunTool, type RunOptions } from "../lib/tools/runner.js";
import {
  listRuns,
  readRunManifest,
  readArtifact,
  isSafeArtifactId,
} from "../lib/tools/types.js";
import { dryRunToolPackageImpact, executeToolPackage } from "../lib/import-tool-packages.js";
import { openDb } from "../db/connection.js";
import {
  idempotencyMiddleware,
  storeIdempotent,
  readJson,
} from "../lib/idempotency.js";

const tools = new Hono();

const ADMIN_TOKEN = "pls-admin-token";

function adminTokenRequired() {
  return async (c: Context, next: Next) => {
    if (c.req.header("X-PLS-Admin-Token") !== ADMIN_TOKEN) {
      return unauthorized(c);
    }
    await next();
  };
}

function requireIdempotencyKey(c: Context) {
  if (!c.req.header("Idempotency-Key")) {
    return invalidInput(c, "Idempotency-Key header is required for imports", "Idempotency-Key");
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET /tools
// ---------------------------------------------------------------------------
tools.get("/", (c) => {
  return ok(c, { tools: listTools() });
});

// ---------------------------------------------------------------------------
// POST /tools/runs/dry-run
// ---------------------------------------------------------------------------
tools.post("/runs/dry-run", async (c) => {
  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json();
  } catch {
    return invalidInput(c, "request body must be valid JSON", "body");
  }

  const toolId = body.toolId;
  if (typeof toolId !== "string" || toolId.length === 0) {
    return invalidInput(c, "toolId is required", "toolId");
  }

  const tool = getTool(toolId);
  if (!tool) {
    return notFound(c, `tool "${toolId}" not found`);
  }

  const opts: RunOptions = {
    toolId,
    workspaceId: c.get("workspaceId"),
    parameters:
      typeof body.parameters === "object" && body.parameters !== null
        ? (body.parameters as Record<string, unknown>)
        : {},
    inputPath: typeof body.inputPath === "string" ? body.inputPath : undefined,
    requestId: c.get("requestId"),
    actor: "tools-api",
    dryRun: true,
  };

  try {
    const plan = dryRunTool(opts);
    return ok(c, plan);
  } catch (err) {
    return internalError(c, err instanceof Error ? err.message : String(err));
  }
});

// ---------------------------------------------------------------------------
// POST /tools/runs
// ---------------------------------------------------------------------------
tools.post("/runs", async (c) => {
  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json();
  } catch {
    return invalidInput(c, "request body must be valid JSON", "body");
  }

  const toolId = body.toolId;
  if (typeof toolId !== "string" || toolId.length === 0) {
    return invalidInput(c, "toolId is required", "toolId");
  }

  const tool = getTool(toolId);
  if (!tool) {
    return notFound(c, `tool "${toolId}" not found`);
  }

  const opts: RunOptions = {
    toolId,
    workspaceId: c.get("workspaceId"),
    parameters:
      typeof body.parameters === "object" && body.parameters !== null
        ? (body.parameters as Record<string, unknown>)
        : {},
    inputPath: typeof body.inputPath === "string" ? body.inputPath : undefined,
    requestId: c.get("requestId"),
    actor: "tools-api",
  };

  try {
    const { run } = await runTool(opts);
    return ok(c, { run });
  } catch (err) {
    return internalError(c, err instanceof Error ? err.message : String(err));
  }
});

// ---------------------------------------------------------------------------
// GET /tools/runs
// ---------------------------------------------------------------------------
tools.get("/runs", (c) => {
  return ok(c, { runs: listRuns(c.get("workspaceId")) });
});

// ---------------------------------------------------------------------------
// GET /tools/runs/:runId
// ---------------------------------------------------------------------------
tools.get("/runs/:runId", (c) => {
  const runId = c.req.param("runId");
  const run = readRunManifest(runId);
  if (!run || run.workspaceId !== c.get("workspaceId")) {
    return notFound(c, `run "${runId}" not found`);
  }
  return ok(c, { run });
});

// ---------------------------------------------------------------------------
// GET /tools/runs/:runId/artifacts
// ---------------------------------------------------------------------------
tools.get("/runs/:runId/artifacts", (c) => {
  const runId = c.req.param("runId");
  const run = readRunManifest(runId);
  if (!run || run.workspaceId !== c.get("workspaceId")) {
    return notFound(c, `run "${runId}" not found`);
  }
  return ok(c, { artifacts: run.artifacts });
});

// ---------------------------------------------------------------------------
// GET /tools/runs/:runId/artifacts/:artifactId
// ---------------------------------------------------------------------------
tools.get("/runs/:runId/artifacts/:artifactId", (c) => {
  const runId = c.req.param("runId");
  const artifactId = c.req.param("artifactId");

  if (!isSafeArtifactId(artifactId)) {
    return invalidInput(c, "invalid artifactId", "artifactId");
  }

  const artifact = readArtifact(runId, artifactId, c.get("workspaceId"));
  if (!artifact) {
    return notFound(c, `artifact "${artifactId}" not found for run "${runId}"`);
  }

  return c.body(new Uint8Array(artifact.buffer), 200, {
    "content-type": artifact.artifact.contentType,
  });
});

// ---------------------------------------------------------------------------
// POST /tools/runs/:runId/import-dry-run
// ---------------------------------------------------------------------------
tools.post("/runs/:runId/import-dry-run", async (c) => {
  const runId = c.req.param("runId");
  try {
    const impact = dryRunToolPackageImpact(runId, c.get("workspaceId"));
    return ok(c, impact);
  } catch (err) {
    return invalidInput(c, err instanceof Error ? err.message : String(err), "runId");
  }
});

// ---------------------------------------------------------------------------
// POST /tools/runs/:runId/import
// Requires admin token, Idempotency-Key, and confirmText.
// ---------------------------------------------------------------------------
tools.post(
  "/runs/:runId/import",
  adminTokenRequired(),
  idempotencyMiddleware(),
  async (c) => {
    const idemErr = requireIdempotencyKey(c);
    if (idemErr) return idemErr;

    const runId = c.req.param("runId");
    const wsId = c.get("workspaceId");
    const body = await readJson<{ confirmText?: string }>(c);

    let impact: ReturnType<typeof dryRunToolPackageImpact>;
    try {
      impact = dryRunToolPackageImpact(runId, wsId);
    } catch (err) {
      return invalidInput(c, err instanceof Error ? err.message : String(err), "runId");
    }

    const expectedConfirm = impact.requiredConfirmText;
    if (body.confirmText !== expectedConfirm) {
      return invalidInput(c, `confirmText required: must be exactly "${expectedConfirm}"`, "confirmText");
    }

    const db = openDb(wsId);
    try {
      const result = executeToolPackage(db, wsId, runId);
      const response = ok(c, {
        operation: "import",
        status: "success",
        auditId: result.auditId,
        beforeSnapshot: { tableRowCounts: Object.fromEntries(result.tables.map((t) => [t.name, 0])), totalRows: 0 },
        afterSnapshot: result.afterSnapshot,
        warnings: result.warnings,
        jobId: result.jobId,
      });
      return storeIdempotent(c, response, result.jobId);
    } catch (err) {
      return internalError(c, err instanceof Error ? err.message : String(err));
    } finally {
      db.close();
    }
  }
);

// ---------------------------------------------------------------------------
// GET /tools/:toolId
// Must be registered after the /runs routes so "runs" is not treated as a toolId.
// ---------------------------------------------------------------------------
tools.get("/:toolId", (c) => {
  const toolId = c.req.param("toolId");
  const tool = getTool(toolId);
  if (!tool) {
    return notFound(c, `tool "${toolId}" not found`);
  }
  return ok(c, { tool: tool.definition });
});

export default tools;

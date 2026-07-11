import { Hono } from "hono";
import { openDb } from "../db/connection.js";
import { ok, notFound, invalidInput } from "../lib/response.js";
import { writeAudit } from "../lib/audit.js";
import { idempotencyMiddleware, readJson, storeIdempotent } from "../lib/idempotency.js";
import {
  buildAgentTemplates,
  runSimulatedMarket,
  type SimulationRun,
  type SimulatedMarketInput,
} from "../services/simulated-market-adapter.js";

const simulatedMarket = new Hono();

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

// GET /simulated-market/agent-templates
simulatedMarket.get("/agent-templates", (c) => {
  return ok(c, { agents: buildAgentTemplates() });
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

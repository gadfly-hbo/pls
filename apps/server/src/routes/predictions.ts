// P1-B3: /predictions with queued/running/succeeded/failed task states and
// timeout fallback. Zero external queue: the job runs in the same process,
// but detaches from the request when the sync deadline elapses.
import { Hono } from "hono";
import { openDb } from "../db/connection.js";
import { ok, accepted, notFound, invalidInput, dependencyFailed } from "../lib/response.js";
import { writeAudit } from "../lib/audit.js";
import { predictFromSkuRow, type AdaptedProductProfile } from "../services/model-adapter.js";
import { idempotencyMiddleware, readJson, storeIdempotent } from "../lib/idempotency.js";
import { markTask, runWithTimeout, DEFAULT_SYNC_TIMEOUT_MS } from "../lib/worker.js";

const predictions = new Hono();

interface PredictBody {
  skuId?: string;
  mode?: "sync" | "async";
  timeoutMs?: number;
}

// Test hook: NOT part of the public API contract.
// Only honoured when NODE_ENV !== "production", so real deployments can't
// slow themselves down via a client header. Used by smoke tests to force
// the async / timeout-fallback paths deterministically.
const TEST_DELAY_HEADER = "X-PLS-Test-Delay-Ms";

function readTestDelay(header: string | undefined): number | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  if (!header) return undefined;
  const parsed = Number(header);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(parsed, 30_000);
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function makeIds(): { taskId: string; predictionId: string } {
  const t = Date.now();
  const r = Math.random().toString(36).slice(2, 7);
  return { taskId: `task_pred_${t}_${r}`, predictionId: `pred_${t}_${r}` };
}

class PredictionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

interface PredictionResult {
  predictionId: string;
  workspaceId: string;
  skuId: string;
  taskId: string;
  modelVersion: string;
  modelPath: string;
  source: string;
  sourceType: "derived";
  generatedAt: string;
  inputSnapshot: unknown;
  predictedProfileTags: unknown;
  topSegments: unknown;
  qualityFlags: unknown;
  unmappedInputTokens: unknown;
}

// Job body: mark running -> compute -> insert prediction -> mark succeeded.
// Audit trail records only IDs and model version; never raw payload.
async function runPrediction(p: {
  wsId: string;
  skuId: string;
  taskId: string;
  predictionId: string;
  requestId: string;
  simulatedDelayMs?: number;
}): Promise<PredictionResult> {
  markTask(p.wsId, p.taskId, { status: "running", attempt: 1 });

  const db = openDb(p.wsId);
  try {
    const sku = db
      .prepare("SELECT * FROM sku WHERE sku_id = ? AND workspace_id = ?")
      .get(p.skuId, p.wsId) as Record<string, unknown> | undefined;

    if (!sku) {
      markTask(p.wsId, p.taskId, {
        status: "failed",
        error: { code: "not_found", message: `SKU ${p.skuId} not found` },
      });
      writeAudit(db, {
        workspaceId: p.wsId,
        actor: "system:worker",
        requestId: p.requestId,
        taskId: p.taskId,
        resourceType: "prediction",
        event: "fail",
        reasonCode: "not_found",
      });
      throw new PredictionError("not_found", `SKU ${p.skuId} not found`);
    }

    if (p.simulatedDelayMs && p.simulatedDelayMs > 0) {
      await new Promise((r) => setTimeout(r, p.simulatedDelayMs));
    }

    let profile: AdaptedProductProfile;
    try {
      profile = predictFromSkuRow(sku);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      markTask(p.wsId, p.taskId, {
        status: "failed",
        error: { code: "dependency_failed", message },
      });
      writeAudit(db, {
        workspaceId: p.wsId,
        actor: "system:worker",
        requestId: p.requestId,
        taskId: p.taskId,
        resourceType: "prediction",
        event: "fail",
        reasonCode: "dependency_failed",
      });
      throw new PredictionError("dependency_failed", `prediction failed for SKU ${p.skuId}`);
    }

    const now = nowIso();
    const modelVersion = profile.modelVersion;
    db.prepare(`
      INSERT INTO prediction (prediction_id, workspace_id, sku_id, task_id, model_version, model_path,
        source, source_type, generated_at, input_snapshot, predicted_profile_tags, top_segments,
        quality_flags, unmapped_input_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'derived', ?, ?, ?, ?, ?, ?)
    `).run(
      p.predictionId,
      p.wsId,
      p.skuId,
      p.taskId,
      modelVersion,
      profile.modelPath,
      profile.source,
      now,
      JSON.stringify(profile.input),
      JSON.stringify(profile.predictedProfileTags),
      JSON.stringify(profile.topSegments),
      JSON.stringify(profile.qualityFlags),
      JSON.stringify(profile.unmappedInputTokens)
    );

    markTask(p.wsId, p.taskId, { status: "succeeded" });
    writeAudit(db, {
      workspaceId: p.wsId,
      actor: "system:worker",
      requestId: p.requestId,
      taskId: p.taskId,
      resourceType: "prediction",
      resourceId: p.predictionId,
      event: "succeed",
      fromStatus: "running",
      toStatus: "succeeded",
      meta: { modelVersion, modelPath: profile.modelPath },
    });

    return {
      predictionId: p.predictionId,
      workspaceId: p.wsId,
      skuId: p.skuId,
      taskId: p.taskId,
      modelVersion,
      modelPath: profile.modelPath,
      source: profile.source,
      sourceType: profile.sourceType,
      generatedAt: now,
      inputSnapshot: profile.input,
      predictedProfileTags: profile.predictedProfileTags,
      topSegments: profile.topSegments,
      qualityFlags: profile.qualityFlags,
      unmappedInputTokens: profile.unmappedInputTokens,
    };
  } finally {
    db.close();
  }
}

// POST /predictions
predictions.post("/", idempotencyMiddleware(), async (c) => {
  const wsId = c.get("workspaceId") as string;
  const requestId = (c.get("requestId") as string) ?? "";
  const body = await readJson<PredictBody>(c);
  const skuId = body.skuId;
  const mode = body.mode ?? "sync";
  const timeoutMs = Math.max(1, body.timeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS);
  const simulatedDelayMs = readTestDelay(c.req.header(TEST_DELAY_HEADER));

  if (!skuId) return invalidInput(c, "skuId is required", "skuId");

  // Fast preflight: 404 without leaving a queued task row.
  const preflight = openDb(wsId);
  const existing = preflight
    .prepare("SELECT sku_id FROM sku WHERE sku_id = ? AND workspace_id = ?")
    .get(skuId, wsId);
  preflight.close();
  if (!existing) return notFound(c, `SKU ${skuId} not found`);

  const { taskId, predictionId } = makeIds();

  // Persist queued row up-front so GET /tasks/{taskId} works immediately.
  const db = openDb(wsId);
  db.prepare(`
    INSERT INTO task (task_id, workspace_id, task_type, status, resource_id, model_version, input, attempts)
    VALUES (?, ?, 'prediction', 'queued', ?, ?, ?, 0)
  `).run(taskId, wsId, predictionId, "m-p0-baseline-0.1", JSON.stringify({ skuId }));
  writeAudit(db, {
    workspaceId: wsId,
    actor: "system:worker",
    requestId,
    taskId,
    resourceType: "prediction",
    resourceId: predictionId,
    event: "queue",
    toStatus: "queued",
  });
  db.close();

  const job = () =>
    runPrediction({ wsId, skuId, taskId, predictionId, requestId, simulatedDelayMs });

  if (mode === "async") {
    // Detach: 202 immediately, work continues in background.
    job().catch((error) => {
      // Failure already recorded on the task row inside runPrediction; guard
      // against unhandled rejections.
      console.error("[predictions] async job failed:", error);
    });
    return storeIdempotent(
      c,
      accepted(c, {
        task: {
          taskId,
          status: "queued",
          resourceUrl: `/api/v0/predictions/${predictionId}`,
        },
      }),
      predictionId
    );
  }

  // sync mode with timeout fallback.
  const outcome = await runWithTimeout(job, timeoutMs);
  if (outcome.kind === "timeout") {
    // Detach: work continues; the task row will transition without us.
    outcome.work.catch((error) => {
      console.error("[predictions] detached job failed:", error);
    });
    writeAudit(openDb(wsId), {
      workspaceId: wsId,
      actor: "system:worker",
      requestId,
      taskId,
      resourceType: "prediction",
      resourceId: predictionId,
      event: "timeout",
      reasonCode: "sync_timeout",
      meta: { timeoutMs },
    });
    return storeIdempotent(
      c,
      accepted(c, {
        task: {
          taskId,
          status: "queued",
          resourceUrl: `/api/v0/predictions/${predictionId}`,
          fallbackReason: "sync_timeout",
        },
      }),
      predictionId
    );
  }

  // outcome.kind === "done"; unwrap any late error the worker surfaced.
  try {
    const result = await Promise.resolve(outcome.value);
    return storeIdempotent(c, ok(c, result), predictionId);
  } catch (error) {
    if (error instanceof PredictionError && error.code === "not_found") {
      return notFound(c, error.message);
    }
    if (error instanceof PredictionError) {
      return dependencyFailed(c, error.message);
    }
    return dependencyFailed(c, `prediction failed for SKU ${skuId}`);
  }
});

// GET /predictions/:predictionId
predictions.get("/:predictionId", (c) => {
  const wsId = c.get("workspaceId") as string;
  const predictionId = c.req.param("predictionId");
  const db = openDb(wsId);
  const row = db
    .prepare("SELECT * FROM prediction WHERE prediction_id = ? AND workspace_id = ?")
    .get(predictionId, wsId) as Record<string, unknown> | undefined;
  db.close();

  if (!row) return notFound(c, `Prediction ${predictionId} not found`);
  return ok(c, {
    predictionId: row.prediction_id,
    workspaceId: row.workspace_id,
    skuId: row.sku_id,
    taskId: row.task_id,
    modelVersion: row.model_version,
    modelPath: row.model_path,
    source: row.source,
    sourceType: row.source_type,
    generatedAt: row.generated_at,
    inputSnapshot: JSON.parse(row.input_snapshot as string),
    predictedProfileTags: JSON.parse(row.predicted_profile_tags as string),
    topSegments: JSON.parse(row.top_segments as string),
    qualityFlags: JSON.parse(row.quality_flags as string),
    unmappedInputTokens: JSON.parse(row.unmapped_input_tokens as string),
  });
});

// GET /predictions
predictions.get("/", (c) => {
  const wsId = c.get("workspaceId") as string;
  const skuIdFilter = c.req.query("skuId");
  const modelVersion = c.req.query("modelVersion");
  const cursor = c.req.query("cursor");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);

  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params: (string | number | null)[] = [wsId];

  if (skuIdFilter) {
    conditions.push("sku_id = ?");
    params.push(skuIdFilter);
  }
  if (modelVersion) {
    conditions.push("model_version = ?");
    params.push(modelVersion);
  }
  if (cursor) {
    conditions.push("generated_at < ?");
    params.push(cursor);
  }

  const rows = db
    .prepare(
      `SELECT * FROM prediction WHERE ${conditions.join(" AND ")} ORDER BY generated_at DESC LIMIT ?`
    )
    .all(...params, pageSize + 1) as Array<Record<string, unknown>>;

  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map((row) => ({
    predictionId: row.prediction_id,
    workspaceId: row.workspace_id,
    skuId: row.sku_id,
    taskId: row.task_id,
    modelVersion: row.model_version,
    modelPath: row.model_path,
    source: row.source,
    sourceType: row.source_type,
    generatedAt: row.generated_at,
    inputSnapshot: JSON.parse(row.input_snapshot as string),
    predictedProfileTags: JSON.parse(row.predicted_profile_tags as string),
    topSegments: JSON.parse(row.top_segments as string),
    qualityFlags: JSON.parse(row.quality_flags as string),
    unmappedInputTokens: JSON.parse(row.unmapped_input_tokens as string),
  }));

  db.close();
  return ok(c, {
    items,
    page: {
      cursor: null,
      nextCursor: hasMore ? (items[items.length - 1]?.generatedAt as string) ?? null : null,
      pageSize,
      hasMore,
    },
  });
});

// POST /predictions/:predictionId/feedback - P1 stub
predictions.post("/:predictionId/feedback", (c) => {
  return notFound(c, "feedback is not enabled in P0");
});

export default predictions;

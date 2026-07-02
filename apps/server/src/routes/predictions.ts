import { Hono } from "hono";
import { openDb } from "../db/connection.js";
import { ok, accepted, notFound, invalidInput, dependencyFailed } from "../lib/response.js";
import { writeAudit } from "../lib/audit.js";
import { predictFromSkuRow } from "../services/model-adapter.js";

const predictions = new Hono();

// POST /predictions
predictions.post("/", async (c) => {
  const wsId = c.get("workspaceId");
  const body = await c.req.json();
  const skuId = body.skuId as string | undefined;
  const mode = (body.mode as string) ?? "sync";

  if (!skuId) return invalidInput(c, "skuId is required", "skuId");

  // Check SKU exists
  const db = openDb(wsId);
  const sku = db
    .prepare("SELECT * FROM sku WHERE sku_id = ? AND workspace_id = ?")
    .get(skuId, wsId) as Record<string, unknown> | undefined;
  if (!sku) {
    db.close();
    return notFound(c, `SKU ${skuId} not found`);
  }

  let profile;
  try {
    profile = predictFromSkuRow(sku);
  } catch {
    writeAudit(db, {
      workspaceId: wsId,
      actor: "system:worker",
      requestId: c.get("requestId") ?? "",
      resourceType: "prediction",
      event: "fail",
      reasonCode: "dependency_failed",
    });
    db.close();
    return dependencyFailed(c, `prediction failed for SKU ${skuId}`);
  }

  const taskId = `task_pred_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const predictionId = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const modelVersion = profile.modelVersion;

  // Store task
  db.prepare(`
    INSERT INTO task (task_id, workspace_id, task_type, status, resource_id, model_version, input, attempts, started_at, finished_at)
    VALUES (?, ?, 'prediction', 'succeeded', ?, ?, ?, 1, ?, ?)
  `).run(taskId, wsId, predictionId, modelVersion, JSON.stringify({ skuId }), now, now);

  db.prepare(`
    INSERT INTO prediction (prediction_id, workspace_id, sku_id, task_id, model_version, model_path,
      source, source_type, generated_at, input_snapshot, predicted_profile_tags, top_segments, quality_flags, unmapped_input_tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'derived', ?, ?, ?, ?, ?, ?)
  `).run(
    predictionId,
    wsId,
    skuId,
    taskId,
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

  writeAudit(db, {
    workspaceId: wsId,
    actor: "system:worker",
    requestId: c.get("requestId") ?? "",
    taskId,
    resourceType: "prediction",
    resourceId: predictionId,
    event: "succeed",
    fromStatus: "queued",
    toStatus: "succeeded",
    meta: { modelVersion, modelPath: profile.modelPath },
  });

  const result = {
    predictionId,
    workspaceId: wsId,
    skuId,
    taskId,
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

  db.close();

  if (mode === "async") {
    return accepted(c, { task: { taskId, status: "succeeded", resourceUrl: `/api/v0/predictions/${predictionId}` } });
  }
  return ok(c, result);
});

// GET /predictions/:predictionId
predictions.get("/:predictionId", (c) => {
  const wsId = c.get("workspaceId");
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
  const wsId = c.get("workspaceId");
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

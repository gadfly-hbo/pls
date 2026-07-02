import { Hono } from "hono";
import { openDb } from "../db/connection.js";
import { ok, accepted, notFound, invalidInput, dependencyFailed } from "../lib/response.js";
import { writeAudit } from "../lib/audit.js";
import { placeholders } from "../lib/sql.js";
import { matchFromPredictionAndChannels } from "../services/model-adapter.js";
import { idempotencyMiddleware, readJson, storeIdempotent } from "../lib/idempotency.js";

const matches = new Hono();

// POST /matches
matches.post("/", idempotencyMiddleware(), async (c) => {
  const wsId = c.get("workspaceId");
  const body = await readJson<Record<string, unknown>>(c);
  const predictionId = body.predictionId as string | undefined;
  const skuId = body.skuId as string | undefined;
  const channelIds = body.channelIds as string[] | undefined;
  const topK = Math.min((body.topK as number) ?? 10, 50);
  const mode = (body.mode as string) ?? "sync";

  // Resolve SKU: from predictionId or direct skuId
  let resolvedSkuId = skuId;
  const db = openDb(wsId);

  let predictionRow: Record<string, unknown> | undefined;
  if (predictionId) {
    const pred = db
      .prepare("SELECT * FROM prediction WHERE prediction_id = ? AND workspace_id = ?")
      .get(predictionId, wsId) as Record<string, unknown> | undefined;
    if (!pred) {
      db.close();
      return notFound(c, `Prediction ${predictionId} not found`);
    }
    predictionRow = pred;
    resolvedSkuId = pred.sku_id as string;
  }

  if (!resolvedSkuId) {
    db.close();
    return invalidInput(c, "predictionId or skuId is required");
  }

  if (!predictionRow) {
    predictionRow = db
      .prepare(
        `SELECT * FROM prediction
         WHERE workspace_id = ? AND sku_id = ?
         ORDER BY generated_at DESC, rowid DESC
         LIMIT 1`
      )
      .get(wsId, resolvedSkuId) as Record<string, unknown> | undefined;
  }

  if (!predictionRow) {
    db.close();
    return dependencyFailed(c, `no prediction found for SKU ${resolvedSkuId}`);
  }

  const channelRows = channelIds && channelIds.length > 0
    ? db
        .prepare(
          `SELECT * FROM channel_profile
           WHERE workspace_id = ? AND channel_id IN (${placeholders(channelIds.length)})`
        )
        .all(wsId, ...channelIds) as Array<Record<string, unknown>>
    : db
        .prepare("SELECT * FROM channel_profile WHERE workspace_id = ? ORDER BY created_at DESC")
        .all(wsId) as Array<Record<string, unknown>>;

  if (channelRows.length === 0) {
    db.close();
    return invalidInput(c, `no channels available for matching`);
  }

  const profile = {
    skuId: String(predictionRow.sku_id),
    modelVersion: String(predictionRow.model_version ?? "m-p0-baseline-0.1"),
    modelPath: String(predictionRow.model_path ?? "rule") as "knn" | "rule",
    input: JSON.parse((predictionRow.input_snapshot as string) ?? "{}") as {
      dnaHash: string;
      categoryLv1: string;
      categoryLv2: string;
      season: string;
      priceBand: string;
      styleKeywords: string[];
    },
    predictedProfileTags: JSON.parse((predictionRow.predicted_profile_tags as string) ?? "[]"),
    topSegments: JSON.parse((predictionRow.top_segments as string) ?? "[]"),
    qualityFlags: JSON.parse((predictionRow.quality_flags as string) ?? "[]"),
    unmappedInputTokens: JSON.parse((predictionRow.unmapped_input_tokens as string) ?? "[]"),
  };

  const channelMatches = matchFromPredictionAndChannels(profile, channelRows);
  if (channelMatches.length === 0) {
    db.close();
    return dependencyFailed(c, `match failed for SKU ${resolvedSkuId}`);
  }

  const taskId = `task_match_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const modelVersion = profile.modelVersion;
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  // Store task
  db.prepare(`
    INSERT INTO task (task_id, workspace_id, task_type, status, resource_id, model_version, input, attempts, started_at, finished_at)
    VALUES (?, ?, 'match', 'succeeded', ?, ?, ?, 1, ?, ?)
  `).run(
    taskId,
    wsId,
    taskId,
    modelVersion,
    JSON.stringify({ predictionId, skuId: resolvedSkuId, channelIds }),
    now,
    now
  );

  // Store match results
  const matchIds: string[] = [];
  const topMatches = channelMatches.slice(0, topK);

  if (topMatches.length === 0) {
    db.close();
    return dependencyFailed(c, `match failed for SKU ${resolvedSkuId}`);
  }

  // P1-B1: match_result is append-only; latest view (match_result_latest) picks the newest
  // row per (workspace_id, sku_id, channel_id). No DELETE needed.

  for (let i = 0; i < topMatches.length; i++) {
    const m = topMatches[i]!;
    const matchId = `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    matchIds.push(matchId);

    db.prepare(`
      INSERT INTO match_result (match_id, workspace_id, task_id, prediction_id, sku_id, channel_id,
        channel_type, model_version, source, source_type, generated_at, match_score, match_confidence,
        rank, overlap, best_segment_id, best_segment_match, positive_drivers, negative_drivers,
        recommendation, risks, quality_flags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'derived', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      matchId,
      wsId,
      taskId,
      predictionRow.prediction_id as string,
      resolvedSkuId,
      m.channelId,
      m.channelType,
      modelVersion,
      modelVersion,
      now,
      m.matchScore,
      m.matchConfidence,
      m.rank,
      m.overlap,
      m.bestSegmentId,
      m.bestSegmentMatch,
      JSON.stringify(m.positiveDrivers),
      JSON.stringify(m.negativeDrivers),
      m.recommendation,
      JSON.stringify(m.risks),
      JSON.stringify(m.qualityFlags)
    );
  }

  writeAudit(db, {
    workspaceId: wsId,
    actor: "system:worker",
    requestId: c.get("requestId") ?? "",
    taskId,
    resourceType: "match",
    resourceId: taskId,
    event: "succeed",
    fromStatus: "queued",
    toStatus: "succeeded",
    meta: { modelVersion, matchCount: topMatches.length },
  });

  const result = {
    taskId,
    predictionId: predictionRow.prediction_id as string,
    modelVersion,
    generatedAt: now,
    channelMatches: topMatches.map((m) => ({
      matchId: matchIds.shift(),
      ...m,
      predictionId: predictionRow.prediction_id as string,
      skuId: resolvedSkuId,
      workspaceId: wsId,
      source: modelVersion,
      sourceType: "derived",
      generatedAt: now,
    })),
  };

  db.close();

  if (mode === "async") {
    return storeIdempotent(c, accepted(c, { task: { taskId, status: "succeeded" } }), taskId);
  }
  return storeIdempotent(c, ok(c, result), taskId);
});

// GET /matches/heatmap - must be before /:matchId
matches.get("/heatmap", (c) => {
  const wsId = c.get("workspaceId");
  const skuIds = c.req.query("skuIds")?.split(",") ?? [];
  const channelIds = c.req.query("channelIds")?.split(",") ?? [];
  const modelVersion = c.req.query("modelVersion");

  // Validate payload size
  if (skuIds.length * channelIds.length > 500) {
    return invalidInput(c, "skuIds.length * channelIds.length exceeds 500");
  }

  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params: (string | number | null)[] = [wsId];

  if (skuIds.length > 0) {
    conditions.push(`sku_id IN (${skuIds.map(() => "?").join(",")})`);
    params.push(...skuIds);
  }
  if (channelIds.length > 0) {
    conditions.push(`channel_id IN (${channelIds.map(() => "?").join(",")})`);
    params.push(...channelIds);
  }
  if (modelVersion) {
    conditions.push("model_version = ?");
    params.push(modelVersion);
  }

  const rows = db
    .prepare(
      `SELECT sku_id, channel_id, match_score, match_confidence, recommendation
       FROM match_result_latest
       WHERE ${conditions.join(" AND ")}
       ORDER BY sku_id, match_score DESC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  db.close();

  // Group by skuId
  const skuMap = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const sid = row.sku_id as string;
    if (!skuMap.has(sid)) skuMap.set(sid, []);
    skuMap.get(sid)!.push(row);
  }

  const heatmapRows = [...skuMap.entries()].map(([skuId, cells]) => ({
    skuId,
    cells: cells.map((c) => ({
      channelId: c.channel_id,
      matchScore: c.match_score,
      matchConfidence: c.match_confidence,
      recommendation: c.recommendation,
    })),
  }));

  return ok(c, {
    modelVersion: modelVersion ?? "m-p0-baseline-0.1",
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    rows: heatmapRows,
  });
});

// GET /matches/:matchId
matches.get("/:matchId", (c) => {
  const wsId = c.get("workspaceId");
  const matchId = c.req.param("matchId");
  const db = openDb(wsId);
  const row = db
    .prepare("SELECT * FROM match_result WHERE match_id = ? AND workspace_id = ?")
    .get(matchId, wsId) as Record<string, unknown> | undefined;
  db.close();

  if (!row) return notFound(c, `Match ${matchId} not found`);
  return ok(c, {
    matchId: row.match_id,
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    predictionId: row.prediction_id,
    skuId: row.sku_id,
    channelId: row.channel_id,
    channelType: row.channel_type,
    modelVersion: row.model_version,
    source: row.source,
    sourceType: row.source_type,
    generatedAt: row.generated_at,
    matchScore: row.match_score,
    matchConfidence: row.match_confidence,
    rank: row.rank,
    overlap: row.overlap,
    bestSegmentId: row.best_segment_id,
    bestSegmentMatch: row.best_segment_match,
    positiveDrivers: JSON.parse(row.positive_drivers as string),
    negativeDrivers: JSON.parse(row.negative_drivers as string),
    recommendation: row.recommendation,
    risks: JSON.parse(row.risks as string),
    qualityFlags: JSON.parse(row.quality_flags as string),
  });
});

// GET /matches
matches.get("/", (c) => {
  const wsId = c.get("workspaceId");
  const predictionId = c.req.query("predictionId");
  const skuId = c.req.query("skuId");
  const cursor = c.req.query("cursor");
  const history = c.req.query("history") === "true";
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);

  if (!predictionId && !skuId) {
    return invalidInput(c, "predictionId or skuId is required");
  }

  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params: (string | number | null)[] = [wsId];

  if (predictionId) {
    conditions.push("prediction_id = ?");
    params.push(predictionId);
  }
  if (skuId) {
    conditions.push("sku_id = ?");
    params.push(skuId);
  }
  if (cursor) {
    conditions.push("generated_at < ?");
    params.push(cursor);
  }

  // P1-B1: default reads match_result_latest (one row per skuId+channelId).
  // history=true returns append-only historical rows.
  const table = history ? "match_result" : "match_result_latest";
  const rows = db
    .prepare(
      `SELECT * FROM ${table} WHERE ${conditions.join(" AND ")} ORDER BY match_score DESC LIMIT ?`
    )
    .all(...params, pageSize + 1) as Array<Record<string, unknown>>;

  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map((row) => ({
    matchId: row.match_id,
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    predictionId: row.prediction_id,
    skuId: row.sku_id,
    channelId: row.channel_id,
    channelType: row.channel_type,
    modelVersion: row.model_version,
    source: row.source,
    sourceType: row.source_type,
    generatedAt: row.generated_at,
    matchScore: row.match_score,
    matchConfidence: row.match_confidence,
    rank: row.rank,
    overlap: row.overlap,
    bestSegmentId: row.best_segment_id,
    bestSegmentMatch: row.best_segment_match,
    positiveDrivers: JSON.parse(row.positive_drivers as string),
    negativeDrivers: JSON.parse(row.negative_drivers as string),
    recommendation: row.recommendation,
    risks: JSON.parse(row.risks as string),
    qualityFlags: JSON.parse(row.quality_flags as string),
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

export default matches;

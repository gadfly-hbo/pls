// P1-E3: Account-product match diagnostic routes.
//
// POST /account-matches — run M-P1-E2 diagnoseAccountFit for a single account × SKU
// GET  /account-matches — query stored diagnostics by accountId/skuId
//
// Reuses channel_profile (accounts), prediction, and match_result tables.
// Diagnostic columns (fit_score, fit_confidence, quality_flags,
// mismatched_dimensions, adjustment_advice) live on match_result.

import { Hono } from "hono";
import { openDb } from "../db/connection.js";
import { ok, notFound, invalidInput, dependencyFailed } from "../lib/response.js";
import { writeAudit } from "../lib/audit.js";
import {
  diagnoseAccountFit,
  type AccountFitAdapterInput,
  type AccountFitDiagnostic,
} from "../../../model/src/account-fit.js";

const accountMatches = new Hono();

interface DiagnosticRow {
  match_id: string;
  workspace_id: string;
  sku_id: string;
  channel_id: string;
  channel_type: string | null;
  model_version: string | null;
  generated_at: string;
  match_score: number | null;
  match_confidence: number | null;
  fit_score: number | null;
  fit_confidence: number | null;
  quality_flags: string;
  mismatched_dimensions: string;
  adjustment_advice: string;
  positive_drivers: string;
  negative_drivers: string;
  recommendation: string | null;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function formatDiagnosticRow(row: DiagnosticRow) {
  return {
    matchId: row.match_id,
    accountId: row.channel_id,
    skuId: row.sku_id,
    channelType: row.channel_type,
    modelVersion: row.model_version,
    adapterVersion: "account-fit-rule-baseline-0.1",
    generatedAt: row.generated_at,
    matchScore: row.match_score,
    matchConfidence: row.match_confidence,
    fitScore: row.fit_score,
    fitConfidence: row.fit_confidence,
    qualityFlags: parseJson<string[]>(row.quality_flags, []),
    matchedDimensions: [],
    mismatchedDimensions: parseJson(row.mismatched_dimensions, []),
    adjustmentAdvice: parseJson(row.adjustment_advice, []),
    positiveDrivers: parseJson(row.positive_drivers, []),
    negativeDrivers: parseJson(row.negative_drivers, []),
    recommendation: row.recommendation,
  };
}

// POST /account-matches
// Body: { accountId: string, skuId: string }
// Runs diagnoseAccountFit (M-P1-E2) for the single accountId × SKU pair.
// Returns 400 if accountId is missing; does NOT fall back to "all channels".
accountMatches.post("/", async (c) => {
  const wsId = c.get("workspaceId") as string;
  const body = (await c.req.json()) as Record<string, unknown>;
  const accountId = body.accountId as string | undefined;
  const skuId = body.skuId as string | undefined;

  if (!accountId) {
    return invalidInput(c, "accountId is required");
  }
  if (!skuId) {
    return invalidInput(c, "skuId is required");
  }

  const db = openDb(wsId);

  // Resolve account → channel_profile
  const accountRow = db
    .prepare(
      "SELECT * FROM channel_profile WHERE channel_id = ? AND workspace_id = ?"
    )
    .get(accountId, wsId) as Record<string, unknown> | undefined;

  if (!accountRow) {
    db.close();
    return notFound(c, `Account ${accountId} not found`);
  }

  // Resolve SKU
  const skuRow = db
    .prepare(
      "SELECT * FROM sku WHERE sku_id = ? AND workspace_id = ?"
    )
    .get(skuId, wsId) as Record<string, unknown> | undefined;

  if (!skuRow) {
    db.close();
    return notFound(c, `SKU ${skuId} not found`);
  }

  // Resolve latest prediction for this SKU
  const predictionRow = db
    .prepare(
      `SELECT * FROM prediction
       WHERE workspace_id = ? AND sku_id = ?
       ORDER BY generated_at DESC, rowid DESC LIMIT 1`
    )
    .get(wsId, skuId) as Record<string, unknown> | undefined;

  if (!predictionRow) {
    db.close();
    return dependencyFailed(
      c,
      `no prediction found for SKU ${skuId}`
    );
  }

  const productProfileTags = parseJson(
    (predictionRow.predicted_profile_tags as string) ?? "[]",
    []
  ) as AccountFitAdapterInput["productProfileTags"];

  const accountProfileTags = parseJson(
    (accountRow.tags as string) ?? "[]",
    []
  ) as AccountFitAdapterInput["accountProfileTags"];

  const taskId = `task_diag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const modelVersion = String(
    predictionRow.model_version ?? "m-p0-baseline-0.1"
  );
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  // Create task
  db.prepare(
    `INSERT INTO task
     (task_id, workspace_id, task_type, status, resource_id, model_version, input, attempts, started_at, finished_at)
     VALUES (?, ?, 'account_match', 'succeeded', ?, ?, ?, 1, ?, ?)`
  ).run(
    taskId,
    wsId,
    taskId,
    modelVersion,
    JSON.stringify({ accountId, skuId }),
    now,
    now
  );

  // Run M-P1-E2 diagnoseAccountFit
  const adapterInput: AccountFitAdapterInput = {
    skuId,
    accountChannelId: accountId,
    productProfileTags,
    accountProfileTags,
    qualityMetadata: {
      productSampleSize: Number(predictionRow.sample_size ?? 500),
      accountSampleSize: Number(accountRow.sample_size ?? 500),
    },
  };

  let diag: AccountFitDiagnostic;
  try {
    diag = diagnoseAccountFit(adapterInput);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    db.close();
    return dependencyFailed(c, `diagnoseAccountFit failed: ${msg}`);
  }

  // Store in match_result
  const matchId = `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  db.prepare(
    `INSERT INTO match_result
     (match_id, workspace_id, task_id, prediction_id, sku_id, channel_id,
      channel_type, model_version, source, source_type, generated_at,
      match_score, match_confidence, fit_score, fit_confidence,
      quality_flags, mismatched_dimensions, adjustment_advice,
      positive_drivers, negative_drivers, recommendation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    matchId,
    wsId,
    taskId,
    predictionRow.prediction_id as string,
    skuId,
    accountId,
    (accountRow.channel_type as string) ?? null,
    modelVersion,
    diag.source,
    diag.sourceType,
    now,
    null,
    null,
    diag.fitScore,
    diag.fitConfidence,
    JSON.stringify(diag.qualityFlags),
    JSON.stringify(diag.mismatchedDimensions),
    JSON.stringify(diag.adjustmentAdvice),
    JSON.stringify(diag.positiveDrivers),
    JSON.stringify(diag.negativeDrivers),
    diag.recommendation
  );

  writeAudit(db, {
    workspaceId: wsId,
    actor: "system:worker",
    requestId: c.get("requestId") ?? "",
    taskId,
    resourceType: "account_match",
    resourceId: taskId,
    event: "succeed",
    fromStatus: "queued",
    toStatus: "succeeded",
    meta: {
      modelVersion,
      adapterVersion: diag.adapterVersion,
      fitScore: diag.fitScore,
    },
  });

  db.close();

  return ok(c, {
    taskId,
    accountId,
    skuId,
    modelVersion: diag.modelVersion,
    adapterVersion: diag.adapterVersion,
    source: diag.source,
    generatedAt: now,
    fitScore: diag.fitScore,
    fitConfidence: diag.fitConfidence,
    recommendation: diag.recommendation,
    qualityFlags: diag.qualityFlags,
    matchedDimensions: diag.matchedDimensions,
    mismatchedDimensions: diag.mismatchedDimensions,
    adjustmentAdvice: diag.adjustmentAdvice,
    positiveDrivers: diag.positiveDrivers,
    negativeDrivers: diag.negativeDrivers,
  });
});

// GET /account-matches?accountId=&skuId=&timeWindow=&pageSize=
accountMatches.get("/", (c) => {
  const wsId = c.get("workspaceId") as string;
  const accountId = c.req.query("accountId");
  const skuId = c.req.query("skuId");
  const timeWindow = c.req.query("timeWindow");
  const cursor = c.req.query("cursor");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);

  if (!accountId && !skuId) {
    return invalidInput(c, "accountId or skuId is required");
  }

  const db = openDb(wsId);
  const conditions = ["workspace_id = ?", "fit_score IS NOT NULL"];
  const params: (string | number | null)[] = [wsId];

  if (accountId) {
    conditions.push("channel_id = ?");
    params.push(accountId);
  }
  if (skuId) {
    conditions.push("sku_id = ?");
    params.push(skuId);
  }
  if (timeWindow) {
    conditions.push(
      `channel_id IN (SELECT channel_id FROM channel_profile WHERE workspace_id = ? AND time_window = ?)`
    );
    params.push(wsId, timeWindow);
  }
  if (cursor) {
    conditions.push("generated_at < ?");
    params.push(cursor);
  }

  const rows = db
    .prepare(
      `SELECT * FROM match_result
       WHERE ${conditions.join(" AND ")}
       ORDER BY generated_at DESC
       LIMIT ?`
    )
    .all(...params, pageSize + 1) as unknown as DiagnosticRow[];

  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map(formatDiagnosticRow);

  db.close();

  return ok(c, {
    items,
    page: {
      cursor: null,
      nextCursor: hasMore
        ? (items[items.length - 1]?.generatedAt as string) ?? null
        : null,
      pageSize,
      hasMore,
    },
  });
});

// GET /account-matches/heatmap?accountId=&skuIds=
accountMatches.get("/heatmap", (c) => {
  const wsId = c.get("workspaceId") as string;
  const accountId = c.req.query("accountId");
  const skuIds = c.req.query("skuIds")?.split(",") ?? [];

  if (!accountId) {
    return invalidInput(c, "accountId is required");
  }

  const db = openDb(wsId);
  const conditions = ["workspace_id = ?", "channel_id = ?", "fit_score IS NOT NULL"];
  const params: (string | number | null)[] = [wsId, accountId];

  if (skuIds.length > 0) {
    conditions.push(
      `sku_id IN (${skuIds.map(() => "?").join(",")})`
    );
    params.push(...skuIds);
  }

  const rows = db
    .prepare(
      `SELECT ranked.sku_id, ranked.channel_id, ranked.fit_score, ranked.fit_confidence,
              ranked.recommendation, ranked.quality_flags, ranked.mismatched_dimensions
       FROM (
         SELECT sku_id, channel_id, fit_score, fit_confidence, recommendation,
                quality_flags, mismatched_dimensions,
                ROW_NUMBER() OVER (
                  PARTITION BY sku_id, channel_id
                  ORDER BY generated_at DESC, rowid DESC
                ) AS _rn
         FROM match_result
         WHERE ${conditions.join(" AND ")}
       ) ranked
       WHERE ranked._rn = 1
       ORDER BY ranked.fit_score DESC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  db.close();

  const skuMap = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const sid = row.sku_id as string;
    if (!skuMap.has(sid)) skuMap.set(sid, []);
    skuMap.get(sid)!.push(row);
  }

  const heatmapRows = [...skuMap.entries()].map(([skuId, cells]) => ({
    skuId,
    cells: cells.map((cell) => ({
      channelId: cell.channel_id,
      fitScore: cell.fit_score,
      fitConfidence: cell.fit_confidence,
      recommendation: cell.recommendation,
      qualityFlags: parseJson((cell.quality_flags as string) ?? "[]", []),
      mismatchedDimensions: parseJson(
        (cell.mismatched_dimensions as string) ?? "[]",
        []
      ),
    })),
  }));

  return ok(c, {
    accountId,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    rows: heatmapRows,
  });
});

export default accountMatches;

// A-P2-9: New product prediction API + matching integration.
import { Hono } from "hono";
import { openDb } from "../db/connection.js";
import { ok, notFound, invalidInput, dependencyFailed } from "../lib/response.js";
import { writeAudit } from "../lib/audit.js";
import {
  predictNewProductProfile,
  toProductChannelFitProfile,
  type NewProductMasterPredictionInput,
  type PredictedProductProfile,
} from "../../../model/src/new-product-prediction.js";
import { matchFromPredictionAndChannels } from "../services/model-adapter.js";

const newProducts = new Hono();

function nowIso(): string { return new Date().toISOString().replace(/\.\d{3}Z$/, "Z"); }
function makeIds() { const t = Date.now(), r = Math.random().toString(36).slice(2, 7); return { taskId: `task_npp_${t}_${r}`, predictionId: `npp_${t}_${r}` }; }
function parseJson<T>(raw: string, fallback: T): T { try { return JSON.parse(raw) as T; } catch { return fallback; } }

interface PredictionRow {
  prediction_id: string; workspace_id: string; task_id: string | null; sku_id: string | null;
  resolved_product_key: string; input_snapshot: string; model_version: string;
  contract_version: string; model_path: string; source: string; source_type: string;
  predicted_profile_tags: string; confidence: number; top_segments: string;
  similar_historical_products: string; explanation_sources: string; risk_flags: string;
  unavailable_reasons: string; quality_flags: string; lineage: string;
  generated_at: string; created_at: string;
}

function fmt(row: PredictionRow) {
  return {
    predictionId: row.prediction_id, workspaceId: row.workspace_id, taskId: row.task_id,
    skuId: row.sku_id, resolvedProductKey: parseJson(row.resolved_product_key, { value: row.sku_id }),
    modelVersion: row.model_version, contractVersion: row.contract_version, modelPath: row.model_path,
    source: row.source, sourceType: row.source_type, generatedAt: row.generated_at,
    predictedProfileTags: parseJson(row.predicted_profile_tags, []), confidence: row.confidence,
    topSegments: parseJson(row.top_segments, []),
    similarHistoricalProducts: parseJson(row.similar_historical_products, []),
    explanationSources: parseJson(row.explanation_sources, []),
    riskFlags: parseJson(row.risk_flags, []),
    unavailableReasons: parseJson(row.unavailable_reasons, []),
    qualityFlags: parseJson(row.quality_flags, []),
    lineage: parseJson(row.lineage, {}),
  };
}

// POST /new-products/predictions
newProducts.post("/predictions", async (c) => {
  const wsId = c.get("workspaceId") as string;
  const requestId = (c.get("requestId") as string) ?? "";
  const body = (await c.req.json()) as Record<string, unknown>;
  if (!body.productMaster) return invalidInput(c, "productMaster is required", "productMaster");

  const { taskId, predictionId } = makeIds();
  const db = openDb(wsId);
  try {
    let result: PredictedProductProfile;
    try {
      result = predictNewProductProfile(body as unknown as NewProductMasterPredictionInput);
    } catch (err) {
      writeAudit(db, { workspaceId: wsId, actor: "system:worker", requestId, taskId, resourceType: "new_product_prediction", event: "fail", reasonCode: "prediction_error" });
      return dependencyFailed(c, `Prediction failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const now = nowIso();
    db.prepare(`INSERT INTO new_product_prediction (prediction_id,workspace_id,task_id,sku_id,resolved_product_key,input_snapshot,model_version,contract_version,model_path,source,source_type,predicted_profile_tags,confidence,top_segments,similar_historical_products,explanation_sources,risk_flags,unavailable_reasons,quality_flags,lineage,generated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      predictionId, wsId, taskId, result.skuId, JSON.stringify(result.resolvedProductKey), JSON.stringify(body),
      result.modelVersion, result.contractVersion, result.modelPath, result.source, result.sourceType,
      JSON.stringify(result.predictedProfileTags), result.confidence, JSON.stringify(result.topSegments),
      JSON.stringify(result.similarHistoricalProducts), JSON.stringify(result.explanationSources),
      JSON.stringify(result.riskFlags), JSON.stringify(result.unavailableReasons),
      JSON.stringify(result.qualityFlags), JSON.stringify(result.lineage), now
    );
    writeAudit(db, { workspaceId: wsId, actor: "system:worker", requestId, taskId, resourceType: "new_product_prediction", resourceId: predictionId, event: "succeed", meta: { modelVersion: result.modelVersion, confidence: result.confidence } });
    db.close();
    return ok(c, fmt({ prediction_id: predictionId, workspace_id: wsId, task_id: taskId, sku_id: result.skuId, resolved_product_key: JSON.stringify(result.resolvedProductKey), input_snapshot: JSON.stringify(body), model_version: result.modelVersion, contract_version: result.contractVersion, model_path: result.modelPath, source: result.source, source_type: result.sourceType, predicted_profile_tags: JSON.stringify(result.predictedProfileTags), confidence: result.confidence, top_segments: JSON.stringify(result.topSegments), similar_historical_products: JSON.stringify(result.similarHistoricalProducts), explanation_sources: JSON.stringify(result.explanationSources), risk_flags: JSON.stringify(result.riskFlags), unavailable_reasons: JSON.stringify(result.unavailableReasons), quality_flags: JSON.stringify(result.qualityFlags), lineage: JSON.stringify(result.lineage), generated_at: now, created_at: now }));
  } catch (e) { db.close(); throw e; }
});

// GET /new-products/predictions
newProducts.get("/predictions", (c) => {
  const wsId = c.get("workspaceId") as string;
  const skuId = c.req.query("skuId");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);
  const db = openDb(wsId);
  const conds = ["workspace_id = ?"]; const params: (string | number)[] = [wsId];
  if (skuId) { conds.push("sku_id = ?"); params.push(skuId); }
  const rows = db.prepare(`SELECT * FROM new_product_prediction WHERE ${conds.join(" AND ")} ORDER BY generated_at DESC LIMIT ?`).all(...params, pageSize) as unknown as PredictionRow[];
  const items = rows.map(fmt);
  writeAudit(db, { workspaceId: wsId, actor: "api", requestId: c.get("requestId") ?? "", resourceType: "new_product_prediction", event: "query", meta: { count: items.length } });
  db.close();
  return ok(c, { items });
});

// GET /new-products/predictions/:predictionId
newProducts.get("/predictions/:predictionId", (c) => {
  const wsId = c.get("workspaceId") as string;
  const pid = c.req.param("predictionId");
  const db = openDb(wsId);
  const row = db.prepare("SELECT * FROM new_product_prediction WHERE prediction_id = ? AND workspace_id = ?").get(pid, wsId) as PredictionRow | undefined;
  if (!row) { db.close(); return notFound(c, `Prediction ${pid} not found`); }
  writeAudit(db, { workspaceId: wsId, actor: "api", requestId: c.get("requestId") ?? "", resourceType: "new_product_prediction", resourceId: pid, event: "query" });
  db.close();
  return ok(c, fmt(row));
});

// POST /new-products/predictions/:predictionId/match
newProducts.post("/predictions/:predictionId/match", async (c) => {
  const wsId = c.get("workspaceId") as string;
  const pid = c.req.param("predictionId");
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const channelIds = body.channelIds as string[] | undefined;

  const db = openDb(wsId);
  const row = db.prepare("SELECT * FROM new_product_prediction WHERE prediction_id = ? AND workspace_id = ?").get(pid, wsId) as PredictionRow | undefined;
  if (!row) { db.close(); return notFound(c, `Prediction ${pid} not found`); }

  const fullProfile: PredictedProductProfile = {
    skuId: row.sku_id,
    resolvedProductKey: parseJson(row.resolved_product_key, { value: row.sku_id }),
    modelVersion: row.model_version, contractVersion: row.contract_version,
    modelPath: row.model_path as "new_product_explainable_baseline",
    source: row.source as "new_product_prediction_baseline", sourceType: "derived",
    predictedProfileTags: parseJson(row.predicted_profile_tags, []),
    confidence: row.confidence, topSegments: parseJson(row.top_segments, []),
    similarHistoricalProducts: parseJson(row.similar_historical_products, []),
    explanationSources: parseJson(row.explanation_sources, []),
    riskFlags: parseJson(row.risk_flags, []),
    unavailableReasons: parseJson(row.unavailable_reasons, []),
    qualityFlags: parseJson(row.quality_flags, []),
    lineage: parseJson(row.lineage, { sourceBatchId: null, dataVersion: null, generatedAt: null, sourceType: null, timeWindow: null }),
  };

  try {
    const fitProfile = toProductChannelFitProfile(fullProfile);
    let q = "SELECT * FROM channel_profile WHERE workspace_id = ?"; const p: (string | number)[] = [wsId];
    if (channelIds?.length) { q += ` AND channel_id IN (${channelIds.map(() => "?").join(",")})`; p.push(...channelIds); }
    const channels = db.prepare(q).all(...p) as Array<Record<string, unknown>>;
    if (!channels.length) { db.close(); return invalidInput(c, "No matching channel profiles", "channelIds"); }

    const matches = matchFromPredictionAndChannels(fitProfile, channels);
    const now = nowIso(); const results: Array<Record<string, unknown>> = [];
    for (const m of matches) {
      const matchId = `match_npp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      db.prepare(`INSERT INTO match_result (match_id,workspace_id,prediction_id,sku_id,channel_id,channel_type,model_version,source,source_type,generated_at,match_score,match_confidence,rank,overlap,best_segment_id,best_segment_match,positive_drivers,negative_drivers,recommendation,risks,quality_flags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        matchId, wsId, pid, row.sku_id, m.channelId, m.channelType, row.model_version, row.source, "derived", now,
        m.matchScore, m.matchConfidence, m.rank, m.overlap, m.bestSegmentId, m.bestSegmentMatch,
        JSON.stringify(m.positiveDrivers), JSON.stringify(m.negativeDrivers), m.recommendation, JSON.stringify(m.risks), JSON.stringify([])
      );
      results.push({ matchId, channelId: m.channelId, matchScore: m.matchScore, recommendation: m.recommendation });
    }
    writeAudit(db, { workspaceId: wsId, actor: "api", requestId: c.get("requestId") ?? "", resourceType: "new_product_prediction", resourceId: pid, event: "match", meta: { matchCount: results.length } });
    db.close();
    return ok(c, { predictionId: pid, matches: results });
  } catch (err) { db.close(); return dependencyFailed(c, `Match failed: ${err instanceof Error ? err.message : String(err)}`); }
});

export default newProducts;

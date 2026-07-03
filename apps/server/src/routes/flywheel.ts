// A-P2-10: Operation flywheel — decision / action / feedback / review.
// P2 Phase 1: record and review only, no auto-execution.
import { Hono } from "hono";
import { openDb } from "../db/connection.js";
import { ok, notFound, invalidInput } from "../lib/response.js";
import { writeAudit } from "../lib/audit.js";

const flywheel = new Hono();

function parseJson<T>(raw: string, fallback: T): T { try { return JSON.parse(raw) as T; } catch { return fallback; } }

// --- Decision Records ---
// POST /operations/decisions — create decision from match suggestion
flywheel.post("/decisions", async (c) => {
  const wsId = c.get("workspaceId") as string;
  const body = (await c.req.json()) as Record<string, unknown>;
  const skuId = body.skuId as string; const channelId = body.channelId as string;
  const recommendation = body.recommendation as string;
  if (!skuId || !channelId || !recommendation) return invalidInput(c, "skuId, channelId, recommendation required");
  const db = openDb(wsId);
  const decisionId = `dec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  db.prepare(`INSERT INTO decision_record (decision_id,workspace_id,match_id,sku_id,channel_id,recommendation,rationale,decision_type,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    decisionId, wsId, String(body.matchId ?? ""), skuId, channelId, recommendation,
    String(body.rationale ?? ""), String(body.decisionType ?? "launch"), "pending", String(body.createdBy ?? "")
  );
  writeAudit(db, { workspaceId: wsId, actor: "api", requestId: c.get("requestId") ?? "", resourceType: "decision", resourceId: decisionId, event: "create" });
  db.close();
  return ok(c, { decisionId, status: "pending" });
});

// GET /operations/decisions
flywheel.get("/decisions", (c) => {
  const wsId = c.get("workspaceId") as string;
  const status = c.req.query("status"); const skuId = c.req.query("skuId");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "50"), 200);
  const db = openDb(wsId);
  const conds = ["workspace_id = ?"]; const params: (string | number)[] = [wsId];
  if (status) { conds.push("status = ?"); params.push(status); }
  if (skuId) { conds.push("sku_id = ?"); params.push(skuId); }
  const rows = db.prepare(`SELECT * FROM decision_record WHERE ${conds.join(" AND ")} ORDER BY created_at DESC LIMIT ?`).all(...params, pageSize) as Array<Record<string, unknown>>;
  const items = rows.map(r => ({
    decisionId: r.decision_id, matchId: r.match_id, skuId: r.sku_id, channelId: r.channel_id,
    recommendation: r.recommendation, rationale: r.rationale, decisionType: r.decision_type,
    status: r.status, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
  }));
  db.close();
  return ok(c, { items });
});

// GET /operations/decisions/:decisionId
flywheel.get("/decisions/:decisionId", (c) => {
  const wsId = c.get("workspaceId") as string; const did = c.req.param("decisionId");
  const db = openDb(wsId);
  const r = db.prepare("SELECT * FROM decision_record WHERE decision_id = ? AND workspace_id = ?").get(did, wsId) as Record<string, unknown> | undefined;
  if (!r) { db.close(); return notFound(c, `Decision ${did} not found`); }
  // Also load actions, feedbacks, reviews
  const actions = db.prepare("SELECT * FROM action_record WHERE decision_id = ? AND workspace_id = ? ORDER BY created_at").all(did, wsId) as Array<Record<string, unknown>>;
  const feedbacks = db.prepare("SELECT * FROM feedback_record WHERE decision_id = ? AND workspace_id = ? ORDER BY created_at").all(did, wsId) as Array<Record<string, unknown>>;
  const reviews = db.prepare("SELECT * FROM strategy_review WHERE decision_id = ? AND workspace_id = ? ORDER BY created_at").all(did, wsId) as Array<Record<string, unknown>>;
  db.close();
  return ok(c, {
    decisionId: r.decision_id, matchId: r.match_id, skuId: r.sku_id, channelId: r.channel_id,
    recommendation: r.recommendation, rationale: r.rationale, decisionType: r.decision_type,
    status: r.status, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
    actions: actions.map(a => ({
      actionId: a.action_id,
      actionType: a.action_type,
      actionDetail: parseJson(a.action_detail as string, {}),
      status: a.status,
      scheduledAt: a.scheduled_at,
      executedAt: a.executed_at,
      createdAt: a.created_at,
    })),
    feedbacks: feedbacks.map(f => ({
      feedbackId: f.feedback_id,
      actionId: f.action_id,
      feedbackType: f.feedback_type,
      metricName: f.metric_name,
      metricValue: f.metric_value,
      metricUnit: f.metric_unit,
      timeWindow: f.time_window,
      source: f.source,
      sourceType: f.source_type,
      sourceBatchId: f.source_batch_id,
      dataVersion: f.data_version,
      qualityFlags: parseJson(f.quality_flags as string, []),
      rawMetrics: parseJson(f.raw_metrics as string, {}),
      createdAt: f.created_at,
    })),
    reviews: reviews.map(rv => ({
      reviewId: rv.review_id,
      reviewStatus: rv.review_status,
      adjustmentType: rv.adjustment_type,
      adjustmentDetail: parseJson(rv.adjustment_detail as string, {}),
      rationale: rv.rationale,
      reviewer: rv.reviewer,
      reviewedAt: rv.reviewed_at,
      createdAt: rv.created_at,
    })),
  });
});

// POST /operations/decisions/:decisionId/actions — record action
flywheel.post("/decisions/:decisionId/actions", async (c) => {
  const wsId = c.get("workspaceId") as string; const did = c.req.param("decisionId");
  const body = (await c.req.json()) as Record<string, unknown>;
  const actionType = body.actionType as string;
  if (!actionType) return invalidInput(c, "actionType required", "actionType");
  const db = openDb(wsId);
  const dec = db.prepare("SELECT decision_id FROM decision_record WHERE decision_id = ? AND workspace_id = ?").get(did, wsId);
  if (!dec) { db.close(); return notFound(c, `Decision ${did} not found`); }
  const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  db.prepare(`INSERT INTO action_record (action_id,workspace_id,decision_id,action_type,action_detail,status,scheduled_at) VALUES (?,?,?,?,?,?,?)`).run(
    actionId, wsId, did, actionType, JSON.stringify(body.detail ?? {}), String(body.status ?? "pending"), String(body.scheduledAt ?? "")
  );
  writeAudit(db, { workspaceId: wsId, actor: "api", requestId: c.get("requestId") ?? "", resourceType: "action", resourceId: actionId, event: "create" });
  db.close();
  return ok(c, { actionId, status: body.status ?? "pending" });
});

// POST /operations/decisions/:decisionId/feedback — import feedback
flywheel.post("/decisions/:decisionId/feedback", async (c) => {
  const wsId = c.get("workspaceId") as string; const did = c.req.param("decisionId");
  const body = (await c.req.json()) as Record<string, unknown>;
  const feedbackType = body.feedbackType as string; const metricName = body.metricName as string;
  if (!feedbackType || !metricName) return invalidInput(c, "feedbackType, metricName required");
  const db = openDb(wsId);
  const dec = db.prepare("SELECT decision_id FROM decision_record WHERE decision_id = ? AND workspace_id = ?").get(did, wsId);
  if (!dec) { db.close(); return notFound(c, `Decision ${did} not found`); }
  const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  db.prepare(`INSERT INTO feedback_record (feedback_id,workspace_id,decision_id,action_id,feedback_type,metric_name,metric_value,metric_unit,time_window,source,source_type,source_batch_id,data_version,quality_flags,raw_metrics) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    feedbackId, wsId, did, String(body.actionId ?? ""), feedbackType, metricName,
    body.metricValue != null ? Number(body.metricValue) : null, String(body.metricUnit ?? ""), String(body.timeWindow ?? ""),
    String(body.source ?? ""), String(body.sourceType ?? ""), String(body.sourceBatchId ?? ""), String(body.dataVersion ?? ""),
    JSON.stringify(body.qualityFlags ?? []), JSON.stringify(body.rawMetrics ?? {})
  );
  writeAudit(db, { workspaceId: wsId, actor: "api", requestId: c.get("requestId") ?? "", resourceType: "feedback", resourceId: feedbackId, event: "import" });
  db.close();
  return ok(c, { feedbackId });
});

// POST /operations/decisions/:decisionId/review — create strategy review
flywheel.post("/decisions/:decisionId/review", async (c) => {
  const wsId = c.get("workspaceId") as string; const did = c.req.param("decisionId");
  const body = (await c.req.json()) as Record<string, unknown>;
  const db = openDb(wsId);
  const dec = db.prepare("SELECT decision_id FROM decision_record WHERE decision_id = ? AND workspace_id = ?").get(did, wsId);
  if (!dec) { db.close(); return notFound(c, `Decision ${did} not found`); }
  const reviewId = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  db.prepare(`INSERT INTO strategy_review (review_id,workspace_id,decision_id,review_status,adjustment_type,adjustment_detail,rationale,reviewer) VALUES (?,?,?,?,?,?,?,?)`).run(
    reviewId, wsId, did, String(body.reviewStatus ?? "pending_review"),
    String(body.adjustmentType ?? ""), JSON.stringify(body.adjustmentDetail ?? {}),
    String(body.rationale ?? ""), String(body.reviewer ?? "")
  );
  // Update decision status if review indicates adjustment needed
  if (body.reviewStatus === "needs_adjustment") {
    db.prepare("UPDATE decision_record SET status = 'needs_adjustment', updated_at = datetime('now') WHERE decision_id = ? AND workspace_id = ?").run(did, wsId);
  } else if (body.reviewStatus === "verified") {
    db.prepare("UPDATE decision_record SET status = 'verified', updated_at = datetime('now') WHERE decision_id = ? AND workspace_id = ?").run(did, wsId);
  }
  writeAudit(db, { workspaceId: wsId, actor: "api", requestId: c.get("requestId") ?? "", resourceType: "review", resourceId: reviewId, event: "create", meta: { reviewStatus: body.reviewStatus } });
  db.close();
  return ok(c, { reviewId, reviewStatus: body.reviewStatus ?? "pending_review" });
});

// GET /operations/decisions/:decisionId/review
flywheel.get("/decisions/:decisionId/review", (c) => {
  const wsId = c.get("workspaceId") as string; const did = c.req.param("decisionId");
  const db = openDb(wsId);
  const rows = db.prepare("SELECT * FROM strategy_review WHERE decision_id = ? AND workspace_id = ? ORDER BY created_at DESC").all(did, wsId) as Array<Record<string, unknown>>;
  const items = rows.map(r => ({
    reviewId: r.review_id, reviewStatus: r.review_status, adjustmentType: r.adjustment_type,
    adjustmentDetail: parseJson(r.adjustment_detail as string, {}), rationale: r.rationale,
    reviewer: r.reviewer, reviewedAt: r.reviewed_at, createdAt: r.created_at,
  }));
  db.close();
  return ok(c, { items });
});

export default flywheel;

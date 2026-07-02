// P1-B4: Smoke step definitions. See smoke.ts for the runner scaffolding.
import { request, step, envelopeData } from "./smoke.js";

interface ProductsPage { items: Array<{ skuId: string }> }
interface PredictionData { predictionId: string; taskId: string; topSegments: unknown[] }
interface AcceptedTask { task: { taskId: string; status: string; fallbackReason?: string } }
interface TaskData { status: string }
interface MatchData { taskId: string; channelMatches: unknown[] }
interface HeatmapData { rows: Array<{ skuId: string; cells: Array<{ channelId: string }> }> }
interface AuditPage { items: Array<{ auditId: string; action: string }> }
interface AcceptedBatch { task: { taskId: string; resourceUrl?: string } }

export async function runSteps(): Promise<void> {
  await step("health", async () => {
    const r = await request("GET", "/health", { auth: false, workspace: false });
    if (r.status !== 200) return { ok: false, status: r.status, reason: "expected 200", detail: r.body };
    return { ok: true, status: r.status };
  });

  await step("auth_missing_token", async () => {
    const r = await request("GET", "/api/v0/products", { auth: false });
    if (r.status !== 401) return { ok: false, status: r.status, reason: "expected 401", detail: r.body };
    return { ok: true, status: r.status };
  });

  await step("workspace_missing_header", async () => {
    const r = await request("GET", "/api/v0/products", { workspace: false });
    if (r.status !== 400) return { ok: false, status: r.status, reason: "expected 400", detail: r.body };
    return { ok: true, status: r.status };
  });

  let skuId = "";
  await step("products_list", async () => {
    const r = await request("GET", "/api/v0/products?pageSize=5");
    if (r.status !== 200) return { ok: false, status: r.status, reason: "expected 200", detail: r.body };
    const data = envelopeData<ProductsPage>(r.body);
    if (!data.items || data.items.length === 0) return { ok: false, reason: "no seeded SKUs" };
    skuId = data.items[0]!.skuId;
    return { ok: true, status: r.status, detail: { count: data.items.length, skuId } };
  });

  await step("safety_violation", async () => {
    const r = await request("POST", "/api/v0/products", {
      body: { skuId: "smoke_bad_sku", phone: "13800138000" },
    });
    if (r.status !== 422) return { ok: false, status: r.status, reason: "expected 422", detail: r.body };
    const code = (r.body as { code?: string }).code;
    if (code !== "safety_violation")
      return { ok: false, status: r.status, reason: `expected code=safety_violation, got ${code}` };
    return { ok: true, status: r.status };
  });

  let predictionId = "";
  let predictionTaskId = "";
  await step("predict_sync", async () => {
    if (!skuId) return { ok: false, reason: "skuId not resolved" };
    const r = await request("POST", "/api/v0/predictions", { body: { skuId } });
    if (r.status !== 200) return { ok: false, status: r.status, reason: "expected 200", detail: r.body };
    const d = envelopeData<PredictionData>(r.body);
    if (!d.predictionId) return { ok: false, reason: "missing predictionId", detail: d };
    if (!Array.isArray(d.topSegments) || d.topSegments.length !== 3)
      return { ok: false, reason: `expected topSegments.length===3, got ${d.topSegments?.length}` };
    predictionId = d.predictionId;
    predictionTaskId = d.taskId;
    return { ok: true, status: r.status, detail: { predictionId, taskId: predictionTaskId } };
  });

  await step("task_poll_prediction", async () => {
    if (!predictionTaskId) return { ok: false, reason: "no taskId" };
    const r = await request("GET", `/api/v0/tasks/${predictionTaskId}`);
    if (r.status !== 200) return { ok: false, status: r.status, reason: "expected 200", detail: r.body };
    const d = envelopeData<TaskData>(r.body);
    if (d.status !== "succeeded")
      return { ok: false, reason: `expected status=succeeded, got ${d.status}` };
    return { ok: true, status: r.status };
  });

  await step("predict_async", async () => {
    if (!skuId) return { ok: false, reason: "skuId not resolved" };
    const r = await request("POST", "/api/v0/predictions", {
      body: { skuId, mode: "async" },
      headers: { "X-PLS-Test-Delay-Ms": "150" },
    });
    if (r.status !== 202) return { ok: false, status: r.status, reason: "expected 202", detail: r.body };
    const d = envelopeData<AcceptedTask>(r.body);
    if (d.task?.status !== "queued")
      return { ok: false, reason: "expected task.status=queued", detail: d };
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const t = await request("GET", `/api/v0/tasks/${d.task.taskId}`);
      const st = envelopeData<TaskData>(t.body).status;
      if (st === "succeeded")
        return { ok: true, status: r.status, detail: { pollIterations: i + 1 } };
      if (st === "failed") return { ok: false, reason: "async task failed", detail: t.body };
    }
    return { ok: false, reason: "async task did not settle within 3s" };
  });

  await step("predict_sync_timeout_fallback", async () => {
    if (!skuId) return { ok: false, reason: "skuId not resolved" };
    const r = await request("POST", "/api/v0/predictions", {
      body: { skuId, timeoutMs: 200 },
      headers: { "X-PLS-Test-Delay-Ms": "1200" },
    });
    if (r.status !== 202) return { ok: false, status: r.status, reason: "expected 202", detail: r.body };
    const d = envelopeData<AcceptedTask>(r.body);
    if (d.task?.fallbackReason !== "sync_timeout")
      return { ok: false, reason: "expected fallbackReason=sync_timeout", detail: d };
    return { ok: true, status: r.status };
  });

  await step("match", async () => {
    if (!predictionId) return { ok: false, reason: "no predictionId" };
    const r = await request("POST", "/api/v0/matches", { body: { predictionId } });
    if (r.status !== 200) return { ok: false, status: r.status, reason: "expected 200", detail: r.body };
    const d = envelopeData<MatchData>(r.body);
    if (!Array.isArray(d.channelMatches) || d.channelMatches.length === 0)
      return { ok: false, reason: "no channelMatches", detail: d };
    return { ok: true, status: r.status, detail: { count: d.channelMatches.length } };
  });

  await step("heatmap_unique", async () => {
    if (!skuId) return { ok: false, reason: "skuId not resolved" };
    if (!predictionId) return { ok: false, reason: "no predictionId" };
    // Second match run — the append-only history should still yield a
    // single latest cell per channelId.
    await request("POST", "/api/v0/matches", { body: { predictionId } });
    const r = await request("GET", `/api/v0/matches/heatmap?skuIds=${skuId}`);
    if (r.status !== 200) return { ok: false, status: r.status, reason: "expected 200", detail: r.body };
    const d = envelopeData<HeatmapData>(r.body);
    const row = d.rows?.find((row) => row.skuId === skuId);
    if (!row) return { ok: false, reason: `no heatmap row for ${skuId}` };
    const unique = new Set(row.cells.map((c) => c.channelId));
    if (unique.size !== row.cells.length)
      return {
        ok: false,
        reason: `duplicate cells: total=${row.cells.length} unique=${unique.size}`,
      };
    return { ok: true, status: r.status, detail: { cells: row.cells.length } };
  });

  await step("match_history_vs_latest", async () => {
    if (!skuId) return { ok: false, reason: "skuId not resolved" };
    const latest = await request("GET", `/api/v0/matches?skuId=${skuId}&pageSize=100`);
    const history = await request(
      "GET",
      `/api/v0/matches?skuId=${skuId}&history=true&pageSize=100`
    );
    const latestItems = envelopeData<{ items: unknown[] }>(latest.body).items ?? [];
    const historyItems = envelopeData<{ items: unknown[] }>(history.body).items ?? [];
    if (latestItems.length === 0) return { ok: false, reason: "latest is empty" };
    if (historyItems.length < latestItems.length)
      return {
        ok: false,
        reason: `history (${historyItems.length}) < latest (${latestItems.length})`,
      };
    return {
      ok: true,
      detail: { latest: latestItems.length, history: historyItems.length },
    };
  });

  const idemKey = `smoke-idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let firstTaskId = "";
  await step("idempotency_first", async () => {
    if (!predictionId) return { ok: false, reason: "no predictionId" };
    const r = await request("POST", "/api/v0/matches", {
      body: { predictionId },
      headers: { "Idempotency-Key": idemKey },
    });
    if (r.status !== 200) return { ok: false, status: r.status, reason: "expected 200", detail: r.body };
    firstTaskId = envelopeData<MatchData>(r.body).taskId;
    return { ok: true, status: r.status };
  });

  await step("idempotency_replay", async () => {
    if (!predictionId || !firstTaskId) return { ok: false, reason: "prerequisites missing" };
    const r = await request("POST", "/api/v0/matches", {
      body: { predictionId },
      headers: { "Idempotency-Key": idemKey },
    });
    if (r.status !== 200) return { ok: false, status: r.status, reason: "expected 200", detail: r.body };
    const replayTaskId = envelopeData<MatchData>(r.body).taskId;
    if (replayTaskId !== firstTaskId)
      return { ok: false, reason: `taskId changed: ${firstTaskId} -> ${replayTaskId}` };
    return { ok: true, status: r.status };
  });

  await step("idempotency_conflict", async () => {
    if (!predictionId) return { ok: false, reason: "no predictionId" };
    // Same key, different payload → 409
    const r = await request("POST", "/api/v0/matches", {
      body: { predictionId, topK: 1 },
      headers: { "Idempotency-Key": idemKey },
    });
    if (r.status !== 409) return { ok: false, status: r.status, reason: "expected 409", detail: r.body };
    return { ok: true, status: r.status };
  });

  // Regression: same key across different endpoints must NOT cross-replay.
  await step("idempotency_endpoint_isolation", async () => {
    if (!predictionId || !skuId) return { ok: false, reason: "prerequisites missing" };
    const key = `smoke-cross-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rp = await request("POST", "/api/v0/predictions", {
      body: { skuId },
      headers: { "Idempotency-Key": key },
    });
    if (rp.status !== 200)
      return { ok: false, status: rp.status, reason: "predictions expected 200", detail: rp.body };
    const predResp = envelopeData<PredictionData>(rp.body);
    if (!predResp.predictionId)
      return { ok: false, reason: "predictions missing predictionId", detail: predResp };

    // Same key + same body wire, different endpoint. Must not replay the
    // prediction response; must produce a real MatchData shape.
    const rm = await request("POST", "/api/v0/matches", {
      body: { predictionId },
      headers: { "Idempotency-Key": key },
    });
    if (rm.status !== 200)
      return { ok: false, status: rm.status, reason: "matches expected 200", detail: rm.body };
    const matchResp = rm.body as { data?: Record<string, unknown> };
    const matchData = matchResp.data ?? {};
    if ("predictedProfileTags" in matchData || "topSegments" in matchData) {
      return { ok: false, reason: "cross-endpoint replay leaked prediction payload", detail: matchData };
    }
    if (!Array.isArray((matchData as { channelMatches?: unknown[] }).channelMatches)) {
      return { ok: false, reason: "matches response missing channelMatches", detail: matchData };
    }
    return { ok: true, status: rm.status };
  });

  // Regression: /batches JSON body path + Idempotency-Key must work.
  await step("batches_json_idempotent", async () => {
    const key = `smoke-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const body = {
      meta: {
        batchType: "sku_import",
        source: "smoke-test",
        sourceType: "mock",
        timeWindow: "2026-Q3",
      },
    };
    const first = await request("POST", "/api/v0/batches", {
      body,
      headers: { "Idempotency-Key": key },
    });
    if (first.status !== 202)
      return { ok: false, status: first.status, reason: "expected 202", detail: first.body };
    const firstBatch = envelopeData<AcceptedBatch>(first.body);
    const firstResourceUrl = firstBatch.task?.resourceUrl;
    if (!firstResourceUrl) return { ok: false, reason: "missing resourceUrl", detail: firstBatch };

    const replay = await request("POST", "/api/v0/batches", {
      body,
      headers: { "Idempotency-Key": key },
    });
    if (replay.status !== 202)
      return { ok: false, status: replay.status, reason: "replay expected 202", detail: replay.body };
    const replayBatch = envelopeData<AcceptedBatch>(replay.body);
    if (replayBatch.task?.resourceUrl !== firstResourceUrl) {
      return {
        ok: false,
        reason: `batchId changed on replay: ${firstResourceUrl} -> ${replayBatch.task?.resourceUrl}`,
      };
    }
    return { ok: true, status: replay.status };
  });

  await step("audit_recent", async () => {
    const r = await request("GET", "/api/v0/audit?pageSize=5");
    if (r.status !== 200) return { ok: false, status: r.status, reason: "expected 200", detail: r.body };
    const d = envelopeData<AuditPage>(r.body);
    if (!d.items || d.items.length === 0) return { ok: false, reason: "audit is empty" };
    return { ok: true, status: r.status, detail: { count: d.items.length } };
  });
}

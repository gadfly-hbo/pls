#!/usr/bin/env node
// A-P5-PORTRAIT-5: Single product portrait tool smoke.
//
// Assumptions:
// - Server running at PLS_API_BASE (default http://localhost:3100/api/v0).
// - Controlled sample package exists at data/templates/single-product-portrait-sample.
// - Anomaly fixture exists at data/templates/single-product-portrait-anomaly.
// - Tools write only to data/local/tool-runs; no business DB writes.

const BASE = process.env.PLS_API_BASE ?? "http://localhost:3100/api/v0";
const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
const WS = process.env.PLS_WORKSPACE ?? `ws_portrait_${Date.now()}`;

let passed = 0;
let failed = 0;
const details = [];

async function req(method, path, body, ws) {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "X-PLS-Workspace": ws ?? WS,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

function assert(name, ok, detail) {
  if (ok) { passed++; console.log(`[PASS] ${name}`); }
  else { failed++; console.log(`[FAIL] ${name}: ${JSON.stringify(detail).slice(0, 200)}`); details.push({ name, detail }); }
}

async function main() {
  console.log(`Smoke single-product-portrait against ${BASE} ws ${WS}`);

  // 1. tool is registered
  const list = await req("GET", "/tools");
  assert("list tools returns 200", list.status === 200, list.body);
  const tools = list.body?.data?.tools ?? [];
  assert("tool registered", tools.some((t) => t.toolId === "single-product-portrait"), tools.map((t) => t.toolId));

  // 2. get tool definition
  const def = await req("GET", "/tools/single-product-portrait");
  assert("get tool returns 200", def.status === 200, def.body);
  assert("tool category", def.body?.data?.tool?.category === "single_product_portrait", def.body);
  assert("tool plannedArtifacts", (def.body?.data?.tool?.plannedArtifacts ?? []).length === 2, def.body);

  // 3. dry run
  const dry = await req("POST", "/tools/runs/dry-run", {
    toolId: "single-product-portrait",
    parameters: { skuId: "mock_sku_portrait_001" },
  });
  assert("dry run returns 200", dry.status === 200, dry.body);
  assert("dry run planned", dry.body?.data?.status === "planned", dry.body);

  // 4. success: run tool with valid sku
  const run = await req("POST", "/tools/runs", {
    toolId: "single-product-portrait",
    parameters: { skuId: "mock_sku_portrait_001" },
  });
  assert("run returns 200", run.status === 200, run.body);
  const runId = run.body?.data?.run?.runId;
  assert("run has runId", typeof runId === "string", run.body);
  assert("run succeeded", run.body?.data?.run?.status === "succeeded", run.body);
  assert("run has 2 artifacts", (run.body?.data?.run?.artifacts ?? []).length === 2, run.body);

  // 5. read prediction.json artifact
  const pred = await req("GET", `/tools/runs/${runId}/artifacts/prediction.json`);
  assert("read prediction.json returns 200", pred.status === 200, pred.status);
  const prediction = pred.body;
  assert("prediction has modelVersion", typeof prediction?.modelVersion === "string", prediction);
  assert("prediction has platformPortraitRows", Array.isArray(prediction?.platformPortraitRows), prediction);
  assert("prediction has dimensionSummaries", Array.isArray(prediction?.dimensionSummaries), prediction);
  assert("prediction has riskFlags", Array.isArray(prediction?.riskFlags), prediction);
  assert("prediction has evidence", Array.isArray(prediction?.explanationSources), prediction);
  assert("prediction has plsBridge", typeof prediction?.plsBridge === "object", prediction);
  assert("prediction riskFlags includes baseline_not_trained_model",
    (prediction?.riskFlags ?? []).includes("baseline_not_trained_model"), prediction?.riskFlags);
  assert("prediction has sourceFiles array",
    Array.isArray(prediction?.sourceFiles) && prediction.sourceFiles.length === 2, prediction?.sourceFiles);
  assert("prediction sourceFiles contains product_attributes path",
    (prediction?.sourceFiles ?? []).some((f) => f.includes("product_attributes.jsonl")), prediction?.sourceFiles);

  // 6. read report.md artifact
  const md = await req("GET", `/tools/runs/${runId}/artifacts/report.md`);
  assert("read report.md returns 200", md.status === 200, md.status);
  assert("report is markdown", typeof md.body === "string" && md.body.includes("# Single Product Portrait"), md.body);

  // 7. unknown sku
  const unknown = await req("POST", "/tools/runs", {
    toolId: "single-product-portrait",
    parameters: { skuId: "nonexistent_sku_999" },
  });
  assert("unknown sku returns 200", unknown.status === 200, unknown.body);
  assert("unknown sku run failed", unknown.body?.data?.run?.status === "failed", unknown.body);
  assert("unknown sku has error", (unknown.body?.data?.run?.errors ?? []).length > 0, unknown.body);

  // 8. anomaly CSV: run with packageId=anomaly
  const anomalyRun = await req("POST", "/tools/runs", {
    toolId: "single-product-portrait",
    parameters: { skuId: "mock_sku_portrait_001", packageId: "anomaly" },
  });
  assert("anomaly run returns 200", anomalyRun.status === 200, anomalyRun.body);
  const anomalyRunId = anomalyRun.body?.data?.run?.runId;
  assert("anomaly run succeeded", anomalyRun.body?.data?.run?.status === "succeeded", anomalyRun.body);
  assert("anomaly run has csv warning",
    (anomalyRun.body?.data?.run?.warnings ?? []).some((w) => w.includes("csv_source_row_anomaly")),
    anomalyRun.body?.data?.run?.warnings);

  const anomalyPred = await req("GET", `/tools/runs/${anomalyRunId}/artifacts/prediction.json`);
  assert("anomaly prediction has csv_source_row_anomaly riskFlag",
    (anomalyPred.body?.riskFlags ?? []).includes("csv_source_row_anomaly"), anomalyPred.body?.riskFlags);

  // 8b. multi-SKU filtering: SKU 001 must not contain SKU 002 portrait labels
  const sku001LabelTypes = (anomalyPred.body?.platformPortraitRows ?? []).map((r) => r.labelType);
  assert("SKU 001 prediction excludes SKU 002 labelType",
    !sku001LabelTypes.includes("电商品类成交偏好"), sku001LabelTypes);
  const sku001Labels = (anomalyPred.body?.platformPortraitRows ?? []).map((r) => r.label);
  assert("SKU 001 prediction excludes SKU 002 label",
    !sku001Labels.includes("户外装备"), sku001Labels);

  // 8c. multi-SKU filtering: run for SKU 002, verify it gets its own labels
  const sku2Run = await req("POST", "/tools/runs", {
    toolId: "single-product-portrait",
    parameters: { skuId: "mock_sku_portrait_002", packageId: "anomaly" },
  });
  assert("SKU 002 run succeeded", sku2Run.body?.data?.run?.status === "succeeded", sku2Run.body);
  const sku2Pred = await req("GET", `/tools/runs/${sku2Run.body?.data?.run?.runId}/artifacts/prediction.json`);
  const sku2LabelTypes = (sku2Pred.body?.platformPortraitRows ?? []).map((r) => r.labelType);
  assert("SKU 002 prediction includes its own labelType",
    sku2LabelTypes.includes("电商品类成交偏好"), sku2LabelTypes);

  // 9. workspace isolation
  const otherWs = `${WS}_other`;
  const otherRun = await req("GET", `/tools/runs/${runId}`, undefined, otherWs);
  assert("other workspace cannot read run", otherRun.status === 404, otherRun.body);
  const otherArtifact = await req("GET", `/tools/runs/${runId}/artifacts/prediction.json`, undefined, otherWs);
  assert("other workspace cannot read artifact", otherArtifact.status === 404, otherArtifact.body);

  // 10. missing skuId parameter
  const missingParam = await req("POST", "/tools/runs", {
    toolId: "single-product-portrait",
    parameters: {},
  });
  assert("missing skuId returns 200", missingParam.status === 200, missingParam.body);
  assert("missing skuId run failed", missingParam.body?.data?.run?.status === "failed", missingParam.body);

  // 11. invalid packageId (path traversal attempt)
  const badPkg = await req("POST", "/tools/runs", {
    toolId: "single-product-portrait",
    parameters: { skuId: "mock_sku_portrait_001", packageId: "../etc" },
  });
  assert("invalid packageId run failed", badPkg.body?.data?.run?.status === "failed", badPkg.body);

  const ok = failed === 0;
  console.log(`\nRESULT: ${JSON.stringify({ name: "smoke-single-product-portrait", ok, passed, failed, workspace: WS, details: details.slice(0, 3) })}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("fatal:", e);
  console.log(`RESULT: ${JSON.stringify({ name: "smoke-single-product-portrait", ok: false, passed, failed, error: e.message })}`);
  process.exit(1);
});

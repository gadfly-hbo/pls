#!/usr/bin/env node
// A-P4-TOOLS-1: Tool registry and local runner API smoke.
//
// Assumptions:
// - Server is running at PLS_API_BASE (default http://localhost:3100/api/v0).
// - Workspace does not need business data; tools write only to data/local/tool-runs.
// - Auth token and workspace are passed via env or defaults.

const BASE = process.env.PLS_API_BASE ?? "http://localhost:3100/api/v0";
const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
const WS = process.env.PLS_WORKSPACE ?? `ws_tools_${Date.now()}`;

let passed = 0;
let failed = 0;
const details = [];

async function request(method, path, body) {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "X-PLS-Workspace": WS,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function requestInWorkspace(workspace, method, path, body) {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "X-PLS-Workspace": workspace,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

function assert(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`[PASS] ${name}`);
  } else {
    failed++;
    console.log(`[FAIL] ${name}: ${JSON.stringify(detail).slice(0, 200)}`);
    details.push({ name, detail });
  }
}

async function main() {
  console.log(`Smoke tools against ${BASE} workspace ${WS}`);

  // 1. list tools
  const list = await request("GET", "/tools");
  assert("list tools returns 200", list.status === 200, list.body);
  const tools = list.body?.data?.tools ?? [];
  assert("list tools contains sample-profile-extract", tools.some((t) => t.toolId === "sample-profile-extract"), tools);

  // 2. get tool definition
  const tool = await request("GET", "/tools/sample-profile-extract");
  assert("get tool returns 200", tool.status === 200, tool.body);
  assert("tool has runner from registry", tool.body?.data?.tool?.runner === "sample-profile-extract", tool.body);

  // 3. dry run
  const dryRun = await request("POST", "/tools/runs/dry-run", {
    toolId: "sample-profile-extract",
    parameters: { platform: "sycm", source: "smoke-test" },
  });
  assert("dry run returns 200", dryRun.status === 200, dryRun.body);
  assert("dry run has planned status", dryRun.body?.data?.status === "planned", dryRun.body);
  assert("dry run planned artifacts", dryRun.body?.data?.plannedArtifacts?.length >= 2, dryRun.body);

  // 4. run tool
  const run = await request("POST", "/tools/runs", {
    toolId: "sample-profile-extract",
    parameters: { platform: "sycm", source: "smoke-test", timeWindow: "2026-06-01/2026-06-30" },
  });
  assert("run tool returns 200", run.status === 200, run.body);
  const runId = run.body?.data?.run?.runId;
  assert("run has runId", typeof runId === "string" && runId.length > 0, run.body);
  assert("run status succeeded", run.body?.data?.run?.status === "succeeded", run.body);

  // 5. get run
  const getRun = await request("GET", `/tools/runs/${runId}`);
  assert("get run returns 200", getRun.status === 200, getRun.body);
  assert("get run matches runId", getRun.body?.data?.run?.runId === runId, getRun.body);

  // 6. list artifacts
  const artifacts = await request("GET", `/tools/runs/${runId}/artifacts`);
  assert("list artifacts returns 200", artifacts.status === 200, artifacts.body);
  const artifactList = artifacts.body?.data?.artifacts ?? [];
  assert("artifacts contain aggregate_profile.json", artifactList.some((a) => a.artifactId === "aggregate_profile.json"), artifacts.body);
  assert("artifacts contain report.md", artifactList.some((a) => a.artifactId === "report.md"), artifacts.body);

  // 7. read JSON artifact
  const jsonArtifact = await request("GET", `/tools/runs/${runId}/artifacts/aggregate_profile.json`);
  assert("read JSON artifact returns 200", jsonArtifact.status === 200, jsonArtifact.status);
  assert("JSON artifact content type", jsonArtifact.body?.platform === "sycm" || typeof jsonArtifact.body === "object", jsonArtifact.body);

  // 8. read Markdown artifact
  const mdArtifact = await request("GET", `/tools/runs/${runId}/artifacts/report.md`);
  assert("read markdown artifact returns 200", mdArtifact.status === 200, mdArtifact.status);
  assert("markdown artifact contains platform", typeof mdArtifact.body === "string" && mdArtifact.body.includes("platform: sycm"), mdArtifact.body);

  // 9. unknown tool
  const unknown = await request("POST", "/tools/runs", { toolId: "not-a-real-tool" });
  assert("unknown tool returns 404", unknown.status === 404, unknown.body);

  // 10. invalid artifact path (URL-encoded traversal attempt)
  const traversal = await request("GET", `/tools/runs/${runId}/artifacts/..%2F..%2F..%2Fetc%2Fpasswd`);
  assert("path traversal artifact returns 400", traversal.status === 400, traversal.body);

  // 11. runs list
  const runs = await request("GET", "/tools/runs");
  assert("runs list returns 200", runs.status === 200, runs.body);
  assert("runs list includes our run", (runs.body?.data?.runs ?? []).some((r) => r.runId === runId), runs.body);

  // 12. workspace isolation
  const otherWs = `${WS}_other`;
  const otherRun = await requestInWorkspace(otherWs, "GET", `/tools/runs/${runId}`);
  assert("other workspace cannot read run", otherRun.status === 404, otherRun.body);
  const otherArtifacts = await requestInWorkspace(otherWs, "GET", `/tools/runs/${runId}/artifacts`);
  assert("other workspace cannot list artifacts", otherArtifacts.status === 404, otherArtifacts.body);
  const otherArtifact = await requestInWorkspace(otherWs, "GET", `/tools/runs/${runId}/artifacts/report.md`);
  assert("other workspace cannot read artifact", otherArtifact.status === 404, otherArtifact.body);
  const otherRuns = await requestInWorkspace(otherWs, "GET", "/tools/runs");
  assert("other workspace run list excludes our run", !(otherRuns.body?.data?.runs ?? []).some((r) => r.runId === runId), otherRuns.body);

  const ok = failed === 0;
  console.log(`\nRESULT: ${JSON.stringify({ name: "smoke-tools", ok, passed, failed, workspace: WS, details: details.slice(0, 3) })}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("fatal:", e);
  console.log(`RESULT: ${JSON.stringify({ name: "smoke-tools", ok: false, passed, failed, error: e.message })}`);
  process.exit(1);
});

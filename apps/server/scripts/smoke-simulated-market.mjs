#!/usr/bin/env node
// A-P7-SIM-1: Simulated market API smoke.
//
// Assumptions:
// - This script starts and stops its own PLS server on a random port.
// - It creates two isolated temporary workspaces via the Admin rebuild API
//   (POST /admin/database/rebuild) and does NOT touch ws_demo.
// - All simulation_run rows are written to the temporary workspace(s) only.
// - The server must expose /admin/database/rebuild with the standard admin token.
//
// Phases:
// - Phase 1: SIMULATED_MARKET_FAKE_LLM=true -> expects provider=minimax success with modelVersion=minimax-m3.
// - Phase 2: SIMULATED_MARKET_FAKE_LLM=false with no MINIMAX_API_KEY -> expects
//   deterministic fallback with both deterministic_fallback_used and
//   llm_unavailable_fallback_used quality flags.
// - Phase 3: SIMULATED_MARKET_FAKE_LLM=true with SIMULATED_MARKET_MODEL overridden -> expects
//   run.modelVersion to reflect the configured model name.
// - Phase 4: SIMULATED_MARKET_LLM_TIMEOUT_MS=abc123 -> expects server to handle invalid
//   timeout gracefully (fallback to default) and still serve requests.
// - Phase 5 (optional): RUN_SIMULATED_MARKET_LIVE_LLM=1 + MINIMAX_API_KEY -> calls real Minimax
//   and expects provider=minimax. Skipped unless explicitly enabled.

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(__dirname, "..");

const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
const ADMIN_TOKEN = process.env.PLS_ADMIN_TOKEN ?? "pls-admin-token";
const WS_MAIN = process.env.PLS_WORKSPACE ?? `ws_sm_simulated_market_${Date.now()}`;
const WS_OTHER = `${WS_MAIN}_other_${Date.now()}`;

let passed = 0;
let failed = 0;
const details = [];
let currentBase = "";

function assert(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`[PASS] ${name}`);
  } else {
    failed++;
    console.log(`[FAIL] ${name}: ${JSON.stringify(detail).slice(0, 300)}`);
    details.push({ name, detail });
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGet(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });
    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

async function startServer(extraEnv = {}, attempt = 0) {
  const maxAttempts = 5;
  const port = 4200 + Math.floor(Math.random() * 1000);
  const base = `http://127.0.0.1:${port}/api/v0`;
  const env = { ...process.env, PORT: String(port), ...extraEnv };
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: SERVER_DIR,
    env,
    stdio: "pipe",
  });

  let output = "";
  child.stdout.on("data", (d) => (output += d.toString()));
  child.stderr.on("data", (d) => (output += d.toString()));

  await sleep(1500);
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const res = await httpGet(`http://127.0.0.1:${port}/health`);
      if (res.status === 200) {
        currentBase = base;
        return { child, base };
      }
    } catch {
      // not ready
    }
    await sleep(100);
  }

  child.kill();
  await sleep(500);
  if (child.exitCode === null) child.kill("SIGKILL");

  if (attempt < maxAttempts - 1) {
    console.log(`Server start attempt ${attempt + 1} failed (port ${port}), retrying...`);
    return startServer(extraEnv, attempt + 1);
  }
  throw new Error(`Server failed to start after ${maxAttempts} attempts.\n${output}`);
}

function stopServer(server) {
  return new Promise((resolve) => {
    if (!server || server.killed) {
      resolve();
      return;
    }
    server.on("exit", () => resolve());
    server.kill();
    setTimeout(() => {
      if (!server.killed) server.kill("SIGKILL");
    }, 5000);
  });
}

async function request(method, path, { body, workspace, idempotencyKey, admin } = {}) {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "X-PLS-Workspace": workspace ?? WS_MAIN,
  };
  if (admin) headers["X-PLS-Admin-Token"] = ADMIN_TOKEN;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";

  const res = await fetch(`${currentBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json, headers: res.headers };
}

async function rebuildWorkspace(ws) {
  const res = await request("POST", "/admin/database/rebuild", {
    workspace: ws,
    admin: true,
    idempotencyKey: `sm_rebuild_${ws}_${Date.now()}`,
    body: { confirmText: `RESET ${ws}`, skipSnapshot: true },
  });
  if (res.status !== 200) {
    throw new Error(`rebuild failed for ${ws}: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

async function setupWorkspaces() {
  console.log(`\n>>> Creating isolated temporary workspaces ${WS_MAIN} and ${WS_OTHER}`);
  await rebuildWorkspace(WS_MAIN);
  await rebuildWorkspace(WS_OTHER);
}

function buildValidBody(agents) {
  return {
    sourceType: "manual_strategy",
    strategyText:
      "本季主打修身显瘦通勤连衣裙，采用高支棉面料，主打简约通勤与多场景穿搭，定价中档，计划通过抖音直播间与天猫旗舰店同步首发。",
    marketContext: {
      channelEntityId: "douyin:shop:semir_official",
      contextText: "抖音直播首发 + 天猫旗舰店",
    },
    targetAgentSet: agents,
  };
}

async function runLlmSuccessPhase() {
  console.log("\n>>> Phase 1: fake LLM success path");
  const server = await startServer({ SIMULATED_MARKET_FAKE_LLM: "true" });

  try {
    await setupWorkspaces();

    // --- agent templates ---
    const templates = await request("GET", "/simulated-market/agent-templates");
    assert("agent-templates returns 200", templates.status === 200, templates.body);
    assert(
      "agent-templates returns 3 default agents",
      Array.isArray(templates.body?.data?.agents) && templates.body.data.agents.length === 3,
      templates.body
    );

    const firstAgent = templates.body?.data?.agents?.[0];
    assert(
      "agent has required fields",
      typeof firstAgent?.agentId === "string" &&
        typeof firstAgent?.name === "string" &&
        firstAgent?.sourceType === "three_audience_segment",
      firstAgent
    );

    // --- run with invalid input ---
    const invalidRun = await request("POST", "/simulated-market/runs", {
      body: { strategyText: "short", marketContext: {}, targetAgentSet: [] },
    });
    assert("invalid run returns 400", invalidRun.status === 400, invalidRun.body);
    assert("invalid run error code", invalidRun.body?.code === "invalid_input", invalidRun.body);

    // --- create a valid run with fake LLM ---
    const idemKey = `smoke-sim-${Date.now()}`;
    const agents = templates.body.data.agents.slice(0, 2);
    const validBody = buildValidBody(agents);

    const createRun = await request("POST", "/simulated-market/runs", {
      body: validBody,
      idempotencyKey: idemKey,
    });
    assert("create run returns 200", createRun.status === 200, createRun.body);
    const run = createRun.body?.data;
    assert("run has runId", typeof run?.runId === "string", run);
    assert("run has workspaceId", run?.workspaceId === WS_MAIN, run);
    assert("run status is succeeded", run?.status === "succeeded", run);
    assert("run provider is minimax", run?.provider === "minimax", run);
    assert("run modelVersion is minimax-m3", run?.modelVersion === "minimax-m3", run);
    assert(
      "run qualityFlags do not include deterministic fallback flag",
      Array.isArray(run?.qualityFlags) && !run.qualityFlags.includes("deterministic_fallback_used"),
      run
    );
    assert(
      "run has overall scores",
      typeof run?.result?.overall?.acceptanceScore === "number" &&
        typeof run?.result?.overall?.purchaseIntentScore === "number" &&
        typeof run?.result?.overall?.confidence === "number",
      run
    );
    assert(
      "run has agent feedback",
      Array.isArray(run?.result?.agentFeedback) && run.result.agentFeedback.length === agents.length,
      run
    );

    // --- idempotency replay ---
    const replayRun = await request("POST", "/simulated-market/runs", {
      body: validBody,
      idempotencyKey: idemKey,
    });
    assert("idempotency replay returns 200", replayRun.status === 200, replayRun.body);
    assert(
      "idempotency replay returns same runId",
      replayRun.body?.data?.runId === run.runId,
      replayRun.body
    );
    assert(
      "idempotency replay header present",
      replayRun.headers.get("Idempotency-Replay") === "true",
      replayRun.headers
    );

    // --- list runs ---
    const list = await request("GET", "/simulated-market/runs?pageSize=10");
    assert("list runs returns 200", list.status === 200, list.body);
    assert(
      "list runs contains created run",
      Array.isArray(list.body?.data?.items) &&
        list.body.data.items.some((item) => item.runId === run.runId),
      list.body
    );
    assert("list has page info", typeof list.body?.data?.page?.hasMore === "boolean", list.body);

    // --- get run detail ---
    const detail = await request("GET", `/simulated-market/runs/${run.runId}`);
    assert("run detail returns 200", detail.status === 200, detail.body);
    assert("run detail runId matches", detail.body?.data?.runId === run.runId, detail.body);
    assert(
      "run detail preserves input snapshot",
      detail.body?.data?.inputSnapshot?.strategyText === validBody.strategyText,
      detail.body
    );

    // --- cross-workspace isolation ---
    const otherDetail = await request("GET", `/simulated-market/runs/${run.runId}`, {
      workspace: WS_OTHER,
    });
    assert("cross-workspace run returns 404", otherDetail.status === 404, otherDetail.body);

    // --- run not found ---
    const notFoundRun = await request("GET", "/simulated-market/runs/sim_nonexistent");
    assert("not found run returns 404", notFoundRun.status === 404, notFoundRun.body);

    // --- auth / workspace headers ---
    const noAuth = await fetch(`${currentBase}/simulated-market/agent-templates`, {
      headers: { "X-PLS-Workspace": WS_MAIN },
    });
    assert("401 without token", noAuth.status === 401);

    const noWs = await fetch(`${currentBase}/simulated-market/agent-templates`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    assert("400 without workspace", noWs.status === 400);
  } finally {
    await stopServer(server.child);
  }
}

async function runFallbackPhase() {
  console.log("\n>>> Phase 2: provider missing / failure fallback path");
  // Ensure no real key is configured and fake LLM is disabled so the server falls back.
  const server = await startServer({
    SIMULATED_MARKET_FAKE_LLM: "false",
    MINIMAX_API_KEY: "",
  });

  try {
    const templates = await request("GET", "/simulated-market/agent-templates");
    assert("fallback agent-templates returns 200", templates.status === 200, templates.body);

    const agents = templates.body?.data?.agents?.slice(0, 2);
    const validBody = buildValidBody(agents);

    const fallbackRun = await request("POST", "/simulated-market/runs", {
      body: validBody,
    });
    assert("fallback create run returns 200", fallbackRun.status === 200, fallbackRun.body);
    const run = fallbackRun.body?.data;
    assert("fallback run status is succeeded", run?.status === "succeeded", run);
    assert(
      "fallback run provider is deterministic_fallback",
      run?.provider === "deterministic_fallback",
      run
    );
    assert(
      "fallback run qualityFlags include deterministic_fallback_used",
      Array.isArray(run?.qualityFlags) && run.qualityFlags.includes("deterministic_fallback_used"),
      run
    );
    assert(
      "fallback run qualityFlags include llm_unavailable_fallback_used",
      Array.isArray(run?.qualityFlags) &&
        run.qualityFlags.includes("llm_unavailable_fallback_used"),
      run
    );
    assert(
      "fallback run has overall scores",
      typeof run?.result?.overall?.acceptanceScore === "number" &&
        typeof run?.result?.overall?.purchaseIntentScore === "number" &&
        typeof run?.result?.overall?.confidence === "number",
      run
    );
    assert(
      "fallback run has agent feedback",
      Array.isArray(run?.result?.agentFeedback) && run.result.agentFeedback.length === agents.length,
      run
    );
  } finally {
    await stopServer(server.child);
  }
}

async function runCustomModelPhase() {
  console.log("\n>>> Phase 3: custom SIMULATED_MARKET_MODEL flows to modelVersion");
  const customModel = "minimax-m3-custom";
  const server = await startServer({
    SIMULATED_MARKET_FAKE_LLM: "true",
    SIMULATED_MARKET_MODEL: customModel,
  });

  try {
    const templates = await request("GET", "/simulated-market/agent-templates");
    assert("custom model agent-templates returns 200", templates.status === 200, templates.body);

    const agents = templates.body?.data?.agents?.slice(0, 2);
    const validBody = buildValidBody(agents);

    const customRun = await request("POST", "/simulated-market/runs", {
      body: validBody,
    });
    assert("custom model create run returns 200", customRun.status === 200, customRun.body);
    const run = customRun.body?.data;
    assert("custom model run provider is minimax", run?.provider === "minimax", run);
    assert(
      "custom model run modelVersion matches SIMULATED_MARKET_MODEL",
      run?.modelVersion === customModel,
      run
    );
  } finally {
    await stopServer(server.child);
  }
}

async function runInvalidTimeoutPhase() {
  console.log("\n>>> Phase 4: invalid SIMULATED_MARKET_LLM_TIMEOUT_MS is handled gracefully");
  const server = await startServer({
    SIMULATED_MARKET_FAKE_LLM: "true",
    SIMULATED_MARKET_LLM_TIMEOUT_MS: "abc123",
  });

  try {
    const templates = await request("GET", "/simulated-market/agent-templates");
    assert("invalid timeout agent-templates returns 200", templates.status === 200, templates.body);

    const agents = templates.body?.data?.agents?.slice(0, 2);
    const validBody = buildValidBody(agents);

    const invalidTimeoutRun = await request("POST", "/simulated-market/runs", {
      body: validBody,
    });
    assert(
      "invalid timeout create run returns 200",
      invalidTimeoutRun.status === 200,
      invalidTimeoutRun.body
    );
    const run = invalidTimeoutRun.body?.data;
    assert("invalid timeout run status is succeeded", run?.status === "succeeded", run);
    assert("invalid timeout run provider is minimax", run?.provider === "minimax", run);
    assert(
      "invalid timeout run has agent feedback",
      Array.isArray(run?.result?.agentFeedback) && run.result.agentFeedback.length === agents.length,
      run
    );
  } finally {
    await stopServer(server.child);
  }
}

async function runLiveMinimaxPhase() {
  const liveEnabled = process.env.RUN_SIMULATED_MARKET_LIVE_LLM === "1";
  const hasKey = Boolean(process.env.MINIMAX_API_KEY);

  if (!liveEnabled) {
    console.log("\n>>> Phase 5: live Minimax smoke skipped (set RUN_SIMULATED_MARKET_LIVE_LLM=1 + MINIMAX_API_KEY to enable)");
    return;
  }

  if (!hasKey) {
    console.log("\n>>> Phase 5: live Minimax smoke skipped (MINIMAX_API_KEY not configured)");
    return;
  }

  console.log("\n>>> Phase 5: live Minimax smoke (real network call)");
  const server = await startServer({
    SIMULATED_MARKET_FAKE_LLM: "false",
  });

  try {
    const templates = await request("GET", "/simulated-market/agent-templates");
    assert("live minimax agent-templates returns 200", templates.status === 200, templates.body);

    const agents = templates.body?.data?.agents?.slice(0, 1);
    const validBody = buildValidBody(agents);

    const liveRun = await request("POST", "/simulated-market/runs", {
      body: validBody,
    });
    assert("live minimax create run returns 200", liveRun.status === 200, liveRun.body);
    const run = liveRun.body?.data;
    assert("live minimax run status is succeeded", run?.status === "succeeded", run);
    assert("live minimax run provider is minimax", run?.provider === "minimax", run);
    assert(
      "live minimax run qualityFlags do not include fallback flag",
      Array.isArray(run?.qualityFlags) && !run.qualityFlags.includes("deterministic_fallback_used"),
      run
    );
  } finally {
    await stopServer(server.child);
  }
}

async function main() {
  console.log(`Smoke simulated-market API`);
  console.log(
    `Precondition: this script creates isolated temporary workspaces via /admin/database/rebuild and does not touch ws_demo.`
  );
  console.log(
    `Phase 1 uses SIMULATED_MARKET_FAKE_LLM=true; Phase 2 uses no fake LLM and no MINIMAX_API_KEY; Phase 3 overrides SIMULATED_MARKET_MODEL; Phase 4 uses invalid SIMULATED_MARKET_LLM_TIMEOUT_MS; Phase 5 (optional) calls live Minimax when RUN_SIMULATED_MARKET_LIVE_LLM=1.`
  );

  await runLlmSuccessPhase();
  await runFallbackPhase();
  await runCustomModelPhase();
  await runInvalidTimeoutPhase();
  await runLiveMinimaxPhase();

  const ok = failed === 0;
  console.log(
    `\nRESULT: ${JSON.stringify({
      name: "smoke-simulated-market",
      ok,
      passed,
      failed,
      workspace: WS_MAIN,
      details: details.slice(0, 3),
    })}`
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("fatal:", e);
  console.log(
    `RESULT: ${JSON.stringify({
      name: "smoke-simulated-market",
      ok: false,
      passed,
      failed,
      error: e.message,
    })}`
  );
  process.exit(1);
});

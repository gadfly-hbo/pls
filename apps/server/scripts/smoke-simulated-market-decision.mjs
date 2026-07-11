#!/usr/bin/env node
// A-P7-SIM-2: Simulated market decision provenance smoke.
//
// Assumptions:
// - This script starts and stops its own PLS server on a random port.
// - It creates two isolated temporary workspaces via the Admin rebuild API
//   (POST /admin/database/rebuild) and does NOT touch ws_demo.
// - All rows are written to the temporary workspace(s) only.
// - The server must expose /admin/database/rebuild with the standard admin token.

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(__dirname, "..");

const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
const ADMIN_TOKEN = process.env.PLS_ADMIN_TOKEN ?? "pls-admin-token";
const WS_MAIN = process.env.PLS_WORKSPACE ?? `ws_sm_sim_decision_${Date.now()}`;
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

async function startServer(attempt = 0) {
  const maxAttempts = 5;
  const port = 4200 + Math.floor(Math.random() * 1000);
  const base = `http://127.0.0.1:${port}/api/v0`;
  const env = { ...process.env, PORT: String(port) };
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
    return startServer(attempt + 1);
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

async function main() {
  console.log(`Smoke simulated-market decision provenance API`);
  console.log(`Precondition: this script creates isolated temporary workspaces via /admin/database/rebuild and does not touch ws_demo.`);

  const server = await startServer();

  try {
    await setupWorkspaces();

    // --- create a valid simulation run ---
    const templates = await request("GET", "/simulated-market/agent-templates");
    assert("agent-templates returns 200", templates.status === 200, templates.body);
    const agents = templates.body?.data?.agents?.slice(0, 2) ?? [];
    assert("agent templates has agents", agents.length >= 1, templates.body);

    const runSourceRef = { id: "pred_smoke_001", type: "single_product_portrait" };
    const validBody = {
      sourceType: "manual_strategy",
      sourceRef: runSourceRef,
      strategyText:
        "本季主打修身显瘦通勤连衣裙，采用高支棉面料，主打简约通勤与多场景穿搭，定价中档，计划通过抖音直播间与天猫旗舰店同步首发。",
      marketContext: {
        channelEntityId: "douyin:shop:semir_official",
        contextText: "抖音直播首发 + 天猫旗舰店",
      },
      targetAgentSet: agents,
    };

    const createRun = await request("POST", "/simulated-market/runs", {
      body: validBody,
      idempotencyKey: `smoke-sim-decision-${Date.now()}`,
    });
    assert("create run returns 200", createRun.status === 200, createRun.body);
    const run = createRun.body?.data;
    const runId = run?.runId;
    assert("run has runId", typeof runId === "string", run);
    assert("run does not auto-create decision", true);

    // --- verify POST /simulated-market/runs did not create a decision ---
    const decisionsBefore = await request("GET", "/operations/decisions");
    assert(
      "simulated run does not auto-create decision_record",
      Array.isArray(decisionsBefore.body?.data?.items) && decisionsBefore.body.data.items.length === 0,
      decisionsBefore.body
    );

    // --- create decision from simulation run ---
    const decisionBody = {
      skuId: "smoke_sku_001",
      channelId: "douyin:shop:semir_official",
      recommendation: "test_launch",
      rationale: "模拟市场反馈整体可接受",
      simulationRunId: runId,
    };
    const createDecision = await request("POST", "/operations/decisions", {
      body: decisionBody,
    });
    assert("create decision from simulation run returns 200", createDecision.status === 200, createDecision.body);
    const decisionId = createDecision.body?.data?.decisionId;
    assert("decision has id", typeof decisionId === "string", createDecision.body);

    const decisionDetail = await request("GET", `/operations/decisions/${decisionId}`);
    assert("decision detail returns 200", decisionDetail.status === 200, decisionDetail.body);
    const detailData = decisionDetail.body?.data;
    assert(
      "decision detail has simulationRunId",
      detailData?.simulationRunId === runId,
      detailData
    );
    assert(
      "decision detail has sourceType",
      detailData?.sourceType === "manual_strategy",
      detailData
    );
    assert(
      "decision detail has sourceRef",
      typeof detailData?.sourceRef === "object",
      detailData
    );
    assert(
      "decision detail sourceRef falls back to run inputSnapshot.sourceRef",
      detailData?.sourceRef?.id === runSourceRef.id && detailData?.sourceRef?.type === runSourceRef.type,
      detailData
    );
    assert(
      "decision detail has simulationSummary with scores",
      typeof detailData?.simulationSummary?.acceptanceScore === "number" &&
        typeof detailData?.simulationSummary?.purchaseIntentScore === "number" &&
        typeof detailData?.simulationSummary?.confidence === "number" &&
        Array.isArray(detailData?.simulationSummary?.riskSummary) &&
        Array.isArray(detailData?.simulationSummary?.recommendedAdjustments),
      detailData
    );

    // --- explicit sourceRef overrides run default ---
    const explicitSourceRef = { id: "manual_001", type: "manual_strategy" };
    const explicitDecision = await request("POST", "/operations/decisions", {
      body: { ...decisionBody, sourceRef: explicitSourceRef },
    });
    assert(
      "decision with explicit sourceRef returns 200",
      explicitDecision.status === 200,
      explicitDecision.body
    );
    const explicitDecisionId = explicitDecision.body?.data?.decisionId;
    const explicitDetail = await request("GET", `/operations/decisions/${explicitDecisionId}`);
    assert(
      "explicit sourceRef overrides run default",
      explicitDetail.body?.data?.sourceRef?.id === explicitSourceRef.id,
      explicitDetail.body
    );

    // --- list decisions includes provenance fields ---
    const list = await request("GET", "/operations/decisions");
    assert("list decisions returns 200", list.status === 200, list.body);
    const listedDecision = list.body?.data?.items?.find((d) => d.decisionId === decisionId);
    assert("list contains decision", !!listedDecision, list.body);
    assert(
      "listed decision has simulationRunId",
      listedDecision?.simulationRunId === runId,
      listedDecision
    );
    assert(
      "listed decision has sourceType",
      listedDecision?.sourceType === "manual_strategy",
      listedDecision
    );
    assert(
      "listed decision sourceRef falls back to run inputSnapshot.sourceRef",
      listedDecision?.sourceRef?.id === runSourceRef.id && listedDecision?.sourceRef?.type === runSourceRef.type,
      listedDecision
    );

    // --- simulationRunId not found ---
    const notFoundDecision = await request("POST", "/operations/decisions", {
      body: {
        ...decisionBody,
        simulationRunId: "sim_nonexistent",
      },
    });
    assert(
      "nonexistent simulationRunId returns 404",
      notFoundDecision.status === 404,
      notFoundDecision.body
    );

    // --- cross-workspace isolation ---
    const crossWsDecision = await request("POST", "/operations/decisions", {
      workspace: WS_OTHER,
      body: decisionBody,
    });
    assert(
      "cross-workspace simulationRunId returns 404",
      crossWsDecision.status === 404,
      crossWsDecision.body
    );

    // --- old match suggestion path still compatible ---
    const matchDecision = await request("POST", "/operations/decisions", {
      body: {
        skuId: "smoke_sku_002",
        channelId: "douyin:shop:semir_official",
        recommendation: "priority_launch",
        rationale: "legacy match suggestion path",
        matchId: "match_legacy_001",
      },
    });
    assert(
      "legacy match path returns 200",
      matchDecision.status === 200,
      matchDecision.body
    );
    const matchDecisionId = matchDecision.body?.data?.decisionId;
    const matchDetail = await request("GET", `/operations/decisions/${matchDecisionId}`);
    assert(
      "legacy match decision preserves matchId",
      matchDetail.body?.data?.matchId === "match_legacy_001",
      matchDetail.body
    );
    assert(
      "legacy match decision has no simulationRunId",
      matchDetail.body?.data?.simulationRunId === null,
      matchDetail.body
    );

    // --- invalid sourceType ---
    const invalidSourceType = await request("POST", "/operations/decisions", {
      body: {
        ...decisionBody,
        sourceType: "invalid_source",
      },
    });
    assert(
      "invalid sourceType returns 400",
      invalidSourceType.status === 400,
      invalidSourceType.body
    );
  } finally {
    await stopServer(server.child);
  }

  const ok = failed === 0;
  console.log(
    `\nRESULT: ${JSON.stringify({
      name: "smoke-simulated-market-decision",
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
      name: "smoke-simulated-market-decision",
      ok: false,
      passed,
      failed,
      error: e.message,
    })}`
  );
  process.exit(1);
});

#!/usr/bin/env node
// A-P7-SIM-1: Simulated market API smoke.
//
// Assumptions:
// - This script starts and stops its own PLS server on a random port.
// - It creates two isolated temporary workspaces via the Admin rebuild API
//   (POST /admin/database/rebuild) and does NOT touch ws_demo.
// - All simulation_run rows are written to the temporary workspace(s) only.
// - The server must expose /admin/database/rebuild with the standard admin token.

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
  console.log(`Smoke simulated-market API`);
  console.log(`Precondition: this script creates isolated temporary workspaces via /admin/database/rebuild and does not touch ws_demo.`);

  const server = await startServer();

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
    assert(
      "invalid run error code",
      invalidRun.body?.code === "invalid_input",
      invalidRun.body
    );

    // --- create a valid run ---
    const idemKey = `smoke-sim-${Date.now()}`;
    const agents = templates.body.data.agents.slice(0, 2);
    const validBody = {
      sourceType: "manual_strategy",
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
      idempotencyKey: idemKey,
    });
    assert("create run returns 200", createRun.status === 200, createRun.body);
    const run = createRun.body?.data;
    assert("run has runId", typeof run?.runId === "string", run);
    assert("run has workspaceId", run?.workspaceId === WS_MAIN, run);
    assert("run status is succeeded", run?.status === "succeeded", run);
    assert(
      "run provider is deterministic_fallback",
      run?.provider === "deterministic_fallback",
      run
    );
    assert(
      "run qualityFlags include fallback flag",
      Array.isArray(run?.qualityFlags) && run.qualityFlags.includes("deterministic_fallback_used"),
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
    assert(
      "cross-workspace run returns 404",
      otherDetail.status === 404,
      otherDetail.body
    );

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

#!/usr/bin/env node
// A-P3-DB-MGMT-3: Empty-business-DB admin smoke wrapper.
// Assumes the configured workspace (default ws_demo) has empty business schema.
// Runs database(empty), import(dry-run), and dangerous smoke on that workspace.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE = process.env.PLS_API_BASE ?? "http://localhost:3100/api/v0";
const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
const ADMIN_TOKEN = process.env.PLS_ADMIN_TOKEN ?? "pls-admin-token";
const WS = process.env.PLS_WORKSPACE ?? `ws_empty_${Date.now()}`;

const env = {
  ...process.env,
  PLS_API_BASE: BASE,
  PLS_API_TOKEN: TOKEN,
  PLS_ADMIN_TOKEN: ADMIN_TOKEN,
  PLS_WORKSPACE: WS,
};

function run(name, args = [], extraEnv = {}) {
  const script = join(__dirname, `smoke-${name}.mjs`);
  console.log(`\n>>> Running smoke-${name} (empty mode)`);
  const child = spawnSync(process.execPath, [script, ...args], {
    env: { ...env, ...extraEnv },
    cwd: process.cwd(),
    stdio: ["inherit", "pipe", "pipe"],
    encoding: "utf8",
  });
  const stdout = child.stdout ?? "";
  const stderr = child.stderr ?? "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  const result = parseResult(stdout);
  return { ok: child.status === 0, result, stdout, stderr };
}

function parseResult(output) {
  const match = output.match(/RESULT:\s*(\{[^\n]+\})/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

async function initWorkspace() {
  console.log(`\n>>> Creating temporary empty workspace ${WS}`);
  const res = await fetch(`${BASE}/admin/database/rebuild`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "X-PLS-Workspace": WS,
      "Content-Type": "application/json",
      "X-PLS-Admin-Token": ADMIN_TOKEN,
      "Idempotency-Key": `empty_init_${Date.now()}`,
    },
    body: JSON.stringify({ confirmText: `RESET ${WS}`, skipSnapshot: true }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`rebuild failed: ${res.status} ${JSON.stringify(body)}`);
  }
}

async function main() {
  console.log(`Smoke admin-empty against ${BASE}`);
  console.log("This script creates a temporary workspace with an empty business schema and runs read-only/dry-run smoke.");

  await initWorkspace();

  const results = [];
  results.push(run("admin-database", [], { PLS_ADMIN_SMOKE_MODE: "empty" }));
  results.push(run("admin-import", [], { PLS_ADMIN_SMOKE_MODE: "dry-run" }));
  results.push(run("admin-dangerous"));

  const allOk = results.every((r) => r.ok && r.result?.ok);
  const summary = results.map((r) => r.result ?? { name: "unknown", ok: false, error: "no result line" });

  console.log("\nSUMMARY: " + JSON.stringify({ mode: "empty", workspace: WS, allOk, results: summary }));
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

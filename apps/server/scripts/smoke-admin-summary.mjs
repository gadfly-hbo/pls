#!/usr/bin/env node
// A-P3-DB-MGMT-3: JSON summary runner for all admin smoke modes.
// Runs empty-mode and imported-mode suites and outputs a single JSON summary.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const env = { ...process.env };
const BASE = process.env.PLS_API_BASE ?? "http://localhost:3100/api/v0";
const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
const ADMIN_TOKEN = process.env.PLS_ADMIN_TOKEN ?? "pls-admin-token";

async function initWorkspace(ws) {
  console.log(`\n>>> Initializing workspace ${ws} for empty-mode smoke`);
  const res = await fetch(`${BASE}/admin/database/rebuild`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "X-PLS-Workspace": ws,
      "Content-Type": "application/json",
      "X-PLS-Admin-Token": ADMIN_TOKEN,
      "Idempotency-Key": `summary_init_${Date.now()}`,
    },
    body: JSON.stringify({ confirmText: `RESET ${ws}`, skipSnapshot: true }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`rebuild failed: ${res.status} ${JSON.stringify(body)}`);
  }
}

function run(name, extraEnv = {}) {
  const script = join(__dirname, `smoke-${name}.mjs`);
  console.log(`\n>>> Running smoke-${name}`);
  const child = spawnSync(process.execPath, [script], {
    env: { ...env, ...extraEnv },
    cwd: process.cwd(),
    stdio: ["inherit", "pipe", "pipe"],
    encoding: "utf8",
  });
  const stdout = child.stdout ?? "";
  const stderr = child.stderr ?? "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  const summary = parseSummary(stdout);
  return { ok: child.status === 0, name, summary };
}

function parseSummary(output) {
  const lines = output.split("\n");
  for (const line of lines) {
    if (line.startsWith("SUMMARY:")) {
      try {
        return JSON.parse(line.slice("SUMMARY:".length).trim());
      } catch { /* ignore */ }
    }
  }
  return { raw: "no summary found" };
}

async function main() {
  console.log("Smoke admin summary runner");
  console.log("This runs both empty-mode and imported-mode admin smoke suites on isolated workspaces.");

  const ts = Date.now();
  const emptyWs = `ws_summary_empty_${ts}`;
  const importedWs = `ws_summary_imported_${ts}`;

  await initWorkspace(emptyWs);
  const empty = run("admin-empty", { PLS_WORKSPACE: emptyWs });
  const imported = run("admin-imported", { PLS_WORKSPACE: importedWs });
  const allOk = empty.ok && imported.ok;

  const summary = {
    timestamp: new Date().toISOString(),
    allOk,
    suites: {
      empty: { ok: empty.ok, name: empty.name, summary: empty.summary },
      imported: { ok: imported.ok, name: imported.name, summary: imported.summary },
    },
  };

  console.log("\n" + "=".repeat(60));
  console.log("JSON SUMMARY");
  console.log("=".repeat(60));
  console.log(JSON.stringify(summary, null, 2));
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

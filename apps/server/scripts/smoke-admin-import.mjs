#!/usr/bin/env node
// A-P3-DB-MGMT-3: Admin import smoke with two modes:
// - PLS_ADMIN_SMOKE_MODE=dry-run (default): dry-run only, does not mutate workspace.
// - PLS_ADMIN_SMOKE_MODE=imported: performs controlled demo + douyin-bi imports on the workspace.
//
// Safety: imported mode refuses to write to ws_demo unless PLS_ALLOW_WS_DEMO_WRITE=1.
// Wrapper scripts (smoke-admin-empty, smoke-admin-imported, smoke-admin-summary) inject
// a temporary workspace by default.

import { guardWriteWorkspace } from "./lib/workspace-guard.mjs";

const BASE = process.env.PLS_API_BASE ?? "http://localhost:3100/api/v0";
const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
const ADMIN_TOKEN = process.env.PLS_ADMIN_TOKEN ?? "pls-admin-token";
const WS = process.env.PLS_WORKSPACE ?? "ws_demo";
const HDR = { Authorization: `Bearer ${TOKEN}`, "X-PLS-Workspace": WS };
const MODE = process.env.PLS_ADMIN_SMOKE_MODE ?? "dry-run";

if (MODE === "imported") {
  guardWriteWorkspace(WS, { purpose: "smoke admin-import imported mode" });
}

let passed = 0;
let failures = 0;

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: HDR, ...opts });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function assert(label, cond, detail = "") {
  if (cond) { console.log(`  OK   ${label}`); passed += 1; }
  else { console.error(`  FAIL ${label} :: ${detail}`); failures += 1; }
}

async function main() {
  console.log(`Smoke admin-import (${MODE} mode) against ${BASE}`);

  // --- import-jobs list ---
  const jobs = await req("/admin/database/import-jobs");
  assert("import-jobs returns 200", jobs.status === 200);
  assert("import-jobs has jobs array", Array.isArray(jobs.body.data?.jobs));

  // --- versions list ---
  const versionsBefore = await req("/admin/database/versions");
  assert("versions returns 200 before import", versionsBefore.status === 200);
  assert("versions has versions array", Array.isArray(versionsBefore.body.data?.versions));

  if (MODE === "dry-run") {
    assert("dry-run mode: no existing import jobs", (jobs.body.data?.jobs?.length ?? 0) === 0);
    assert("dry-run mode: no existing versions", (versionsBefore.body.data?.versions?.length ?? 0) === 0);
  }

  // --- dry-run: demo ---
  const dryDemo = await req("/admin/database/import-jobs/dry-run", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json" },
    body: JSON.stringify({ packageType: "demo" }),
  });
  assert("dry-run demo returns 200", dryDemo.status === 200);
  assert("dry-run demo operation is import", dryDemo.body.data?.operation === "import");
  assert("dry-run demo affectedTables exists", Array.isArray(dryDemo.body.data?.affectedTables));
  assert("dry-run demo affectedRows > 0", (dryDemo.body.data?.affectedRows ?? 0) > 0);
  assert("dry-run demo requiredConfirmText is IMPORT demo", dryDemo.body.data?.requiredConfirmText === "IMPORT demo");
  assert("dry-run demo sourceType is mock", dryDemo.body.data?.sourceType === "mock");
  assert("dry-run demo containsUserAuthorized is false", dryDemo.body.data?.containsUserAuthorized === false);
  assert("dry-run demo has qualityReport", dryDemo.body.data?.qualityReport != null);

  // --- dry-run: douyin-bi ---
  const dryDouyin = await req("/admin/database/import-jobs/dry-run", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json" },
    body: JSON.stringify({ packageType: "douyin-bi" }),
  });
  assert("dry-run douyin-bi returns 200", dryDouyin.status === 200);
  assert("dry-run douyin-bi operation is import", dryDouyin.body.data?.operation === "import");
  assert("dry-run douyin-bi has affectedTables", Array.isArray(dryDouyin.body.data?.affectedTables));
  assert("dry-run douyin-bi has >= 8 tables", (dryDouyin.body.data?.affectedTables?.length ?? 0) >= 8,
    `got ${dryDouyin.body.data?.affectedTables?.length}`);
  assert("dry-run douyin-bi affectedRows > 0", (dryDouyin.body.data?.affectedRows ?? 0) > 0,
    `got ${dryDouyin.body.data?.affectedRows}`);
  assert("dry-run douyin-bi dataVersion exists", !!dryDouyin.body.data?.dataVersion);
  assert("dry-run douyin-bi sourceType is user_authorized", dryDouyin.body.data?.sourceType === "user_authorized");
  assert("dry-run douyin-bi containsUserAuthorized is true", dryDouyin.body.data?.containsUserAuthorized === true);
  assert("dry-run douyin-bi requiredConfirmText is IMPORT douyin-bi", dryDouyin.body.data?.requiredConfirmText === "IMPORT douyin-bi");
  assert("dry-run douyin-bi has qualityReport", dryDouyin.body.data?.qualityReport != null);

  // --- dry-run: missing packageType ---
  const dryMissing = await req("/admin/database/import-jobs/dry-run", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert("dry-run missing packageType returns 400", dryMissing.status === 400);

  // --- dry-run: unknown packageType ---
  const dryUnknown = await req("/admin/database/import-jobs/dry-run", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json" },
    body: JSON.stringify({ packageType: "nonexistent" }),
  });
  assert("dry-run unknown packageType returns 400", dryUnknown.status === 400);

  // --- formal import: missing admin token ---
  const importNoAdmin = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "Idempotency-Key": `no_admin_${Date.now()}` },
    body: JSON.stringify({ packageType: "demo" }),
  });
  assert("import without admin token returns 401", importNoAdmin.status === 401);

  // --- formal import: demo (no idempotency key) ---
  const importNoKey = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN },
    body: JSON.stringify({ packageType: "demo", confirmText: "IMPORT demo" }),
  });
  assert("import without Idempotency-Key returns 400", importNoKey.status === 400);

  // --- formal import: missing confirmText (with idempotency key + admin token) ---
  const importNoConfirm = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "Idempotency-Key": `no_confirm_${Date.now()}`, "X-PLS-Admin-Token": ADMIN_TOKEN },
    body: JSON.stringify({ packageType: "demo" }),
  });
  assert("import without confirmText returns 400", importNoConfirm.status === 400);

  // --- formal import: wrong confirmText (with idempotency key + admin token) ---
  const importWrongConfirm = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "Idempotency-Key": `wrong_confirm_${Date.now()}`, "X-PLS-Admin-Token": ADMIN_TOKEN },
    body: JSON.stringify({ packageType: "demo", confirmText: "WRONG" }),
  });
  assert("import wrong confirmText returns 400", importWrongConfirm.status === 400);

  if (MODE === "dry-run") {
    // --- auth ---
    const noAuth = await fetch(`${BASE}/admin/database/import-jobs`);
    assert("401 without token", noAuth.status === 401);

    // --- workspace ---
    const noWs = await fetch(`${BASE}/admin/database/import-jobs`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    assert("400 without workspace", noWs.status === 400);

    console.log(`\n${failures === 0 ? "All" : failures} smoke checks ${failures === 0 ? "passed." : "FAILED."}`);
    printResult();
    process.exit(failures === 0 ? 0 : 1);
  }

  // --- formal import: demo (with idempotency key + admin token + correct confirmText) ---
  const idemKeyDemo = `test_import_demo_${Date.now()}`;
  const importDemo = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "Idempotency-Key": idemKeyDemo, "X-PLS-Admin-Token": ADMIN_TOKEN },
    body: JSON.stringify({ packageType: "demo", confirmText: "IMPORT demo" }),
  });
  assert("import demo returns 200", importDemo.status === 200);
  assert("import demo operation is import", importDemo.body.data?.operation === "import");
  assert("import demo status is success", importDemo.body.data?.status === "success");
  assert("import demo has auditId", !!importDemo.body.data?.auditId);
  assert("import demo has afterSnapshot", !!importDemo.body.data?.afterSnapshot);
  assert("import demo has jobId", !!importDemo.body.data?.jobId);
  assert("import demo rowCount > 0", (importDemo.body.data?.afterSnapshot?.totalRows ?? 0) > 0);
  assert("import demo before totalRows is 0", (importDemo.body.data?.beforeSnapshot?.totalRows ?? null) === 0);

  // --- idempotency replay: same key returns cached result ---
  const importReplay = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "Idempotency-Key": idemKeyDemo, "X-PLS-Admin-Token": ADMIN_TOKEN },
    body: JSON.stringify({ packageType: "demo", confirmText: "IMPORT demo" }),
  });
  assert("idempotency replay returns 200", importReplay.status === 200);
  assert("idempotency replay has same jobId", importReplay.body.data?.jobId === importDemo.body.data?.jobId);

  // --- idempotency replay WITHOUT admin token: must be 401, not replayed 200 ---
  const importReplayNoAdmin = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "Idempotency-Key": idemKeyDemo },
    body: JSON.stringify({ packageType: "demo", confirmText: "IMPORT demo" }),
  });
  assert("replay without admin token returns 401 (not 200)", importReplayNoAdmin.status === 401);

  // --- idempotency conflict: different payload with same key ---
  const importConflict = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "Idempotency-Key": idemKeyDemo, "X-PLS-Admin-Token": ADMIN_TOKEN },
    body: JSON.stringify({ packageType: "douyin-bi", confirmText: "IMPORT douyin-bi" }),
  });
  assert("idempotency conflict returns 409", importConflict.status === 409);

  // --- versions after demo import ---
  const versionsAfterDemo = await req("/admin/database/versions");
  assert("versions after demo import returns 200", versionsAfterDemo.status === 200);
  assert("versions has demo entry", versionsAfterDemo.body.data?.versions?.some((v) => v.source === "demo_seed"));

  // --- formal import: douyin-bi ---
  const idemKeyDouyin = `test_import_douyin_${Date.now()}`;
  const importDouyin = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "Idempotency-Key": idemKeyDouyin, "X-PLS-Admin-Token": ADMIN_TOKEN },
    body: JSON.stringify({ packageType: "douyin-bi", confirmText: "IMPORT douyin-bi" }),
  });
  assert("import douyin-bi returns 200", importDouyin.status === 200);
  assert("import douyin-bi status is success", importDouyin.body.data?.status === "success");
  assert("import douyin-bi has auditId", !!importDouyin.body.data?.auditId);
  assert("import douyin-bi has dataVersion", !!importDouyin.body.data?.afterSnapshot?.dataVersion);
  assert("import douyin-bi rowCount > 0", (importDouyin.body.data?.afterSnapshot?.totalRows ?? 0) > 0);

  // --- versions after douyin-bi import ---
  const versionsAfterDouyin = await req("/admin/database/versions");
  assert("versions after douyin-bi import returns 200", versionsAfterDouyin.status === 200);
  assert("versions has douyin-bi entry", versionsAfterDouyin.body.data?.versions?.some((v) => v.source === "douyin_report_dashboard"));

  // --- import-jobs list now has entries ---
  const jobsAfter = await req("/admin/database/import-jobs");
  assert("import-jobs has entries after import", (jobsAfter.body.data?.jobs?.length ?? 0) >= 2);

  // --- auth ---
  const noAuth = await fetch(`${BASE}/admin/database/import-jobs`);
  assert("401 without token", noAuth.status === 401);

  // --- workspace ---
  const noWs = await fetch(`${BASE}/admin/database/import-jobs`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  assert("400 without workspace", noWs.status === 400);

  printResult();
  process.exit(failures === 0 ? 0 : 1);
}

function printResult() {
  console.log(`\nRESULT: ${JSON.stringify({ name: "admin-import", mode: MODE, workspace: WS, passed, failed: failures, ok: failures === 0 })}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

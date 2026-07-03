#!/usr/bin/env node
// A-P3-DB-4: Smoke script for the admin import, versions, and quality API.
// Assumes server on localhost:3100 and ws_demo schema ready.

const BASE = process.env.PLS_API_BASE ?? "http://localhost:3100/api/v0";
const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
const ADMIN_TOKEN = process.env.PLS_ADMIN_TOKEN ?? "pls-admin-token";
const WS = process.env.PLS_WORKSPACE ?? "ws_demo";
const HDR = { Authorization: `Bearer ${TOKEN}`, "X-PLS-Workspace": WS };

let failures = 0;

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: HDR, ...opts });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function assert(label, cond, detail = "") {
  if (cond) console.log(`  OK   ${label}`);
  else { console.error(`  FAIL ${label} :: ${detail}`); failures += 1; }
}

async function main() {
  console.log(`Smoke admin-import against ${BASE}`);

  // --- import-jobs list ---
  const jobs = await req("/admin/database/import-jobs");
  assert("import-jobs returns 200", jobs.status === 200);
  assert("import-jobs has jobs array", Array.isArray(jobs.body.data?.jobs));

  // --- dry-run: douyin-bi ---
  const dryDouyin = await req("/admin/database/import-jobs/dry-run", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json" },
    body: JSON.stringify({ packageType: "douyin-bi" }),
  });
  assert("dry-run douyin-bi returns 200", dryDouyin.status === 200);
  assert("dry-run has tables array", Array.isArray(dryDouyin.body.data?.tables));
  assert("dry-run douyin-bi has >= 8 tables", (dryDouyin.body.data?.tables?.length ?? 0) >= 8,
    `got ${dryDouyin.body.data?.tables?.length}`);
  assert("dry-run douyin-bi totalRows > 0", (dryDouyin.body.data?.totalRows ?? 0) > 0,
    `got ${dryDouyin.body.data?.totalRows}`);
  assert("dry-run has dataVersion", !!dryDouyin.body.data?.dataVersion);
  assert("dry-run has batchId", !!dryDouyin.body.data?.batchId);
  assert("dry-run has qualityReport", dryDouyin.body.data?.qualityReport != null);

  // --- dry-run: demo ---
  const dryDemo = await req("/admin/database/import-jobs/dry-run", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json" },
    body: JSON.stringify({ packageType: "demo" }),
  });
  assert("dry-run demo returns 200", dryDemo.status === 200);
  assert("dry-run demo has tables", (dryDemo.body.data?.tables?.length ?? 0) >= 1);
  assert("dry-run demo totalRows > 0", (dryDemo.body.data?.totalRows ?? 0) > 0);

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
    body: JSON.stringify({ packageType: "demo" }),
  });
  assert("import without Idempotency-Key returns 400", importNoKey.status === 400);

  // --- formal import: demo (with idempotency key + admin token) ---
  const idemKey = `test_import_${Date.now()}`;
  const importDemo = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "Idempotency-Key": idemKey, "X-PLS-Admin-Token": ADMIN_TOKEN },
    body: JSON.stringify({ packageType: "demo" }),
  });
  assert("import demo returns 200", importDemo.status === 200);
  assert("import demo has jobId", !!importDemo.body.data?.jobId);
  assert("import demo status succeeded", importDemo.body.data?.status === "succeeded");
  assert("import demo rowCount > 0", (importDemo.body.data?.rowCount ?? 0) > 0);
  assert("import demo has tables", Array.isArray(importDemo.body.data?.tables));

  // --- idempotency replay: same key returns cached result ---
  const importReplay = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "Idempotency-Key": idemKey, "X-PLS-Admin-Token": ADMIN_TOKEN },
    body: JSON.stringify({ packageType: "demo" }),
  });
  assert("idempotency replay returns 200", importReplay.status === 200);
  assert("idempotency replay has same jobId", importReplay.body.data?.jobId === importDemo.body.data?.jobId);

  // --- idempotency replay WITHOUT admin token: must be 401, not replayed 200 ---
  const importReplayNoAdmin = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "Idempotency-Key": idemKey },
    body: JSON.stringify({ packageType: "demo" }),
  });
  assert("replay without admin token returns 401 (not 200)", importReplayNoAdmin.status === 401);

  // --- idempotency conflict: different payload with same key ---
  const importConflict = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "Idempotency-Key": idemKey, "X-PLS-Admin-Token": ADMIN_TOKEN },
    body: JSON.stringify({ packageType: "douyin-bi" }),
  });
  assert("idempotency conflict returns 409", importConflict.status === 409);

  // --- import-jobs list now has entries ---
  const jobsAfter = await req("/admin/database/import-jobs");
  assert("import-jobs has entries after import", (jobsAfter.body.data?.jobs?.length ?? 0) >= 1);

  // --- versions ---
  const versions = await req("/admin/database/versions");
  assert("versions returns 200", versions.status === 200);
  assert("versions has versions array", Array.isArray(versions.body.data?.versions));
  assert("versions has >= 1 entry", (versions.body.data?.versions?.length ?? 0) >= 1);

  // --- auth ---
  const noAuth = await fetch(`${BASE}/admin/database/import-jobs`);
  assert("401 without token", noAuth.status === 401);

  // --- workspace ---
  const noWs = await fetch(`${BASE}/admin/database/import-jobs`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  assert("400 without workspace", noWs.status === 400);

  console.log(`\n${failures === 0 ? "All" : failures} smoke checks ${failures === 0 ? "passed." : "FAILED."}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

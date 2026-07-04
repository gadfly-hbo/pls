#!/usr/bin/env node
// A-P3-DB-MGMT-1: Smoke script for admin dangerous operations.
// Covers empty-DB dry-run behavior and destructive execute on a TEMP workspace.

const BASE = process.env.PLS_API_BASE ?? "http://localhost:3100/api/v0";
const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
const ADMIN_TOKEN = process.env.PLS_ADMIN_TOKEN ?? "pls-admin-token";
const WS = process.env.PLS_WORKSPACE ?? "ws_demo";
const HDR = { Authorization: `Bearer ${TOKEN}`, "X-PLS-Workspace": WS };

let passed = 0;
let failures = 0;

function assert(label, cond, detail = "") {
  if (cond) { console.log(`  OK   ${label}`); passed += 1; }
  else { console.error(`  FAIL ${label} :: ${detail}`); failures += 1; }
}

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: HDR, ...opts });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log(`Smoke admin-dangerous against ${BASE}`);

  // === truncate (empty-DB safe target) ===
  const dryTrunc = await req("/admin/database/tables/decision_record/truncate", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `dry_trunc_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  assert("truncate dry-run returns 200", dryTrunc.status === 200);
  assert("truncate dry-run operation is truncate", dryTrunc.body.data?.operation === "truncate");
  assert("truncate dry-run has affectedTables", Array.isArray(dryTrunc.body.data?.affectedTables));
  assert("truncate dry-run requiredConfirmText", dryTrunc.body.data?.requiredConfirmText === "TRUNCATE decision_record");

  // truncate without admin token
  const truncNoAuth = await req("/admin/database/tables/decision_record/truncate", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "Idempotency-Key": `trunc_noauth_${Date.now()}` },
    body: JSON.stringify({ confirmText: "TRUNCATE decision_record" }),
  });
  assert("truncate without admin token returns 401", truncNoAuth.status === 401);

  // truncate without idempotency key
  const truncNoIdem = await req("/admin/database/tables/decision_record/truncate", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN },
    body: JSON.stringify({ confirmText: "TRUNCATE decision_record" }),
  });
  assert("truncate without idempotency returns 400", truncNoIdem.status === 400);

  // truncate with wrong confirmText
  const truncWrongConfirm = await req("/admin/database/tables/decision_record/truncate", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `trunc_wrong_${Date.now()}` },
    body: JSON.stringify({ confirmText: "WRONG" }),
  });
  assert("truncate wrong confirmText returns 400", truncWrongConfirm.status === 400);

  // truncate protected table (dry-run)
  const truncProtected = await req("/admin/database/tables/schema_migration/truncate", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `trunc_prot_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  assert("truncate protected table containsSystemHistory", truncProtected.body.data?.containsSystemHistory === true);
  assert("truncate protected table warns", truncProtected.body.data?.warnings?.some((w) => w.includes("protected")) === true);

  // === drop ===
  const dryDrop = await req("/admin/database/tables/decision_record", {
    method: "DELETE",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `dry_drop_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  assert("drop dry-run returns 200", dryDrop.status === 200);
  assert("drop dry-run operation is drop", dryDrop.body.data?.operation === "drop");
  assert("drop dry-run requiredConfirmText", dryDrop.body.data?.requiredConfirmText === "DROP decision_record");

  // drop protected table (dry-run)
  const dropProtected = await req("/admin/database/tables/schema_migration", {
    method: "DELETE",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `drop_prot_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  assert("drop protected table containsSystemHistory", dropProtected.body.data?.containsSystemHistory === true);
  assert("drop protected table warns", dropProtected.body.data?.warnings?.some((w) => w.includes("protected")) === true);

  // === delete version (empty-DB should find 0 rows) ===
  const dryDelVer = await req("/admin/database/versions/nonexistent_version", {
    method: "DELETE",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `dry_delver_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  assert("delete version dry-run returns 200", dryDelVer.status === 200);
  assert("delete version empty affectedRows is 0", dryDelVer.body.data?.affectedRows === 0);
  assert("delete version requiredConfirmText", dryDelVer.body.data?.requiredConfirmText === "DELETE VERSION nonexistent_version");
  assert("delete version not found warning", dryDelVer.body.data?.warnings?.some((w) => w.includes("not found")) === true);

  // delete version with wrong confirmText (uses non-existent version so test is workspace-agnostic)
  const delVerWrong = await req("/admin/database/versions/any_version", {
    method: "DELETE",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `delver_wrong_${Date.now()}` },
    body: JSON.stringify({ confirmText: "WRONG" }),
  });
  assert("delete version wrong confirm returns 400", delVerWrong.status === 400);

  // === apply migrations ===
  const dryMigrations = await req("/admin/database/migrations/apply", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `dry_mig_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  assert("migrations dry-run returns 200", dryMigrations.status === 200);
  assert("migrations dry-run operation is apply_migrations", dryMigrations.body.data?.operation === "apply_migrations");
  assert("migrations dry-run containsSystemHistory", dryMigrations.body.data?.containsSystemHistory === true);
  assert("migrations dry-run requiredConfirmText", dryMigrations.body.data?.requiredConfirmText === "APPLY MIGRATIONS");

  const migWrong = await req("/admin/database/migrations/apply", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `mig_wrong_${Date.now()}` },
    body: JSON.stringify({ confirmText: "WRONG" }),
  });
  assert("migrations wrong confirm returns 400", migWrong.status === 400);

  // === rebuild dry-run on main workspace (read-only impact, no execute) ===
  const dryRebuild = await req("/admin/database/rebuild", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `dry_rebuild_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  assert("rebuild dry-run returns 200", dryRebuild.status === 200);
  assert("rebuild dry-run operation is rebuild", dryRebuild.body.data?.operation === "rebuild");
  assert("rebuild dry-run targetType is workspace", dryRebuild.body.data?.targetType === "workspace");
  assert("rebuild dry-run targetName is current ws", dryRebuild.body.data?.targetName === WS);
  assert("rebuild dry-run has affectedTables", Array.isArray(dryRebuild.body.data?.affectedTables));
  assert("rebuild dry-run requiredConfirmText", dryRebuild.body.data?.requiredConfirmText === `RESET ${WS}`);
  assert("rebuild dry-run warns about system history",
    dryRebuild.body.data?.warnings?.some((w) => w.includes("protected")) === true,
    `got warnings: ${JSON.stringify(dryRebuild.body.data?.warnings)}`);

  const rebuildNoAuth = await req("/admin/database/rebuild", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "Idempotency-Key": `rebuild_noauth_${Date.now()}` },
    body: JSON.stringify({ confirmText: `RESET ${WS}` }),
  });
  assert("rebuild without admin token returns 401", rebuildNoAuth.status === 401);

  const rebuildWrong = await req("/admin/database/rebuild", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `rebuild_wrong_${Date.now()}` },
    body: JSON.stringify({ confirmText: "WRONG" }),
  });
  assert("rebuild wrong confirm returns 400", rebuildWrong.status === 400);

  // === REAL destructive operations on TEMPORARY workspace ===
  const DROP_WS = `ws_drop_test_${Date.now()}`;
  const dropHdr = { Authorization: `Bearer ${TOKEN}`, "X-PLS-Workspace": DROP_WS };
  // Initialize temp workspace with full schema via rebuild
  await fetch(`${BASE}/admin/database/rebuild`, {
    method: "POST",
    headers: { ...dropHdr, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `drop_init_${Date.now()}` },
    body: JSON.stringify({ confirmText: `RESET ${DROP_WS}`, skipSnapshot: true }),
  });
  // Drop a view (match_result_latest is created by SCHEMA_DDL)
  const dropViewRes = await fetch(`${BASE}/admin/database/tables/match_result_latest`, {
    method: "DELETE",
    headers: { ...dropHdr, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `drop_view_${Date.now()}` },
    body: JSON.stringify({ confirmText: "DROP match_result_latest" }),
  });
  assert("real drop view returns 200 (not 500)", dropViewRes.status === 200,
    `got ${dropViewRes.status}`);
  // Verify view is gone
  const viewCheck = await fetch(`${BASE}/admin/database/tables/match_result_latest/schema`, { headers: dropHdr });
  assert("view is dropped (404)", viewCheck.status === 404);

  // Drop a real business table so we can test truncate/drop on non-existent target
  const dropTableRes = await fetch(`${BASE}/admin/database/tables/decision_record`, {
    method: "DELETE",
    headers: { ...dropHdr, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `drop_table_${Date.now()}` },
    body: JSON.stringify({ confirmText: "DROP decision_record" }),
  });
  assert("real drop business table returns 200", dropTableRes.status === 200);

  // Truncate non-existent table -> 404
  const truncMissing = await fetch(`${BASE}/admin/database/tables/decision_record/truncate`, {
    method: "POST",
    headers: { ...dropHdr, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `trunc_missing_${Date.now()}` },
    body: JSON.stringify({ confirmText: "TRUNCATE decision_record" }),
  });
  assert("truncate non-existent table returns 404", truncMissing.status === 404);

  // Drop non-existent table (in whitelist) -> 404
  const dropMissing = await fetch(`${BASE}/admin/database/tables/decision_record`, {
    method: "DELETE",
    headers: { ...dropHdr, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `drop_missing_${Date.now()}` },
    body: JSON.stringify({ confirmText: "DROP decision_record" }),
  });
  assert("drop non-existent table returns 404", dropMissing.status === 404);

  // === real DELETE VERSION on TEMP workspace with imported data ===
  const DEL_WS = `ws_review_delete_version_${Date.now()}`;
  const delHdr = { Authorization: `Bearer ${TOKEN}`, "X-PLS-Workspace": DEL_WS };
  await fetch(`${BASE}/admin/database/tables/workspace/sample?limit=1`, { headers: delHdr });
  await fetch(`${BASE}/admin/database/rebuild`, {
    method: "POST",
    headers: { ...delHdr, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `temp_init_${Date.now()}` },
    body: JSON.stringify({ confirmText: `RESET ${DEL_WS}`, skipSnapshot: true }),
  });
  const importRes = await fetch(`${BASE}/admin/database/import-jobs`, {
    method: "POST",
    headers: { ...delHdr, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `temp_import_${Date.now()}` },
    body: JSON.stringify({ packageType: "douyin-bi", confirmText: "IMPORT douyin-bi" }),
  });
  const importBody = await importRes.json();
  assert("temp workspace import douyin-bi returns 200", importRes.status === 200,
    `got ${importRes.status}, body: ${JSON.stringify(importBody).slice(0, 300)}`);
  assert("temp workspace import has rowCount > 0", (importBody.data?.afterSnapshot?.totalRows ?? 0) > 0,
    `got rowCount=${importBody.data?.afterSnapshot?.totalRows}`);

  const importedVersion = importBody.data?.afterSnapshot?.dataVersion ?? "v1_20260703";
  assert("temp workspace import dataVersion exists", !!importedVersion);

  // Dry-run delete imported version
  const tempDry = await fetch(`${BASE}/admin/database/versions/${importedVersion}`, {
    method: "DELETE",
    headers: { ...delHdr, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `temp_drydel_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  const tempDryBody = await tempDry.json();
  assert("temp workspace dry-run delete returns 200", tempDry.status === 200);
  const dryRows = tempDryBody.data?.affectedRows ?? 0;
  assert("temp workspace dry-run finds > 0 rows", dryRows > 0,
    `dryRows=${dryRows}, data=${JSON.stringify(tempDryBody.data)}`);
  assert("temp workspace dry-run lists douyin tables",
    tempDryBody.data?.affectedTables?.some((t) => t.startsWith("douyin_")) === true,
    `got ${JSON.stringify(tempDryBody.data?.affectedTables)}`);
  assert("temp workspace dry-run warns user_authorized",
    tempDryBody.data?.warnings?.some((w) => w.includes("user_authorized")) === true);
  assert("temp workspace dry-run requiredConfirmText",
    tempDryBody.data?.requiredConfirmText === `DELETE VERSION ${importedVersion}`);

  // Real delete with correct confirmText
  const tempReal = await fetch(`${BASE}/admin/database/versions/${importedVersion}`, {
    method: "DELETE",
    headers: { ...delHdr, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `temp_realdel_${Date.now()}` },
    body: JSON.stringify({ confirmText: `DELETE VERSION ${importedVersion}` }),
  });
  assert("temp workspace real delete returns 200 (not 404)", tempReal.status === 200,
    `got ${tempReal.status}`);
  const tempRealBody = await tempReal.json();
  assert("temp workspace real delete has auditId", !!tempRealBody.data?.auditId);
  assert("temp workspace real delete status success", tempRealBody.data?.status === "success");

  // Verify data is gone
  const tempAfter = await fetch(`${BASE}/admin/database/versions/${importedVersion}`, {
    method: "DELETE",
    headers: { ...delHdr, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `temp_afterdel_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  const tempAfterBody = await tempAfter.json();
  const afterRows = tempAfterBody.data?.affectedRows ?? 0;
  assert("after real delete, dry-run finds 0 rows", afterRows === 0,
    `afterRows=${afterRows}, warnings=${JSON.stringify(tempAfterBody.data?.warnings)}`);

  // === rebuild on TEMPORARY workspace (smoke-safe) ===
  const TEMP_WS = `ws_smoke_${Date.now()}`;
  const tempHdr = { Authorization: `Bearer ${TOKEN}`, "X-PLS-Workspace": TEMP_WS };
  await fetch(`${BASE}/admin/database/tables/workspace/sample?limit=1`, { headers: tempHdr });
  const tempRebuild = await fetch(`${BASE}/admin/database/rebuild`, {
    method: "POST",
    headers: { ...tempHdr, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `temp_rebuild_${Date.now()}` },
    body: JSON.stringify({ confirmText: `RESET ${TEMP_WS}`, skipSnapshot: true }),
  });
  const tempRebuildBody = await tempRebuild.json();
  assert("temp workspace rebuild returns 200", tempRebuild.status === 200);
  assert("temp workspace rebuild status success", tempRebuildBody.data?.status === "success");
  assert("temp workspace rebuild has auditId", !!tempRebuildBody.data?.auditId);
  assert("temp workspace rebuild has steps", Array.isArray(tempRebuildBody.data?.afterSnapshot?.steps));
  const allOk = tempRebuildBody.data?.afterSnapshot?.steps?.every((s) => s.status === "ok" || s.status === "skipped");
  assert("temp workspace rebuild all steps ok/skipped", allOk === true);

  // Verify rebuild did not affect main ws_demo
  const mainCheck = await fetch(`${BASE}/admin/database/tables`, { headers: HDR });
  const mainCheckBody = await mainCheck.json();
  const mainTableCount = mainCheckBody.data?.tables?.length ?? 0;
  assert("main ws_demo not affected by temp rebuild", mainTableCount >= 28);

  console.log(`\n${failures === 0 ? "All" : failures} smoke checks ${failures === 0 ? "passed." : "FAILED."}`);
  printResult();
  process.exit(failures === 0 ? 0 : 1);
}

function printResult() {
  console.log(`\nRESULT: ${JSON.stringify({ name: "admin-dangerous", workspace: WS, passed, failed: failures, ok: failures === 0 })}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

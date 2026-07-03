#!/usr/bin/env node
// A-P3-DB-6: Smoke script for admin dangerous operations.
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
  console.log(`Smoke admin-dangerous against ${BASE}`);

  // === truncate ===
  // dry-run truncate
  const dryTrunc = await req("/admin/database/tables/decision_record/truncate", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `dry_trunc_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  assert("truncate dry-run returns 200", dryTrunc.status === 200);
  assert("truncate dry-run has impact", dryTrunc.body.data?.dryRun === true);
  assert("truncate dry-run has affectedTables", Array.isArray(dryTrunc.body.data?.impact?.affectedTables));

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

  // truncate protected table
  const truncProtected = await req("/admin/database/tables/schema_migration/truncate", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `trunc_prot_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  assert("truncate protected table isProtected=true", truncProtected.body.data?.impact?.isProtected === true);

  // === drop ===
  // dry-run drop
  const dryDrop = await req("/admin/database/tables/decision_record", {
    method: "DELETE",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `dry_drop_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  assert("drop dry-run returns 200", dryDrop.status === 200);

  // drop protected table
  const dropProtected = await req("/admin/database/tables/schema_migration", {
    method: "DELETE",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `drop_prot_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  assert("drop protected table isProtected=true", dropProtected.body.data?.impact?.isProtected === true);

  // === delete version ===
  // dry-run delete nonexistent version
  const dryDelVer = await req("/admin/database/versions/nonexistent_version", {
    method: "DELETE",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `dry_delver_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  assert("delete version dry-run returns 200", dryDelVer.status === 200);
  assert("delete version not found", dryDelVer.body.data?.impact?.warnings?.length > 0);

  // dry-run delete REAL data_version v1_20260703 (matches douyin_* rows)
  const dryDelVerReal = await req("/admin/database/versions/v1_20260703", {
    method: "DELETE",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `dry_delver_real_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  assert("delete version v1_20260703 dry-run returns 200", dryDelVerReal.status === 200);
  assert("delete version v1_20260703 finds data", (dryDelVerReal.body.data?.impact?.affectedRows ?? 0) > 0,
    `got ${dryDelVerReal.body.data?.impact?.affectedRows}`);
  assert("delete version v1_20260703 lists douyin tables",
    dryDelVerReal.body.data?.impact?.affectedTables?.some((t) => t.startsWith("douyin_")) === true,
    `got ${JSON.stringify(dryDelVerReal.body.data?.impact?.affectedTables)}`);
  assert("delete version v1_20260703 warns user_authorized",
    dryDelVerReal.body.data?.impact?.warnings?.some((w) => w.includes("user_authorized")) === true);

  // delete version with wrong confirmText
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

  const migWrong = await req("/admin/database/migrations/apply", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `mig_wrong_${Date.now()}` },
    body: JSON.stringify({ confirmText: "WRONG" }),
  });
  assert("migrations wrong confirm returns 400", migWrong.status === 400);

  // === rebuild ===
  const dryRebuild = await req("/admin/database/rebuild", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `dry_rebuild_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  assert("rebuild dry-run returns 200", dryRebuild.status === 200);
  assert("rebuild dry-run targetType=workspace", dryRebuild.body.data?.impact?.targetType === "workspace");
  assert("rebuild dry-run has affectedTables", Array.isArray(dryRebuild.body.data?.impact?.affectedTables));

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

  // === rebuild dry-run: must include protected system table rows ===
  const rebuildDryCheck = await req("/admin/database/rebuild", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `rebuild_drycheck_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  assert("rebuild dry-run returns 200", rebuildDryCheck.status === 200);
  assert("rebuild dry-run warns about protected tables",
    rebuildDryCheck.body.data?.impact?.warnings?.some((w) => w.includes("protected")) === true,
    `got warnings: ${JSON.stringify(rebuildDryCheck.body.data?.impact?.warnings)}`);

  // === real drop view on TEMP workspace (smoke-safe) ===
  // Use temp workspace so we don't touch main ws_demo
  const DROP_WS = `ws_drop_test_${Date.now()}`;
  const dropHdr = { Authorization: `Bearer ${TOKEN}`, "X-PLS-Workspace": DROP_WS };
  // Initialize temp workspace
  await fetch(`${BASE}/admin/database/tables/workspace/sample?limit=1`, { headers: dropHdr });
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

  // === real DELETE VERSION on TEMP workspace with imported data ===
  // Initialize temp workspace via rebuild (creates full schema), import douyin-bi, then delete v1_20260703
  const DEL_WS = `ws_review_delete_version_${Date.now()}`;
  const delHdr = { Authorization: `Bearer ${TOKEN}`, "X-PLS-Workspace": DEL_WS };
  // 1. Init temp workspace dir + run rebuild to create full schema
  await fetch(`${BASE}/admin/database/tables/workspace/sample?limit=1`, { headers: delHdr });
  await fetch(`${BASE}/admin/database/rebuild`, {
    method: "POST",
    headers: { ...delHdr, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `temp_init_${Date.now()}` },
    body: JSON.stringify({ confirmText: `RESET ${DEL_WS}`, skipSnapshot: true }),
  });
  // 2. Import douyin-bi via admin API
  const importRes = await fetch(`${BASE}/admin/database/import-jobs`, {
    method: "POST",
    headers: { ...delHdr, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `temp_import_${Date.now()}` },
    body: JSON.stringify({ packageType: "douyin-bi" }),
  });
  const importBody = await importRes.json();
  assert("temp workspace import douyin-bi returns 200", importRes.status === 200,
    `got ${importRes.status}, body: ${JSON.stringify(importBody).slice(0, 300)}`);
  assert("temp workspace import has rowCount > 0", (importBody.data?.rowCount ?? 0) > 0,
    `got rowCount=${importBody.data?.rowCount}`);
  // 3. Dry-run delete v1_20260703
  const tempDry = await fetch(`${BASE}/admin/database/versions/v1_20260703`, {
    method: "DELETE",
    headers: { ...delHdr, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `temp_drydel_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  const tempDryBody = await tempDry.json();
  assert("temp workspace dry-run delete returns 200", tempDry.status === 200);
  const dryRows = tempDryBody.data?.impact?.affectedRows ?? 0;
  assert("temp workspace dry-run finds > 0 rows", dryRows > 0,
    `dryRows=${dryRows}, impact=${JSON.stringify(tempDryBody.data?.impact)}`);
  // 4. Real delete with correct confirmText
  const tempReal = await fetch(`${BASE}/admin/database/versions/v1_20260703`, {
    method: "DELETE",
    headers: { ...delHdr, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `temp_realdel_${Date.now()}` },
    body: JSON.stringify({ confirmText: "DELETE VERSION v1_20260703" }),
  });
  assert("temp workspace real delete returns 200 (not 404)", tempReal.status === 200,
    `got ${tempReal.status}, body: ${JSON.stringify(await tempReal.clone().json().catch(() => ({})))}`);
  // 5. Verify data is gone (dry-run should now find 0 rows)
  const tempAfter = await fetch(`${BASE}/admin/database/versions/v1_20260703`, {
    method: "DELETE",
    headers: { ...delHdr, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `temp_afterdel_${Date.now()}` },
    body: JSON.stringify({ dryRun: true }),
  });
  const tempAfterBody = await tempAfter.json();
  const afterRows = tempAfterBody.data?.impact?.affectedRows ?? 0;
  assert("after real delete, dry-run finds 0 rows", afterRows === 0,
    `afterRows=${afterRows}, warnings=${JSON.stringify(tempAfterBody.data?.impact?.warnings)}`);

  // === rebuild on TEMPORARY workspace (smoke-safe) ===
  const TEMP_WS = `ws_smoke_${Date.now()}`;
  const tempHdr = { Authorization: `Bearer ${TOKEN}`, "X-PLS-Workspace": TEMP_WS };
  // Init temp workspace via migrations
  await fetch(`${BASE}/admin/database/tables/workspace/sample?limit=1`, { headers: tempHdr });
  const tempRebuild = await fetch(`${BASE}/admin/database/rebuild`, {
    method: "POST",
    headers: { ...tempHdr, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `temp_rebuild_${Date.now()}` },
    body: JSON.stringify({ confirmText: `RESET ${TEMP_WS}`, skipSnapshot: true }),
  });
  const tempRebuildBody = await tempRebuild.json();
  assert("temp workspace rebuild returns 200", tempRebuild.status === 200);
  assert("temp workspace rebuild has steps", Array.isArray(tempRebuildBody.data?.steps));
  const allOk = tempRebuildBody.data?.steps?.every((s) => s.status === "ok" || s.status === "skipped");
  assert("temp workspace rebuild all steps ok/skipped", allOk === true);

  // Verify rebuild did not affect main ws_demo
  const mainCheck = await fetch(`${BASE}/admin/database/tables`, { headers: HDR });
  const mainCheckBody = await mainCheck.json();
  const mainTableCount = mainCheckBody.data?.tables?.length ?? 0;
  assert("main ws_demo not affected by temp rebuild", mainTableCount >= 28);

  console.log(`\n${failures === 0 ? "All" : failures} smoke checks ${failures === 0 ? "passed." : "FAILED."}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
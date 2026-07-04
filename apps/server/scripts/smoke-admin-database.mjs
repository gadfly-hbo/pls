#!/usr/bin/env node
// A-P3-DB-MGMT-3: Admin database smoke with two modes:
// - PLS_ADMIN_SMOKE_MODE=empty (default): validates an empty-business-schema workspace.
// - PLS_ADMIN_SMOKE_MODE=imported: validates a workspace after demo + douyin-bi imports.

const BASE = process.env.PLS_API_BASE ?? "http://localhost:3100/api/v0";
const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
const WS = process.env.PLS_WORKSPACE ?? "ws_demo";
const HDR = { Authorization: `Bearer ${TOKEN}`, "X-PLS-Workspace": WS };
const MODE = process.env.PLS_ADMIN_SMOKE_MODE ?? "empty";

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

function printResult() {
  console.log(`\nRESULT: ${JSON.stringify({ name: "admin-database", mode: MODE, workspace: WS, passed, failed: failures, ok: failures === 0 })}`);
}

async function main() {
  console.log(`Smoke admin-database (${MODE} mode) against ${BASE}`);

  // --- overview ---
  const overview = await req("/admin/database/overview");
  assert("overview returns 200", overview.status === 200, `got ${overview.status}`);
  assert("overview has workspaceId", overview.body.data?.workspaceId === WS);
  assert("overview tableCount >= 28", (overview.body.data?.tableCount ?? 0) >= 28,
    `got ${overview.body.data?.tableCount}`);
  assert("overview viewCount >= 10", (overview.body.data?.viewCount ?? 0) >= 10,
    `got ${overview.body.data?.viewCount}`);
  assert("overview migrationStatus.applied >= 1",
    (overview.body.data?.migrationStatus?.applied ?? 0) >= 1,
    `got ${overview.body.data?.migrationStatus?.applied}`);
  assert("overview lastAuditEvent exists", !!overview.body.data?.lastAuditEvent);

  const totalRows = overview.body.data?.totalRows ?? 0;
  if (MODE === "empty") {
    // Empty-business-schema expectation: only system/runtime rows (workspace, schema_migration, db_admin_audit)
    assert("overview totalRows <= 10 (empty business DB)", totalRows <= 10,
      `got ${totalRows}`);
  } else if (MODE === "imported") {
    assert("overview totalRows > 10 (imported business DB)", totalRows > 10,
      `got ${totalRows}`);
  }

  // --- tables ---
  const tables = await req("/admin/database/tables");
  assert("tables returns 200", tables.status === 200, `got ${tables.status}`);
  const tableList = tables.body.data?.tables ?? [];
  assert("tables has >= 28 items", tableList.length >= 28,
    `got ${tableList.length}`);
  const wsTable = tableList.find((t) => t.name === "workspace");
  assert("workspace table found", !!wsTable);
  assert("workspace is core domain", wsTable?.domain === "core");
  assert("workspace is not system table", wsTable?.isSystem === false);
  assert("workspace is code defined", wsTable?.isCodeDefined === true);
  const migrationTable = tableList.find((t) => t.name === "schema_migration");
  assert("schema_migration is system table", migrationTable?.isSystem === true);
  assert("schema_migration is admin domain", migrationTable?.domain === "admin");
  const matchView = tableList.find((t) => t.name === "match_result_latest");
  assert("match_result_latest view found", !!matchView);
  assert("match_result_latest type is view", matchView?.type === "view");

  if (MODE === "imported") {
    const skuRowCount = tableList.find((t) => t.name === "sku")?.rowCount ?? 0;
    const cpRowCount = tableList.find((t) => t.name === "channel_profile")?.rowCount ?? 0;
    const douyinProductRowCount = tableList.find((t) => t.name === "douyin_product")?.rowCount ?? 0;
    assert("imported DB has sku rows", skuRowCount > 0, `got ${skuRowCount}`);
    assert("imported DB has channel_profile rows", cpRowCount > 0, `got ${cpRowCount}`);
    assert("imported DB has douyin_product rows", douyinProductRowCount > 0, `got ${douyinProductRowCount}`);
  }

  // --- tables/:name/schema ---
  const schema = await req("/admin/database/tables/workspace/schema");
  assert("workspace schema returns 200", schema.status === 200);
  assert("workspace schema has sql", !!schema.body.data?.sql);
  assert("workspace schema sql contains CREATE TABLE",
    schema.body.data?.sql?.includes("CREATE TABLE"));

  // Non-existent table
  const nfSchema = await req("/admin/database/tables/nonexistent_table/schema");
  assert("nonexistent table returns 404", nfSchema.status === 404);

  // SQL injection attempt
  const injSchema = await req("/admin/database/tables/workspace%20OR%201=1/schema");
  assert("injection attempt returns 404", injSchema.status === 404);

  // --- tables/:name/sample ---
  const sample = await req("/admin/database/tables/workspace/sample?limit=5");
  assert("workspace sample returns 200", sample.status === 200);
  assert("workspace sample has rows", Array.isArray(sample.body.data?.rows));
  assert("workspace sample rows <= 5", (sample.body.data?.rows?.length ?? 0) <= 5,
    `got ${sample.body.data?.rows?.length}`);
  assert("workspace sample limit is 5", sample.body.data?.limit === 5);

  // View sampling not supported
  const viewSample = await req("/admin/database/tables/match_result_latest/sample");
  assert("view sample returns 400", viewSample.status === 400);

  // Non-existent sample
  const nfSample = await req("/admin/database/tables/nonexistent_table/sample");
  assert("nonexistent table sample returns 404", nfSample.status === 404);

  // --- migrations ---
  const migrations = await req("/admin/database/migrations");
  assert("migrations returns 200", migrations.status === 200);
  assert("migrations has array", Array.isArray(migrations.body.data?.migrations));
  assert("migrations has >= 1 entry", (migrations.body.data?.migrations?.length ?? 0) >= 1,
    `got ${migrations.body.data?.migrations?.length}`);
  const v001 = migrations.body.data?.migrations?.find((m) => m.version === 1);
  assert("V001 migration found", !!v001);
  assert("V001 status is applied", v001?.status === "applied");

  // --- audit-events ---
  const audit = await req("/admin/database/audit-events");
  assert("audit-events returns 200", audit.status === 200);
  assert("audit-events has events array", Array.isArray(audit.body.data?.events));

  if (MODE === "imported") {
    const auditEvents = audit.body.data?.events ?? [];
    assert("imported DB has import audit events", auditEvents.some((e) => e.operation === "import"));
    assert("imported DB has rebuild audit events", auditEvents.some((e) => e.operation === "rebuild"));
  }

  // --- import-jobs ---
  const jobs = await req("/admin/database/import-jobs");
  assert("import-jobs returns 200", jobs.status === 200);
  assert("import-jobs has jobs array", Array.isArray(jobs.body.data?.jobs));
  if (MODE === "empty") {
    assert("empty DB has no import jobs", (jobs.body.data?.jobs?.length ?? 0) === 0);
  } else if (MODE === "imported") {
    assert("imported DB has >= 2 import jobs", (jobs.body.data?.jobs?.length ?? 0) >= 2);
  }

  // --- versions ---
  const versions = await req("/admin/database/versions");
  assert("versions returns 200", versions.status === 200);
  assert("versions has versions array", Array.isArray(versions.body.data?.versions));
  if (MODE === "empty") {
    assert("empty DB has no versions", (versions.body.data?.versions?.length ?? 0) === 0);
  } else if (MODE === "imported") {
    assert("imported DB has demo version", versions.body.data?.versions?.some((v) => v.source === "demo_seed"));
    assert("imported DB has douyin-bi version", versions.body.data?.versions?.some((v) => v.source === "douyin_report_dashboard"));
  }

  // --- auth ---
  const noAuth = await fetch(`${BASE}/admin/database/overview`);
  assert("401 without token", noAuth.status === 401);

  // --- workspace ---
  const noWs = await fetch(`${BASE}/admin/database/overview`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  assert("400 without workspace", noWs.status === 400);

  console.log(`\n${failures === 0 ? "All" : failures} smoke checks ${failures === 0 ? "passed." : "FAILED."}`);
  printResult();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

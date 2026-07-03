#!/usr/bin/env node
// A-P3-DB-3: Smoke script for the admin database read-only API.
// Assumes server on localhost:3100 and ws_demo schema ready.

const BASE = process.env.PLS_API_BASE ?? "http://localhost:3100/api/v0";
const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
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
  console.log(`Smoke admin-database against ${BASE}`);

  // --- overview ---
  const overview = await req("/admin/database/overview");
  assert("overview returns 200", overview.status === 200, `got ${overview.status}`);
  assert("overview has workspaceId", overview.body.data?.workspaceId === WS);
  assert("overview tableCount > 25", (overview.body.data?.tableCount ?? 0) >= 25,
    `got ${overview.body.data?.tableCount}`);
  assert("overview viewCount >= 10", (overview.body.data?.viewCount ?? 0) >= 10,
    `got ${overview.body.data?.viewCount}`);
  assert("overview totalRows > 0", (overview.body.data?.totalRows ?? 0) > 0,
    `got ${overview.body.data?.totalRows}`);
  assert("overview migrationStatus.applied >= 1",
    (overview.body.data?.migrationStatus?.applied ?? 0) >= 1,
    `got ${overview.body.data?.migrationStatus?.applied}`);

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

  // --- auth ---
  const noAuth = await fetch(`${BASE}/admin/database/overview`);
  assert("401 without token", noAuth.status === 401);

  // --- workspace ---
  const noWs = await fetch(`${BASE}/admin/database/overview`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  assert("400 without workspace", noWs.status === 400);

  console.log(`\n${failures === 0 ? "All" : failures} smoke checks ${failures === 0 ? "passed." : "FAILED."}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

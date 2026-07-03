#!/usr/bin/env node
// A-P2-1: Smoke script for the data management API.
// Assumes server on localhost:3100 and ws_demo data sources seeded.

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
  console.log(`Smoke data-management against ${BASE}`);

  // --- data-sources ---
  const sources = await req("/data-management/data-sources");
  assert("data-sources list has 4 items",
    sources.body.data?.items?.length === 4,
    `got ${sources.body.data?.items?.length}`);
  const douyinBi = sources.body.data.items.find((s) => s.sourceId === "douyin_bi");
  assert("douyin_bi is active", douyinBi?.status === "active");
  const stubs = sources.body.data.items.filter((s) => s.status === "stub");
  assert("2 stub sources exist", stubs.length === 2,
    `got ${stubs.length}`);

  // --- data-sources/:id with versions ---
  const src = await req("/data-management/data-sources/douyin_bi");
  assert("douyin_bi detail has versions array",
    Array.isArray(src.body.data?.versions?.versions));
  assert("douyin_bi has >=1 version",
    (src.body.data?.versions?.versions?.length ?? 0) >= 1);
  assert("douyin_bi latestDataVersion is set",
    !!src.body.data?.versions?.latestDataVersion);

  const stubSrc = await req("/data-management/data-sources/product_master");
  assert("product_master stub has 0 versions",
    stubSrc.body.data?.versions?.versions?.length === 0);

  const nf = await req("/data-management/data-sources/nope");
  assert("404 on missing source", nf.status === 404);

  // --- import-batches ---
  const batches = await req("/data-management/import-batches?batchType=douyin_bi_import");
  assert("import-batches returns items",
    (batches.body.data?.items?.length ?? 0) >= 1);
  const firstBatchId = batches.body.data.items[0].batchId;
  const bd = await req(`/data-management/import-batches/${firstBatchId}`);
  assert("import-batch detail has entityCounts",
    !!bd.body.data?.entityCounts && Object.keys(bd.body.data.entityCounts).length > 0);

  // --- data-versions ---
  const versions = await req("/data-management/data-versions");
  assert("data-versions returns items",
    (versions.body.data?.items?.length ?? 0) >= 1);
  const v1 = versions.body.data.items.find((v) => v.dataVersion === "v1_20260703");
  assert("v1 version present", !!v1);
  assert("v1 rowCount is 692", v1?.rowCount === 692, `got ${v1?.rowCount}`);

  // --- quality report ---
  const qr = await req("/data-management/data-versions/douyin_bi/v1_20260703/quality");
  assert("quality report has totalRows=692",
    qr.body.data?.totalRows === 692, `got ${qr.body.data?.totalRows}`);
  assert("quality report has qualityFlags",
    Array.isArray(qr.body.data?.qualityFlags) && qr.body.data.qualityFlags.length > 0);
  assert("quality report has admissionPolicy",
    !!qr.body.data?.admissionPolicy);

  const qr404 = await req("/data-management/data-versions/douyin_bi/v_bogus/quality");
  assert("404 on missing quality report", qr404.status === 404);

  // --- audit ---
  const audit = await req("/data-management/audit?resourceType=bi_batch&event=import_completed&pageSize=5");
  assert("audit returns import events",
    (audit.body.data?.items?.length ?? 0) >= 1);

  // --- 501 reserved ---
  const postImport = await req("/data-management/import-batches", { method: "POST" });
  assert("POST import-batches returns 501", postImport.status === 501,
    `got ${postImport.status}`);

  const postRollback = await req("/data-management/data-versions/douyin_bi/v1_20260703/rollback", { method: "POST" });
  assert("POST rollback returns 501", postRollback.status === 501,
    `got ${postRollback.status}`);

  // --- auth ---
  const noAuth = await fetch(`${BASE}/data-management/data-sources`, { headers: { "X-PLS-Workspace": WS } });
  assert("401 without token", noAuth.status === 401);
  const noWs = await fetch(`${BASE}/data-management/data-sources`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  assert("400 without workspace", noWs.status === 400);

  if (failures) { console.error(`\n${failures} smoke check(s) failed.`); process.exit(1); }
  else console.log(`\nAll smoke checks passed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });

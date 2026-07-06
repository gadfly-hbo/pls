#!/usr/bin/env node
// A-P6-CHANNEL-3: Channel Profile 2.0 object library smoke.
// Modes:
//   PLS_ADMIN_SMOKE_MODE=dry-run (default): only dry-run import; no workspace mutation.
//   PLS_ADMIN_SMOKE_MODE=imported: creates a temporary workspace via rebuild, imports the
//     channel-profile-object-library sample package, and exercises read APIs.
//
// This script never writes to the main ws_demo workspace.

const BASE = process.env.PLS_API_BASE ?? "http://localhost:3100/api/v0";
const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
const ADMIN_TOKEN = process.env.PLS_ADMIN_TOKEN ?? "pls-admin-token";
const WS = process.env.PLS_WORKSPACE ?? (process.env.PLS_ADMIN_SMOKE_MODE === "imported" ? `ws_col_${Date.now()}` : "ws_demo");
const MODE = process.env.PLS_ADMIN_SMOKE_MODE ?? "dry-run";
const PACKAGE_TYPE = "channel-profile-object-library";
const BLOCKING_PACKAGE_TYPE = "channel-profile-object-library-blocking";
const SOURCE_BATCH_ID = "batch_channel_object_library_mock_20260706";
const CONFIRM_TEXT = `IMPORT CHANNEL OBJECT LIBRARY ${SOURCE_BATCH_ID}`;
const DATA_VERSION = "v_channel_object_library_mock_20260706";
const BLOCKING_CONFIRM_TEXT = "IMPORT CHANNEL OBJECT LIBRARY batch_channel_object_library_blocking_20260706";

const HDR = { Authorization: `Bearer ${TOKEN}`, "X-PLS-Workspace": WS };

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

async function initWorkspace() {
  if (MODE !== "imported") return;
  console.log(`\n>>> Creating temporary workspace ${WS}`);
  const res = await fetch(`${BASE}/admin/database/rebuild`, {
    method: "POST",
    headers: {
      ...HDR,
      "Content-Type": "application/json",
      "X-PLS-Admin-Token": ADMIN_TOKEN,
      "Idempotency-Key": `col_init_${Date.now()}`,
    },
    body: JSON.stringify({ confirmText: `RESET ${WS}`, skipSnapshot: true }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`rebuild failed: ${res.status} ${JSON.stringify(body)}`);
  }
}

async function importPackage() {
  const idemKey = `col_import_${Date.now()}`;
  const res = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: {
      ...HDR,
      "Content-Type": "application/json",
      "X-PLS-Admin-Token": ADMIN_TOKEN,
      "Idempotency-Key": idemKey,
    },
    body: JSON.stringify({ packageType: PACKAGE_TYPE, confirmText: CONFIRM_TEXT }),
  });
  assert("import returns 200", res.status === 200);
  assert("import status is success", res.body.data?.status === "success");
  assert("import has auditId", !!res.body.data?.auditId);
  assert("import jobId is present", res.body.data?.jobId?.startsWith("imp_"));
}

async function testDryRun() {
  const dry = await req("/admin/database/import-jobs/dry-run", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json" },
    body: JSON.stringify({ packageType: PACKAGE_TYPE }),
  });
  assert("dry-run returns 200", dry.status === 200);
  assert("dry-run operation is import", dry.body.data?.operation === "import");
  assert("dry-run affectedRows > 0", (dry.body.data?.affectedRows ?? 0) > 0, `got ${dry.body.data?.affectedRows}`);
  assert("dry-run has qualityReport", dry.body.data?.qualityReport != null);
  assert("dry-run requiredConfirmText matches manifest", dry.body.data?.requiredConfirmText === CONFIRM_TEXT);
  assert("dry-run dataVersion matches manifest", dry.body.data?.dataVersion === DATA_VERSION);
  assert("dry-run sourceType matches manifest", dry.body.data?.sourceType === "mock_sample");
  assert("dry-run containsUserAuthorized is false", dry.body.data?.containsUserAuthorized === false);

  // Missing confirmText on formal import should be rejected before any DB work.
  const missing = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `col_missing_${Date.now()}` },
    body: JSON.stringify({ packageType: PACKAGE_TYPE }),
  });
  assert("import without confirmText returns 400", missing.status === 400);

  // Wrong confirmText.
  const wrong = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN, "Idempotency-Key": `col_wrong_${Date.now()}` },
    body: JSON.stringify({ packageType: PACKAGE_TYPE, confirmText: "WRONG" }),
  });
  assert("import wrong confirmText returns 400", wrong.status === 400);

  // Missing admin token.
  const noAdmin = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "Idempotency-Key": `col_noadmin_${Date.now()}` },
    body: JSON.stringify({ packageType: PACKAGE_TYPE, confirmText: CONFIRM_TEXT }),
  });
  assert("import without admin token returns 401", noAdmin.status === 401);

  const blockingDry = await req("/admin/database/import-jobs/dry-run", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json" },
    body: JSON.stringify({ packageType: BLOCKING_PACKAGE_TYPE }),
  });
  assert("blocking package dry-run returns 200", blockingDry.status === 200);
  assert("blocking package dry-run exposes requiredConfirmText", blockingDry.body.data?.requiredConfirmText === BLOCKING_CONFIRM_TEXT);
  assert("blocking package dry-run reports blocking warnings", (blockingDry.body.data?.warnings?.length ?? 0) > 0);
  assert(
    "blocking package dry-run qualityReport is not shareable",
    blockingDry.body.data?.qualityReport?.shareable === false
  );

  const blockedImport = await req("/admin/database/import-jobs", {
    method: "POST",
    headers: {
      ...HDR,
      "Content-Type": "application/json",
      "X-PLS-Admin-Token": ADMIN_TOKEN,
      "Idempotency-Key": `col_blocked_${Date.now()}`,
    },
    body: JSON.stringify({ packageType: BLOCKING_PACKAGE_TYPE, confirmText: BLOCKING_CONFIRM_TEXT }),
  });
  assert("blocking package confirm import returns 400", blockedImport.status === 400);
  assert("blocking package confirm import names dryRun field", blockedImport.body.error?.field === "dryRun");
}

async function testReadApis() {
  // List all
  const list = await req("/channel-objects");
  assert("list returns 200", list.status === 200);
  assert("list has 6 objects", list.body.data?.items?.length === 6, `got ${list.body.data?.items?.length}`);
  assert("list has cursor page wrapper", list.body.data?.page?.pageSize === 20 && list.body.data?.page?.hasMore === false);

  // Filter by objectType
  const scenarios = await req("/channel-objects?objectType=business_scenario");
  assert("filter by business_scenario returns 1", scenarios.body.data?.items?.length === 1);

  const accounts = await req("/channel-objects?objectType=account");
  assert("filter by account returns 1", accounts.body.data?.items?.length === 1);

  // Latest view: default query returns latest projection
  const platform = await req("/channel-objects/platform:mock_platform_douyin");
  assert("platform detail returns 200", platform.status === 200);
  assert("platform detail targetObject is ChannelEntity", platform.body.data?.targetObject === "ChannelEntity");
  assert("platform detail latest dataVersion", platform.body.data?.dataVersion === DATA_VERSION);

  // Historical dataVersion query
  const platformHist = await req(`/channel-objects/platform:mock_platform_douyin?dataVersion=${DATA_VERSION}`);
  assert("platform detail historical returns 200", platformHist.status === 200);

  // 404
  const nf = await req("/channel-objects/nope");
  assert("404 on missing object", nf.status === 404);

  // Audience profile
  const aud = await req("/channel-objects/account:mock_account_douyin_style/audience-profiles");
  assert("audience profiles returns 200", aud.status === 200);
  assert("audience profiles has 1 row", aud.body.data?.items?.length === 1);
  assert("audience profile has tags", aud.body.data?.items[0]?.tags?.length > 0);
  assert("audience profile no unapproved tags in sample", aud.body.data?.items[0]?.unmappedFields?.length === 0);

  // Product fit profile
  const fit = await req("/channel-objects/account:mock_account_douyin_style/product-fit-profiles");
  assert("product-fit profiles returns 200", fit.status === 200);
  assert("product-fit profiles has 1 row", fit.body.data?.items?.length === 1);

  // Bindings
  const bindings = await req("/channel-objects/business_scenario:new_product_launch:mock_style/bindings");
  assert("bindings returns 200", bindings.status === 200);
  assert("scenario has 1 binding", bindings.body.data?.items?.length === 1);
  assert("scenario binding type is scenario_to_channel_entity", bindings.body.data?.items[0]?.bindingType === "scenario_to_channel_entity");

  const parentBindings = await req("/channel-objects/trade_area:mock_trade_area_city_walk/bindings");
  assert("trade area bindings returns 1", parentBindings.body.data?.items?.length === 1);
  assert("trade area binding type is parent_child", parentBindings.body.data?.items[0]?.bindingType === "parent_child");

  // Auth / workspace
  const noAuth = await fetch(`${BASE}/channel-objects`, { headers: { "X-PLS-Workspace": WS } });
  assert("401 without token", noAuth.status === 401);
  const noWs = await fetch(`${BASE}/channel-objects`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  assert("400 without workspace", noWs.status === 400);
}

async function testCompatibility() {
  // Existing /channels and /channels/entities must still work.
  const ch = await req("/channels");
  assert("/channels still works", ch.status === 200);
  const ce = await req("/channels/entities");
  assert("/channels/entities still works", ce.status === 200);
}

async function main() {
  console.log(`Smoke channel-object-library (${MODE} mode) against ${BASE}`);
  console.log(`Workspace: ${WS} (mode=${MODE})`);

  await testDryRun();

  if (MODE === "imported") {
    await initWorkspace();
    await importPackage();
    await testReadApis();
  }

  await testCompatibility();

  printResult();
  process.exit(failures === 0 ? 0 : 1);
}

function printResult() {
  console.log(`\nRESULT: ${JSON.stringify({ name: "channel-object-library", mode: MODE, workspace: WS, passed, failed: failures, ok: failures === 0 })}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

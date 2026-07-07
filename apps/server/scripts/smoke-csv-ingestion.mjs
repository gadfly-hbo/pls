#!/usr/bin/env node
// A-P7-INGEST-2: CSV ingestion smoke. Runs against an isolated temporary workspace.

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE = process.env.PLS_API_BASE ?? "http://localhost:3100/api/v0";
const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
const ADMIN_TOKEN = process.env.PLS_ADMIN_TOKEN ?? "pls-admin-token";
const WS = process.env.PLS_WORKSPACE ?? `ws_csv_ingestion_${Date.now()}`;

const HDR = {
  Authorization: `Bearer ${TOKEN}`,
  "X-PLS-Workspace": WS,
};

const CSV_SKU_PATH = resolve(__dirname, "../../../data/templates/csv-ingestion/sample_sku.csv");
const CSV_CHANNEL_PATH = resolve(__dirname, "../../../data/templates/csv-ingestion/sample_channel_profile.csv");
const STAGING_ROOT = resolve(__dirname, "../../../data/local/csv-staging");

let passed = 0;
let failures = 0;

function assert(label, cond, detail = "") {
  if (cond) {
    console.log(`  OK   ${label}`);
    passed += 1;
  } else {
    console.error(`  FAIL ${label} :: ${detail}`);
    failures += 1;
  }
}

async function reqJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: HDR, ...opts });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function initWorkspace() {
  console.log(`\n>>> Initializing workspace ${WS}`);
  const res = await fetch(`${BASE}/admin/database/rebuild`, {
    method: "POST",
    headers: {
      ...HDR,
      "Content-Type": "application/json",
      "X-PLS-Admin-Token": ADMIN_TOKEN,
      "Idempotency-Key": `csv_init_${Date.now()}`,
    },
    body: JSON.stringify({ confirmText: `RESET ${WS}`, skipSnapshot: true }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`rebuild failed: ${res.status} ${JSON.stringify(body)}`);
  }
}

async function dryRun(filePathOrContent, targetTable) {
  const isPath = typeof filePathOrContent === "string" && existsSync(filePathOrContent);
  const bytes = isPath
    ? readFileSync(filePathOrContent)
    : Buffer.isBuffer(filePathOrContent)
      ? filePathOrContent
      : Buffer.from(String(filePathOrContent), "utf-8");
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "text/csv" }), "upload.csv");
  form.append("targetTable", targetTable);
  return await reqJson("/admin/data-ingestion/csv/dry-run", {
    method: "POST",
    headers: { ...HDR },
    body: form,
  });
}

async function importCsv(stagedFileId, targetTable) {
  return await reqJson("/admin/data-ingestion/csv/import", {
    method: "POST",
    headers: {
      ...HDR,
      "Content-Type": "application/json",
      "X-PLS-Admin-Token": ADMIN_TOKEN,
      "Idempotency-Key": `csv_import_${targetTable}_${Date.now()}`,
    },
    body: JSON.stringify({
      stagedFileId,
      targetTable,
      confirmText: `IMPORT CSV ${targetTable}`,
    }),
  });
}

async function importCsvWithId(stagedFileId, targetTable, idemKey) {
  return await reqJson("/admin/data-ingestion/csv/import", {
    method: "POST",
    headers: {
      ...HDR,
      "Content-Type": "application/json",
      "X-PLS-Admin-Token": ADMIN_TOKEN,
      "Idempotency-Key": idemKey,
    },
    body: JSON.stringify({
      stagedFileId,
      targetTable,
      confirmText: `IMPORT CSV ${targetTable}`,
    }),
  });
}

function stagingDir(workspaceId, stagedFileId) {
  return resolve(STAGING_ROOT, workspaceId, stagedFileId);
}

function stagingMetaPath(workspaceId, stagedFileId) {
  return resolve(stagingDir(workspaceId, stagedFileId), "staging.json");
}

function stagingDataPath(workspaceId, stagedFileId) {
  return resolve(stagingDir(workspaceId, stagedFileId), "data.csv");
}

async function main() {
  console.log(`Smoke csv-ingestion against ${BASE} / workspace ${WS}`);

  await initWorkspace();

  // --- dry-run valid SKU ---
  const drySku = await dryRun(CSV_SKU_PATH, "sku");
  assert("dry-run sku returns 200", drySku.status === 200, `${drySku.status}`);
  assert("dry-run sku operation is import", drySku.body.data?.operation === "import", `${drySku.body.data?.operation}`);
  assert("dry-run sku targetType is csv_upload", drySku.body.data?.targetType === "csv_upload", `${drySku.body.data?.targetType}`);
  assert("dry-run sku targetName is sku", drySku.body.data?.targetName === "sku");
  assert("dry-run sku affectedRows is 3", drySku.body.data?.affectedRows === 3, `${drySku.body.data?.affectedRows}`);
  assert("dry-run sku requiredConfirmText is IMPORT CSV sku", drySku.body.data?.requiredConfirmText === "IMPORT CSV sku");
  assert("dry-run sku has qualityReport", drySku.body.data?.qualityReport != null);
  assert("dry-run sku has stagedFileId", typeof drySku.body.data?.stagedFileId === "string");
  const skuStagedId = drySku.body.data?.stagedFileId;

  // --- dry-run valid channel_profile ---
  const dryChannel = await dryRun(CSV_CHANNEL_PATH, "channel_profile");
  assert("dry-run channel_profile returns 200", dryChannel.status === 200);
  assert("dry-run channel_profile affectedRows is 2", dryChannel.body.data?.affectedRows === 2, `${dryChannel.body.data?.affectedRows}`);
  assert("dry-run channel_profile requiredConfirmText is IMPORT CSV channel_profile", dryChannel.body.data?.requiredConfirmText === "IMPORT CSV channel_profile");
  const channelStagedId = dryChannel.body.data?.stagedFileId;

  // --- dry-run missing required column ---
  const missingSkuCsv = `title,attributes\nMock,{}\n`;
  const missingDry = await dryRun(Buffer.from(missingSkuCsv), "sku");
  assert("dry-run missing sku_id returns 200 with blocking", missingDry.status === 200);
  assert("dry-run missing sku_id has blockingErrors > 0", (missingDry.body.data?.qualityReport?.blockingErrors ?? 0) > 0);
  assert("dry-run missing sku_id missingColumns includes sku_id", missingDry.body.data?.qualityReport?.missingColumns?.includes("sku_id"));

  // --- dry-run type error ---
  const typeErrorCsv = `channel_id,channel_name,sample_size\nch_001,Mock,N/A\n`;
  const typeErrorDry = await dryRun(Buffer.from(typeErrorCsv), "channel_profile");
  assert("dry-run type error returns 200 with blocking", typeErrorDry.status === 200);
  assert("dry-run type error has blockingErrors > 0", (typeErrorDry.body.data?.qualityReport?.blockingErrors ?? 0) > 0);
  assert("dry-run type error has typeErrors > 0", (typeErrorDry.body.data?.qualityReport?.typeErrors ?? 0) > 0);

  // --- dry-run unsupported target table ---
  const badTableCsv = `workspace_id,name\nws_demo,Test\n`;
  const badTableDry = await dryRun(Buffer.from(badTableCsv), "workspace");
  assert("dry-run workspace table returns 200 with blocking", badTableDry.status === 200);
  assert("dry-run workspace blockingErrors > 0", (badTableDry.body.data?.qualityReport?.blockingErrors ?? 0) > 0);

  // --- import without admin token ---
  const importNoAdmin = await reqJson("/admin/data-ingestion/csv/import", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "Idempotency-Key": `csv_no_admin_${Date.now()}` },
    body: JSON.stringify({ stagedFileId: skuStagedId, targetTable: "sku", confirmText: "IMPORT CSV sku" }),
  });
  assert("import without admin token returns 401", importNoAdmin.status === 401);

  // --- import without idempotency key ---
  const importNoIdem = await reqJson("/admin/data-ingestion/csv/import", {
    method: "POST",
    headers: { ...HDR, "Content-Type": "application/json", "X-PLS-Admin-Token": ADMIN_TOKEN },
    body: JSON.stringify({ stagedFileId: skuStagedId, targetTable: "sku", confirmText: "IMPORT CSV sku" }),
  });
  assert("import without Idempotency-Key returns 400", importNoIdem.status === 400);

  // --- import wrong confirmText (correct function uses correct text, so test explicit call) ---
  const wrongConfirm = await reqJson("/admin/data-ingestion/csv/import", {
    method: "POST",
    headers: {
      ...HDR,
      "Content-Type": "application/json",
      "X-PLS-Admin-Token": ADMIN_TOKEN,
      "Idempotency-Key": `csv_wrong_confirm_${Date.now()}`,
    },
    body: JSON.stringify({ stagedFileId: skuStagedId, targetTable: "sku", confirmText: "WRONG" }),
  });
  assert("import wrong confirmText returns 400", wrongConfirm.status === 400);

  // --- import blocked by dry-run errors ---
  const missingDryId = missingDry.body.data?.stagedFileId;
  if (missingDryId) {
    const importBlocked = await reqJson("/admin/data-ingestion/csv/import", {
      method: "POST",
      headers: {
        ...HDR,
        "Content-Type": "application/json",
        "X-PLS-Admin-Token": ADMIN_TOKEN,
        "Idempotency-Key": `csv_blocked_${Date.now()}`,
      },
      body: JSON.stringify({ stagedFileId: missingDryId, targetTable: "sku", confirmText: "IMPORT CSV sku" }),
    });
    assert("import blocked by dry-run errors returns 400", importBlocked.status === 400);
  }

  // --- formal import SKU ---
  const importSku = await importCsv(skuStagedId, "sku");
  assert("import sku returns 200", importSku.status === 200);
  assert("import sku status is success", importSku.body.data?.status === "success");
  assert("import sku has auditId", !!importSku.body.data?.auditId);
  assert("import sku has jobId", !!importSku.body.data?.jobId);
  assert("import sku after totalRows is 3", importSku.body.data?.afterSnapshot?.totalRows === 3);

  // --- formal import channel_profile ---
  const importChannel = await importCsv(channelStagedId, "channel_profile");
  assert("import channel_profile returns 200", importChannel.status === 200);
  assert("import channel_profile after totalRows is 2", importChannel.body.data?.afterSnapshot?.totalRows === 2);

  // --- import-jobs list ---
  const jobs = await reqJson("/admin/database/import-jobs");
  assert("import-jobs returns 200", jobs.status === 200);
  assert("import-jobs has csv entries", (jobs.body.data?.jobs?.length ?? 0) >= 2);
  assert("import-jobs has csv_upload import_type", jobs.body.data?.jobs?.some((j) => j.import_type === "csv_upload"));

  // --- audit events ---
  const audit = await reqJson("/admin/database/audit-events");
  assert("audit-events returns 200", audit.status === 200);
  assert("audit-events has csv import", audit.body.data?.events?.some((e) => e.operation === "import" && e.target_type === "csv_upload"));

  // --- workspace isolation: staged file from WS should not work in another WS ---
  const otherWs = `ws_csv_other_${Date.now()}`;
  await fetch(`${BASE}/admin/database/rebuild`, {
    method: "POST",
    headers: {
      ...HDR,
      "X-PLS-Workspace": otherWs,
      "Content-Type": "application/json",
      "X-PLS-Admin-Token": ADMIN_TOKEN,
      "Idempotency-Key": `csv_other_init_${Date.now()}`,
    },
    body: JSON.stringify({ confirmText: `RESET ${otherWs}`, skipSnapshot: true }),
  });
  const otherImport = await reqJson("/admin/data-ingestion/csv/import", {
    method: "POST",
    headers: {
      ...HDR,
      "X-PLS-Workspace": otherWs,
      "Content-Type": "application/json",
      "X-PLS-Admin-Token": ADMIN_TOKEN,
      "Idempotency-Key": `csv_other_import_${Date.now()}`,
    },
    body: JSON.stringify({ stagedFileId: skuStagedId, targetTable: "sku", confirmText: "IMPORT CSV sku" }),
  });
  assert("workspace isolation: staged file from other WS import returns 400", otherImport.status === 400);

  // --- idempotency replay with a fresh staged file ---
  const freshSkuCsv = `sku_id,workspace_id,spu_id,category_lv1,category_lv2,season,title,attributes,assets,mapped_product_tags
mock_csv_sku_idem_001,ws_demo,mock_csv_spu_001,apparel,dress,spring_summer,Idem Dress 001,{},[],[]
mock_csv_sku_idem_002,ws_demo,mock_csv_spu_001,apparel,top,spring_summer,Idem Top 002,{},[],[]
mock_csv_sku_idem_003,ws_demo,mock_csv_spu_002,apparel,bottom,fall_winter,Idem Bottom 003,{},[],[]
`;
  const freshSkuDry = await dryRun(freshSkuCsv, "sku");
  const freshSkuStagedId = freshSkuDry.body.data?.stagedFileId;
  const idemKey = `csv_idem_replay_${Date.now()}`;
  const idemHeaders = {
    ...HDR,
    "Content-Type": "application/json",
    "X-PLS-Admin-Token": ADMIN_TOKEN,
    "Idempotency-Key": idemKey,
  };
  const firstImport = await reqJson("/admin/data-ingestion/csv/import", {
    method: "POST",
    headers: idemHeaders,
    body: JSON.stringify({ stagedFileId: freshSkuStagedId, targetTable: "sku", confirmText: "IMPORT CSV sku" }),
  });
  assert("idempotency replay returns 200", firstImport.status === 200);
  const replay = await reqJson("/admin/data-ingestion/csv/import", {
    method: "POST",
    headers: idemHeaders,
    body: JSON.stringify({ stagedFileId: freshSkuStagedId, targetTable: "sku", confirmText: "IMPORT CSV sku" }),
  });
  assert("idempotency replay has same jobId", replay.body.data?.jobId === firstImport.body.data?.jobId);

  // --- idempotency conflict ---
  const conflict = await reqJson("/admin/data-ingestion/csv/import", {
    method: "POST",
    headers: idemHeaders,
    body: JSON.stringify({ stagedFileId: channelStagedId, targetTable: "channel_profile", confirmText: "IMPORT CSV channel_profile" }),
  });
  assert("idempotency conflict returns 409", conflict.status === 409);

  // --- append-only: second import with new idempotency key must be blocked by PK conflict ---
  const secondImport = await importCsvWithId(skuStagedId, "sku", `csv_second_import_${Date.now()}`);
  assert("append-only second import returns 400", secondImport.status === 400);
  assert("append-only second import blocked by primary key conflict", (secondImport.body.error?.message ?? "").includes("already exists"));

  // --- stagedFileId path traversal rejected ---
  const traversalImport = await importCsvWithId("../ws_demo/csv_123456_abcdef", "sku", `csv_traversal_${Date.now()}`);
  assert("path traversal stagedFileId returns 400", traversalImport.status === 400);

  // --- URL-encoded path traversal rejected ---
  const encodedTraversalImport = await importCsvWithId("..%2Fws_demo%2Fcsv_123456_abcdef", "sku", `csv_encoded_traversal_${Date.now()}`);
  assert("URL-encoded path traversal stagedFileId returns 400", encodedTraversalImport.status === 400);

  // --- tampered staged file content rejected ---
  const tamperDataPath = stagingDataPath(WS, skuStagedId);
  if (existsSync(tamperDataPath)) {
    writeFileSync(tamperDataPath, "tampered\n", "utf-8");
    const tamperImport = await importCsvWithId(skuStagedId, "sku", `csv_tamper_content_${Date.now()}`);
    assert("tampered staged file content returns 400", tamperImport.status === 400);
  }

  // --- tampered staging meta workspaceId rejected ---
  const channelStagedId2 = dryChannel.body.data?.stagedFileId;
  const metaPath = stagingMetaPath(WS, channelStagedId2);
  if (existsSync(metaPath)) {
    const originalMeta = readFileSync(metaPath, "utf-8");
    const tamperedMeta = JSON.parse(originalMeta);
    tamperedMeta.workspaceId = otherWs;
    writeFileSync(metaPath, JSON.stringify(tamperedMeta), "utf-8");
    const metaTamperImport = await importCsvWithId(channelStagedId2, "channel_profile", `csv_tamper_meta_${Date.now()}`);
    assert("tampered staging meta workspaceId returns 400", metaTamperImport.status === 400);
    writeFileSync(metaPath, originalMeta, "utf-8");
  }

  // --- targetTable mismatch with staged file rejected ---
  if (existsSync(metaPath)) {
    const originalMeta = readFileSync(metaPath, "utf-8");
    const tamperedMeta = JSON.parse(originalMeta);
    tamperedMeta.targetTable = "sku";
    writeFileSync(metaPath, JSON.stringify(tamperedMeta), "utf-8");
    const tableMismatchImport = await importCsvWithId(channelStagedId2, "channel_profile", `csv_table_mismatch_${Date.now()}`);
    assert("staged file targetTable mismatch returns 400", tableMismatchImport.status === 400);
    writeFileSync(metaPath, originalMeta, "utf-8");
  }

  console.log(`\n${failures === 0 ? "All" : failures} smoke checks ${failures === 0 ? "passed." : "FAILED."}`);
  printResult();
  process.exit(failures === 0 ? 0 : 1);
}

function printResult() {
  console.log(`\nRESULT: ${JSON.stringify({ name: "csv-ingestion", mode: "full", workspace: WS, passed, failed: failures, ok: failures === 0 })}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

#!/usr/bin/env node
// A-P4-TOOLS-4: Tool-run import package smoke.
//
// Creates a temporary workspace, seeds data_source, stages two sample tool-run
// packages (profile-extract / business-aggregate), then verifies dry-run,
// import, bad-confirmText guard, and Data Management read-backs.
// Does NOT write to ws_demo.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../../..");

const BASE = process.env.PLS_API_BASE ?? "http://localhost:3100/api/v0";
const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
const ADMIN_TOKEN = process.env.PLS_ADMIN_TOKEN ?? "pls-admin-token";
const WS = process.env.PLS_WORKSPACE ?? `ws_tools_import_${Date.now()}`;
const TOOL_RUNS_ROOT = resolve(REPO_ROOT, "data/local/tool-runs");

let passed = 0;
let failed = 0;
const details = [];

function assert(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`[PASS] ${name}`);
  } else {
    failed++;
    console.log(`[FAIL] ${name}: ${JSON.stringify(detail).slice(0, 200)}`);
    details.push({ name, detail });
  }
}

async function request(method, path, body, extraHeaders = {}) {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "X-PLS-Workspace": WS,
    ...extraHeaders,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function requestInWorkspace(workspace, method, path, body, extraHeaders = {}) {
  return request(method, path, body, {
    "X-PLS-Workspace": workspace,
    ...extraHeaders,
  });
}

async function adminRequest(method, path, body, idemKey) {
  return request(method, path, body, {
    "X-PLS-Admin-Token": ADMIN_TOKEN,
    "Idempotency-Key": idemKey,
  });
}

function copyDirRecursive(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const dstPath = join(dst, entry);
    const st = statSync(srcPath);
    if (st.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else {
      copyFileSync(srcPath, dstPath);
    }
  }
}

function stagePackage(templateDir, runId) {
  const dst = join(TOOL_RUNS_ROOT, runId);
  if (existsSync(dst)) {
    throw new Error(`tool-run destination already exists: ${dst}`);
  }
  copyDirRecursive(templateDir, dst);
  const manifestPath = join(dst, "run_manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  manifest.runId = runId;
  manifest.workspaceId = WS;
  manifest.outputDir = dst;
  manifest.importAdapter = manifest.importAdapter ?? {};
  manifest.importAdapter.confirmText = `IMPORT TOOL RUN ${runId}`;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

async function initWorkspace() {
  console.log(`\n>>> Initializing workspace ${WS}`);
  const res = await fetch(`${BASE}/admin/database/rebuild`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "X-PLS-Workspace": WS,
      "Content-Type": "application/json",
      "X-PLS-Admin-Token": ADMIN_TOKEN,
      "Idempotency-Key": `tools_import_rebuild_${Date.now()}`,
    },
    body: JSON.stringify({ confirmText: `RESET ${WS}`, skipSnapshot: true }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`rebuild failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return res.json();
}

function seedDataSources() {
  console.log(`\n>>> Seeding data sources in ${WS}`);
  const child = spawnSync(process.execPath, [join(__dirname, "seed-data-sources.mjs")], {
    env: { ...process.env, PLS_WORKSPACE: WS },
    cwd: process.cwd(),
    stdio: ["inherit", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.status !== 0) {
    throw new Error("seed-data-sources failed");
  }
}

async function main() {
  console.log(`Smoke tools-import against ${BASE} workspace ${WS}`);

  await initWorkspace();
  seedDataSources();

  const ts = Date.now();
  const profileRunId = `run_smoke_profile_extract_${ts}`;
  const businessRunId = `run_smoke_business_aggregate_${ts}`;

  const profileManifest = stagePackage(
    resolve(REPO_ROOT, "data/templates/profile-extract/sample_package"),
    profileRunId
  );
  const businessManifest = stagePackage(
    resolve(REPO_ROOT, "data/templates/business-aggregate/sample_package"),
    businessRunId
  );

  const profileConfirm = profileManifest.importAdapter.confirmText;
  const businessConfirm = businessManifest.importAdapter.confirmText;

  // --- profile-extract dry-run ---
  const profileDry = await request("POST", `/tools/runs/${profileRunId}/import-dry-run`);
  assert("profile-extract dry-run 200", profileDry.status === 200, profileDry.body);
  assert(
    "profile-extract dry-run affectedTables includes channel_profile",
    (profileDry.body?.data?.affectedTables ?? []).includes("channel_profile"),
    profileDry.body
  );
  assert(
    "profile-extract dry-run requiredConfirmText matches manifest",
    profileDry.body?.data?.requiredConfirmText === profileConfirm,
    profileDry.body
  );

  // --- business-aggregate dry-run ---
  const businessDry = await request("POST", `/tools/runs/${businessRunId}/import-dry-run`);
  assert("business-aggregate dry-run 200", businessDry.status === 200, businessDry.body);
  const businessTables = businessDry.body?.data?.affectedTables ?? [];
  assert("business-aggregate dry-run includes sku", businessTables.includes("sku"), businessDry.body);
  assert("business-aggregate dry-run includes channel_profile", businessTables.includes("channel_profile"), businessDry.body);
  assert("business-aggregate dry-run includes wide_table_row", businessTables.includes("wide_table_row"), businessDry.body);
  assert(
    "business-aggregate dry-run requiredConfirmText matches manifest",
    businessDry.body?.data?.requiredConfirmText === businessConfirm,
    businessDry.body
  );

  // --- workspace isolation ---
  const otherWs = `${WS}_other`;
  const otherDry = await requestInWorkspace(otherWs, "POST", `/tools/runs/${profileRunId}/import-dry-run`);
  assert("other workspace import dry-run returns 400", otherDry.status === 400, otherDry.body);
  const otherImport = await requestInWorkspace(
    otherWs,
    "POST",
    `/tools/runs/${profileRunId}/import`,
    { confirmText: profileConfirm },
    {
      "X-PLS-Admin-Token": ADMIN_TOKEN,
      "Idempotency-Key": `tools_import_other_ws_${ts}`,
    }
  );
  assert("other workspace import returns 400", otherImport.status === 400, otherImport.body);

  // --- wrong confirmText ---
  const badConfirm = await adminRequest(
    "POST",
    `/tools/runs/${profileRunId}/import`,
    { confirmText: "WRONG" },
    `tools_import_bad_${ts}`
  );
  assert("bad confirmText returns 400", badConfirm.status === 400, badConfirm.body);

  // --- missing admin token ---
  const noAdmin = await request("POST", `/tools/runs/${profileRunId}/import`, { confirmText: profileConfirm });
  assert("import without admin token returns 401", noAdmin.status === 401, noAdmin.body);

  // --- profile-extract import ---
  const profileImport = await adminRequest(
    "POST",
    `/tools/runs/${profileRunId}/import`,
    { confirmText: profileConfirm },
    `tools_import_profile_${ts}`
  );
  assert("profile-extract import 200", profileImport.status === 200, profileImport.body);
  assert(
    "profile-extract import status success",
    profileImport.body?.data?.status === "success",
    profileImport.body
  );
  assert(
    "profile-extract import has auditId",
    typeof profileImport.body?.data?.auditId === "string",
    profileImport.body
  );

  // --- business-aggregate import ---
  const businessImport = await adminRequest(
    "POST",
    `/tools/runs/${businessRunId}/import`,
    { confirmText: businessConfirm },
    `tools_import_business_${ts}`
  );
  assert("business-aggregate import 200", businessImport.status === 200, businessImport.body);
  assert(
    "business-aggregate import status success",
    businessImport.body?.data?.status === "success",
    businessImport.body
  );
  assert(
    "business-aggregate import has auditId",
    typeof businessImport.body?.data?.auditId === "string",
    businessImport.body
  );

  // --- Data Management: source list ---
  const sources = await request("GET", "/data-management/data-sources");
  assert("data-sources list 200", sources.status === 200, sources.body);
  const items = sources.body?.data?.items ?? [];
  assert(
    "profile_extract source exists and is active",
    items.some((s) => s.sourceId === "profile_extract" && s.status === "active"),
    items
  );
  assert(
    "business_aggregate source exists and is active",
    items.some((s) => s.sourceId === "business_aggregate" && s.status === "active"),
    items
  );

  // --- Data Management: versions ---
  const profileVersions = await request("GET", "/data-management/data-sources/profile_extract");
  assert("profile_extract versions 200", profileVersions.status === 200, profileVersions.body);
  const pv = profileVersions.body?.data?.versions?.versions ?? [];
  assert(
    "profile_extract has the imported version",
    pv.some((v) => v.dataVersion === profileManifest.importAdapter.dataVersion),
    profileVersions.body
  );

  const businessVersions = await request("GET", "/data-management/data-sources/business_aggregate");
  assert("business_aggregate versions 200", businessVersions.status === 200, businessVersions.body);
  const bv = businessVersions.body?.data?.versions?.versions ?? [];
  assert(
    "business_aggregate has the imported version",
    bv.some((v) => v.dataVersion === businessManifest.importAdapter.dataVersion),
    businessVersions.body
  );

  // --- Data Management: quality reports ---
  const profileQr = await request(
    "GET",
    `/data-management/data-versions/profile_extract/${profileManifest.importAdapter.dataVersion}/quality`
  );
  assert("profile_extract quality report 200", profileQr.status === 200, profileQr.body);
  assert(
    "profile_extract quality report has sourceBatchId",
    profileQr.body?.data?.sourceBatchId === profileManifest.importAdapter.sourceBatchId,
    profileQr.body
  );

  const businessQr = await request(
    "GET",
    `/data-management/data-versions/business_aggregate/${businessManifest.importAdapter.dataVersion}/quality`
  );
  assert("business_aggregate quality report 200", businessQr.status === 200, businessQr.body);
  assert(
    "business_aggregate quality report has sourceBatchId",
    businessQr.body?.data?.sourceBatchId === businessManifest.importAdapter.sourceBatchId,
    businessQr.body
  );

  // --- Data Management: import batches ---
  const profileBatches = await request("GET", "/data-management/import-batches?batchType=profile_extract_import");
  assert("profile_extract_import batches 200", profileBatches.status === 200, profileBatches.body);
  const pbItems = profileBatches.body?.data?.items ?? [];
  assert(
    "profile_extract_import batch exists",
    pbItems.some((b) => b.batchId.includes(profileManifest.importAdapter.sourceBatchId)),
    profileBatches.body
  );

  const businessBatches = await request("GET", "/data-management/import-batches?batchType=business_aggregate_import");
  assert("business_aggregate_import batches 200", businessBatches.status === 200, businessBatches.body);
  const bbItems = businessBatches.body?.data?.items ?? [];
  assert(
    "business_aggregate_import batch exists",
    bbItems.some((b) => b.batchId.includes(businessManifest.importAdapter.sourceBatchId)),
    businessBatches.body
  );

  const ok = failed === 0;
  console.log(
    `\nRESULT: ${JSON.stringify({
      name: "smoke-tools-import",
      ok,
      passed,
      failed,
      workspace: WS,
      details: details.slice(0, 3),
    })}`
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("fatal:", e);
  console.log(
    `RESULT: ${JSON.stringify({ name: "smoke-tools-import", ok: false, passed, failed, error: e.message })}`
  );
  process.exit(1);
});

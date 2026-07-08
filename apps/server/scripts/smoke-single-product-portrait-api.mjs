#!/usr/bin/env node
// T0002: Single product portrait dedicated API smoke.
//
// Assumptions:
// - This script starts and stops its own PLS server instances on random ports.
// - Tests both model-available and model-unavailable states.
// - No business DB writes; all predictions are in-memory.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import http from "node:http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(__dirname, "..");
const REPO_ROOT = resolve(SERVER_DIR, "../..");
const DEFAULT_MODEL_PATH = resolve(REPO_ROOT, "data/local/single-product-portrait-q2-73sample/model.json");

const TOKEN = process.env.PLS_API_TOKEN ?? "pls-p0-demo-token";
const WS = process.env.PLS_WORKSPACE ?? `ws_single_portrait_${Date.now()}`;

let passed = 0;
let failed = 0;
const details = [];

let currentBase = "";

function assert(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`[PASS] ${name}`);
  } else {
    failed++;
    console.log(`[FAIL] ${name}: ${JSON.stringify(detail).slice(0, 300)}`);
    details.push({ name, detail });
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGet(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });
    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

async function startServer(envOverrides, attempt = 0) {
  const maxAttempts = 5;
  const port = 4100 + Math.floor(Math.random() * 1000);
  const base = `http://127.0.0.1:${port}/api/v0`;
  const env = { ...process.env, PORT: String(port), ...envOverrides };
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: SERVER_DIR,
    env,
    stdio: "pipe",
  });

  let output = "";
  child.stdout.on("data", (data) => {
    output += data.toString();
  });
  child.stderr.on("data", (data) => {
    output += data.toString();
  });

  // Wait briefly for tsx to compile and start the server, then poll health.
  await sleep(3000);
  const healthUrl = `http://127.0.0.1:${port}/health`;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      break;
    }
    try {
      const res = await httpGet(healthUrl);
      if (res.status === 200) {
        currentBase = `http://127.0.0.1:${port}/api/v0`;
        return { child, base: currentBase };
      }
    } catch (err) {
      // not ready yet
    }
    await sleep(100);
  }

  child.kill();
  await sleep(500);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }

  if (attempt < maxAttempts - 1) {
    console.log(`Server start attempt ${attempt + 1} failed (port ${port}), retrying...`);
    return startServer(envOverrides, attempt + 1);
  }
  throw new Error(`Server failed to start after ${maxAttempts} attempts. Output:\n${output}`);
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) {
      resolve();
      return;
    }
    child.on("exit", () => resolve());
    child.kill();
    setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }, 5000);
  });
}

async function request(method, path, body) {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "X-PLS-Workspace": WS,
  };
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${currentBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
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

function csvToBuffer(rows) {
  const lines = rows.map((row) => row.join(","));
  return Buffer.from(lines.join("\n"), "utf-8");
}

function xlsxToBuffer(rows) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function formWithFile(buffer, filename, contentType) {
  const form = new FormData();
  form.append("file", new File([buffer], filename, { type: contentType }));
  return form;
}

async function testModelUnavailable() {
  console.log("\n--- Testing model unavailable state ---");
  const server = await startServer({ SINGLE_PRODUCT_PORTRAIT_MODEL_PATH: "/nonexistent/model.json" });
  try {
    const metadata = await request("GET", "/single-product-portrait/metadata");
    assert("metadata unavailable returns 200", metadata.status === 200, metadata.body);
    assert(
      "metadata unavailable has modelAvailable false",
      metadata.body?.data?.modelAvailable === false,
      metadata.body,
    );
    assert(
      "metadata unavailable error code",
      metadata.body?.data?.error?.code === "model_not_available",
      metadata.body,
    );

    const predict = await request("POST", "/single-product-portrait/predict", {
      skuId: "NEW_SKU_001",
      fitType: "X型",
      fabric: "全棉",
      fab: "修身显瘦通勤T恤",
    });
    assert("predict unavailable returns 400", predict.status === 400, predict.body);
    assert(
      "predict unavailable error code",
      predict.body?.error?.code === "model_not_available",
      predict.body,
    );

    // Batch preview unavailable
    const batchPreview = await request(
      "POST",
      "/single-product-portrait/predict/batch/preview",
      formWithFile(csvToBuffer([["款号", "版型", "面料", "FAB"], ["SKU_001", "X型", "全棉", "test"]]), "unavailable.csv", "text/csv"),
    );
    assert("batch preview unavailable returns 200", batchPreview.status === 200, batchPreview.body);
    assert(
      "batch preview unavailable has file error",
      batchPreview.body?.data?.fileErrors?.some((e) => e.code === "model_not_available"),
      batchPreview.body,
    );
    assert(
      "batch preview unavailable validRows matches parsed rows",
      batchPreview.body?.data?.validRows === 1,
      batchPreview.body,
    );

    // Batch execute unavailable
    const batchExecute = await request(
      "POST",
      "/single-product-portrait/predict/batch",
      formWithFile(csvToBuffer([["款号", "版型", "面料", "FAB"], ["SKU_001", "X型", "全棉", "test"]]), "unavailable.csv", "text/csv"),
    );
    assert("batch execute unavailable returns 200", batchExecute.status === 200, batchExecute.body);
    assert(
      "batch execute unavailable has file error",
      batchExecute.body?.data?.fileErrors?.some((e) => e.code === "model_not_available"),
      batchExecute.body,
    );
    assert(
      "batch execute unavailable successCount 0",
      batchExecute.body?.data?.successCount === 0,
      batchExecute.body,
    );
    assert(
      "batch execute unavailable failureCount 1",
      batchExecute.body?.data?.failureCount === 1,
      batchExecute.body,
    );
  } finally {
    await stopServer(server.child);
  }
}

async function testSinglePredict() {
  console.log("\n--- Testing single product prediction ---");
  const metadata = await request("GET", "/single-product-portrait/metadata");
  assert("metadata available returns 200", metadata.status === 200, metadata.body);
  assert(
    "metadata available has modelAvailable true",
    metadata.body?.data?.modelAvailable === true,
    metadata.body,
  );
  assert(
    "metadata has required fields",
    Array.isArray(metadata.body?.data?.fitTypes) &&
      Array.isArray(metadata.body?.data?.requiredColumns) &&
      typeof metadata.body?.data?.modelVersion === "string",
    metadata.body,
  );

  const fitTypes = metadata.body?.data?.fitTypes ?? [];
  const validFitType = fitTypes[0] ?? "X型";

  const predict = await request("POST", "/single-product-portrait/predict", {
    skuId: "NEW_SKU_001",
    fitType: validFitType,
    fabric: "全棉",
    fab: "修身显瘦通勤T恤，舒适亲肤",
  });
  assert("single predict returns 200", predict.status === 200, predict.body);
  assert(
    "single predict has prediction",
    typeof predict.body?.data?.prediction === "object",
    predict.body,
  );
  assert(
    "single prediction has skuId",
    predict.body?.data?.prediction?.skuId === "NEW_SKU_001",
    predict.body?.data?.prediction,
  );
  assert(
    "single prediction has dimension summaries",
    Array.isArray(predict.body?.data?.prediction?.dimensionSummaries) &&
      predict.body?.data?.prediction?.dimensionSummaries.length > 0,
    predict.body?.data?.prediction,
  );
  assert(
    "single prediction has risk flags",
    Array.isArray(predict.body?.data?.prediction?.riskFlags),
    predict.body?.data?.prediction,
  );

  // Missing skuId
  const missingSkuId = await request("POST", "/single-product-portrait/predict", {
    fitType: validFitType,
    fabric: "全棉",
    fab: "test",
  });
  assert("missing skuId returns 400", missingSkuId.status === 400, missingSkuId.body);
  assert(
    "missing skuId error code",
    missingSkuId.body?.error?.code === "required_field_empty",
    missingSkuId.body,
  );
  assert("missing skuId field", missingSkuId.body?.error?.field === "skuId", missingSkuId.body);

  // Unknown fit type
  const unknownFit = await request("POST", "/single-product-portrait/predict", {
    skuId: "NEW_SKU_002",
    fitType: "未知版型",
    fabric: "全棉",
    fab: "test",
  });
  assert("unknown fit type returns 400", unknownFit.status === 400, unknownFit.body);
  assert(
    "unknown fit type error code",
    unknownFit.body?.error?.code === "unknown_fit_type",
    unknownFit.body,
  );
  assert("unknown fit type field", unknownFit.body?.error?.field === "fitType", unknownFit.body);

  // Field too long
  const longSkuId = await request("POST", "/single-product-portrait/predict", {
    skuId: "a".repeat(101),
    fitType: validFitType,
    fabric: "全棉",
    fab: "test",
  });
  assert("long skuId returns 400", longSkuId.status === 400, longSkuId.body);
  assert("long skuId error code", longSkuId.body?.error?.code === "field_too_long", longSkuId.body);
  assert("long skuId field", longSkuId.body?.error?.field === "skuId", longSkuId.body);

  // Missing fabric
  const missingFabric = await request("POST", "/single-product-portrait/predict", {
    skuId: "NEW_SKU_003",
    fitType: validFitType,
    fab: "test",
  });
  assert("missing fabric returns 400", missingFabric.status === 400, missingFabric.body);
  assert(
    "missing fabric error code",
    missingFabric.body?.error?.code === "required_field_empty",
    missingFabric.body,
  );
  assert("missing fabric field", missingFabric.body?.error?.field === "fabric", missingFabric.body);
}

async function testBatchXlsx(fitTypes) {
  console.log("\n--- Testing batch .xlsx ---");
  const validFitType = fitTypes[0] ?? "X型";
  const secondFitType = fitTypes[1] ?? validFitType;
  const validRows = [
    ["款号", "版型", "面料", "FAB"],
    ["SKU_XLSX_001", validFitType, "全棉", "修身显瘦通勤T恤"],
    ["SKU_XLSX_002", secondFitType, "涤纶", "运动速干T恤"],
  ];

  const buffer = xlsxToBuffer(validRows);
  const preview = await request(
    "POST",
    "/single-product-portrait/predict/batch/preview",
    formWithFile(buffer, "valid.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  );
  assert("xlsx preview returns 200", preview.status === 200, preview.body);
  assert("xlsx preview totalRows 2", preview.body?.data?.totalRows === 2, preview.body);
  assert("xlsx preview validRows 2", preview.body?.data?.validRows === 2, preview.body);
  assert("xlsx preview invalidRows 0", preview.body?.data?.invalidRows === 0, preview.body);

  const execute = await request(
    "POST",
    "/single-product-portrait/predict/batch",
    formWithFile(buffer, "valid.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  );
  assert("xlsx execute returns 200", execute.status === 200, execute.body);
  assert("xlsx execute successCount 2", execute.body?.data?.successCount === 2, execute.body);
  assert("xlsx execute results length 2", execute.body?.data?.results?.length === 2, execute.body);
  assert(
    "xlsx execute has metadata",
    execute.body?.data?.metadata?.modelAvailable === true,
    execute.body,
  );

  // Missing header
  const missingHeaderRows = [["款号", "版型", "面料"], ["SKU_001", validFitType, "全棉"]];
  const missingHeader = await request(
    "POST",
    "/single-product-portrait/predict/batch/preview",
    formWithFile(
      xlsxToBuffer(missingHeaderRows),
      "missing_header.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
  );
  assert("missing header preview returns 200", missingHeader.status === 200, missingHeader.body);
  assert(
    "missing header has file error",
    missingHeader.body?.data?.fileErrors?.some((e) => e.code === "missing_required_columns"),
    missingHeader.body,
  );

  // Empty file
  const emptyBuffer = xlsxToBuffer([["款号", "版型", "面料", "FAB"]]);
  const empty = await request(
    "POST",
    "/single-product-portrait/predict/batch/preview",
    formWithFile(
      emptyBuffer,
      "empty.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
  );
  assert("empty file preview returns 200", empty.status === 200, empty.body);
  assert(
    "empty file has file error",
    empty.body?.data?.fileErrors?.some((e) => e.code === "empty_file"),
    empty.body,
  );

  // Row limit exceeded
  const tooManyRows = [["款号", "版型", "面料", "FAB"]];
  for (let i = 0; i < 101; i++) {
    tooManyRows.push([`SKU_${i}`, validFitType, "全棉", "test"]);
  }
  const tooMany = await request(
    "POST",
    "/single-product-portrait/predict/batch/preview",
    formWithFile(
      xlsxToBuffer(tooManyRows),
      "too_many.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
  );
  assert("too many rows preview returns 200", tooMany.status === 200, tooMany.body);
  assert(
    "too many rows has file error",
    tooMany.body?.data?.fileErrors?.some((e) => e.code === "row_limit_exceeded"),
    tooMany.body,
  );

  // Extra columns and duplicate sku
  const extraAndDupRows = [
    ["款号", "版型", "面料", "FAB", "额外列"],
    ["SKU_DUP_001", validFitType, "全棉", "test", "extra1"],
    ["SKU_DUP_001", secondFitType, "涤纶", "test2", "extra2"],
  ];
  const extraAndDup = await request(
    "POST",
    "/single-product-portrait/predict/batch/preview",
    formWithFile(
      xlsxToBuffer(extraAndDupRows),
      "extra_and_dup.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
  );
  assert("extra columns preview returns 200", extraAndDup.status === 200, extraAndDup.body);
  assert(
    "extra columns warning",
    extraAndDup.body?.data?.warnings?.some((w) => w.code === "extra_columns_ignored"),
    extraAndDup.body,
  );
  assert(
    "duplicate sku warning",
    extraAndDup.body?.data?.warnings?.some((w) => w.code === "duplicate_sku_id_in_file"),
    extraAndDup.body,
  );
  assert(
    "duplicate sku still valid row",
    extraAndDup.body?.data?.validRows === 2,
    extraAndDup.body,
  );
}

async function testBatchCsv(fitTypes) {
  console.log("\n--- Testing batch .csv ---");
  const validFitType = fitTypes[0] ?? "X型";
  const secondFitType = fitTypes[1] ?? validFitType;
  const validRows = [
    ["款号", "版型", "面料", "FAB"],
    ["SKU_CSV_001", validFitType, "全棉", "修身显瘦通勤T恤"],
    ["SKU_CSV_002", secondFitType, "涤纶", "运动速干T恤"],
  ];
  const buffer = csvToBuffer(validRows);

  const preview = await request(
    "POST",
    "/single-product-portrait/predict/batch/preview",
    formWithFile(buffer, "valid.csv", "text/csv"),
  );
  assert("csv preview returns 200", preview.status === 200, preview.body);
  assert("csv preview totalRows 2", preview.body?.data?.totalRows === 2, preview.body);
  assert("csv preview validRows 2", preview.body?.data?.validRows === 2, preview.body);

  const execute = await request(
    "POST",
    "/single-product-portrait/predict/batch",
    formWithFile(buffer, "valid.csv", "text/csv"),
  );
  assert("csv execute returns 200", execute.status === 200, execute.body);
  assert("csv execute successCount 2", execute.body?.data?.successCount === 2, execute.body);
  assert(
    "csv execute has predictions",
    execute.body?.data?.results?.every((r) => typeof r.prediction?.skuId === "string"),
    execute.body,
  );

  // BOM handling
  const bomBuffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buffer]);
  const bomPreview = await request(
    "POST",
    "/single-product-portrait/predict/batch/preview",
    formWithFile(bomBuffer, "bom.csv", "text/csv"),
  );
  assert("csv with BOM preview returns 200", bomPreview.status === 200, bomPreview.body);
  assert("csv with BOM validRows 2", bomPreview.body?.data?.validRows === 2, bomPreview.body);

  // File too large
  const largeRows = [["款号", "版型", "面料", "FAB"]];
  const longFab = "a".repeat(2000);
  for (let i = 0; i < 1100; i++) {
    largeRows.push([`SKU_${i}`, validFitType, "全棉", longFab]);
  }
  const largeBuffer = csvToBuffer(largeRows);
  assert("large csv buffer > 2MB", largeBuffer.length > 2 * 1024 * 1024, largeBuffer.length);
  const tooLarge = await request(
    "POST",
    "/single-product-portrait/predict/batch/preview",
    formWithFile(largeBuffer, "too_large.csv", "text/csv"),
  );
  assert("too large csv preview returns 200", tooLarge.status === 200, tooLarge.body);
  assert(
    "too large csv has file error",
    tooLarge.body?.data?.fileErrors?.some((e) => e.code === "file_too_large"),
    tooLarge.body,
  );

  // Row-level errors: unknown fit type and empty field
  const errorRows = [
    ["款号", "版型", "面料", "FAB"],
    ["SKU_ERR_001", "未知版型", "全棉", "test"],
    ["", validFitType, "全棉", "test"],
  ];
  const errorPreview = await request(
    "POST",
    "/single-product-portrait/predict/batch/preview",
    formWithFile(csvToBuffer(errorRows), "errors.csv", "text/csv"),
  );
  assert("error csv preview returns 200", errorPreview.status === 200, errorPreview.body);
  assert(
    "unknown fit type row error",
    errorPreview.body?.data?.rowErrors?.some((e) => e.code === "unknown_fit_type"),
    errorPreview.body,
  );
  assert(
    "required field empty row error",
    errorPreview.body?.data?.rowErrors?.some((e) => e.code === "required_field_empty"),
    errorPreview.body,
  );
  assert(
    "invalidRows 2",
    errorPreview.body?.data?.invalidRows === 2,
    errorPreview.body,
  );
}

async function testZeroValidRows() {
  console.log("\n--- Testing 0 valid rows execute ---");
  const rows = [
    ["款号", "版型", "面料", "FAB"],
    ["SKU_ERR_001", "未知版型", "全棉", "test"],
    ["SKU_ERR_002", "未知版型", "涤纶", "test2"],
  ];
  const execute = await request(
    "POST",
    "/single-product-portrait/predict/batch",
    formWithFile(csvToBuffer(rows), "zero_valid.csv", "text/csv"),
  );
  assert("0 valid rows execute returns 200", execute.status === 200, execute.body);
  assert("0 valid rows successCount 0", execute.body?.data?.successCount === 0, execute.body);
  assert("0 valid rows failureCount 2", execute.body?.data?.failureCount === 2, execute.body);
  assert(
    "0 valid rows has row errors",
    execute.body?.data?.rowErrors?.length === 2,
    execute.body,
  );
  assert(
    "0 valid rows has metadata",
    execute.body?.data?.metadata?.modelAvailable === true,
    execute.body,
  );
}

async function main() {
  console.log(`Smoke single-product-portrait API workspace ${WS}`);

  // Verify model exists for available-state tests
  try {
    readFileSync(DEFAULT_MODEL_PATH);
  } catch (e) {
    console.error(`Model file not found at ${DEFAULT_MODEL_PATH}: ${e.message}`);
    console.log(
      `RESULT: ${JSON.stringify({
        name: "smoke-single-product-portrait-api",
        ok: false,
        passed,
        failed: 1,
        error: `model file missing: ${DEFAULT_MODEL_PATH}`,
      })}`,
    );
    process.exit(1);
  }

  await testModelUnavailable();

  const server = await startServer({ SINGLE_PRODUCT_PORTRAIT_MODEL_PATH: DEFAULT_MODEL_PATH });
  try {
    const metadata = await request("GET", "/single-product-portrait/metadata");
    const fitTypes = metadata.body?.data?.fitTypes ?? [];
    await testSinglePredict();
    await testBatchXlsx(fitTypes);
    await testBatchCsv(fitTypes);
    await testZeroValidRows();
  } finally {
    await stopServer(server.child);
  }

  const ok = failed === 0;
  console.log(
    `\nRESULT: ${JSON.stringify({
      name: "smoke-single-product-portrait-api",
      ok,
      passed,
      failed,
      workspace: WS,
      details: details.slice(0, 3),
    })}`,
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("fatal:", e);
  console.log(
    `RESULT: ${JSON.stringify({
      name: "smoke-single-product-portrait-api",
      ok: false,
      passed,
      failed,
      error: e.message,
    })}`,
  );
  process.exit(1);
});

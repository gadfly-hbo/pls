#!/usr/bin/env node
// D-P1-F1 validator for data/p1/douyin-bi.
//
// Checks:
// 1. Required files exist (jsonl / json / csv).
// 2. Every JSONL row parses and carries sourceBatchId, dataVersion,
//    generatedAt and upsertKey.
// 3. Referential integrity between products / accounts / fits /
//    comparison_dimensions / adjustment_advice.
// 4. quality_report / source_manifest / sqlite_import_manifest completeness.
// 5. Mapped tagIds fall inside PLS taxonomy whitelist used in the package.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_DIR = path.join(REPO_ROOT, "data", "p1", "douyin-bi");

const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_DIR;

const REQUIRED_JSONL = [
  "accounts.jsonl",
  "account_benchmark_tags.jsonl",
  "account_reports.jsonl",
  "products.jsonl",
  "product_account_fits.jsonl",
  "comparison_dimensions.jsonl",
  "adjustment_advice.jsonl",
  "summary_metrics.jsonl",
];

const REQUIRED_JSON = [
  "quality_report.json",
  "source_manifest.json",
  "sqlite_import_manifest.json",
];

const REQUIRED_CSV = ["field_dictionary.csv", "unmapped_fields.csv"];

const TAG_WHITELIST = new Set([
  "demo.age_18_24",
  "demo.age_25_34",
  "demo.age_35_44",
  "demo.age_45_plus",
  "demo.female",
  "demo.male",
  "demo.city_high_tier",
  "demo.city_lower_tier",
  "price.value",
  "price.mid",
  "price.premium",
  "price.promo_sensitive",
  "price.new_arrival_sensitive",
]);

const REQUIRED_META = ["sourceBatchId", "dataVersion", "generatedAt", "upsertKey"];

const errors = [];
const warnings = [];
function readJsonl(name) {
  const filePath = path.join(targetDir, name);
  if (!fs.existsSync(filePath)) {
    errors.push(`missing jsonl: ${name}`);
    return [];
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const rows = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "") continue;
    try {
      rows.push(JSON.parse(line));
    } catch (err) {
      errors.push(`invalid json in ${name} line ${i + 1}: ${err.message}`);
    }
  }
  return rows;
}

function readJson(name) {
  const filePath = path.join(targetDir, name);
  if (!fs.existsSync(filePath)) {
    errors.push(`missing json: ${name}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    errors.push(`invalid json: ${name}: ${err.message}`);
    return null;
  }
}

function requireCsv(name) {
  const filePath = path.join(targetDir, name);
  if (!fs.existsSync(filePath)) {
    errors.push(`missing csv: ${name}`);
    return null;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const nonEmpty = raw.split("\n").filter((l) => l.trim() !== "");
  if (nonEmpty.length < 1) errors.push(`csv empty: ${name}`);
  return raw;
}

for (const f of REQUIRED_CSV) requireCsv(f);

const accounts = readJsonl("accounts.jsonl");
const benchmarkTags = readJsonl("account_benchmark_tags.jsonl");
const accountReports = readJsonl("account_reports.jsonl");
const products = readJsonl("products.jsonl");
const fits = readJsonl("product_account_fits.jsonl");
const dims = readJsonl("comparison_dimensions.jsonl");
const advices = readJsonl("adjustment_advice.jsonl");
const summaryMetrics = readJsonl("summary_metrics.jsonl");

const quality = readJson("quality_report.json");
const sourceManifest = readJson("source_manifest.json");
const importManifest = readJson("sqlite_import_manifest.json");
function checkMeta(objectName, rows) {
  if (rows.length === 0) {
    warnings.push(`${objectName}: 0 rows`);
    return;
  }
  rows.forEach((row, idx) => {
    for (const key of REQUIRED_META) {
      if (row[key] === undefined || row[key] === null) {
        errors.push(`${objectName}[${idx}] missing meta ${key}`);
      }
    }
    const up = row.upsertKey;
    if (!up || typeof up !== "object" || !Array.isArray(up.fields) || up.fields.length === 0 || typeof up.hash !== "string") {
      errors.push(`${objectName}[${idx}] upsertKey must be { fields:string[], hash:string }`);
    }
  });
}

checkMeta("accounts", accounts);
checkMeta("account_benchmark_tags", benchmarkTags);
checkMeta("account_reports", accountReports);
checkMeta("products", products);
checkMeta("product_account_fits", fits);
checkMeta("comparison_dimensions", dims);
checkMeta("adjustment_advice", advices);
checkMeta("summary_metrics", summaryMetrics);

// upsertKey.hash must be unique inside each object
function checkHashUniqueness(objectName, rows) {
  if (rows.length === 0) return;
  const seen = new Map();
  rows.forEach((row, idx) => {
    const hash = row.upsertKey?.hash;
    if (!hash) return;
    if (seen.has(hash)) {
      errors.push(
        `${objectName} upsertKey.hash collision: rows ${seen.get(hash)} and ${idx} share hash=${hash}`,
      );
    } else {
      seen.set(hash, idx);
    }
  });
}
checkHashUniqueness("accounts", accounts);
checkHashUniqueness("account_benchmark_tags", benchmarkTags);
checkHashUniqueness("account_reports", accountReports);
checkHashUniqueness("products", products);
checkHashUniqueness("product_account_fits", fits);
checkHashUniqueness("comparison_dimensions", dims);
checkHashUniqueness("adjustment_advice", advices);
checkHashUniqueness("summary_metrics", summaryMetrics);

// upsertKey.fields must match declared value order (hash reproduces from row values)
function checkHashReproducible(objectName, rows) {
  if (rows.length === 0) return;
  const seen = new Map();
  rows.forEach((row, idx) => {
    const key = row.upsertKey;
    if (!key || !Array.isArray(key.fields) || typeof key.hash !== "string") return;
    // Only enforce presence of every declared field in the row (nested via dotted path unsupported here).
    for (const f of key.fields) {
      if (!(f in row)) {
        errors.push(`${objectName}[${idx}] upsertKey.fields references missing row field: ${f}`);
      }
    }
    if (seen.has(key.hash)) return;
    seen.set(key.hash, idx);
  });
}
checkHashReproducible("accounts", accounts);
checkHashReproducible("account_benchmark_tags", benchmarkTags);
checkHashReproducible("account_reports", accountReports);
checkHashReproducible("products", products);
checkHashReproducible("product_account_fits", fits);
checkHashReproducible("comparison_dimensions", dims);
checkHashReproducible("adjustment_advice", advices);
checkHashReproducible("summary_metrics", summaryMetrics);

const accountIds = new Set(accounts.map((a) => a.channelId));
const skuIds = new Set(products.map((p) => p.skuId));
const fitIds = new Set(fits.map((f) => f.fitId));

function assertTag(objectName, field, tagId) {
  if (tagId && !TAG_WHITELIST.has(tagId)) {
    errors.push(`${objectName}.${field} tagId not in whitelist: ${tagId}`);
  }
}

for (const row of benchmarkTags) {
  if (!accountIds.has(row.channelId)) errors.push(`account_benchmark_tags references unknown channelId: ${row.channelId}`);
  assertTag("account_benchmark_tags", "mappedTagId", row.mappedTagId);
}
for (const row of accountReports) {
  if (!accountIds.has(row.channelId)) errors.push(`account_reports references unknown channelId: ${row.channelId}`);
}
for (const row of fits) {
  if (!accountIds.has(row.accountChannelId)) errors.push(`product_account_fits references unknown accountChannelId: ${row.accountChannelId}`);
  if (!skuIds.has(row.skuId)) errors.push(`product_account_fits references unknown skuId: ${row.skuId}`);
}
for (const row of dims) {
  if (!fitIds.has(row.fitId)) errors.push(`comparison_dimensions references unknown fitId: ${row.fitId}`);
  assertTag("comparison_dimensions", "productTop1TagId", row.productTop1TagId);
  assertTag("comparison_dimensions", "accountTop1TagId", row.accountTop1TagId);
}
for (const row of advices) {
  if (!accountIds.has(row.accountChannelId)) errors.push(`adjustment_advice references unknown accountChannelId: ${row.accountChannelId}`);
  if (row.skuId && !skuIds.has(row.skuId)) warnings.push(`adjustment_advice skuId not in products: ${row.skuId}`);
  assertTag("adjustment_advice", "productTop1TagId", row.productTop1TagId);
  assertTag("adjustment_advice", "accountTop1TagId", row.accountTop1TagId);
}

if (quality) {
  for (const k of ["batchId", "dataVersion", "generatedAt", "timeWindow", "source", "objectCounts", "totalRows", "coverage", "admissionPolicy", "reproduce"]) {
    if (quality[k] === undefined) errors.push(`quality_report missing ${k}`);
  }
  const expected = {
    accounts: accounts.length,
    account_benchmark_tags: benchmarkTags.length,
    account_reports: accountReports.length,
    products: products.length,
    product_account_fits: fits.length,
    comparison_dimensions: dims.length,
    adjustment_advice: advices.length,
    summary_metrics: summaryMetrics.length,
  };
  for (const [k, v] of Object.entries(expected)) {
    if ((quality.objectCounts ?? {})[k] !== v) {
      errors.push(`quality_report objectCounts.${k}=${quality.objectCounts?.[k]} but actual=${v}`);
    }
  }
}
if (sourceManifest) {
  for (const k of ["batchId", "dataVersion", "generatedAt", "sources", "admissionPolicy", "mappingTemplate"]) {
    if (sourceManifest[k] === undefined) errors.push(`source_manifest missing ${k}`);
  }
}
if (importManifest) {
  for (const k of ["batchId", "dataVersion", "generatedAt", "targetDatabase", "tables"]) {
    if (importManifest[k] === undefined) errors.push(`sqlite_import_manifest missing ${k}`);
  }
  if (Array.isArray(importManifest.tables)) {
    const filesInPackage = new Set(fs.readdirSync(targetDir));
    for (const t of importManifest.tables) {
      for (const k of ["name", "file", "businessKey", "upsertKey", "writeMode"]) {
        if (t[k] === undefined) errors.push(`sqlite_import_manifest.tables.${t.name ?? "?"} missing ${k}`);
      }
      if (t.file && !filesInPackage.has(t.file)) {
        errors.push(`sqlite_import_manifest references missing file: ${t.file}`);
      }
      // Verify the manifest-declared upsert key is unique across actual row values.
      if (t.file && Array.isArray(t.upsertKey)) {
        const rows = readJsonl(t.file);
        const seen = new Map();
        rows.forEach((row, idx) => {
          const composite = t.upsertKey
            .map((f) => (row[f] === null || row[f] === undefined ? "__null__" : String(row[f])))
            .join("|");
          if (seen.has(composite)) {
            errors.push(
              `sqlite_import_manifest.tables.${t.name}: upsertKey ${JSON.stringify(t.upsertKey)} not unique; rows ${seen.get(composite)} and ${idx} share value=${composite}`,
            );
          } else {
            seen.set(composite, idx);
          }
        });
      }
      // Verify manifest-declared business key is unique across actual row values.
      if (t.file && Array.isArray(t.businessKey)) {
        const rows = readJsonl(t.file);
        const seen = new Map();
        rows.forEach((row, idx) => {
          const composite = t.businessKey
            .map((f) => (row[f] === null || row[f] === undefined ? "__null__" : String(row[f])))
            .join("|");
          if (seen.has(composite)) {
            errors.push(
              `sqlite_import_manifest.tables.${t.name}: businessKey ${JSON.stringify(t.businessKey)} not unique; rows ${seen.get(composite)} and ${idx} share value=${composite}`,
            );
          } else {
            seen.set(composite, idx);
          }
        });
      }
    }
  }
}
const summary = {
  targetDir,
  objectCounts: {
    accounts: accounts.length,
    account_benchmark_tags: benchmarkTags.length,
    account_reports: accountReports.length,
    products: products.length,
    product_account_fits: fits.length,
    comparison_dimensions: dims.length,
    adjustment_advice: advices.length,
    summary_metrics: summaryMetrics.length,
  },
  errorCount: errors.length,
  warningCount: warnings.length,
  errors,
  warnings,
};

process.stdout.write(JSON.stringify(summary, null, 2) + "\n");

if (errors.length > 0) {
  process.stderr.write(`[validate-p1-douyin-bi] ${errors.length} error(s)\n`);
  process.exit(1);
}
process.stderr.write("[validate-p1-douyin-bi] ok\n");

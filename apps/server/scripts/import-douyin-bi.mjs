#!/usr/bin/env node
// A-P1-F2: Import D-P1-F1 Douyin BI JSONL objects into the ws_demo SQLite.
//
// Usage:
//   node scripts/import-douyin-bi.mjs [<packageDir>]
//
// Defaults:
//   packageDir = <repo>/data/p1/douyin-bi
//   workspace  = ws_demo
//
// Behavior:
//   - Reads sqlite_import_manifest.json to enumerate JSONL tables.
//   - Upserts every row keyed by PK (workspace_id + business key + source_batch_id + data_version).
//   - Records one batch row + one audit_event on success.
//   - Re-runs of the same batchId+dataVersion do NOT duplicate rows (INSERT OR REPLACE).

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const packageDir = resolve(process.argv[2] ?? join(repoRoot, "data/p1/douyin-bi"));
const workspaceId = process.env.PLS_WORKSPACE ?? "ws_demo";
const dbPath = join(repoRoot, "data/workspaces", workspaceId, "db.sqlite");

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

const manifest = JSON.parse(readFileSync(join(packageDir, "sqlite_import_manifest.json"), "utf-8"));
const batchId = manifest.batchId;
const dataVersion = manifest.dataVersion;

// Read quality report if present (D-P1-F1 packages include quality_report.json).
let qualityReportJson = "{}";
try {
  qualityReportJson = readFileSync(join(packageDir, "quality_report.json"), "utf-8");
} catch {
  console.log("  (no quality_report.json found — quality_report column will be empty)");
}

console.log(`Importing douyin BI package`);
console.log(`  packageDir = ${packageDir}`);
console.log(`  workspace  = ${workspaceId}`);
console.log(`  batchId    = ${batchId}`);
console.log(`  version    = ${dataVersion}`);

function readJsonl(file) {
  const text = readFileSync(join(packageDir, file), "utf-8");
  return text.split("\n").map(l => l.trim()).filter(l => l.length > 0).map(l => JSON.parse(l));
}

function boolInt(v) { return v ? 1 : 0; }

// ---------------------------------------------------------------------------
// Per-table upsert
// ---------------------------------------------------------------------------
function upsertAccounts(rows) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO douyin_account (
    workspace_id, channel_id, source_batch_id, data_version, generated_at, time_window,
    account_group_id, account_name, account_kind, platform_type, channel_type,
    display_name_policy, display_name, is_baseline, has_report, has_benchmark_tags,
    source, source_type, upsert_hash, raw
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of rows) stmt.run(
    workspaceId, r.channelId, r.sourceBatchId, r.dataVersion, r.generatedAt,
    r.timeWindow ?? null, r.accountGroupId ?? null, r.accountName ?? null,
    r.accountKind ?? null, r.platformType ?? null, r.channelType ?? null,
    r.displayNamePolicy ?? null, r.displayName ?? null,
    boolInt(r.isBaseline), boolInt(r.hasReport), boolInt(r.hasBenchmarkTags),
    r.source ?? null, r.sourceType ?? null, r.upsertKey?.hash ?? null, JSON.stringify(r));
  return rows.length;
}

function upsertBenchmarkTags(rows) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO douyin_account_benchmark_tag (
    workspace_id, channel_id, dimension, option_label, source_batch_id, data_version,
    generated_at, time_window, account_name, dimension_taxonomy,
    share_percent, share_ratio, top1_flag, decision_method, business_interpretation,
    mapped_tag_id, mapping_confidence, sample_size, order_index, upsert_hash, raw
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of rows) stmt.run(
    workspaceId, r.channelId, r.dimension, r.optionLabel,
    r.sourceBatchId, r.dataVersion, r.generatedAt, r.timeWindow ?? null,
    r.accountName ?? null, r.dimensionTaxonomy ?? null,
    r.sharePercent ?? null, r.shareRatio ?? null, r.top1Flag ?? null,
    r.decisionMethod ?? null, r.businessInterpretation ?? null,
    r.mappedTagId ?? null, r.mappingConfidence ?? null, r.sampleSize ?? null,
    r.orderIndex ?? null, r.upsertKey?.hash ?? null, JSON.stringify(r));
  return rows.length;
}

function upsertAccountReports(rows) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO douyin_account_report (
    workspace_id, channel_id, report_kind, source_batch_id, data_version,
    generated_at, time_window, report_id, account_name, account_kind, channel_type,
    compare_period, plain_text_excerpt, plain_text_char_count,
    raw_html_bytes, raw_html_hash, raw_html_available,
    source, source_type, upsert_hash, raw
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of rows) stmt.run(
    workspaceId, r.channelId, r.reportKind, r.sourceBatchId, r.dataVersion,
    r.generatedAt, r.timeWindow ?? null, r.reportId ?? null,
    r.accountName ?? null, r.accountKind ?? null, r.channelType ?? null,
    r.comparePeriod ?? null, r.plainTextExcerpt ?? null, r.plainTextCharCount ?? null,
    r.rawHtmlBytes ?? null, r.rawHtmlHash ?? null, boolInt(r.rawHtmlAvailable),
    r.source ?? null, r.sourceType ?? null, r.upsertKey?.hash ?? null, JSON.stringify(r));
  return rows.length;
}

function upsertProducts(rows) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO douyin_product (
    workspace_id, sku_id, source_batch_id, data_version, generated_at, time_window,
    product_name, product_attributes, performance_metrics, performance_index,
    profile_distribution, mapped_profile_tags, unmapped_profile_fields,
    source, source_type, quality_flags, upsert_hash, raw
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of rows) stmt.run(
    workspaceId, r.skuId, r.sourceBatchId, r.dataVersion, r.generatedAt,
    r.timeWindow ?? null, r.productName ?? null,
    JSON.stringify(r.productAttributes ?? {}),
    JSON.stringify(r.performanceMetrics ?? {}),
    JSON.stringify(r.performanceIndex ?? {}),
    JSON.stringify(r.profileDistribution ?? {}),
    JSON.stringify(r.mappedProfileTags ?? []),
    JSON.stringify(r.unmappedProfileFields ?? []),
    r.source ?? null, r.sourceType ?? null,
    JSON.stringify(r.qualityFlags ?? []),
    r.upsertKey?.hash ?? null, JSON.stringify(r));
  return rows.length;
}

function upsertFits(rows) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO douyin_product_account_fit (
    workspace_id, fit_id, sku_id, account_channel_id, source_batch_id, data_version,
    generated_at, time_window, product_name, account_name,
    legacy_fit_score, legacy_fit_score_usage, mismatch_dimension_count, heavy_adjustment_tag_list,
    sales_rank, sales_volume, source, source_type, quality_flags, upsert_hash, raw
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of rows) stmt.run(
    workspaceId, r.fitId, r.skuId, r.accountChannelId,
    r.sourceBatchId, r.dataVersion, r.generatedAt, r.timeWindow ?? null,
    r.productName ?? null, r.accountName ?? null,
    r.legacyFitScore ?? null, r.legacyFitScoreUsage ?? null,
    r.mismatchDimensionCount ?? null, r.heavyAdjustmentTagList ?? null,
    r.salesRank ?? null, r.salesVolume ?? null,
    r.source ?? null, r.sourceType ?? null,
    JSON.stringify(r.qualityFlags ?? []),
    r.upsertKey?.hash ?? null, JSON.stringify(r));
  return rows.length;
}

function upsertComparisonDimensions(rows) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO douyin_comparison_dimension (
    workspace_id, fit_id, dimension, source_batch_id, data_version,
    generated_at, time_window, sku_id, account_channel_id, dimension_taxonomy,
    product_top1_label, product_top1_share_percent,
    account_top1_label, account_top1_share_percent,
    product_top1_tag_id, account_top1_tag_id,
    decision_method, is_match_label, status, gap_score,
    upsert_hash, raw
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of rows) stmt.run(
    workspaceId, r.fitId, r.dimension, r.sourceBatchId, r.dataVersion,
    r.generatedAt, r.timeWindow ?? null,
    r.skuId ?? null, r.accountChannelId ?? null, r.dimensionTaxonomy ?? null,
    r.productTop1Label ?? null, r.productTop1SharePercent ?? null,
    r.accountTop1Label ?? null, r.accountTop1SharePercent ?? null,
    r.productTop1TagId ?? null, r.accountTop1TagId ?? null,
    r.decisionMethod ?? null, r.isMatchLabel ?? null, r.status ?? null, r.gapScore ?? null,
    r.upsertKey?.hash ?? null, JSON.stringify(r));
  return rows.length;
}

function upsertAdjustmentAdvice(rows) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO douyin_adjustment_advice (
    workspace_id, advice_id, sku_id, account_channel_id, dimension, order_index,
    source_batch_id, data_version, generated_at, time_window, product_name, dimension_taxonomy,
    product_top1_label, product_top1_share_percent,
    account_top1_label, account_top1_share_percent,
    product_top1_tag_id, account_top1_tag_id, gap_score,
    priority_label, priority, direction, action_type, legacy_fit_score, evidence,
    source, source_type, quality_flags, upsert_hash, raw
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of rows) stmt.run(
    workspaceId, r.adviceId, r.skuId, r.accountChannelId, r.dimension, r.orderIndex,
    r.sourceBatchId, r.dataVersion, r.generatedAt, r.timeWindow ?? null,
    r.productName ?? null, r.dimensionTaxonomy ?? null,
    r.productTop1Label ?? null, r.productTop1SharePercent ?? null,
    r.accountTop1Label ?? null, r.accountTop1SharePercent ?? null,
    r.productTop1TagId ?? null, r.accountTop1TagId ?? null, r.gapScore ?? null,
    r.priorityLabel ?? null, r.priority ?? null,
    r.direction ?? null, r.actionType ?? null, r.legacyFitScore ?? null,
    JSON.stringify(r.evidence ?? {}),
    r.source ?? null, r.sourceType ?? null,
    JSON.stringify(r.qualityFlags ?? []),
    r.upsertKey?.hash ?? null, JSON.stringify(r));
  return rows.length;
}

function upsertSummaryMetrics(rows) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO douyin_summary_metric (
    workspace_id, metric_name, order_index, source_batch_id, data_version,
    generated_at, time_window, metric_value, metric_value_numeric,
    source, source_type, upsert_hash, raw
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of rows) stmt.run(
    workspaceId, r.metricName, r.orderIndex, r.sourceBatchId, r.dataVersion,
    r.generatedAt, r.timeWindow ?? null,
    r.metricValue == null ? null : String(r.metricValue), r.metricValueNumeric ?? null,
    r.source ?? null, r.sourceType ?? null,
    r.upsertKey?.hash ?? null, JSON.stringify(r));
  return rows.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const dispatch = {
  douyin_accounts: { fn: upsertAccounts, file: "accounts.jsonl" },
  douyin_account_benchmark_tags: { fn: upsertBenchmarkTags, file: "account_benchmark_tags.jsonl" },
  douyin_account_reports: { fn: upsertAccountReports, file: "account_reports.jsonl" },
  douyin_products: { fn: upsertProducts, file: "products.jsonl" },
  douyin_product_account_fits: { fn: upsertFits, file: "product_account_fits.jsonl" },
  douyin_comparison_dimensions: { fn: upsertComparisonDimensions, file: "comparison_dimensions.jsonl" },
  douyin_adjustment_advice: { fn: upsertAdjustmentAdvice, file: "adjustment_advice.jsonl" },
  douyin_summary_metrics: { fn: upsertSummaryMetrics, file: "summary_metrics.jsonl" },
};

const timeWindow = manifest.timeWindow ?? null;
const importBatchId = `douyin_bi_import_${batchId}_${dataVersion}`;
const entityCounts = {};

const transactionBody = () => {
  let total = 0;
  for (const table of manifest.tables) {
    const d = dispatch[table.name];
    if (!d) { console.warn(`  SKIP ${table.name} (no dispatch entry)`); continue; }
    const rows = readJsonl(d.file);
    const count = d.fn(rows);
    entityCounts[table.name] = count;
    console.log(`  ${table.name}: ${count} rows`);
    total += count;
  }

  db.prepare(`INSERT OR REPLACE INTO batch (batch_id, workspace_id, batch_type, source, source_type, time_window, row_count, entity_counts, quality_report, created_at)
    VALUES (?, ?, 'douyin_bi_import', ?, 'user_authorized', ?, ?, ?, ?, datetime('now'))`).run(
    importBatchId, workspaceId, `douyin_report_dashboard`, timeWindow, total, JSON.stringify(entityCounts), qualityReportJson);

  db.prepare(`INSERT INTO audit_event (audit_id, workspace_id, actor, request_id, resource_type, resource_id, event, meta, occurred_at)
    VALUES (?, ?, 'import-script', ?, 'bi_batch', ?, 'import_completed', ?, datetime('now'))`).run(
    randomUUID(), workspaceId, importBatchId, importBatchId,
    JSON.stringify({ sourceBatchId: batchId, dataVersion, totalRows: total, entityCounts }));

  console.log(`  total rows: ${total}`);
};

console.log("Upserting...");
db.exec("BEGIN");
try {
  transactionBody();
  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}
console.log("Done.");
db.close();
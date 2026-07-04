import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { OperationImpact } from "./dangerous-ops.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportJobResult {
  jobId: string;
  packageType: string;
  source: string;
  sourceType: string;
  dataVersion: string | null;
  status: "queued" | "running" | "succeeded" | "failed";
  dryRun: boolean;
  rowCount: number;
  successCount: number;
  errorCount: number;
  warnings: string[];
  errors: string[];
  qualityReport: Record<string, unknown>;
  tables: Array<{ name: string; rowCount: number }>;
  afterSnapshot: Record<string, unknown>;
  auditId: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface DryRunResult {
  packageType: string;
  source: string;
  sourceType: string;
  batchId: string | null;
  dataVersion: string | null;
  timeWindow: string | null;
  tables: Array<{ name: string; file: string; rowCount: number }>;
  totalRows: number;
  qualityReport: Record<string, unknown> | null;
  warnings: string[];
  errors: string[];
}

export interface VersionInfo {
  source: string;
  sourceType: string;
  batchId: string;
  dataVersion: string;
  rowCount: number;
  timeWindow: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Package registry
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dirname, "../../../../");

interface PackageConfig {
  type: string;
  source: string;
  sourceType: string;
  basePath: string;
  manifestFile?: string;
}

const PACKAGES: Record<string, PackageConfig> = {
  "douyin-bi": {
    type: "douyin-bi",
    source: "douyin_report_dashboard",
    sourceType: "user_authorized",
    basePath: "data/p1/douyin-bi",
    manifestFile: "sqlite_import_manifest.json",
  },
  demo: {
    type: "demo",
    source: "demo_seed",
    sourceType: "mock",
    basePath: "data/demo",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJsonl(filePath: string): Array<Record<string, SqlVal>> {
  const text = readFileSync(filePath, "utf-8");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, SqlVal>);
}

/** A value that can be stored in SQLite. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlVal = string | number | boolean | null | undefined;

/** Extract a typed SQL value from a JSONL row, coercing to SQLInputValue. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sv(r: Record<string, any>, key: string): string | number | null {
  const v = r[key];
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return String(v);
}

function boolInt(v: unknown): number {
  return v ? 1 : 0;
}

// Helper to stringify a value for JSON columns
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jsonVal(v: any): string {
  return JSON.stringify(v ?? {});
}

const MANIFEST_TO_TABLE_NAME: Record<string, string> = {
  douyin_accounts: "douyin_account",
  douyin_account_benchmark_tags: "douyin_account_benchmark_tag",
  douyin_account_reports: "douyin_account_report",
  douyin_products: "douyin_product",
  douyin_product_account_fits: "douyin_product_account_fit",
  douyin_comparison_dimensions: "douyin_comparison_dimension",
  douyin_adjustment_advice: "douyin_adjustment_advice",
  douyin_summary_metrics: "douyin_summary_metric",
  skus: "sku",
  channel_profiles: "channel_profile",
  wide_table: "wide_table_row",
};

function manifestToTableName(name: string): string {
  return MANIFEST_TO_TABLE_NAME[name] ?? name;
}

/** Convert a dry-run result into the standardized OperationImpact shape. */
export function toImportImpact(dry: DryRunResult): OperationImpact {
  const affectedTables = dry.tables.map((t) => manifestToTableName(t.name));
  return {
    operation: "import",
    targetType: "package",
    targetName: dry.packageType,
    affectedTables,
    affectedRows: dry.totalRows,
    sourceType: dry.sourceType,
    dataVersion: dry.dataVersion,
    containsUserAuthorized: dry.sourceType === "user_authorized",
    containsSystemHistory: false,
    warnings: [...dry.warnings, ...dry.errors],
    requiredConfirmText: `IMPORT ${dry.packageType}`,
  };
}

// ---------------------------------------------------------------------------
// Dry run: douyin-bi
// ---------------------------------------------------------------------------

function dryRunDouyinBi(pkg: PackageConfig): DryRunResult {
  const packageDir = resolve(REPO_ROOT, pkg.basePath);
  const manifestPath = join(packageDir, pkg.manifestFile!);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

  const result: DryRunResult = {
    packageType: pkg.type,
    source: pkg.source,
    sourceType: pkg.sourceType,
    batchId: manifest.batchId ?? null,
    dataVersion: manifest.dataVersion ?? null,
    timeWindow: manifest.timeWindow ?? null,
    tables: [],
    totalRows: 0,
    qualityReport: null,
    warnings: [],
    errors: [],
  };

  // Read quality report
  const qrPath = join(packageDir, "quality_report.json");
  if (existsSync(qrPath)) {
    try {
      result.qualityReport = JSON.parse(readFileSync(qrPath, "utf-8"));
    } catch {
      result.warnings.push("quality_report.json exists but could not be parsed");
    }
  }

  // Count rows per table
  for (const table of manifest.tables ?? []) {
    const filePath = join(packageDir, table.file);
    if (!existsSync(filePath)) {
      result.errors.push(`file not found: ${table.file}`);
      continue;
    }
    try {
      const rows = readJsonl(filePath);
      result.tables.push({ name: manifestToTableName(table.name), file: table.file, rowCount: rows.length });
      result.totalRows += rows.length;

      // Validate required fields
      for (const [i, row] of rows.entries()) {
        if (!row.sourceBatchId) {
          result.warnings.push(`${table.file}[${i}]: missing sourceBatchId`);
        }
        if (!row.dataVersion) {
          result.warnings.push(`${table.file}[${i}]: missing dataVersion`);
        }
        if (!row.generatedAt) {
          result.warnings.push(`${table.file}[${i}]: missing generatedAt`);
        }
      }
    } catch (err) {
      result.errors.push(`failed to parse ${table.file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Dry run: demo
// ---------------------------------------------------------------------------

function dryRunDemo(pkg: PackageConfig): DryRunResult {
  const packageDir = resolve(REPO_ROOT, pkg.basePath);

  const result: DryRunResult = {
    packageType: pkg.type,
    source: pkg.source,
    sourceType: pkg.sourceType,
    batchId: null,
    dataVersion: null,
    timeWindow: null,
    tables: [],
    totalRows: 0,
    qualityReport: null,
    warnings: [],
    errors: [],
  };

  // Read quality report
  const qrPath = join(packageDir, "batch_quality_report.json");
  if (existsSync(qrPath)) {
    try {
      result.qualityReport = JSON.parse(readFileSync(qrPath, "utf-8"));
    } catch {
      result.warnings.push("batch_quality_report.json exists but could not be parsed");
    }
  }

  // Count rows in JSONL files
  const jsonlFiles = [
    { file: "skus.jsonl", tableName: "sku" },
    { file: "channel_profiles.jsonl", tableName: "channel_profile" },
    { file: "wide_table.jsonl", tableName: "wide_table_row" },
  ];
  for (const { file, tableName } of jsonlFiles) {
    const filePath = join(packageDir, file);
    if (!existsSync(filePath)) {
      result.warnings.push(`file not found: ${file} (optional)`);
      continue;
    }
    try {
      const rows = readJsonl(filePath);
      result.tables.push({ name: tableName, file, rowCount: rows.length });
      result.totalRows += rows.length;
    } catch (err) {
      result.errors.push(`failed to parse ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Execute import: douyin-bi
// ---------------------------------------------------------------------------

function executeDouyinBi(
  db: DatabaseSync,
  workspaceId: string,
  pkg: PackageConfig,
): Omit<ImportJobResult, "jobId" | "dryRun" | "auditId"> {
  const packageDir = resolve(REPO_ROOT, pkg.basePath);
  const manifest = JSON.parse(readFileSync(join(packageDir, pkg.manifestFile!), "utf-8"));
  const batchId = manifest.batchId as string;
  const dataVersion = manifest.dataVersion as string;
  const timeWindow = manifest.timeWindow ?? null;

  let qualityReportJson = "{}";
  try {
    qualityReportJson = readFileSync(join(packageDir, "quality_report.json"), "utf-8");
  } catch { /* no quality report */ }

  const importBatchId = `douyin_bi_import_${batchId}_${dataVersion}`;
  const entityCounts: Record<string, number> = {};
  let total = 0;
  const warnings: string[] = [];
  const errors: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upsertFns: Record<string, (rows: any[]) => number> = {
    douyin_accounts: (rows) => {
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
        r.source ?? null, r.sourceType ?? null, r.upsertKey?.hash ?? null, jsonVal(r));
      return rows.length;
    },
    douyin_account_benchmark_tags: (rows) => {
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
        r.orderIndex ?? null, r.upsertKey?.hash ?? null, jsonVal(r));
      return rows.length;
    },
    douyin_account_reports: (rows) => {
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
        r.source ?? null, r.sourceType ?? null, r.upsertKey?.hash ?? null, jsonVal(r));
      return rows.length;
    },
    douyin_products: (rows) => {
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
        r.upsertKey?.hash ?? null, jsonVal(r));
      return rows.length;
    },
    douyin_product_account_fits: (rows) => {
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
        r.upsertKey?.hash ?? null, jsonVal(r));
      return rows.length;
    },
    douyin_comparison_dimensions: (rows) => {
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
        r.upsertKey?.hash ?? null, jsonVal(r));
      return rows.length;
    },
    douyin_adjustment_advice: (rows) => {
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
        r.upsertKey?.hash ?? null, jsonVal(r));
      return rows.length;
    },
    douyin_summary_metrics: (rows) => {
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
        r.upsertKey?.hash ?? null, jsonVal(r));
      return rows.length;
    },
  };

  const tables: Array<{ name: string; rowCount: number }> = [];

  db.exec("BEGIN");
  try {
    for (const table of manifest.tables ?? []) {
      const fn = upsertFns[table.name];
      if (!fn) {
        warnings.push(`no upsert function for ${table.name}, skipped`);
        continue;
      }
      const filePath = join(packageDir, table.file);
      if (!existsSync(filePath)) {
        errors.push(`file not found: ${table.file}`);
        continue;
      }
      const rows = readJsonl(filePath);
      const count = fn(rows);
      entityCounts[table.name] = count;
      tables.push({ name: manifestToTableName(table.name), rowCount: count });
      total += count;
    }

    db.prepare(`INSERT OR REPLACE INTO batch (batch_id, workspace_id, batch_type, source, source_type, time_window, row_count, entity_counts, quality_report, created_at)
      VALUES (?, ?, 'douyin_bi_import', ?, 'user_authorized', ?, ?, ?, ?, datetime('now'))`).run(
      importBatchId, workspaceId, pkg.source, timeWindow, total, JSON.stringify(entityCounts), qualityReportJson);

    db.prepare(`INSERT INTO audit_event (audit_id, workspace_id, actor, request_id, resource_type, resource_id, event, meta, occurred_at)
      VALUES (?, ?, 'admin-api', ?, 'bi_batch', ?, 'import_completed', ?, datetime('now'))`).run(
      randomUUID(), workspaceId, importBatchId, importBatchId,
      JSON.stringify({ sourceBatchId: batchId, dataVersion, totalRows: total, entityCounts }));

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return {
    packageType: pkg.type,
    source: pkg.source,
    sourceType: pkg.sourceType,
    dataVersion,
    status: "succeeded",
    rowCount: total,
    successCount: total,
    errorCount: errors.length,
    warnings,
    errors,
    qualityReport: JSON.parse(qualityReportJson),
    tables,
    afterSnapshot: {
      tableRowCounts: Object.fromEntries(tables.map((t) => [t.name, t.rowCount])),
      totalRows: total,
      dataVersion,
    },
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Execute import: demo
// ---------------------------------------------------------------------------

function executeDemo(
  db: DatabaseSync,
  workspaceId: string,
  _pkg: PackageConfig,
): Omit<ImportJobResult, "jobId" | "dryRun" | "auditId"> {
  const packageDir = resolve(REPO_ROOT, "data/demo");
  const warnings: string[] = [];
  const errors: string[] = [];
  const tables: Array<{ name: string; rowCount: number }> = [];
  let total = 0;

  db.exec("BEGIN");
  try {
    // Import SKUs
    const skuPath = join(packageDir, "skus.jsonl");
    if (existsSync(skuPath)) {
      const rows = readJsonl(skuPath);
      const stmt = db.prepare(`INSERT OR REPLACE INTO sku (
        sku_id, workspace_id, spu_id, category_lv1, category_lv2, season, title, attributes, assets, mapped_product_tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const r of rows) stmt.run(
        sv(r, "skuId"), workspaceId, sv(r, "spuId"), sv(r, "categoryLv1"),
        sv(r, "categoryLv2"), sv(r, "season"), sv(r, "title"),
        JSON.stringify(r.attributes ?? {}), JSON.stringify(r.assets ?? []),
        JSON.stringify(r.mappedProductTags ?? []));
      tables.push({ name: "sku", rowCount: rows.length });
      total += rows.length;
    }

    // Import channel profiles
    const cpPath = join(packageDir, "channel_profiles.jsonl");
    if (existsSync(cpPath)) {
      const rows = readJsonl(cpPath);
      const stmt = db.prepare(`INSERT OR REPLACE INTO channel_profile (
        channel_id, workspace_id, channel_name, channel_type, platform_type,
        sample_size, source, tags, traffic_index, conversion_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const r of rows) stmt.run(
        sv(r, "channelId"), workspaceId, sv(r, "channelName"), sv(r, "channelType"),
        sv(r, "platformType"), sv(r, "sampleSize"), sv(r, "source"),
        JSON.stringify(r.tags ?? []), sv(r, "trafficIndex"), sv(r, "conversionIndex"));
      tables.push({ name: "channel_profile", rowCount: rows.length });
      total += rows.length;
    }

    // Import wide table
    const wtPath = join(packageDir, "wide_table.jsonl");
    if (existsSync(wtPath)) {
      const rows = readJsonl(wtPath);
      const stmt = db.prepare(`INSERT OR REPLACE INTO wide_table_row (
        sku_id, channel_id, time_window, workspace_id, full_row
      ) VALUES (?, ?, ?, ?, ?)`);
      for (const r of rows) stmt.run(
        sv(r, "skuId"), sv(r, "channelId"), sv(r, "timeWindow"), workspaceId, jsonVal(r));
      tables.push({ name: "wide_table_row", rowCount: rows.length });
      total += rows.length;
    }

    // Ensure workspace exists
    db.prepare("INSERT OR IGNORE INTO workspace (workspace_id, name) VALUES (?, ?)").run(workspaceId, "Demo Workspace");

    // Write batch record
    const batchId = `demo_import_${Date.now()}`;
    db.prepare(`INSERT INTO batch (batch_id, workspace_id, batch_type, source, source_type, row_count, entity_counts, created_at)
      VALUES (?, ?, 'demo_import', 'demo_seed', 'mock', ?, ?, datetime('now'))`).run(
      batchId, workspaceId, total, JSON.stringify(Object.fromEntries(tables.map((t) => [t.name, t.rowCount]))));

    db.prepare(`INSERT INTO audit_event (audit_id, workspace_id, actor, request_id, resource_type, resource_id, event, meta, occurred_at)
      VALUES (?, ?, 'admin-api', ?, 'demo_batch', ?, 'import_completed', ?, datetime('now'))`).run(
      randomUUID(), workspaceId, batchId, batchId,
      JSON.stringify({ totalRows: total, tables: tables.map((t) => t.name) }));

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return {
    packageType: "demo",
    source: "demo_seed",
    sourceType: "mock",
    dataVersion: null,
    status: "succeeded",
    rowCount: total,
    successCount: total,
    errorCount: errors.length,
    warnings,
    errors,
    qualityReport: {},
    tables,
    afterSnapshot: {
      tableRowCounts: Object.fromEntries(tables.map((t) => [t.name, t.rowCount])),
      totalRows: total,
      dataVersion: null,
    },
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getPackageConfig(packageType: string): PackageConfig | undefined {
  return PACKAGES[packageType];
}

export function listPackageTypes(): string[] {
  return Object.keys(PACKAGES);
}

export function dryRun(packageType: string): DryRunResult {
  const pkg = PACKAGES[packageType];
  if (!pkg) throw new Error(`unknown package type: ${packageType}`);
  if (pkg.type === "douyin-bi") return dryRunDouyinBi(pkg);
  if (pkg.type === "demo") return dryRunDemo(pkg);
  throw new Error(`dry run not implemented for package type: ${packageType}`);
}

/** Standardized dry-run impact for a package. */
export function dryRunImpact(packageType: string): OperationImpact {
  return toImportImpact(dryRun(packageType));
}

export function executeImport(
  db: DatabaseSync,
  workspaceId: string,
  packageType: string,
): ImportJobResult {
  const pkg = PACKAGES[packageType];
  if (!pkg) throw new Error(`unknown package type: ${packageType}`);

  const jobId = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = new Date().toISOString();

  // Insert job record (queued)
  db.prepare(`INSERT INTO data_import_job (job_id, workspace_id, import_type, source, source_type, status, dry_run, created_at, started_at)
    VALUES (?, ?, ?, ?, ?, 'queued', 0, datetime('now'), ?)`).run(
    jobId, workspaceId, packageType, pkg.source, pkg.sourceType, startedAt);

  // Update to running
  db.prepare("UPDATE data_import_job SET status = 'running' WHERE job_id = ?").run(jobId);

  try {
    let result: Omit<ImportJobResult, "jobId" | "dryRun" | "auditId">;
    if (pkg.type === "douyin-bi") {
      result = executeDouyinBi(db, workspaceId, pkg);
    } else if (pkg.type === "demo") {
      result = executeDemo(db, workspaceId, pkg);
    } else {
      throw new Error(`import not implemented for package type: ${packageType}`);
    }

    // Update job record (succeeded)
    db.prepare(`UPDATE data_import_job SET status = 'succeeded',
      row_count = ?, success_count = ?, error_count = ?,
      quality_report = ?, data_version = ?,
      finished_at = datetime('now')
      WHERE job_id = ?`).run(
      result.rowCount, result.successCount, result.errorCount,
      JSON.stringify(result.qualityReport), result.dataVersion, jobId);

    // Write admin audit
    const auditId = randomUUID();
    db.prepare(`INSERT INTO db_admin_audit (audit_id, workspace_id, actor, operation, target_type, target_name, before_snapshot, after_snapshot, status, created_at)
      VALUES (?, ?, 'admin-api', 'import', 'package', ?, ?, ?, 'success', datetime('now'))`).run(
      auditId, workspaceId, packageType,
      JSON.stringify({ tableRowCounts: Object.fromEntries(result.tables.map((t) => [t.name, 0])), totalRows: 0 }),
      JSON.stringify(result.afterSnapshot));

    return { jobId, dryRun: false, auditId, ...result };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    db.prepare("UPDATE data_import_job SET status = 'failed', error = ?, finished_at = datetime('now') WHERE job_id = ?").run(errorMsg, jobId);
    db.prepare(`INSERT INTO db_admin_audit (audit_id, workspace_id, actor, operation, target_type, target_name, status, error, created_at)
      VALUES (?, ?, 'admin-api', 'import', 'package', ?, 'failed', ?, datetime('now'))`).run(
      randomUUID(), workspaceId, packageType, errorMsg);
    throw err;
  }
}

export function listVersions(db: DatabaseSync, workspaceId: string): VersionInfo[] {
  const versions: VersionInfo[] = [];

  // From batch table
  const batchRows = db.prepare(
    "SELECT batch_id, source, source_type, time_window, row_count, created_at FROM batch WHERE workspace_id = ? ORDER BY created_at DESC"
  ).all(workspaceId) as Array<{ batch_id: string; source: string; source_type: string; time_window: string | null; row_count: number; created_at: string }>;

  for (const row of batchRows) {
    // Extract data_version from batch metadata if available
    const metaRow = db.prepare(
      "SELECT meta FROM audit_event WHERE resource_id = ? AND event = 'import_completed' LIMIT 1"
    ).get(row.batch_id) as { meta: string } | undefined;
    let dataVersion = "";
    if (metaRow) {
      try {
        const meta = JSON.parse(metaRow.meta);
        dataVersion = meta.dataVersion ?? "";
      } catch { /* ignore */ }
    }

    versions.push({
      source: row.source ?? "unknown",
      sourceType: row.source_type ?? "unknown",
      batchId: row.batch_id,
      dataVersion,
      rowCount: row.row_count ?? 0,
      timeWindow: row.time_window,
      createdAt: row.created_at,
    });
  }

  return versions;
}

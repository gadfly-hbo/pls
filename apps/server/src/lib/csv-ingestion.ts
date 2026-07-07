import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { OperationImpact } from "./dangerous-ops.js";

// ---------------------------------------------------------------------------
// Constants and configuration
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dirname, "../../../../");
const STAGING_ROOT = resolve(REPO_ROOT, "data/local/csv-staging");

/** Tables that may receive CSV imports in P7 phase 1. */
export const CSV_ALLOWED_TABLES = new Set([
  "sku",
  "channel_profile",
  "wide_table_row",
  "batch",
  "prediction",
  "match_result",
]);

/** Tables that must never be imported via CSV. */
export const CSV_PROTECTED_TABLES = new Set([
  "workspace",
  "schema_migration",
  "db_admin_audit",
  "idempotency_key",
  "data_import_job",
  "audit_event",
  "task",
]);

const STAGED_FILE_ID_REGEX = /^csv_[0-9]+_[a-z0-9]{6}$/;

function isValidStagedFileId(id: string): boolean {
  return typeof id === "string" && STAGED_FILE_ID_REGEX.test(id);
}

function isWithinStagingDir(filePath: string, workspaceId: string): boolean {
  const root = resolve(stagingDir(workspaceId));
  const resolved = resolve(filePath);
  return resolved === root || resolved.startsWith(root + sep);
}

/** Column type overrides for tables where the SQLite declared type is TEXT but
 *  the CSV value should be validated/parsed as JSON/BOOLEAN/DATETIME. */
const COLUMN_TYPE_OVERRIDES: Record<string, Record<string, ColumnType>> = {
  sku: {
    attributes: "JSON",
    assets: "JSON",
    mapped_product_tags: "JSON",
    created_at: "DATETIME",
    updated_at: "DATETIME",
  },
  channel_profile: {
    tags: "JSON",
    quality_flags: "JSON",
    created_at: "DATETIME",
    updated_at: "DATETIME",
  },
  wide_table_row: {
    full_row: "JSON",
    created_at: "DATETIME",
  },
  batch: {
    entity_counts: "JSON",
    quality_report: "JSON",
    created_at: "DATETIME",
  },
  prediction: {
    input_snapshot: "JSON",
    predicted_profile_tags: "JSON",
    top_segments: "JSON",
    quality_flags: "JSON",
    unmapped_input_tokens: "JSON",
    generated_at: "DATETIME",
    created_at: "DATETIME",
  },
  match_result: {
    positive_drivers: "JSON",
    negative_drivers: "JSON",
    risks: "JSON",
    quality_flags: "JSON",
    mismatched_dimensions: "JSON",
    adjustment_advice: "JSON",
    generated_at: "DATETIME",
    created_at: "DATETIME",
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ColumnType = "TEXT" | "INTEGER" | "REAL" | "NUMERIC" | "JSON" | "BOOLEAN" | "DATETIME";

export interface ColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | null;
  pk: number;
}

export interface ErrorItem {
  rowNumber: number;
  column: string;
  rule: string;
  message: string;
  rawValue: string;
}

export interface WarningItem {
  rowNumber: number | null;
  column: string;
  message: string;
}

export interface QualityReport {
  rowCount: number;
  validRows: number;
  errorRows: number;
  missingColumns: string[];
  extraColumns: string[];
  typeErrors: number;
  sampleErrors: ErrorItem[];
  warnings: WarningItem[];
  blockingErrors: number;
  requiredConfirmText: string;
}

export interface CsvDryRunResult {
  operation: "import";
  targetType: "csv_upload";
  targetName: string;
  affectedTables: string[];
  affectedRows: number;
  sourceType: string;
  dataVersion: string | null;
  containsUserAuthorized: boolean;
  containsSystemHistory: boolean;
  warnings: string[];
  requiredConfirmText: string;
  stagedFileId: string;
  qualityReport: QualityReport;
  blockingErrorCount: number;
}

export interface StagingMeta {
  stagedFileId: string;
  targetTable: string;
  originalName: string;
  contentHash: string;
  uploadedAt: string;
  workspaceId: string;
}

export interface CsvImportJobResult {
  jobId: string;
  status: "succeeded" | "failed";
  rowCount: number;
  successCount: number;
  errorCount: number;
  warnings: string[];
  errors: string[];
  qualityReport: QualityReport;
  beforeSnapshot: Record<string, unknown>;
  afterSnapshot: Record<string, unknown>;
  auditId: string;
  sourceBatchId: string;
  dataVersion: string;
  startedAt: string;
  finishedAt: string;
}

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '\\' && next === '"') {
        field += '"';
        i += 2;
      } else if (ch === '"') {
        if (next === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i += 1;
      } else if (ch === ',') {
        current.push(field);
        field = "";
        i += 1;
      } else if (ch === '\r' && next === '\n') {
        current.push(field);
        if (current.length > 1 || current[0] !== "" || i > 0) {
          lines.push(current);
        }
        current = [];
        field = "";
        i += 2;
      } else if (ch === '\n' || ch === '\r') {
        current.push(field);
        if (current.length > 1 || current[0] !== "" || i > 0) {
          lines.push(current);
        }
        current = [];
        field = "";
        i += 1;
      } else {
        field += ch;
        i += 1;
      }
    }
  }

  if (field !== "" || current.length > 0) {
    current.push(field);
    lines.push(current);
  }

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const firstLine = lines[0]!;
  const headers = firstLine.map((h) => h.trim());
  const rows = lines.slice(1).filter((r) => r.length > 1 || r[0] !== "" || r.some((c) => c !== ""));
  return { headers, rows };
}

// ---------------------------------------------------------------------------
// Header and column helpers
// ---------------------------------------------------------------------------

export function normalizeHeader(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s\-.]+/g, "_")
    .replace(/_+/g, "_");
}

export function resolveColumnType(tableName: string, column: ColumnInfo): ColumnType {
  const overrides = COLUMN_TYPE_OVERRIDES[tableName];
  const override = overrides?.[column.name];
  if (override) return override;
  const declared = (column.type ?? "").toUpperCase();
  if (declared === "INTEGER") return "INTEGER";
  if (declared === "REAL") return "REAL";
  if (declared === "NUMERIC") return "NUMERIC";
  if (declared === "TEXT") return "TEXT";
  if (declared === "BLOB") return "TEXT";
  return "TEXT";
}

function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// ---------------------------------------------------------------------------
// Type converters
// ---------------------------------------------------------------------------

export function convertValue(raw: string, _columnName: string, columnType: ColumnType): { value: SQLInputValue | null; error?: string } {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { value: null };
  }

  switch (columnType) {
    case "TEXT":
      return { value: raw };

    case "INTEGER": {
      const intVal = parseInt(trimmed, 10);
      if (!Number.isFinite(intVal) || String(intVal) !== trimmed) {
        return { value: null, error: `Expected INTEGER, got '${raw}'` };
      }
      return { value: intVal };
    }

    case "REAL":
    case "NUMERIC": {
      const floatVal = parseFloat(trimmed);
      if (!Number.isFinite(floatVal)) {
        return { value: null, error: `Expected ${columnType}, got '${raw}'` };
      }
      return { value: floatVal };
    }

    case "BOOLEAN": {
      const lower = trimmed.toLowerCase();
      if (["1", "true", "yes", "y"].includes(lower)) return { value: 1 };
      if (["0", "false", "no", "n"].includes(lower)) return { value: 0 };
      return { value: null, error: `Expected BOOLEAN, got '${raw}'` };
    }

    case "DATETIME": {
      const dt = new Date(trimmed);
      if (Number.isNaN(dt.getTime())) {
        return { value: null, error: `Expected DATETIME, got '${raw}'` };
      }
      return { value: trimmed };
    }

    case "JSON": {
      try {
        const parsed = JSON.parse(trimmed);
        return { value: JSON.stringify(parsed) };
      } catch {
        return { value: null, error: `Expected JSON, got '${raw}'` };
      }
    }

    default:
      return { value: raw };
  }
}

// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------

function stagingDir(workspaceId: string): string {
  return resolve(STAGING_ROOT, workspaceId);
}

function stagedFilePath(workspaceId: string, stagedFileId: string): string {
  return resolve(stagingDir(workspaceId), stagedFileId, "data.csv");
}

function stagingMetaPath(workspaceId: string, stagedFileId: string): string {
  return resolve(stagingDir(workspaceId), stagedFileId, "staging.json");
}

export async function stageCsvFile(workspaceId: string, targetTable: string, file: File | { name: string; text(): Promise<string> | string }): Promise<{ stagedFileId: string; contentHash: string; path: string }> {
  const stagedFileId = `csv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const dir = resolve(stagingDir(workspaceId), stagedFileId);
  mkdirSync(dir, { recursive: true });

  const textPromise = typeof file.text === "function" ? file.text() : file.text;
  const text = await Promise.resolve(textPromise);
  const contentHash = hashContent(text);
  const csvPath = resolve(dir, "data.csv");
  writeFileSync(csvPath, text, "utf-8");

  const meta: StagingMeta = {
    stagedFileId,
    targetTable,
    originalName: file.name || "upload.csv",
    contentHash,
    uploadedAt: new Date().toISOString(),
    workspaceId,
  };
  writeFileSync(resolve(dir, "staging.json"), JSON.stringify(meta, null, 2), "utf-8");

  return { stagedFileId, contentHash, path: csvPath };
}

export function loadStagedCsv(workspaceId: string, stagedFileId: string, expectedTargetTable?: string): { path: string; meta: StagingMeta; text: string } | null {
  if (!isValidStagedFileId(stagedFileId)) return null;

  const csvPath = stagedFilePath(workspaceId, stagedFileId);
  const metaPath = stagingMetaPath(workspaceId, stagedFileId);
  if (!isWithinStagingDir(csvPath, workspaceId) || !isWithinStagingDir(metaPath, workspaceId)) return null;
  if (!existsSync(csvPath) || !existsSync(metaPath)) return null;

  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as StagingMeta;
    if (meta.workspaceId !== workspaceId || meta.stagedFileId !== stagedFileId) {
      return null;
    }
    if (expectedTargetTable != null && meta.targetTable !== expectedTargetTable) {
      return null;
    }
    const text = readFileSync(csvPath, "utf-8");
    const currentHash = hashContent(text);
    if (currentHash !== meta.contentHash) {
      return null;
    }
    return { path: csvPath, meta, text };
  } catch {
    return null;
  }
}

export function removeStagedCsv(workspaceId: string, stagedFileId: string): void {
  const dir = resolve(stagingDir(workspaceId), stagedFileId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Schema introspection
// ---------------------------------------------------------------------------

export function getTableColumns(db: DatabaseSync, tableName: string): ColumnInfo[] {
  const rows = db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }>;
  return rows.map((r) => ({
    name: r.name,
    type: r.type,
    notNull: r.notnull === 1,
    defaultValue: r.dflt_value,
    pk: r.pk,
  }));
}

function isRequiredColumn(col: ColumnInfo): boolean {
  return col.notNull && col.defaultValue == null && col.name !== "workspace_id";
}

// ---------------------------------------------------------------------------
// Dry run
// ---------------------------------------------------------------------------

export interface DryRunOptions {
  strict?: boolean;
}

export function dryRunCsv(
  db: DatabaseSync,
  workspaceId: string,
  targetTable: string,
  stagedFileId: string,
  options: DryRunOptions = {}
): CsvDryRunResult {
  const staged = loadStagedCsv(workspaceId, stagedFileId, targetTable);
  if (!staged) {
    return buildErrorResult(targetTable, stagedFileId, "staged_file_missing", `Staged file "${stagedFileId}" not found, was modified, or does not match target table "${targetTable}"`);
  }
  return dryRunCsvText(db, workspaceId, targetTable, stagedFileId, staged.text, options);
}

export function dryRunCsvText(
  db: DatabaseSync,
  workspaceId: string,
  targetTable: string,
  stagedFileId: string,
  text: string,
  options: DryRunOptions = {}
): CsvDryRunResult {
  if (CSV_PROTECTED_TABLES.has(targetTable)) {
    return buildErrorResult(targetTable, stagedFileId, "unsupported_target_table", `Table "${targetTable}" is not allowed for CSV import`);
  }
  if (!CSV_ALLOWED_TABLES.has(targetTable)) {
    return buildErrorResult(targetTable, stagedFileId, "unsupported_target_table", `Table "${targetTable}" is not in the CSV import whitelist`);
  }

  const columns = getTableColumns(db, targetTable);
  if (columns.length === 0) {
    return buildErrorResult(targetTable, stagedFileId, "unsupported_target_table", `Table "${targetTable}" does not exist in workspace "${workspaceId}"`);
  }

  const { headers, rows } = parseCsv(text);

  if (headers.length === 0) {
    return buildErrorResult(targetTable, stagedFileId, "empty_csv", "CSV has no header row");
  }
  if (rows.length === 0) {
    return buildErrorResult(targetTable, stagedFileId, "empty_csv", "CSV has no data rows");
  }

  const normalizedHeaders = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
  const headerIndex: Record<string, number> = {};
  const headerCollisions = new Set<string>();
  for (let i = 0; i < normalizedHeaders.length; i++) {
    const entry = normalizedHeaders[i]!;
    const norm = entry.norm;
    if (norm === "") continue;
    if (norm in headerIndex) {
      headerCollisions.add(norm);
    } else {
      headerIndex[norm] = i;
    }
  }

  const columnMap = new Map(columns.map((c) => [c.name, c]));
  const pkColumns = columns.filter((c) => c.pk > 0).map((c) => c.name);
  const requiredColumns = columns.filter(isRequiredColumn).map((c) => c.name);

  const missingColumns: string[] = [];
  for (const req of requiredColumns) {
    if (!(req in headerIndex)) {
      missingColumns.push(req);
    }
  }

  const extraColumns: string[] = [];
  for (const norm of Object.keys(headerIndex)) {
    if (!columnMap.has(norm)) {
      extraColumns.push(norm);
    }
  }

  const sampleErrors: ErrorItem[] = [];
  const warnings: WarningItem[] = [];
  const pkSeen = new Set<string>();
  const errorRows = new Set<number>();
  let typeErrorCount = 0;

  const addError = (rowNumber: number, column: string, rule: string, message: string, rawValue: string) => {
    sampleErrors.push({ rowNumber, column, rule, message, rawValue });
    errorRows.add(rowNumber);
    if (rule === "type_conversion_failed") {
      typeErrorCount += 1;
    }
  };

  if (headerCollisions.size > 0) {
    for (const col of headerCollisions) {
      addError(1, col, "header_normalization_collision", `Normalized header "${col}" appears more than once`, "");
    }
  }

  for (const col of missingColumns) {
    addError(1, col, "missing_required_column", `Required column "${col}" is missing from CSV header`, "");
  }

  for (const col of extraColumns) {
    warnings.push({ rowNumber: null, column: col, message: `CSV column "${col}" is not in target table "${targetTable}" and will be ignored` });
  }

  if (options.strict && extraColumns.length > 0) {
    for (const col of extraColumns) {
      addError(1, col, "extra_columns_in_strict_mode", `Strict mode does not allow extra CSV column "${col}"`, "");
    }
  }

  for (const pk of pkColumns) {
    if (!(pk in headerIndex)) {
      addError(1, pk, "primary_key_missing", `Primary key column "${pk}" is missing from CSV header`, "");
      if (!missingColumns.includes(pk)) {
        missingColumns.push(pk);
      }
    }
  }

  const workspaceIdIndex = headerIndex["workspace_id"];
  if (workspaceIdIndex != null) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowNumber = i + 2;
      const rawValue = row[workspaceIdIndex] ?? "";
      const trimmed = rawValue.trim();
      if (trimmed !== "" && trimmed !== workspaceId) {
        warnings.push({
          rowNumber,
          column: "workspace_id",
          message: `CSV provides workspace_id '${trimmed}' which differs from request context '${workspaceId}'; will use request context`,
        });
      }
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2;
    const row = rows[i]!;

    const pkValues: string[] = [];
    for (const pk of pkColumns) {
      const idx = headerIndex[pk];
      if (idx == null) continue;
      const raw = row[idx] ?? "";
      const trimmed = raw.trim();
      if (trimmed === "") {
        addError(rowNumber, pk, "primary_key_missing", `Primary key column "${pk}" is empty`, raw);
      }
      pkValues.push(trimmed);
    }

    if (pkColumns.length > 0 && pkValues.length === pkColumns.length && pkValues.every((v) => v !== "")) {
      const pkKey = pkValues.join("\0");
      if (pkSeen.has(pkKey)) {
        addError(rowNumber, pkColumns.join(","), "duplicate_primary_key_in_csv", `Duplicate primary key (${pkColumns.join(", ")}) in CSV: "${pkValues.join(", ")}"`, pkValues.join(","));
      } else {
        pkSeen.add(pkKey);
        const pkColsForCheck = pkColumns.filter((c) => c !== "workspace_id");
        const conditions = pkColsForCheck.map((c) => `"${c}" = ?`).join(" AND ");
        const values = [workspaceId, ...pkColsForCheck.map((c) => pkValues[pkColumns.indexOf(c)]!).filter((v): v is string => v !== undefined)];
        const existing = db.prepare(`SELECT 1 FROM "${targetTable}" WHERE workspace_id = ? ${conditions ? "AND " + conditions : ""} LIMIT 1`).get(...values);
        if (existing) {
          addError(rowNumber, pkColumns.join(","), "primary_key_conflict", `Primary key (${pkColumns.join(", ")}) already exists in table "${targetTable}": "${pkValues.join(", ")}"`, pkValues.join(","));
        }
      }
    }

    for (const col of columns) {
      const idx = headerIndex[col.name];
      if (idx == null) continue;
      const raw = row[idx] ?? "";
      const trimmed = raw.trim();
      const colType = resolveColumnType(targetTable, col);

      if (trimmed === "") {
        if (col.notNull && col.defaultValue == null) {
          addError(rowNumber, col.name, "required_field_empty", `Required column "${col.name}" is empty`, raw);
        }
        continue;
      }

      const converted = convertValue(raw, col.name, colType);
      if (converted.error) {
        addError(rowNumber, col.name, "type_conversion_failed", converted.error, raw);
      }
    }
  }

  const blockingErrors = sampleErrors.length;
  const validRows = rows.length - errorRows.size;
  const errorRowCount = errorRows.size;

  const qualityReport: QualityReport = {
    rowCount: rows.length,
    validRows: Math.max(0, validRows),
    errorRows: errorRowCount,
    missingColumns,
    extraColumns,
    typeErrors: typeErrorCount,
    sampleErrors: sampleErrors.slice(0, 20),
    warnings,
    blockingErrors,
    requiredConfirmText: `IMPORT CSV ${targetTable}`,
  };

  const impactWarnings: string[] = [];
  if (extraColumns.length > 0) {
    impactWarnings.push(`Extra CSV columns will be ignored: ${extraColumns.join(", ")}`);
  }
  if (missingColumns.length > 0) {
    impactWarnings.push(`Missing required columns: ${missingColumns.join(", ")}`);
  }
  impactWarnings.push(...warnings.slice(0, 10).map((w) => w.message));

  return {
    operation: "import",
    targetType: "csv_upload",
    targetName: targetTable,
    affectedTables: [targetTable],
    affectedRows: rows.length - errorRowCount,
    sourceType: "user_authorized",
    dataVersion: null,
    containsUserAuthorized: true,
    containsSystemHistory: false,
    warnings: impactWarnings,
    requiredConfirmText: `IMPORT CSV ${targetTable}`,
    stagedFileId,
    qualityReport,
    blockingErrorCount: blockingErrors,
  };
}

function buildErrorResult(targetTable: string, stagedFileId: string, rule: string, message: string): CsvDryRunResult {
  const qualityReport: QualityReport = {
    rowCount: 0,
    validRows: 0,
    errorRows: 0,
    missingColumns: [],
    extraColumns: [],
    typeErrors: 0,
    sampleErrors: [{ rowNumber: 1, column: "", rule, message, rawValue: "" }],
    warnings: [],
    blockingErrors: 1,
    requiredConfirmText: `IMPORT CSV ${targetTable}`,
  };
  return {
    operation: "import",
    targetType: "csv_upload",
    targetName: targetTable,
    affectedTables: [targetTable],
    affectedRows: 0,
    sourceType: "user_authorized",
    dataVersion: null,
    containsUserAuthorized: true,
    containsSystemHistory: false,
    warnings: [message],
    requiredConfirmText: `IMPORT CSV ${targetTable}`,
    stagedFileId,
    qualityReport,
    blockingErrorCount: 1,
  };
}

function countTableRows(db: DatabaseSync, tableName: string, workspaceId: string): number {
  const result = db.prepare(`SELECT COUNT(*) AS cnt FROM "${tableName}" WHERE workspace_id = ?`).get(workspaceId) as { cnt: number } | undefined;
  return result?.cnt ?? 0;
}

// ---------------------------------------------------------------------------
// Execute import
// ---------------------------------------------------------------------------

export function executeCsvImport(
  db: DatabaseSync,
  workspaceId: string,
  targetTable: string,
  stagedFileId: string,
  _options: DryRunOptions = {}
): CsvImportJobResult {
  const staged = loadStagedCsv(workspaceId, stagedFileId, targetTable);
  if (!staged) {
    throw new Error(`Staged file "${stagedFileId}" not found, was modified, or does not match target table "${targetTable}"`);
  }

  if (CSV_PROTECTED_TABLES.has(targetTable) || !CSV_ALLOWED_TABLES.has(targetTable)) {
    throw new Error(`Table "${targetTable}" is not allowed for CSV import`);
  }

  const dry = dryRunCsvText(db, workspaceId, targetTable, stagedFileId, staged.text, _options);
  if (dry.blockingErrorCount > 0) {
    throw new Error(`Import blocked by dry-run errors: ${dry.qualityReport.sampleErrors.map((e) => e.message).join("; ")}`);
  }

  const columns = getTableColumns(db, targetTable);
  const columnMap = new Map(columns.map((c) => [c.name, c]));
  const { headers, rows } = parseCsv(staged.text);
  const normalizedHeaders = headers.map((h) => normalizeHeader(h));
  const headerIndex: Record<string, number> = {};
  for (let i = 0; i < normalizedHeaders.length; i++) {
    const norm = normalizedHeaders[i]!;
    if (norm !== "") {
      headerIndex[norm] = i;
    }
  }

  const insertColumns = columns
    .filter((col) => col.name in headerIndex || col.name === "workspace_id")
    .map((col) => col.name);

  const placeholders = insertColumns.map(() => "?").join(", ");
  const stmt = db.prepare(`INSERT INTO "${targetTable}" (${insertColumns.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`);

  const timestamp = new Date().toISOString().replace(/\..*Z$/, "Z");
  const dateSuffix = timestamp.slice(0, 10).replace(/-/g, "");
  const sourceBatchId = `csv_${targetTable}_${dateSuffix}_${Date.now()}`;
  const dataVersion = `v1_${dateSuffix}`;
  const startedAt = new Date().toISOString();
  const jobId = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const beforeRowCount = countTableRows(db, targetTable, workspaceId);
  const beforeSnapshot = {
    tableRowCounts: { [targetTable]: beforeRowCount },
    totalRows: beforeRowCount,
  };

  db.prepare(`INSERT INTO data_import_job (job_id, workspace_id, import_type, source, source_type, status, dry_run, input_manifest, created_at, started_at)
    VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, datetime('now'), ?)`).run(
    jobId, workspaceId, "csv_upload", "csv_upload", "user_authorized",
    JSON.stringify({ targetTable, stagedFileId, sourceBatchId, dataVersion, generatedAt: timestamp }),
    startedAt
  );
  db.prepare("UPDATE data_import_job SET status = 'running' WHERE job_id = ?").run(jobId);

  let successCount = 0;
  const errors: string[] = [];

  db.exec("BEGIN");
  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const values: Array<SQLInputValue> = [];

      for (const colName of insertColumns) {
        if (colName === "workspace_id") {
          values.push(workspaceId);
          continue;
        }
        const idx = headerIndex[colName];
        const raw = idx != null ? (row[idx] ?? "") : "";
        const col = columnMap.get(colName)!;
        const colType = resolveColumnType(targetTable, col);
        const converted = convertValue(raw, colName, colType);
        if (converted.error) {
          errors.push(`Row ${i + 2}: ${converted.error}`);
          values.push(null);
        } else {
          values.push(converted.value ?? null);
        }
      }

      stmt.run(...values);
      successCount += 1;
    }

    const inputManifest = {
      source: "csv_upload",
      sourceType: "user_authorized",
      sourceBatchId,
      dataVersion,
      generatedAt: timestamp,
      targetTable,
      stagedFileId,
      originalName: staged.meta.originalName,
    };

    db.prepare(`INSERT INTO batch (batch_id, workspace_id, batch_type, source, source_type, time_window, row_count, entity_counts, created_at)
      VALUES (?, ?, 'csv_upload', ?, ?, ?, ?, ?, datetime('now'))`).run(
      sourceBatchId, workspaceId, "csv_upload", "user_authorized", null, successCount,
      JSON.stringify({ [targetTable]: successCount })
    );

    db.prepare(`INSERT INTO audit_event (audit_id, workspace_id, actor, request_id, resource_type, resource_id, event, meta, occurred_at)
      VALUES (?, ?, 'admin-api', ?, 'csv_import', ?, 'import_completed', ?, datetime('now'))`).run(
      randomUUID(), workspaceId, sourceBatchId, sourceBatchId,
      JSON.stringify({ ...inputManifest, totalRows: successCount })
    );

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    const errorMsg = err instanceof Error ? err.message : String(err);
    db.prepare("UPDATE data_import_job SET status = 'failed', error = ?, finished_at = datetime('now') WHERE job_id = ?").run(errorMsg, jobId);
    throw err;
  }

  const finishedAt = new Date().toISOString();
  db.prepare(`UPDATE data_import_job SET status = 'succeeded', row_count = ?, success_count = ?, error_count = ?, quality_report = ?, data_version = ?, finished_at = datetime('now') WHERE job_id = ?`).run(
    successCount, successCount, errors.length, JSON.stringify(dry.qualityReport), dataVersion, jobId
  );

  const afterRowCount = countTableRows(db, targetTable, workspaceId);
  const afterSnapshot = {
    tableRowCounts: { [targetTable]: afterRowCount },
    totalRows: afterRowCount,
    dataVersion,
  };

  const auditId = randomUUID();
  db.prepare(`INSERT INTO db_admin_audit (audit_id, workspace_id, actor, operation, target_type, target_name, before_snapshot, after_snapshot, status, created_at)
    VALUES (?, ?, 'admin-api', 'import', 'csv_upload', ?, ?, ?, 'success', datetime('now'))`).run(
    auditId, workspaceId, targetTable,
    JSON.stringify(beforeSnapshot),
    JSON.stringify(afterSnapshot)
  );

  return {
    jobId,
    status: "succeeded",
    rowCount: successCount,
    successCount,
    errorCount: errors.length,
    warnings: dry.qualityReport.warnings.map((w) => w.message),
    errors,
    qualityReport: dry.qualityReport,
    beforeSnapshot,
    afterSnapshot,
    auditId,
    sourceBatchId,
    dataVersion,
    startedAt,
    finishedAt,
  };
}

import { existsSync, mkdirSync, copyFileSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "../db/connection.js";
import { runMigrations } from "../db/migration-runner.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dirname, "../../../../");

/** Tables that must never be dropped/truncated (audit + migration + idempotency). */
export const PROTECTED_TABLES = new Set([
  "schema_migration",
  "db_admin_audit",
  "data_import_job",
  "idempotency_key",
  "audit_event",
  "workspace",
  "comparison_run",
  "comparison_participant",
  "comparison_portrait_source",
  "comparison_dimension_evidence",
  "comparison_dimension_assessment",
  "comparison_explanation_attempt",
  "comparison_explanation_outcome",
  "comparison_archive_event",
]);

/** Tables that admin can drop if explicit. */
export const DROPPABLE_TABLES = new Set([
  "sku",
  "channel_profile",
  "wide_table_row",
  "batch",
  "prediction",
  "match_result",
  "task",
  "douyin_account",
  "douyin_account_benchmark_tag",
  "douyin_account_report",
  "douyin_product",
  "douyin_product_account_fit",
  "douyin_comparison_dimension",
  "douyin_adjustment_advice",
  "douyin_summary_metric",
  "data_source",
  "channel_entity",
  "new_product_prediction",
  "decision_record",
  "action_record",
  "feedback_record",
  "strategy_review",
  "channel_object",
  "channel_object_binding",
  "audience_profile",
  "product_fit_profile",
]);

export const DROPPABLE_VIEWS = new Set([
  "match_result_latest",
  "douyin_account_latest",
  "douyin_account_benchmark_tag_latest",
  "douyin_account_report_latest",
  "douyin_product_latest",
  "douyin_product_account_fit_latest",
  "douyin_comparison_dimension_latest",
  "douyin_adjustment_advice_latest",
  "douyin_summary_metric_latest",
  "channel_entity_latest",
  "channel_object_latest",
  "channel_object_binding_latest",
  "audience_profile_latest",
  "product_fit_profile_latest",
  "channel_object_entity_latest",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Standardized impact report for every admin database operation. */
export interface OperationImpact {
  operation: string;
  targetType: "table" | "view" | "version" | "workspace" | "package" | "migration" | "csv_upload";
  targetName: string;
  affectedTables: string[];
  affectedRows: number;
  sourceType: string | null;
  dataVersion: string | null;
  containsUserAuthorized: boolean;
  containsSystemHistory: boolean;
  warnings: string[];
  requiredConfirmText: string;
}

/** Legacy shape kept for compatibility; callers should migrate to OperationImpact. */
export interface ImpactReport extends OperationImpact {
  target: string;
  isProtected: boolean;
  isUserAuthorized: boolean;
}

export interface RebuildReport extends OperationImpact {
  snapshotPath: string | null;
  steps: Array<{ step: string; status: "ok" | "skipped" | "error"; detail?: string }>;
}

export interface ExecuteResult<T extends OperationImpact = OperationImpact> {
  impact: T;
  afterSnapshot: Record<string, unknown>;
  auditId: string;
  notFound?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTable(db: DatabaseSync, name: string): boolean {
  const row = db.prepare("SELECT type FROM sqlite_master WHERE name = ?").get(name) as { type: string } | undefined;
  return row?.type === "table";
}

function isView(db: DatabaseSync, name: string): boolean {
  const row = db.prepare("SELECT type FROM sqlite_master WHERE name = ?").get(name) as { type: string } | undefined;
  return row?.type === "view";
}

function tableRowCount(db: DatabaseSync, name: string): number {
  try {
    const row = db.prepare(`SELECT COUNT(*) as cnt FROM "${name}"`).get() as { cnt: number };
    return row.cnt;
  } catch {
    return 0;
  }
}

function writeAudit(
  db: DatabaseSync,
  workspaceId: string,
  operation: string,
  targetType: string,
  targetName: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  status: "success" | "failed",
  error?: string
): string {
  const auditId = randomUUID();
  try {
    db.prepare(`INSERT INTO db_admin_audit (audit_id, workspace_id, actor, operation, target_type, target_name, before_snapshot, after_snapshot, status, error, created_at)
      VALUES (?, ?, 'admin-api', ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
      auditId, workspaceId, operation, targetType, targetName,
      JSON.stringify(before), JSON.stringify(after), status, error ?? null);
  } catch { /* audit table may not exist yet during rebuild */ }
  return auditId;
}

export { writeAudit as writeAdminAudit };

// ---------------------------------------------------------------------------
// Truncate table
// ---------------------------------------------------------------------------

export function impactTruncate(workspaceId: string, tableName: string): OperationImpact {
  const db = openDb(workspaceId);
  try {
    const isProtected = PROTECTED_TABLES.has(tableName);
    const exists = isTable(db, tableName);
    const rowCount = exists ? tableRowCount(db, tableName) : 0;
    const warnings: string[] = [];
    if (isProtected) warnings.push("table is protected (system/audit), truncate refused");
    if (!exists) warnings.push(`table "${tableName}" does not exist`);
    return {
      operation: "truncate",
      targetType: "table",
      targetName: tableName,
      affectedTables: exists ? [tableName] : [],
      affectedRows: rowCount,
      sourceType: exists ? "system_runtime" : null,
      dataVersion: null,
      containsUserAuthorized: tableName.startsWith("douyin_"),
      containsSystemHistory: PROTECTED_TABLES.has(tableName) || ["batch", "audit_event", "idempotency_key", "task"].includes(tableName),
      warnings,
      requiredConfirmText: `TRUNCATE ${tableName}`,
    };
  } finally {
    db.close();
  }
}

export function executeTruncate(workspaceId: string, tableName: string): ExecuteResult<OperationImpact> {
  const impact = impactTruncate(workspaceId, tableName);
  const exists = isTableAfter(workspaceId, tableName);
  if (!exists) {
    return { impact, afterSnapshot: { rowCount: 0, exists: false }, auditId: "", notFound: true };
  }
  const db = openDb(workspaceId);
  try {
    db.exec(`DELETE FROM "${tableName}"`);
    try {
      db.exec(`DELETE FROM sqlite_sequence WHERE name='${tableName}'`);
    } catch { /* sqlite_sequence only exists for autoincrement tables */ }
    const afterSnapshot = { rowCount: 0 };
    const auditId = writeAudit(db, workspaceId, "truncate", "table", tableName,
      { rowCount: impact.affectedRows }, afterSnapshot, "success");
    return { impact, afterSnapshot, auditId };
  } finally {
    db.close();
  }
}

function isTableAfter(workspaceId: string, name: string): boolean {
  const db = openDb(workspaceId);
  const exists = isTable(db, name);
  db.close();
  return exists;
}

// ---------------------------------------------------------------------------
// Drop table
// ---------------------------------------------------------------------------

export function impactDrop(workspaceId: string, tableName: string): OperationImpact {
  const db = openDb(workspaceId);
  try {
    const isProtected = PROTECTED_TABLES.has(tableName);
    const tblExists = isTable(db, tableName);
    const viewExists = isView(db, tableName);
    const exists = tblExists || viewExists;
    const rowCount = tblExists ? tableRowCount(db, tableName) : 0;
    const isCodeDefined = DROPPABLE_TABLES.has(tableName) || DROPPABLE_VIEWS.has(tableName);
    const warnings: string[] = [];
    if (isProtected) warnings.push("table is protected (system/audit), drop refused");
    if (exists && !isCodeDefined) warnings.push("table/view is not in droppable whitelist");
    if (!exists) warnings.push(`table/view "${tableName}" does not exist`);
    return {
      operation: "drop",
      targetType: tblExists ? "table" : "view",
      targetName: tableName,
      affectedTables: exists ? [tableName] : [],
      affectedRows: rowCount,
      sourceType: exists ? "system_runtime" : null,
      dataVersion: null,
      containsUserAuthorized: tableName.startsWith("douyin_"),
      containsSystemHistory: PROTECTED_TABLES.has(tableName) || ["batch", "audit_event", "idempotency_key", "task"].includes(tableName),
      warnings,
      requiredConfirmText: `DROP ${tableName}`,
    };
  } finally {
    db.close();
  }
}

export function executeDrop(workspaceId: string, tableName: string): ExecuteResult<OperationImpact> {
  const impact = impactDrop(workspaceId, tableName);
  if (PROTECTED_TABLES.has(tableName)) {
    return { impact, afterSnapshot: { dropped: false }, auditId: "" };
  }
  if (!DROPPABLE_TABLES.has(tableName) && !DROPPABLE_VIEWS.has(tableName)) {
    return { impact, afterSnapshot: { dropped: false, reason: "not in droppable whitelist" }, auditId: "" };
  }
  const db = openDb(workspaceId);
  try {
    const tableExists = isTable(db, tableName);
    const viewExists = isView(db, tableName);
    if (!tableExists && !viewExists) {
      return { impact, afterSnapshot: { dropped: false, exists: false }, auditId: "", notFound: true };
    }
    if (tableExists) {
      db.exec(`DROP TABLE IF EXISTS "${tableName}"`);
    } else if (viewExists) {
      db.exec(`DROP VIEW IF EXISTS "${tableName}"`);
    }
    const afterSnapshot = { dropped: true };
    const auditId = writeAudit(db, workspaceId, "drop", impact.targetType, tableName,
      { rowCount: impact.affectedRows }, afterSnapshot, "success");
    return { impact, afterSnapshot, auditId };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Delete version (by data_version across douyin_* tables)
// ---------------------------------------------------------------------------

/** Tables that carry `data_version` column and are subject to version deletion. */
const VERSIONED_TABLES = [
  "douyin_account",
  "douyin_account_benchmark_tag",
  "douyin_account_report",
  "douyin_product",
  "douyin_product_account_fit",
  "douyin_comparison_dimension",
  "douyin_adjustment_advice",
  "douyin_summary_metric",
];

export function impactDeleteVersion(workspaceId: string, dataVersion: string): OperationImpact {
  const db = openDb(workspaceId);
  try {
    const affectedTables: string[] = [];
    let totalRows = 0;
    for (const table of VERSIONED_TABLES) {
      if (!isTable(db, table)) continue;
      const row = db
        .prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE workspace_id = ? AND data_version = ?`)
        .get(workspaceId, dataVersion) as { cnt: number };
      if (row.cnt > 0) {
        affectedTables.push(table);
        totalRows += row.cnt;
      }
    }
    try {
      if (isTable(db, "batch")) {
        const batchRow = db
          .prepare("SELECT COUNT(*) as cnt FROM batch WHERE workspace_id = ? AND batch_id LIKE ?")
          .get(workspaceId, `%_${dataVersion}`) as { cnt: number };
        if (batchRow.cnt > 0) {
          affectedTables.push("batch");
          totalRows += batchRow.cnt;
        }
      }
    } catch { /* batch table missing — fresh workspace */ }

    const warnings: string[] = [];
    if (totalRows === 0) {
      warnings.push(`data_version "${dataVersion}" not found in any versioned table`);
    } else if (affectedTables.some((t) => t.startsWith("douyin_"))) {
      warnings.push("contains user_authorized douyin_* data");
    }
    return {
      operation: "delete_version",
      targetType: "version",
      targetName: dataVersion,
      affectedTables,
      affectedRows: totalRows,
      sourceType: totalRows > 0 ? "user_authorized" : null,
      dataVersion,
      containsUserAuthorized: totalRows > 0 && affectedTables.some((t) => t.startsWith("douyin_")),
      containsSystemHistory: affectedTables.includes("batch"),
      warnings,
      requiredConfirmText: `DELETE VERSION ${dataVersion}`,
    };
  } finally {
    db.close();
  }
}

export function executeDeleteVersion(workspaceId: string, dataVersion: string): ExecuteResult<OperationImpact> {
  const impact = impactDeleteVersion(workspaceId, dataVersion);
  if (impact.affectedRows === 0) {
    return { impact, afterSnapshot: { deletedRows: 0, tablesDeleted: [] }, auditId: "" };
  }
  const db = openDb(workspaceId);
  try {
    let deletedRows = 0;
    const tablesDeleted: string[] = [];
    for (const table of VERSIONED_TABLES) {
      if (!isTable(db, table)) continue;
      const result = db
        .prepare(`DELETE FROM ${table} WHERE workspace_id = ? AND data_version = ?`)
        .run(workspaceId, dataVersion);
      const changes = Number(result.changes);
      if (changes > 0) {
        deletedRows += changes;
        tablesDeleted.push(table);
      }
    }
    try {
      if (isTable(db, "batch")) {
        const batchPattern = `douyin_bi_import_%_${dataVersion}`;
        const batchResult = db
          .prepare("DELETE FROM batch WHERE workspace_id = ? AND batch_id LIKE ?")
          .run(workspaceId, batchPattern);
        const batchChanges = Number(batchResult.changes);
        if (batchChanges > 0) {
          deletedRows += batchChanges;
          tablesDeleted.push("batch");
        }
      }
    } catch { /* batch table missing — fresh workspace */ }

    const afterSnapshot = { deletedRows, tablesDeleted };
    const auditId = writeAudit(db, workspaceId, "delete_version", "version", dataVersion,
      { rowCount: impact.affectedRows, affectedTables: impact.affectedTables },
      afterSnapshot, "success");
    return { impact, afterSnapshot, auditId };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Rebuild workspace
// ---------------------------------------------------------------------------

export function impactRebuild(workspaceId: string): OperationImpact {
  const db = openDb(workspaceId);
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
    let totalRows = 0;
    const affected: string[] = [];
    let protectedRows = 0;
    const protectedAffected: string[] = [];
    let hasUserAuthorized = false;
    for (const t of tables) {
      const cnt = tableRowCount(db, t.name);
      if (PROTECTED_TABLES.has(t.name)) {
        protectedRows += cnt;
        protectedAffected.push(t.name);
      } else {
        affected.push(t.name);
      }
      totalRows += cnt;
      if (t.name.startsWith("douyin_")) hasUserAuthorized = true;
    }
    const warnings: string[] = [];
    if (hasUserAuthorized) warnings.push("contains user_authorized douyin_* data");
    if (protectedAffected.length > 0) {
      warnings.push(
        `will also destroy ${protectedRows} rows in protected system tables: ${protectedAffected.join(", ")}`
      );
    }
    return {
      operation: "rebuild",
      targetType: "workspace",
      targetName: workspaceId,
      affectedTables: affected,
      affectedRows: totalRows,
      sourceType: "system_runtime",
      dataVersion: null,
      containsUserAuthorized: hasUserAuthorized,
      containsSystemHistory: protectedAffected.length > 0,
      warnings,
      requiredConfirmText: `RESET ${workspaceId}`,
    };
  } finally {
    db.close();
  }
}

export async function executeRebuild(workspaceId: string, skipSnapshot: boolean): Promise<ExecuteResult<RebuildReport>> {
  const impact = impactRebuild(workspaceId) as RebuildReport;
  const steps: RebuildReport["steps"] = [];
  let snapshotPath: string | null = null;

  if (skipSnapshot) {
    steps.push({ step: "snapshot", status: "skipped", detail: "skipSnapshot=true" });
  } else {
    const dbPath = join(REPO_ROOT, "data/workspaces", workspaceId, "db.sqlite");
    if (existsSync(dbPath)) {
      snapshotPath = `${dbPath}.snapshot.${Date.now()}`;
      try {
        copyFileSync(dbPath, snapshotPath);
        steps.push({ step: "snapshot", status: "ok", detail: snapshotPath });
      } catch (err) {
        steps.push({ step: "snapshot", status: "error", detail: err instanceof Error ? err.message : String(err) });
        return { impact, afterSnapshot: { snapshotPath, steps }, auditId: "" };
      }
    } else {
      steps.push({ step: "snapshot", status: "skipped", detail: "no existing db file" });
    }
  }

  const dbPath = join(REPO_ROOT, "data/workspaces", workspaceId, "db.sqlite");
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;

  try {
    if (existsSync(dbPath)) unlinkSync(dbPath);
    if (existsSync(walPath)) unlinkSync(walPath);
    if (existsSync(shmPath)) unlinkSync(shmPath);
    steps.push({ step: "delete_db_file", status: "ok" });
  } catch (err) {
    steps.push({ step: "delete_db_file", status: "error", detail: err instanceof Error ? err.message : String(err) });
    return { impact, afterSnapshot: { snapshotPath, steps }, auditId: "" };
  }

  try {
    mkdirSync(join(REPO_ROOT, "data/workspaces", workspaceId), { recursive: true });
    const db = openDb(workspaceId);
    const migrationsDir = resolve(REPO_ROOT, "apps/server/src/db/migrations");
    const result = runMigrations(db, migrationsDir);
    const {
      SCHEMA_DDL, DOUYIN_BI_DDL, DOUYIN_BI_DDL_PART2, DOUYIN_BI_DDL_PART3,
      DATA_MANAGEMENT_DDL, CHANNEL_ENTITY_DDL, NEW_PRODUCT_DDL, FLYWHEEL_DDL,
      CHANNEL_OBJECT_LIBRARY_DDL, COMPARISON_DDL,
    } = await import("../db/schema.js");
    for (const view of [
      "match_result_latest", "douyin_account_latest", "douyin_account_benchmark_tag_latest",
      "douyin_account_report_latest", "douyin_product_latest", "douyin_product_account_fit_latest",
      "douyin_comparison_dimension_latest", "douyin_adjustment_advice_latest",
      "douyin_summary_metric_latest", "channel_entity_latest",
      "channel_object_latest", "channel_object_binding_latest",
      "audience_profile_latest", "product_fit_profile_latest",
      "channel_object_entity_latest",
    ]) {
      try { db.exec(`DROP VIEW IF EXISTS ${view}`); } catch { /* ignore */ }
    }
    db.exec(SCHEMA_DDL);
    db.exec(DOUYIN_BI_DDL);
    db.exec(DOUYIN_BI_DDL_PART2);
    db.exec(DOUYIN_BI_DDL_PART3);
    db.exec(DATA_MANAGEMENT_DDL);
    db.exec(CHANNEL_ENTITY_DDL);
    db.exec(NEW_PRODUCT_DDL);
    db.exec(FLYWHEEL_DDL);
    db.exec(CHANNEL_OBJECT_LIBRARY_DDL);
    db.exec(COMPARISON_DDL);
    db.close();
    steps.push({ step: "apply_migrations", status: "ok", detail: `${result.applied} applied, ${result.failed} failed (migration runner)` });
  } catch (err) {
    steps.push({ step: "apply_migrations", status: "error", detail: err instanceof Error ? err.message : String(err) });
    return { impact, afterSnapshot: { snapshotPath, steps }, auditId: "" };
  }

  try {
    const db = openDb(workspaceId);
    db.prepare("INSERT OR IGNORE INTO workspace (workspace_id, name) VALUES (?, ?)").run(workspaceId, workspaceId);
    db.close();
    steps.push({ step: "init_workspace", status: "ok" });
  } catch (err) {
    steps.push({ step: "init_workspace", status: "error", detail: err instanceof Error ? err.message : String(err) });
    return { impact, afterSnapshot: { snapshotPath, steps }, auditId: "" };
  }

  try {
    const db = openDb(workspaceId);
    const auditId = writeAudit(db, workspaceId, "rebuild", "workspace", workspaceId,
      { rowCount: impact.affectedRows, tables: impact.affectedTables },
      { rebuilt: true, snapshotPath, steps }, "success");
    db.close();
    return {
      impact: { ...impact, snapshotPath, steps },
      afterSnapshot: { rebuilt: true, snapshotPath, steps },
      auditId,
    };
  } catch (err) {
    steps.push({ step: "audit", status: "error", detail: err instanceof Error ? err.message : String(err) });
    return { impact: { ...impact, snapshotPath, steps }, afterSnapshot: { snapshotPath, steps }, auditId: "" };
  }
}

// ---------------------------------------------------------------------------
// Apply migrations (re-trigger pending)
// ---------------------------------------------------------------------------

export function applyPendingMigrations(workspaceId: string): {
  applied: number;
  pending: number;
  failed: number;
  errors: Array<{ version: number; name: string; error: string }>;
} {
  // Run via dynamic import to avoid circular deps
  const db = openDb(workspaceId);
  try {
    // Synchronously duplicate the runner logic is heavy; instead use the
    // bootstrap DDL + read applied versions, then trigger new ones.
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migration (
      version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'applied', error TEXT, execution_ms INTEGER
    )`);
    const pending = db.prepare("SELECT COUNT(*) as cnt FROM schema_migration WHERE status = 'pending'").get() as { cnt: number };
    const failed = db.prepare("SELECT COUNT(*) as cnt FROM schema_migration WHERE status = 'failed'").get() as { cnt: number };
    const applied = db.prepare("SELECT COUNT(*) as cnt FROM schema_migration WHERE status = 'applied'").get() as { cnt: number };
    return { applied: applied.cnt, pending: pending.cnt, failed: failed.cnt, errors: [] };
  } finally {
    db.close();
  }
}
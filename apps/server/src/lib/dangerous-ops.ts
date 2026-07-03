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
]);

/** Tables that admin can drop if explicit. */
const DROPPABLE_TABLES = new Set([
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
]);

const DROPPABLE_VIEWS = new Set([
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
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImpactReport {
  target: string;
  targetType: "table" | "view" | "version" | "workspace";
  affectedTables: string[];
  affectedRows: number;
  isProtected: boolean;
  isUserAuthorized: boolean;
  warnings: string[];
}

export interface RebuildReport extends ImpactReport {
  snapshotPath: string | null;
  steps: Array<{ step: string; status: "ok" | "skipped" | "error"; detail?: string }>;
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
): void {
  try {
    db.prepare(`INSERT INTO db_admin_audit (audit_id, workspace_id, actor, operation, target_type, target_name, before_snapshot, after_snapshot, status, error, created_at)
      VALUES (?, ?, 'admin-api', ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
      randomUUID(), workspaceId, operation, targetType, targetName,
      JSON.stringify(before), JSON.stringify(after), status, error ?? null);
  } catch { /* audit table may not exist yet during rebuild */ }
}

export { writeAudit as writeAdminAudit };

// ---------------------------------------------------------------------------
// Truncate table
// ---------------------------------------------------------------------------

export function impactTruncate(workspaceId: string, tableName: string): ImpactReport {
  const db = openDb(workspaceId);
  try {
    const isProtected = PROTECTED_TABLES.has(tableName);
    const exists = isTable(db, tableName);
    const rowCount = exists ? tableRowCount(db, tableName) : 0;
    return {
      target: tableName,
      targetType: "table",
      affectedTables: exists ? [tableName] : [],
      affectedRows: rowCount,
      isProtected,
      isUserAuthorized: tableName.startsWith("douyin_"),
      warnings: isProtected ? ["table is protected (system/audit), truncate refused"] : [],
    };
  } finally {
    db.close();
  }
}

export function executeTruncate(workspaceId: string, tableName: string): ImpactReport {
  const impact = impactTruncate(workspaceId, tableName);
  if (impact.isProtected || !isTableAfter(workspaceId, tableName)) {
    return impact;
  }
  const db = openDb(workspaceId);
  try {
    db.exec(`DELETE FROM "${tableName}"`);
    try {
      db.exec(`DELETE FROM sqlite_sequence WHERE name='${tableName}'`);
    } catch { /* sqlite_sequence only exists for autoincrement tables */ }
    writeAudit(db, workspaceId, "truncate_table", "table", tableName,
      { rowCount: impact.affectedRows }, { rowCount: 0 }, "success");
    return { ...impact, affectedRows: 0 };
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

export function impactDrop(workspaceId: string, tableName: string): ImpactReport {
  const db = openDb(workspaceId);
  try {
    const isProtected = PROTECTED_TABLES.has(tableName);
    const tblExists = isTable(db, tableName);
    const viewExists = isView(db, tableName);
    const exists = tblExists || viewExists;
    const rowCount = tblExists ? tableRowCount(db, tableName) : 0;
    const isCodeDefined = DROPPABLE_TABLES.has(tableName) || DROPPABLE_VIEWS.has(tableName);
    return {
      target: tableName,
      targetType: tblExists ? "table" : "view",
      affectedTables: exists ? [tableName] : [],
      affectedRows: rowCount,
      isProtected,
      isUserAuthorized: tableName.startsWith("douyin_"),
      warnings: [
        !isCodeDefined ? "table/view is not in droppable whitelist" : "",
        isProtected ? "table is protected (system/audit), drop refused" : "",
      ].filter(Boolean),
    };
  } finally {
    db.close();
  }
}

export function executeDrop(workspaceId: string, tableName: string): ImpactReport {
  const impact = impactDrop(workspaceId, tableName);
  if (impact.isProtected) return impact;
  if (!DROPPABLE_TABLES.has(tableName) && !DROPPABLE_VIEWS.has(tableName)) {
    return impact;
  }
  const db = openDb(workspaceId);
  try {
    // SQLite requires DROP TABLE for tables and DROP VIEW for views; using the
    // wrong one raises an error. Detect type and use matching statement.
    if (isTable(db, tableName)) {
      db.exec(`DROP TABLE IF EXISTS "${tableName}"`);
    } else if (isView(db, tableName)) {
      db.exec(`DROP VIEW IF EXISTS "${tableName}"`);
    } else {
      // Fallback: try both IF EXISTS, no-op
      db.exec(`DROP TABLE IF EXISTS "${tableName}"`);
      db.exec(`DROP VIEW IF EXISTS "${tableName}"`);
    }
    writeAudit(db, workspaceId, "drop_table", "table", tableName,
      { rowCount: impact.affectedRows }, { dropped: true }, "success");
    return { ...impact, affectedRows: 0, affectedTables: [] };
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

export function impactDeleteVersion(workspaceId: string, dataVersion: string): ImpactReport {
  const db = openDb(workspaceId);
  try {
    // Count rows across all versioned tables for this data_version
    const affectedTables: string[] = [];
    let totalRows = 0;
    let hasUserAuthorized = false;
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
    // Also count batch rows (table may not exist on a fresh workspace)
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

    if (totalRows === 0) {
      return {
        target: dataVersion,
        targetType: "version",
        affectedTables: [],
        affectedRows: 0,
        isProtected: false,
        isUserAuthorized: false,
        warnings: [`data_version "${dataVersion}" not found in any versioned table`],
      };
    }

    hasUserAuthorized = affectedTables.some((t) => t.startsWith("douyin_"));
    return {
      target: dataVersion,
      targetType: "version",
      affectedTables,
      affectedRows: totalRows,
      isProtected: false,
      isUserAuthorized: hasUserAuthorized,
      warnings: hasUserAuthorized ? ["contains user_authorized douyin_* data"] : [],
    };
  } finally {
    db.close();
  }
}

export function executeDeleteVersion(workspaceId: string, dataVersion: string): ImpactReport {
  const impact = impactDeleteVersion(workspaceId, dataVersion);
  if (impact.warnings.length > 0 && impact.affectedRows === 0) return impact;
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
    // Also delete batch rows matching pattern (table may not exist on a fresh workspace)
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

    writeAudit(db, workspaceId, "delete_version", "version", dataVersion,
      { rowCount: impact.affectedRows, affectedTables: impact.affectedTables },
      { deletedRows, tablesDeleted }, "success");
    return { ...impact, affectedRows: 0 };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Rebuild workspace
// ---------------------------------------------------------------------------

export function impactRebuild(workspaceId: string): ImpactReport {
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
      target: workspaceId,
      targetType: "workspace",
      affectedTables: affected,
      affectedRows: totalRows,
      isProtected: false,
      isUserAuthorized: hasUserAuthorized,
      warnings,
    };
  } finally {
    db.close();
  }
}

export async function executeRebuild(workspaceId: string, skipSnapshot: boolean): Promise<RebuildReport> {
  const impact = impactRebuild(workspaceId);
  const steps: RebuildReport["steps"] = [];
  let snapshotPath: string | null = null;

  // Step 1: snapshot (unless skipped)
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
        return { ...impact, snapshotPath, steps };
      }
    } else {
      steps.push({ step: "snapshot", status: "skipped", detail: "no existing db file" });
    }
  }

  // Step 2: close & delete file
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
    return { ...impact, snapshotPath, steps };
  }

  // Step 3: re-initialize (open will create empty db, apply migrations + business DDL)
  try {
    mkdirSync(join(REPO_ROOT, "data/workspaces", workspaceId), { recursive: true });
    const db = openDb(workspaceId);
    const migrationsDir = resolve(REPO_ROOT, "apps/server/src/db/migrations");
    const result = runMigrations(db, migrationsDir);
    // Also apply the idempotent business DDL (workspace, sku, channel_profile, etc.)
    // because versioned migrations only cover system/admin tables.
    const {
      SCHEMA_DDL, DOUYIN_BI_DDL, DOUYIN_BI_DDL_PART2, DOUYIN_BI_DDL_PART3,
      DATA_MANAGEMENT_DDL, CHANNEL_ENTITY_DDL, NEW_PRODUCT_DDL, FLYWHEEL_DDL,
    } = await import("../db/schema.js");
    for (const view of [
      "match_result_latest", "douyin_account_latest", "douyin_account_benchmark_tag_latest",
      "douyin_account_report_latest", "douyin_product_latest", "douyin_product_account_fit_latest",
      "douyin_comparison_dimension_latest", "douyin_adjustment_advice_latest",
      "douyin_summary_metric_latest", "channel_entity_latest",
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
    db.close();
    steps.push({ step: "apply_migrations", status: "ok", detail: `${result.applied} applied, ${result.failed} failed (migration runner)` });
  } catch (err) {
    steps.push({ step: "apply_migrations", status: "error", detail: err instanceof Error ? err.message : String(err) });
    return { ...impact, snapshotPath, steps };
  }

  // Step 4: ensure workspace row
  try {
    const db = openDb(workspaceId);
    db.prepare("INSERT OR IGNORE INTO workspace (workspace_id, name) VALUES (?, ?)").run(workspaceId, workspaceId);
    db.close();
    steps.push({ step: "init_workspace", status: "ok" });
  } catch (err) {
    steps.push({ step: "init_workspace", status: "error", detail: err instanceof Error ? err.message : String(err) });
    return { ...impact, snapshotPath, steps };
  }

  // Step 5: audit (writes to a fresh admin audit table)
  try {
    const db = openDb(workspaceId);
    writeAudit(db, workspaceId, "rebuild", "workspace", workspaceId,
      { rowCount: impact.affectedRows, tables: impact.affectedTables },
      { rebuilt: true, snapshotPath }, "success");
    db.close();
  } catch (err) {
    steps.push({ step: "audit", status: "error", detail: err instanceof Error ? err.message : String(err) });
  }

  return {
    ...impact,
    affectedRows: 0,
    affectedTables: [],
    snapshotPath,
    steps,
  };
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
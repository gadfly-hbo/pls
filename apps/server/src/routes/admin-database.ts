import { Hono, type Context, type Next } from "hono";
import { resolve } from "node:path";
import { openDb } from "../db/connection.js";
import { ok, notFound, invalidInput, internalError, conflict, unauthorized } from "../lib/response.js";

// ---------------------------------------------------------------------------
// Error helpers with product-scoped codes
// ---------------------------------------------------------------------------
function invalidConfirmText(c: Context, expected: string): Response {
  return invalidInput(c, `confirmText required: must be exactly "${expected}"`, "confirmText");
}

function protectedTarget(c: Context, message: string): Response {
  return conflict(c, message); // 409 with code "conflict"; product spec calls it "protected_target"
}

function targetNotFound(c: Context, message: string): Response {
  return notFound(c, message);
}
import {
  dryRun as pkgDryRun,
  executeImport,
  listVersions as pkgListVersions,
  listPackageTypes,
  getPackageConfig,
  toImportImpact,
} from "../lib/import-packages.js";
import {
  idempotencyMiddleware,
  storeIdempotent,
  readJson,
} from "../lib/idempotency.js";
import {
  impactTruncate,
  executeTruncate,
  impactDrop,
  executeDrop,
  impactDeleteVersion,
  executeDeleteVersion,
  impactRebuild,
  executeRebuild,
  writeAdminAudit,
  PROTECTED_TABLES,
  DROPPABLE_TABLES,
  DROPPABLE_VIEWS,
} from "../lib/dangerous-ops.js";
import { runMigrations } from "../db/migration-runner.js";

const admin = new Hono();
const REPO_ROOT = resolve(import.meta.dirname, "../../../../");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validate table/view name against sqlite_master to prevent SQL injection. */
function isValidEntityName(db: ReturnType<typeof openDb>, name: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE (type='table' OR type='view') AND name = ?")
    .get(name);
  return row !== undefined;
}

/** Extract all table/view names defined in code DDL. */
const CODE_TABLES = new Set([
  "workspace", "sku", "channel_profile", "wide_table_row", "batch",
  "idempotency_key", "prediction", "match_result", "task", "audit_event",
  "douyin_account", "douyin_account_benchmark_tag", "douyin_account_report",
  "douyin_product", "douyin_product_account_fit", "douyin_comparison_dimension",
  "douyin_adjustment_advice", "douyin_summary_metric", "data_source",
  "channel_entity", "new_product_prediction", "decision_record", "action_record",
  "feedback_record", "strategy_review", "schema_migration", "db_admin_audit",
  "data_import_job", "channel_object", "channel_object_binding",
  "audience_profile", "product_fit_profile",
]);

const SYSTEM_TABLES = new Set(["schema_migration", "db_admin_audit", "data_import_job"]);

/** Classify table into domain layer. */
function classifyTable(name: string): string {
  if (SYSTEM_TABLES.has(name)) return "admin";
  if (["workspace", "sku", "channel_profile", "wide_table_row", "batch", "idempotency_key"].includes(name)) return "core";
  if (name.startsWith("douyin_") || name === "data_source" || name === "channel_entity" ||
      name === "channel_object" || name === "channel_object_binding" ||
      name === "audience_profile" || name === "product_fit_profile") return "import";
  if (name === "prediction" || name === "new_product_prediction") return "prediction";
  if (name === "match_result") return "match";
  if (name === "task") return "task";
  if (name === "audit_event") return "audit";
  if (["decision_record", "action_record", "feedback_record", "strategy_review"].includes(name)) return "flywheel";
  return "unknown";
}

/** Tables that should never be truncated or dropped. */
const IMMUTABLE_TABLES = new Set(["schema_migration", "db_admin_audit"]);

function isTruncatable(name: string): boolean {
  return !IMMUTABLE_TABLES.has(name);
}

function isDroppable(name: string): boolean {
  return !IMMUTABLE_TABLES.has(name) && CODE_TABLES.has(name);
}

// ---------------------------------------------------------------------------
// GET /overview
// ---------------------------------------------------------------------------
admin.get("/overview", (c) => {
  const wsId = c.get("workspaceId");
  const db = openDb(wsId);
  try {
    // Table and view counts
    const entities = db
      .prepare("SELECT type, COUNT(*) as cnt FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' GROUP BY type")
      .all() as Array<{ type: string; cnt: number }>;
    let tableCount = 0;
    let viewCount = 0;
    for (const e of entities) {
      if (e.type === "table") tableCount = e.cnt;
      if (e.type === "view") viewCount = e.cnt;
    }

    // Total row count across all tables
    const tableNames = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>;
    let totalRows = 0;
    for (const t of tableNames) {
      const row = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get() as { cnt: number };
      totalRows += row.cnt;
    }

    // Migration status
    let migrationStatus = { total: 0, applied: 0, pending: 0, failed: 0 };
    const hasMigration = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migration'")
      .get();
    if (hasMigration) {
      const rows = db
        .prepare("SELECT status, COUNT(*) as cnt FROM schema_migration GROUP BY status")
        .all() as Array<{ status: string; cnt: number }>;
      for (const r of rows) {
        migrationStatus.total += r.cnt;
        if (r.status === "applied") migrationStatus.applied = r.cnt;
        else if (r.status === "pending") migrationStatus.pending = r.cnt;
        else if (r.status === "failed") migrationStatus.failed = r.cnt;
      }
    }

    // Last admin audit event
    let lastAuditEvent: { operation: string; target_name: string; status: string; created_at: string } | null = null;
    const hasAuditTable = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='db_admin_audit'")
      .get();
    if (hasAuditTable) {
      lastAuditEvent = (db
        .prepare("SELECT operation, target_name, status, created_at FROM db_admin_audit ORDER BY created_at DESC LIMIT 1")
        .get() as { operation: string; target_name: string; status: string; created_at: string }) ?? null;
    }

    return ok(c, {
      workspaceId: wsId,
      tableCount,
      viewCount,
      totalRows,
      migrationStatus,
      lastAuditEvent,
    });
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// GET /tables
// ---------------------------------------------------------------------------
admin.get("/tables", (c) => {
  const wsId = c.get("workspaceId");
  const db = openDb(wsId);
  try {
    const rows = db
      .prepare(
        "SELECT name, type FROM sqlite_master WHERE (type='table' OR type='view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as Array<{ name: string; type: string }>;

    const tables = rows.map((r) => {
      let rowCount = 0;
      try {
        const row = db.prepare(`SELECT COUNT(*) as cnt FROM "${r.name}"`).get() as { cnt: number };
        rowCount = row.cnt;
      } catch { /* view query may fail if underlying table missing */ }
      return {
        name: r.name,
        type: r.type,
        rowCount,
        domain: classifyTable(r.name),
        isSystem: SYSTEM_TABLES.has(r.name),
        isCodeDefined: CODE_TABLES.has(r.name),
        truncatable: r.type === "table" ? isTruncatable(r.name) : false,
        droppable: r.type === "table" ? isDroppable(r.name) : false,
      };
    });

    return ok(c, { tables });
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// GET /tables/:name/schema
// ---------------------------------------------------------------------------
admin.get("/tables/:name/schema", (c) => {
  const wsId = c.get("workspaceId");
  const name = c.req.param("name");
  const db = openDb(wsId);
  try {
    if (!isValidEntityName(db, name)) {
      return notFound(c, `table or view "${name}" not found`);
    }
    const row = db
      .prepare("SELECT sql FROM sqlite_master WHERE (type='table' OR type='view') AND name = ?")
      .get(name) as { sql: string } | undefined;
    if (!row) {
      return notFound(c, `table or view "${name}" not found`);
    }
    return ok(c, { name, sql: row.sql });
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// GET /tables/:name/sample?limit=50
// ---------------------------------------------------------------------------
admin.get("/tables/:name/sample", (c) => {
  const wsId = c.get("workspaceId");
  const name = c.req.param("name");
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "50", 10) || 50, 1), 200);
  const db = openDb(wsId);
  try {
    if (!isValidEntityName(db, name)) {
      return notFound(c, `table or view "${name}" not found`);
    }
    // Only allow sampling tables, not views (views can be expensive)
    const typeRow = db
      .prepare("SELECT type FROM sqlite_master WHERE name = ?")
      .get(name) as { type: string } | undefined;
    if (typeRow?.type === "view") {
      return invalidInput(c, "sampling views is not supported, query the underlying table instead", "name");
    }

    const rows = db.prepare(`SELECT * FROM "${name}" LIMIT ?`).all(limit);
    return ok(c, { name, limit, rows });
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// GET /migrations
// ---------------------------------------------------------------------------
admin.get("/migrations", (c) => {
  const wsId = c.get("workspaceId");
  const db = openDb(wsId);
  try {
    const hasTable = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migration'")
      .get();
    if (!hasTable) {
      return ok(c, { migrations: [], status: "no_migration_table" });
    }
    const rows = db
      .prepare("SELECT version, name, checksum, applied_at, status, error, execution_ms FROM schema_migration ORDER BY version")
      .all();
    return ok(c, { migrations: rows });
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// GET /audit-events
// ---------------------------------------------------------------------------
admin.get("/audit-events", (c) => {
  const wsId = c.get("workspaceId");
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "50", 10) || 50, 1), 200);
  const db = openDb(wsId);
  try {
    const hasTable = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='db_admin_audit'")
      .get();
    if (!hasTable) {
      return ok(c, { events: [], status: "no_audit_table" });
    }
    const rows = db
      .prepare(
        "SELECT audit_id, workspace_id, actor, operation, target_type, target_name, before_snapshot, after_snapshot, status, error, created_at FROM db_admin_audit WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?"
      )
      .all(wsId, limit);
    return ok(c, { events: rows });
  } finally {
    db.close();
  }
});

// ===========================================================================
// A-P3-DB-4: Import, versions, and quality check endpoints
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /import-jobs
// ---------------------------------------------------------------------------
admin.get("/import-jobs", (c) => {
  const wsId = c.get("workspaceId");
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "50", 10) || 50, 1), 200);
  const db = openDb(wsId);
  try {
    const hasTable = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='data_import_job'")
      .get();
    if (!hasTable) {
      return ok(c, { jobs: [], status: "no_import_job_table" });
    }
    const rows = db
      .prepare(
        "SELECT job_id, workspace_id, import_type, source, source_type, data_version, status, dry_run, row_count, success_count, error_count, quality_report, created_at, started_at, finished_at, error FROM data_import_job WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?"
      )
      .all(wsId, limit);

    // Parse quality_report JSON
    const jobs = (rows as Array<Record<string, unknown>>).map((r) => ({
      ...r,
      qualityReport: typeof r.quality_report === "string" ? JSON.parse(r.quality_report as string) : r.quality_report,
      quality_report: undefined,
    }));

    return ok(c, { jobs });
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// POST /import-jobs/dry-run
// ---------------------------------------------------------------------------
admin.post("/import-jobs/dry-run", async (c) => {
  let packageType: string | undefined;
  try {
    const body = await c.req.json<{ packageType?: string }>();
    packageType = body.packageType;
  } catch { /* empty body */ }

  if (!packageType) {
    return invalidInput(c, "packageType is required", "packageType");
  }

  const pkg = getPackageConfig(packageType);
  if (!pkg) {
    return invalidInput(
      c,
      `unknown package type "${packageType}". Supported: ${listPackageTypes().join(", ")}`,
      "packageType"
    );
  }

  try {
    const result = pkgDryRun(packageType);
    const impact = toImportImpact(result);
    return ok(c, { ...impact, qualityReport: result.qualityReport });
  } catch (err) {
    return internalError(c, `dry run failed: ${err instanceof Error ? err.message : String(err)}`);
  }
});

// ---------------------------------------------------------------------------
// POST /import-jobs  (admin write + idempotent)
// ---------------------------------------------------------------------------
const ADMIN_TOKEN = "pls-admin-token";

/** Route-level middleware: reject if X-PLS-Admin-Token is missing or wrong. */
function adminTokenRequired() {
  return async (c: Context, next: Next) => {
    if (c.req.header("X-PLS-Admin-Token") !== ADMIN_TOKEN) {
      return unauthorized(c);
    }
    await next();
  };
}

// Middleware order matters: admin token MUST be checked BEFORE idempotency replay,
// so a cached 200 is never served to an unauthenticated caller.
admin.post("/import-jobs", adminTokenRequired(), idempotencyMiddleware(), async (c) => {
  // Idempotency-Key is required for formal imports
  const idemKey = c.req.header("Idempotency-Key");
  if (!idemKey) {
    return invalidInput(c, "Idempotency-Key header is required for formal imports", "Idempotency-Key");
  }

  const wsId = c.get("workspaceId");
  const body = await readJson<{ packageType?: string; confirmText?: string }>(c);
  const packageType = body.packageType;

  if (!packageType) {
    return invalidInput(c, "packageType is required", "packageType");
  }

  const pkg = getPackageConfig(packageType);
  if (!pkg) {
    return invalidInput(
      c,
      `unknown package type "${packageType}". Supported: ${listPackageTypes().join(", ")}`,
      "packageType"
    );
  }

  let dry: ReturnType<typeof pkgDryRun>;
  try {
    dry = pkgDryRun(packageType);
  } catch (err) {
    return internalError(c, `import dry-run failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const expectedConfirm = toImportImpact(dry).requiredConfirmText;
  if (body.confirmText !== expectedConfirm) {
    return invalidConfirmText(c, expectedConfirm);
  }

  // Reject formal import if dry-run has blocking errors. This keeps the
  // confirmText contract but prevents corrupt/invalid packages from being
  // written to the workspace.
  const blockingErrors = dry.errors ?? [];
  if (blockingErrors.length > 0) {
    return invalidInput(c, `import blocked by dry-run errors: ${blockingErrors.join("; ")}`, "dryRun");
  }

  const db = openDb(wsId);
  try {
    const result = executeImport(db, wsId, packageType);
    const response = ok(c, {
      operation: "import",
      status: "success",
      auditId: result.auditId,
      beforeSnapshot: { tableRowCounts: Object.fromEntries(result.tables.map((t) => [t.name, 0])), totalRows: 0 },
      afterSnapshot: result.afterSnapshot,
      warnings: result.warnings,
      jobId: result.jobId,
    });
    // Cache under idempotency key for replay
    return storeIdempotent(c, response, result.jobId);
  } catch (err) {
    return internalError(c, `import failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// GET /versions
// ---------------------------------------------------------------------------
admin.get("/versions", (c) => {
  const wsId = c.get("workspaceId");
  const db = openDb(wsId);
  try {
    const versions = pkgListVersions(db, wsId);
    return ok(c, { versions });
  } finally {
    db.close();
  }
});

// ===========================================================================
// A-P3-DB-6: Dangerous operations (truncate / drop / delete version / rebuild)
// All require admin token + Idempotency-Key + confirmText.
// ===========================================================================

/** Validate confirmText matches expected pattern; backend-side check, not just frontend. */
function validateConfirmText(c: Context, body: { confirmText?: string }, expected: string) {
  if (!body.confirmText || body.confirmText !== expected) {
    return invalidConfirmText(c, expected);
  }
  return null;
}

/**
 * Validate that Idempotency-Key header is present on dangerous write endpoints.
 * The idempotencyMiddleware only captures the key when present; we still need to
 * enforce its presence per spec.
 */
function requireIdempotencyKey(c: Context): Response | null {
  if (!c.req.header("Idempotency-Key")) {
    return invalidInput(c, "Idempotency-Key header is required for dangerous operations", "Idempotency-Key");
  }
  return null;
}

// ---------------------------------------------------------------------------
// POST /tables/:name/truncate
// ---------------------------------------------------------------------------
admin.post("/tables/:name/truncate", adminTokenRequired(), idempotencyMiddleware(), async (c) => {
  const idemErr = requireIdempotencyKey(c);
  if (idemErr) return idemErr;

  const tableName = c.req.param("name");
  if (!tableName) return invalidInput(c, "table name is required", "name");

  let body: { dryRun?: boolean; confirmText?: string } = {};
  try { body = await readJson<{ dryRun?: boolean; confirmText?: string }>(c); } catch { /* no body */ }

  const impact = impactTruncate(c.get("workspaceId"), tableName);

  // Dry run
  if (body.dryRun === true) {
    return ok(c, impact);
  }

  // Protected target
  if (PROTECTED_TABLES.has(tableName)) {
    return conflict(c, `table "${tableName}" is protected and cannot be truncated`);
  }

  // Confirm text check
  const expected = `TRUNCATE ${tableName}`;
  const confirmErr = validateConfirmText(c, body, expected);
  if (confirmErr) return confirmErr;

  const wsId = c.get("workspaceId");
  const { impact: execImpact, afterSnapshot, auditId, notFound: truncNotFound } = executeTruncate(wsId, tableName);
  if (truncNotFound) {
    return notFound(c, `table "${tableName}" does not exist`);
  }
  const response = ok(c, {
    operation: "truncate",
    status: "success",
    auditId,
    beforeSnapshot: { rowCount: execImpact.affectedRows, affectedTables: execImpact.affectedTables },
    afterSnapshot,
    warnings: execImpact.warnings,
  });
  return storeIdempotent(c, response, `truncate_${tableName}`);
});

// ---------------------------------------------------------------------------
// DELETE /tables/:name
// ---------------------------------------------------------------------------
admin.delete("/tables/:name", adminTokenRequired(), idempotencyMiddleware(), async (c) => {
  const idemErr = requireIdempotencyKey(c);
  if (idemErr) return idemErr;

  const tableName = c.req.param("name");
  if (!tableName) return invalidInput(c, "table name is required", "name");

  let body: { dryRun?: boolean; confirmText?: string } = {};
  try { body = await readJson<{ dryRun?: boolean; confirmText?: string }>(c); } catch { /* no body */ }

  const impact = impactDrop(c.get("workspaceId"), tableName);

  if (body.dryRun === true) {
    return ok(c, impact);
  }

  if (PROTECTED_TABLES.has(tableName)) {
    return conflict(c, `table/view "${tableName}" is protected and cannot be dropped`);
  }
  if (!DROPPABLE_TABLES.has(tableName) && !DROPPABLE_VIEWS.has(tableName)) {
    return conflict(c, `table/view "${tableName}" is not in the droppable whitelist`);
  }

  const expected = `DROP ${tableName}`;
  const confirmErr = validateConfirmText(c, body, expected);
  if (confirmErr) return confirmErr;

  const wsId = c.get("workspaceId");
  const { impact: execImpact, afterSnapshot, auditId, notFound: dropNotFound } = executeDrop(wsId, tableName);
  if (dropNotFound) {
    return notFound(c, `table/view "${tableName}" does not exist`);
  }
  const response = ok(c, {
    operation: "drop",
    status: "success",
    auditId,
    beforeSnapshot: { rowCount: execImpact.affectedRows, affectedTables: execImpact.affectedTables },
    afterSnapshot,
    warnings: execImpact.warnings,
  });
  return storeIdempotent(c, response, `drop_${tableName}`);
});

// ---------------------------------------------------------------------------
// DELETE /versions/:dataVersion
// ---------------------------------------------------------------------------
admin.delete("/versions/:dataVersion", adminTokenRequired(), idempotencyMiddleware(), async (c) => {
  const idemErr = requireIdempotencyKey(c);
  if (idemErr) return idemErr;

  const dataVersion = c.req.param("dataVersion");
  if (!dataVersion) return invalidInput(c, "dataVersion is required", "dataVersion");

  let body: { dryRun?: boolean; confirmText?: string } = {};
  try { body = await readJson<{ dryRun?: boolean; confirmText?: string }>(c); } catch { /* no body */ }

  const impact = impactDeleteVersion(c.get("workspaceId"), dataVersion);

  if (body.dryRun === true) {
    return ok(c, impact);
  }

  const expected = `DELETE VERSION ${dataVersion}`;
  const confirmErr = validateConfirmText(c, body, expected);
  if (confirmErr) return confirmErr;

  if (impact.affectedRows === 0) {
    return notFound(c, `data_version "${dataVersion}" not found in any versioned table`);
  }

  const wsId = c.get("workspaceId");
  const { impact: execImpact, afterSnapshot, auditId } = executeDeleteVersion(wsId, dataVersion);
  const response = ok(c, {
    operation: "delete_version",
    status: "success",
    auditId,
    beforeSnapshot: { rowCount: execImpact.affectedRows, affectedTables: execImpact.affectedTables },
    afterSnapshot,
    warnings: execImpact.warnings,
  });
  return storeIdempotent(c, response, `delete_version_${dataVersion}`);
});

// ---------------------------------------------------------------------------
// POST /migrations/apply
// ---------------------------------------------------------------------------
admin.post("/migrations/apply", adminTokenRequired(), idempotencyMiddleware(), async (c) => {
  const idemErr = requireIdempotencyKey(c);
  if (idemErr) return idemErr;

  let body: { dryRun?: boolean; confirmText?: string } = {};
  try { body = await readJson<{ dryRun?: boolean; confirmText?: string }>(c); } catch { /* no body */ }

  const wsId = c.get("workspaceId");
  const db = openDb(wsId);
  let pendingRows: Array<{ version: number; name: string; status: string }> = [];
  try {
    const rows = db
      .prepare("SELECT version, name, status FROM schema_migration WHERE status != 'applied'")
      .all();
    pendingRows = rows as Array<{ version: number; name: string; status: string }>;
  } finally {
    db.close();
  }

  const impact = {
    operation: "apply_migrations",
    targetType: "migration" as const,
    targetName: "all",
    affectedTables: ["schema_migration"],
    affectedRows: pendingRows.length,
    sourceType: "system_runtime",
    dataVersion: null,
    containsUserAuthorized: false,
    containsSystemHistory: true,
    warnings: pendingRows.length > 0 ? [] : ["no pending migrations"],
    requiredConfirmText: "APPLY MIGRATIONS",
  };

  if (body.dryRun === true) {
    return ok(c, impact);
  }

  const expected = "APPLY MIGRATIONS";
  const confirmErr = validateConfirmText(c, body, expected);
  if (confirmErr) return confirmErr;

  const db2 = openDb(wsId);
  try {
    const migrationsDir = resolve(REPO_ROOT, "apps/server/src/db/migrations");
    const result = runMigrations(db2, migrationsDir);
    const beforeSnapshot = { pending: pendingRows.length, failed: pendingRows.filter((r) => r.status === "failed").length };
    const afterSnapshot = { applied: result.applied, failed: result.failed, pending: result.pending };
    const auditId = writeAdminAudit(db2, wsId, "apply_migrations", "migration", "all", beforeSnapshot, afterSnapshot, "success");
    const response = ok(c, {
      operation: "apply_migrations",
      status: "success",
      auditId,
      beforeSnapshot,
      afterSnapshot,
      warnings: impact.warnings,
    });
    return storeIdempotent(c, response, "apply_migrations");
  } finally {
    db2.close();
  }
});

// ---------------------------------------------------------------------------
// POST /rebuild
// ---------------------------------------------------------------------------
admin.post("/rebuild", adminTokenRequired(), idempotencyMiddleware(), async (c) => {
  const idemErr = requireIdempotencyKey(c);
  if (idemErr) return idemErr;

  let body: { dryRun?: boolean; confirmText?: string; skipSnapshot?: boolean } = {};
  try { body = await readJson<{ dryRun?: boolean; confirmText?: string; skipSnapshot?: boolean }>(c); } catch { /* no body */ }

  const wsId = c.get("workspaceId");
  const impact = impactRebuild(wsId);

  if (body.dryRun === true) {
    return ok(c, impact);
  }

  const expected = `RESET ${wsId}`;
  const confirmErr = validateConfirmText(c, body, expected);
  if (confirmErr) return confirmErr;

  const { impact: execImpact, afterSnapshot, auditId } = await executeRebuild(wsId, body.skipSnapshot === true);
  const response = ok(c, {
    operation: "rebuild",
    status: "success",
    auditId,
    beforeSnapshot: { rowCount: execImpact.affectedRows, affectedTables: execImpact.affectedTables },
    afterSnapshot,
    warnings: execImpact.warnings,
  });
  return storeIdempotent(c, response, `rebuild_${wsId}`);
});

export default admin;

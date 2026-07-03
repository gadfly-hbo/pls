import type { DatabaseSync } from "node:sqlite";

export default {
  version: 1,
  name: "create_admin_tables",
  up(db: DatabaseSync): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT NOT NULL DEFAULT 'applied',
        error TEXT,
        execution_ms INTEGER
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS db_admin_audit (
        audit_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor TEXT NOT NULL DEFAULT 'system',
        operation TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_name TEXT NOT NULL,
        before_snapshot TEXT NOT NULL DEFAULT '{}',
        after_snapshot TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'success',
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_admin_audit_workspace ON db_admin_audit(workspace_id, created_at DESC)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_admin_audit_operation ON db_admin_audit(workspace_id, operation)`
    );

    db.exec(`
      CREATE TABLE IF NOT EXISTS data_import_job (
        job_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        import_type TEXT NOT NULL,
        source TEXT NOT NULL,
        source_type TEXT,
        data_version TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        dry_run INTEGER NOT NULL DEFAULT 0,
        input_manifest TEXT NOT NULL DEFAULT '{}',
        quality_report TEXT NOT NULL DEFAULT '{}',
        row_count INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        started_at TEXT,
        finished_at TEXT,
        error TEXT
      );
    `);

    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_import_job_workspace ON data_import_job(workspace_id, created_at DESC)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_import_job_status ON data_import_job(workspace_id, status)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_import_job_version ON data_import_job(workspace_id, data_version)`
    );
  },
};

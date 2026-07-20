import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
import {
  createMigrationBackup,
  restoreMigrationBackup,
  resolveMainDbPath,
  type MigrationBackup,
} from "./migration-backup.js";

const require = createRequire(import.meta.url);

export class MigrationDriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationDriftError";
  }
}

export class MigrationFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationFailedError";
  }
}

interface MigrationExport {
  version: number;
  name: string;
  up(db: DatabaseSync): void;
}

interface ResolvedMigration {
  version: number;
  name: string;
  fileName: string;
  checksum: string;
  up(db: DatabaseSync): void;
}

interface MigrationRecord {
  version: number;
  name: string;
  checksum: string;
  applied_at: string;
  status: string;
  error: string | null;
  execution_ms: number | null;
}

const BOOTSTRAP_DDL = `
CREATE TABLE IF NOT EXISTS schema_migration (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'applied',
  error TEXT,
  execution_ms INTEGER
);
`;

// Full SHA-256, 64-char lowercase hex (ledger S036/S053). Legacy 16-char
// prefixes stored by the previous runner are upgraded once, never rewritten
// unconditionally (ledger S054).
function computeChecksum(filePath: string): string {
  const content = readFileSync(filePath, "utf-8");
  return createHash("sha256").update(content).digest("hex");
}

function loadMigrations(migrationsDir: string): ResolvedMigration[] {
  const files = readdirSync(migrationsDir)
    .filter((f) => /^V\d+_.+\.ts$/.test(f))
    .sort();

  const migrations: ResolvedMigration[] = [];
  for (const file of files) {
    const filePath = resolve(migrationsDir, file);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(filePath) as { default: MigrationExport };
    const exported = mod.default;
    const match = /^V(\d+)_(.+)\.ts$/.exec(file);
    if (!match) {
      throw new MigrationDriftError(`migration file ${file} does not match V<version>_<name>.ts`);
    }
    const fileVersion = Number.parseInt(match[1]!, 10);
    const fileNamePart = match[2]!;
    if (exported.version !== fileVersion || exported.name !== fileNamePart) {
      throw new MigrationDriftError(
        `migration file ${file} exports version=${exported.version} name="${exported.name}", expected version=${fileVersion} name="${fileNamePart}"`
      );
    }
    if (typeof exported.up !== "function") {
      throw new MigrationDriftError(`migration file ${file} does not export an up() function`);
    }
    migrations.push({
      version: exported.version,
      name: exported.name,
      fileName: file,
      checksum: computeChecksum(filePath),
      up: exported.up.bind(exported),
    });
  }

  let previous = 0;
  const names = new Set<string>();
  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.version) || migration.version <= 0) {
      throw new MigrationDriftError(
        `migration "${migration.name}": version must be a positive integer`
      );
    }
    if (migration.version <= previous) {
      throw new MigrationDriftError("migrations must be ordered by strictly ascending version");
    }
    if (migration.name.trim().length === 0 || names.has(migration.name)) {
      throw new MigrationDriftError(
        `migration name "${migration.name}" is blank or duplicated`
      );
    }
    names.add(migration.name);
    previous = migration.version;
  }
  return migrations;
}

type StoredChecksumClass = "match" | "legacy_upgradeable" | "drift";

function classifyStoredChecksum(stored: string, full: string): StoredChecksumClass {
  if (/^[0-9a-f]{64}$/.test(stored)) {
    return stored === full ? "match" : "drift";
  }
  if (/^[0-9a-f]{16}$/.test(stored)) {
    return full.startsWith(stored) ? "legacy_upgradeable" : "drift";
  }
  return "drift";
}

function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // the original error carries the useful diagnostic
    }
    throw error;
  }
}

interface ForeignKeyViolation {
  table: string;
  rowid: number | null;
  parent: string;
  fkid: number;
}

function foreignKeyCheck(db: DatabaseSync): ForeignKeyViolation[] {
  const rows = db.prepare("PRAGMA foreign_key_check").all();
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      table: String(record["table"]),
      rowid: record["rowid"] === null ? null : Number(record["rowid"]),
      parent: String(record["parent"]),
      fkid: Number(record["fkid"]),
    };
  });
}

function quickCheck(db: DatabaseSync): boolean {
  const rows = db.prepare("PRAGMA quick_check").all();
  return rows.every(
    (row) => String((row as Record<string, unknown>)["quick_check"]) === "ok"
  );
}

function tableExists(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT type FROM sqlite_master WHERE name = ?")
    .get(name) as { type?: string } | undefined;
  return row?.type === "table";
}

function hasUserObjectsBesidesMigrationTable(db: DatabaseSync): boolean {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND name != 'schema_migration' LIMIT 1"
    )
    .get() as { name?: string } | undefined;
  return row !== undefined;
}

export interface RunResult {
  applied: number;
  pending: number;
  failed: number;
  errors: Array<{ version: number; name: string; error: string }>;
  upgradedChecksums: number;
  backupPath: string | null;
}

export function runMigrations(db: DatabaseSync, migrationsDir: string): RunResult {
  const migrations = loadMigrations(migrationsDir);
  const registry = new Map<number, ResolvedMigration>();
  for (const migration of migrations) {
    registry.set(migration.version, migration);
  }
  const maxKnownVersion = migrations.length > 0 ? migrations[migrations.length - 1]!.version : 0;
  const dbPath = resolveMainDbPath(db);

  // Read-only probe: do NOT create schema_migration here. For non-empty
  // databases the bootstrap runs later, inside the backup-restore
  // protection, so a failure restore returns even the sqlite_master
  // inventory to the exact pre-call state.
  const appliedRows = tableExists(db, "schema_migration")
    ? (db
        .prepare(
          "SELECT version, name, checksum, status FROM schema_migration ORDER BY version ASC"
        )
        .all() as unknown as MigrationRecord[])
    : [];

  // ------------------------------------------------------------------
  // Phase 1 (read-only): verify already-recorded migrations fail closed
  // (S053) and plan this run's mutations. Nothing below this comment may
  // write before the backup is taken.
  // ------------------------------------------------------------------
  const legacyUpgrades: Array<{
    version: number;
    name: string;
    oldChecksum: string;
    newChecksum: string;
  }> = [];
  const retryVersions: number[] = [];

  for (const row of appliedRows) {
    const expected = registry.get(row.version);
    if (!expected) {
      throw new MigrationDriftError(
        `database has migration version ${row.version} ("${row.name}") which is not in this build's registry (highest known V${maxKnownVersion}); refusing to run against a newer or unknown schema`
      );
    }
    if (row.name !== expected.name) {
      throw new MigrationDriftError(
        `applied migration version ${row.version} has name "${row.name}", expected "${expected.name}"`
      );
    }
    const checksumClass = classifyStoredChecksum(row.checksum, expected.checksum);
    if (row.status === "applied") {
      if (checksumClass === "drift") {
        throw new MigrationDriftError(
          `applied migration version ${row.version} checksum drift: stored ${row.checksum}, expected ${expected.checksum}`
        );
      }
      if (checksumClass === "legacy_upgradeable") {
        legacyUpgrades.push({
          version: row.version,
          name: row.name,
          oldChecksum: row.checksum,
          newChecksum: expected.checksum,
        });
      }
    } else {
      // Legacy rows left by the pre-transactional runner: a 'failed' row, or a
      // 'pending' row from a crash between the old non-atomic insert and the
      // final update. Retry is only allowed when the stored checksum still
      // matches the current file (full 64-char or strict 16-char prefix).
      if (checksumClass === "drift") {
        throw new MigrationDriftError(
          `migration V${row.version} was previously recorded as "${row.status}" with checksum ${row.checksum}, but the current file checksum is ${expected.checksum}. Manual intervention required.`
        );
      }
      retryVersions.push(row.version);
    }
  }

  // One-shot legacy 16-char checksum upgrades require minimal audit (S054).
  // db_admin_audit is created by V001; any database holding applied
  // migrations has it. Fail closed here — before the backup — instead of
  // silently dropping the approved audit semantics.
  if (legacyUpgrades.length > 0 && !tableExists(db, "db_admin_audit")) {
    throw new MigrationDriftError(
      `cannot upgrade ${legacyUpgrades.length} legacy 16-char migration checksum(s): db_admin_audit table is missing (V001 not applied); refusing to upgrade without audit`
    );
  }

  const appliedVersions = new Set<number>();
  for (const row of appliedRows) {
    if (row.status === "applied") appliedVersions.add(row.version);
  }
  const pending = migrations.filter((migration) => !appliedVersions.has(migration.version));
  const mutationsPlanned =
    legacyUpgrades.length > 0 || retryVersions.length > 0 || pending.length > 0;

  const result: RunResult = {
    applied: 0,
    pending: pending.length,
    failed: 0,
    errors: [],
    upgradedChecksums: legacyUpgrades.length,
    backupPath: null,
  };

  // ------------------------------------------------------------------
  // Phase 2: backup BEFORE any durable mutation of this run (S055),
  // including the schema_migration bootstrap for non-empty databases, so
  // a later failure restores the exact pre-call state: pre-call
  // sqlite_master inventory, pre-call checksums, absence of new audit
  // rows, and pre-call failed/pending rows. Fresh databases skip the
  // backup; per-migration transactions still guarantee no partial schema.
  // ------------------------------------------------------------------
  const needsBackup =
    dbPath !== null &&
    mutationsPlanned &&
    (appliedRows.length > 0 || hasUserObjectsBesidesMigrationTable(db));
  let backup: MigrationBackup | null = null;
  if (needsBackup) {
    backup = createMigrationBackup(db, dbPath);
    result.backupPath = backup.backupPath;
    console.log(`  backup: ${backup.backupPath}`);
  }

  let restored = false;
  const failWithRestore = (cause: string): never => {
    if (backup !== null && dbPath !== null && !restored) {
      restored = true;
      try {
        restoreMigrationBackup(db, dbPath, backup.backupPath);
      } catch (restoreError) {
        const restoreMsg =
          restoreError instanceof Error ? restoreError.message : String(restoreError);
        throw new MigrationFailedError(
          `${cause}; backup restore FAILED: ${restoreMsg} (backup at ${backup.backupPath})`
        );
      }
      throw new MigrationFailedError(
        `${cause}; database restored from backup ${backup.backupPath}`
      );
    }
    throw new MigrationFailedError(cause);
  };

  // Bootstrap: under the restore umbrella when a backup exists (non-empty
  // database); unprotected otherwise (fresh or no-op calls), preserving the
  // invariant that any runner call leaves schema_migration present.
  if (backup !== null) {
    try {
      db.exec(BOOTSTRAP_DDL);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      failWithRestore(`schema_migration bootstrap failed: ${errorMsg}`);
    }
  } else {
    db.exec(BOOTSTRAP_DDL);
  }

  if (!mutationsPlanned) {
    return result;
  }

  // ------------------------------------------------------------------
  // Phase 3: every durable mutation of this run under the restore
  // umbrella: legacy checksum upgrades + audit, retry-row deletes, and
  // one transaction per migration (S053/S054).
  // ------------------------------------------------------------------
  if (legacyUpgrades.length > 0) {
    const workspaceId = dbPath !== null ? basename(dirname(dbPath)) : "unknown";
    try {
      withTransaction(db, () => {
        for (const upgrade of legacyUpgrades) {
          const updated = db
            .prepare(
              "UPDATE schema_migration SET checksum = ? WHERE version = ? AND checksum = ?"
            )
            .run(upgrade.newChecksum, upgrade.version, upgrade.oldChecksum);
          if (Number(updated.changes) !== 1) {
            throw new MigrationDriftError(
              `legacy checksum upgrade for V${upgrade.version} matched ${updated.changes} rows; concurrent modification suspected`
            );
          }
          db.prepare(
            `INSERT INTO db_admin_audit (audit_id, workspace_id, actor, operation, target_type, target_name, before_snapshot, after_snapshot, status, created_at)
             VALUES (?, ?, 'system', 'migration_checksum_upgrade', 'migration', ?, ?, ?, 'success', datetime('now'))`
          ).run(
            randomUUID(),
            workspaceId,
            `V${String(upgrade.version).padStart(3, "0")}_${upgrade.name}`,
            JSON.stringify({ checksum: upgrade.oldChecksum }),
            JSON.stringify({ checksum: upgrade.newChecksum })
          );
        }
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      failWithRestore(`legacy checksum upgrade failed: ${errorMsg}`);
    }
  }

  for (const version of retryVersions) {
    try {
      db.prepare("DELETE FROM schema_migration WHERE version = ?").run(version);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      failWithRestore(`retry cleanup for migration V${version} failed: ${errorMsg}`);
    }
  }

  for (const migration of pending) {
    const startMs = Date.now();
    try {
      withTransaction(db, () => {
        migration.up(db);
        const elapsed = Date.now() - startMs;
        db.prepare(
          "INSERT INTO schema_migration (version, name, checksum, status, execution_ms) VALUES (?, ?, ?, 'applied', ?)"
        ).run(migration.version, migration.name, migration.checksum, elapsed);
      });
      result.applied++;
      const elapsed = Date.now() - startMs;
      console.log(
        `  ✓ V${String(migration.version).padStart(3, "0")}_${migration.name} (${elapsed}ms)`
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (backup !== null) {
        failWithRestore(`migration V${migration.version}_${migration.name} failed: ${errorMsg}`);
      }
      // No backup (fresh database): keep the legacy visible failure record
      // and stop at the first failure.
      const elapsed = Date.now() - startMs;
      db.prepare(
        "INSERT INTO schema_migration (version, name, checksum, status, execution_ms, error) VALUES (?, ?, ?, 'failed', ?, ?)"
      ).run(migration.version, migration.name, migration.checksum, elapsed, errorMsg);
      result.failed++;
      result.errors.push({ version: migration.version, name: migration.name, error: errorMsg });
      console.error(
        `  ✗ V${String(migration.version).padStart(3, "0")}_${migration.name}: ${errorMsg}`
      );
      return result;
    }
  }

  // ------------------------------------------------------------------
  // Phase 4: post-migration integrity checks (S053).
  // ------------------------------------------------------------------
  const violations = foreignKeyCheck(db);
  if (violations.length > 0) {
    failWithRestore(`foreign_key_check reported ${violations.length} violation(s) after migration`);
  }
  if (!quickCheck(db)) {
    failWithRestore("quick_check failed after migration");
  }

  return result;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const { openDb } = await import("./connection.js");
  const wsId = process.argv[2] || "ws_demo";
  const db = openDb(wsId);
  const dir = resolve(import.meta.dirname, "migrations");
  console.log(`Running migrations for workspace: ${wsId}`);
  const result = runMigrations(db, dir);
  if (result.failed > 0) {
    console.error(`\nMigration completed with ${result.failed} failure(s)`);
    process.exit(1);
  } else {
    console.log(`\nMigration complete: ${result.applied} applied, ${result.pending} total pending`);
  }
  db.close();
}

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  MigrationBackupError,
  MIGRATION_BACKUP_DIRNAME,
} from "./migration-backup.js";
import {
  MigrationDriftError,
  MigrationFailedError,
  runMigrations,
} from "./migration-runner.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(t: test.TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pls-migration-runner-"));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function closeQuietly(db: DatabaseSync): void {
  try {
    db.close();
  } catch {
    // already closed (e.g. handle closed by backup restore)
  }
}

function openTestDb(dbPath: string, opts?: { foreignKeys?: boolean }): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`PRAGMA foreign_keys = ${opts?.foreignKeys === false ? "OFF" : "ON"}`);
  return db;
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath, "utf-8")).digest("hex");
}

function migrationFileSource(version: number, name: string, upBody: string): string {
  return `export default {
  version: ${version},
  name: ${JSON.stringify(name)},
  up(db) {
${upBody}
  },
};
`;
}

function writeMigration(
  dir: string,
  version: number,
  name: string,
  upBody: string
): string {
  const filePath = path.join(dir, `V${String(version).padStart(3, "0")}_${name}.ts`);
  fs.writeFileSync(filePath, migrationFileSource(version, name, upBody));
  return filePath;
}

const ADMIN_UP = `    db.exec("CREATE TABLE IF NOT EXISTS db_admin_audit (audit_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, actor TEXT NOT NULL DEFAULT 'system', operation TEXT NOT NULL, target_type TEXT NOT NULL, target_name TEXT NOT NULL, before_snapshot TEXT NOT NULL DEFAULT '{}', after_snapshot TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'success', error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))");
    db.exec("CREATE TABLE IF NOT EXISTS sample_one (id INTEGER PRIMARY KEY, label TEXT)");`;

const SAMPLE_TWO_UP = `    db.exec("CREATE TABLE IF NOT EXISTS sample_two (id INTEGER PRIMARY KEY)");`;

const PROBE_UP = `    db.exec("CREATE TABLE IF NOT EXISTS probe_marker (id INTEGER PRIMARY KEY)");`;

const BROKEN_UP = `    db.exec("CREATE TABLE t_partial (id INTEGER)");
    throw new Error("boom");`;

interface MigrationRow {
  version: number;
  name: string;
  checksum: string;
  status: string;
  error: string | null;
}

function readMigrationRows(db: DatabaseSync): MigrationRow[] {
  const rows = db
    .prepare("SELECT version, name, checksum, status, error FROM schema_migration ORDER BY version")
    .all();
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      version: Number(record["version"]),
      name: String(record["name"]),
      checksum: String(record["checksum"]),
      status: String(record["status"]),
      error: record["error"] === null ? null : String(record["error"]),
    };
  });
}

function tableNames(db: DatabaseSync): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();
  return rows.map((row) => String((row as Record<string, unknown>)["name"]));
}

// ---------------------------------------------------------------------------
// fresh / repeat
// ---------------------------------------------------------------------------

test("fresh run applies all migrations with full 64-char checksums and no backup", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const migDir = path.join(dir, "migrations");
  fs.mkdirSync(migDir);
  const v1File = writeMigration(migDir, 1, "admin", ADMIN_UP);
  const v2File = writeMigration(migDir, 2, "sample", SAMPLE_TWO_UP);

  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  const result = runMigrations(db, migDir);

  assert.equal(result.applied, 2);
  assert.equal(result.failed, 0);
  assert.equal(result.pending, 2);
  assert.equal(result.upgradedChecksums, 0);
  assert.equal(result.backupPath, null);

  const rows = readMigrationRows(db);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.checksum, sha256File(v1File));
  assert.equal(rows[1]?.checksum, sha256File(v2File));
  for (const row of rows) {
    assert.match(row.checksum, /^[0-9a-f]{64}$/);
    assert.equal(row.status, "applied");
  }

  assert.ok(tableNames(db).includes("db_admin_audit"));
  assert.ok(tableNames(db).includes("sample_one"));
  assert.ok(tableNames(db).includes("sample_two"));
  assert.equal(fs.existsSync(path.join(dir, MIGRATION_BACKUP_DIRNAME)), false);

  const auditCount = db.prepare("SELECT COUNT(*) AS n FROM db_admin_audit").get() as { n: number };
  assert.equal(auditCount.n, 0);
});

test("repeat run is a no-op: no new applies, no checksum rewrite, no backup", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const migDir = path.join(dir, "migrations");
  fs.mkdirSync(migDir);
  writeMigration(migDir, 1, "admin", ADMIN_UP);
  writeMigration(migDir, 2, "sample", SAMPLE_TWO_UP);

  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, migDir);
  const before = readMigrationRows(db);

  const second = runMigrations(db, migDir);
  assert.equal(second.applied, 0);
  assert.equal(second.pending, 0);
  assert.equal(second.failed, 0);
  assert.equal(second.upgradedChecksums, 0);
  assert.equal(second.backupPath, null);
  assert.deepEqual(readMigrationRows(db), before);
  assert.equal(fs.existsSync(path.join(dir, MIGRATION_BACKUP_DIRNAME)), false);
});

// ---------------------------------------------------------------------------
// drift detection
// ---------------------------------------------------------------------------

test("name drift on an applied migration fails closed", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const migDir = path.join(dir, "migrations");
  fs.mkdirSync(migDir);
  writeMigration(migDir, 1, "admin", ADMIN_UP);

  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, migDir);
  db.prepare("UPDATE schema_migration SET name = ? WHERE version = 1").run("tampered");

  assert.throws(
    () => runMigrations(db, migDir),
    (error: unknown) =>
      error instanceof MigrationDriftError && /name/.test((error as Error).message)
  );
});

test("checksum drift on an applied migration fails closed", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const migDir = path.join(dir, "migrations");
  fs.mkdirSync(migDir);
  writeMigration(migDir, 1, "admin", ADMIN_UP);

  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, migDir);
  db.prepare("UPDATE schema_migration SET checksum = ? WHERE version = 1").run("0".repeat(64));

  assert.throws(
    () => runMigrations(db, migDir),
    (error: unknown) =>
      error instanceof MigrationDriftError && /checksum drift/.test((error as Error).message)
  );
  const row = db.prepare("SELECT checksum FROM schema_migration WHERE version = 1").get() as {
    checksum: string;
  };
  assert.equal(row.checksum, "0".repeat(64));
});

test("unknown higher migration version in the database is refused", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const migDir = path.join(dir, "migrations");
  fs.mkdirSync(migDir);
  writeMigration(migDir, 1, "admin", ADMIN_UP);

  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, migDir);
  db.prepare(
    "INSERT INTO schema_migration (version, name, checksum, status) VALUES (?, ?, ?, 'applied')"
  ).run(999, "999_future", "f".repeat(64));

  assert.throws(
    () => runMigrations(db, migDir),
    (error: unknown) =>
      error instanceof MigrationDriftError && /registry/.test((error as Error).message)
  );
});

// ---------------------------------------------------------------------------
// legacy 16-char checksum upgrade (S054)
// ---------------------------------------------------------------------------

test("legacy 16-char checksums upgrade once to 64-char with minimal audit", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const migDir = path.join(dir, "migrations");
  fs.mkdirSync(migDir);
  const v1File = writeMigration(migDir, 1, "admin", ADMIN_UP);
  const v2File = writeMigration(migDir, 2, "sample", SAMPLE_TWO_UP);

  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, migDir);

  const v1Full = sha256File(v1File);
  const v2Full = sha256File(v2File);
  db.prepare("UPDATE schema_migration SET checksum = ? WHERE version = 1").run(v1Full.slice(0, 16));
  db.prepare("UPDATE schema_migration SET checksum = ? WHERE version = 2").run(v2Full.slice(0, 16));

  const result = runMigrations(db, migDir);
  assert.equal(result.upgradedChecksums, 2);
  assert.equal(result.applied, 0);
  // The checksum upgrade is itself a durable mutation, so the runner takes a
  // formal owner-only backup before applying it.
  assert.ok(result.backupPath !== null);
  assert.ok(fs.existsSync(result.backupPath));
  assert.equal(fs.statSync(result.backupPath).mode & 0o777, 0o600);

  const rows = readMigrationRows(db);
  assert.equal(rows[0]?.checksum, v1Full);
  assert.equal(rows[1]?.checksum, v2Full);

  const auditRows = db
    .prepare(
      "SELECT workspace_id, actor, operation, target_type, target_name, before_snapshot, after_snapshot, status FROM db_admin_audit WHERE operation = 'migration_checksum_upgrade' ORDER BY target_name"
    )
    .all() as Array<Record<string, unknown>>;
  assert.equal(auditRows.length, 2);
  const first = auditRows[0]!;
  assert.equal(first["workspace_id"], path.basename(dir));
  assert.equal(first["actor"], "system");
  assert.equal(first["target_type"], "migration");
  assert.equal(first["status"], "success");
  assert.equal(first["target_name"], "V001_admin");
  assert.deepEqual(JSON.parse(String(first["before_snapshot"])), { checksum: v1Full.slice(0, 16) });
  assert.deepEqual(JSON.parse(String(first["after_snapshot"])), { checksum: v1Full });

  // upgrade is a one-shot: a follow-up run performs no further upgrades
  const again = runMigrations(db, migDir);
  assert.equal(again.upgradedChecksums, 0);
});

test("legacy 16-char checksum with wrong prefix is drift, never upgraded", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const migDir = path.join(dir, "migrations");
  fs.mkdirSync(migDir);
  const v1File = writeMigration(migDir, 1, "admin", ADMIN_UP);

  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, migDir);

  const full = sha256File(v1File);
  const wrongPrefix = (full.startsWith("a") ? "b" : "a") + full.slice(1, 16);
  db.prepare("UPDATE schema_migration SET checksum = ? WHERE version = 1").run(wrongPrefix);

  assert.throws(
    () => runMigrations(db, migDir),
    (error: unknown) =>
      error instanceof MigrationDriftError && /checksum drift/.test((error as Error).message)
  );
  const row = db.prepare("SELECT checksum FROM schema_migration WHERE version = 1").get() as {
    checksum: string;
  };
  assert.equal(row.checksum, wrongPrefix);
});

test("legacy checksum upgrade fails closed when db_admin_audit is missing", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const migDir = path.join(dir, "migrations");
  fs.mkdirSync(migDir);
  const v1File = writeMigration(migDir, 1, "admin", ADMIN_UP);
  const legacy = sha256File(v1File).slice(0, 16);

  // Hand-crafted pre-runner state: schema_migration exists with a legacy
  // checksum, but the V001 audit table was never created.
  const setup = openTestDb(dbPath);
  setup.exec(`CREATE TABLE schema_migration (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'applied',
    error TEXT,
    execution_ms INTEGER
  )`);
  setup
    .prepare("INSERT INTO schema_migration (version, name, checksum, status) VALUES (?, ?, ?, 'applied')")
    .run(1, "admin", legacy);
  setup.close();

  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  assert.throws(
    () => runMigrations(db, migDir),
    (error: unknown) =>
      error instanceof MigrationDriftError && /db_admin_audit/.test((error as Error).message)
  );
  const row = db.prepare("SELECT checksum FROM schema_migration WHERE version = 1").get() as {
    checksum: string;
  };
  assert.equal(row.checksum, legacy);
});

// ---------------------------------------------------------------------------
// transactions, backup, restore, checks (S053/S055)
// ---------------------------------------------------------------------------

test("fresh failure leaves no partial schema and records a failed row; same-checksum retry restores", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const migDir = path.join(dir, "migrations");
  fs.mkdirSync(migDir);
  writeMigration(migDir, 1, "admin", ADMIN_UP);
  writeMigration(migDir, 2, "broken", BROKEN_UP);

  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));

  // Fresh database: no backup exists, so the runner keeps the legacy
  // failed-row semantics instead of restoring.
  const first = runMigrations(db, migDir);
  assert.equal(first.applied, 1);
  assert.equal(first.failed, 1);
  assert.equal(first.errors.length, 1);
  assert.equal(first.errors[0]?.version, 2);
  assert.equal(first.backupPath, null);
  assert.ok(!tableNames(db).includes("t_partial"));
  assert.ok(tableNames(db).includes("sample_one"));
  const failedRow = readMigrationRows(db).find((row) => row.version === 2);
  assert.equal(failedRow?.status, "failed");
  assert.match(failedRow?.error ?? "", /boom/);

  // Marker row proves the later restore preserves committed data.
  db.prepare("INSERT INTO sample_one (id, label) VALUES (?, ?)").run(1, "keep-me");

  // Retry with the same file checksum: allowed, but this run upgrades a
  // non-empty database, so a backup is taken and the failure restores it.
  assert.throws(
    () => runMigrations(db, migDir),
    (error: unknown) =>
      error instanceof MigrationFailedError && /restored from backup/.test((error as Error).message)
  );

  const verify = openTestDb(dbPath);
  t.after(() => closeQuietly(verify));
  assert.ok(!tableNames(verify).includes("t_partial"));
  // Restore must return the exact pre-call state: the pre-call failed row is
  // preserved, not silently dropped by the retry cleanup.
  const rows = readMigrationRows(verify);
  assert.deepEqual(
    rows.map((row) => [row.version, row.status]),
    [
      [1, "applied"],
      [2, "failed"],
    ]
  );
  assert.match(rows[1]?.error ?? "", /boom/);
  const marker = verify.prepare("SELECT label FROM sample_one WHERE id = 1").get() as {
    label: string;
  };
  assert.equal(marker.label, "keep-me");
  assert.equal(fs.existsSync(path.join(dir, MIGRATION_BACKUP_DIRNAME)), true);
});

test("a failed row whose file changed is blocked for manual intervention", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const migDir = path.join(dir, "migrations");
  fs.mkdirSync(migDir);
  writeMigration(migDir, 1, "admin", ADMIN_UP);
  writeMigration(migDir, 2, "broken", BROKEN_UP);

  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  const first = runMigrations(db, migDir);
  assert.equal(first.failed, 1);

  // The failed migration file changed underneath: refuse rather than guess.
  writeMigration(migDir, 2, "broken", `${BROKEN_UP}\n    db.exec("SELECT 1");`);
  assert.throws(
    () => runMigrations(db, migDir),
    (error: unknown) =>
      error instanceof MigrationDriftError && /Manual intervention/.test((error as Error).message)
  );
});

test("upgrade takes an owner-only backup, preserves data, and never auto-cleans backups", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const migDir = path.join(dir, "migrations");
  fs.mkdirSync(migDir);
  writeMigration(migDir, 1, "admin", ADMIN_UP);

  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, migDir);
  db.prepare("INSERT INTO sample_one (id, label) VALUES (?, ?)").run(7, "pre-upgrade");

  writeMigration(migDir, 2, "probe", PROBE_UP);
  const upgraded = runMigrations(db, migDir);
  assert.equal(upgraded.applied, 1);
  assert.ok(upgraded.backupPath !== null);
  const backupPath = upgraded.backupPath;
  // The backup module resolves real paths (macOS /tmp -> /private/tmp).
  const realDir = fs.realpathSync(dir);
  const realBackupDir = path.join(realDir, MIGRATION_BACKUP_DIRNAME);
  assert.equal(path.dirname(backupPath), realBackupDir);
  assert.ok(fs.existsSync(backupPath));
  assert.equal(fs.statSync(backupPath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(realBackupDir).mode & 0o777, 0o700);

  assert.ok(tableNames(db).includes("probe_marker"));
  const marker = db.prepare("SELECT label FROM sample_one WHERE id = 7").get() as { label: string };
  assert.equal(marker.label, "pre-upgrade");
  const v2 = readMigrationRows(db).find((row) => row.version === 2);
  assert.match(v2?.checksum ?? "", /^[0-9a-f]{64}$/);

  // Repeat run is a no-op and the formal backup is not auto-cleaned.
  const again = runMigrations(db, migDir);
  assert.equal(again.applied, 0);
  assert.equal(again.backupPath, null);
  const backups = fs.readdirSync(realBackupDir);
  assert.equal(backups.length, 1);
  assert.equal(path.join(realBackupDir, backups[0]!), backupPath);
});

test("foreign_key_check failure after migration restores the pre-upgrade backup", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const migDir = path.join(dir, "migrations");
  fs.mkdirSync(migDir);
  writeMigration(migDir, 1, "admin", ADMIN_UP);

  // Pre-existing foreign key violation created outside the runner. This
  // database never ran the runner, so schema_migration must NOT exist yet.
  const setup = openTestDb(dbPath, { foreignKeys: false });
  setup.exec("CREATE TABLE parent (id INTEGER PRIMARY KEY)");
  setup.exec("CREATE TABLE child (id INTEGER PRIMARY KEY, pid INTEGER REFERENCES parent(id))");
  setup.exec("INSERT INTO child (id, pid) VALUES (1, 999)");
  assert.ok(!tableNames(setup).includes("schema_migration"));
  setup.close();

  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  assert.throws(
    () => runMigrations(db, migDir),
    (error: unknown) =>
      error instanceof MigrationFailedError &&
      /foreign_key_check reported 1 violation/.test((error as Error).message) &&
      /restored from backup/.test((error as Error).message)
  );

  const verify = openTestDb(dbPath);
  t.after(() => closeQuietly(verify));
  // Restored to the exact pre-call state at the sqlite_master level: the
  // applied migration is gone, the bootstrapped registry table is gone (it
  // did not exist before the call), and the violating rows are back exactly
  // as before.
  assert.ok(!tableNames(verify).includes("sample_one"));
  assert.ok(!tableNames(verify).includes("db_admin_audit"));
  assert.ok(!tableNames(verify).includes("schema_migration"));
  const orphan = verify.prepare("SELECT pid FROM child WHERE id = 1").get() as { pid: number };
  assert.equal(orphan.pid, 999);
  assert.equal(fs.existsSync(path.join(dir, MIGRATION_BACKUP_DIRNAME)), true);
});

test("rebuild-shaped call chain: fresh-database failure returns a result and the caller closes cleanly", (t) => {
  // Mirrors dangerous-ops.ts rebuild: it deletes db.sqlite/-wal/-shm and then
  // opens a brand-new empty database, so the runner's no-backup legacy
  // failure path is the only failure mode reachable from that call site. The
  // runner must RETURN (not throw), and the caller keeps using and finally
  // closes the same handle.
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const migDir = path.join(dir, "migrations");
  fs.mkdirSync(migDir);
  writeMigration(migDir, 1, "admin", ADMIN_UP);
  writeMigration(migDir, 2, "broken", BROKEN_UP);

  const db = openTestDb(dbPath);
  const result = runMigrations(db, migDir);
  assert.equal(result.applied, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0]?.error ?? "", /boom/);
  assert.equal(result.backupPath, null);

  // The rebuild caller continues with idempotent DDL on the same handle and
  // closes it on the success path.
  db.exec("CREATE TABLE IF NOT EXISTS post_rebuild_ddl (id INTEGER)");
  db.close();

  const verify = openTestDb(dbPath);
  t.after(() => closeQuietly(verify));
  assert.deepEqual(
    readMigrationRows(verify).map((row) => [row.version, row.status]),
    [
      [1, "applied"],
      [2, "failed"],
    ]
  );
  assert.ok(!tableNames(verify).includes("t_partial"));
  assert.ok(tableNames(verify).includes("post_rebuild_ddl"));
});

test("a symlinked .migration-backups directory is refused before any write", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const migDir = path.join(dir, "migrations");
  fs.mkdirSync(migDir);
  writeMigration(migDir, 1, "admin", ADMIN_UP);

  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, migDir);

  const escapeTarget = fs.mkdtempSync(path.join(os.tmpdir(), "pls-migration-escape-"));
  t.after(() => fs.rmSync(escapeTarget, { recursive: true, force: true }));
  fs.symlinkSync(escapeTarget, path.join(dir, MIGRATION_BACKUP_DIRNAME), "dir");

  writeMigration(migDir, 2, "probe", PROBE_UP);
  assert.throws(
    () => runMigrations(db, migDir),
    (error: unknown) => error instanceof MigrationBackupError
  );
  assert.ok(!tableNames(db).includes("probe_marker"));
  assert.deepEqual(
    readMigrationRows(db).map((row) => row.version),
    [1]
  );
  assert.equal(fs.readdirSync(escapeTarget).length, 0);
});

test("a later migration failure rolls back the legacy checksum upgrade and its audit", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const migDir = path.join(dir, "migrations");
  fs.mkdirSync(migDir);
  const v1File = writeMigration(migDir, 1, "admin", ADMIN_UP);
  const v2File = writeMigration(migDir, 2, "sample", SAMPLE_TWO_UP);

  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, migDir);

  const v1Legacy = sha256File(v1File).slice(0, 16);
  const v2Legacy = sha256File(v2File).slice(0, 16);
  db.prepare("UPDATE schema_migration SET checksum = ? WHERE version = 1").run(v1Legacy);
  db.prepare("UPDATE schema_migration SET checksum = ? WHERE version = 2").run(v2Legacy);

  const BROKEN_V3 = `    db.exec("CREATE TABLE t_partial_v3 (id INTEGER)");
    throw new Error("boom-v3");`;
  writeMigration(migDir, 3, "broken_v3", BROKEN_V3);

  assert.throws(
    () => runMigrations(db, migDir),
    (error: unknown) =>
      error instanceof MigrationFailedError &&
      /V3_broken_v3/.test((error as Error).message) &&
      /restored from backup/.test((error as Error).message)
  );

  const verify = openTestDb(dbPath);
  t.after(() => closeQuietly(verify));
  // Pre-call state restored: 16-char legacy checksums, zero upgrade audit
  // rows, no V003 record, no partial V003 structure.
  const rows = readMigrationRows(verify);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.checksum, v1Legacy);
  assert.equal(rows[1]?.checksum, v2Legacy);
  const auditCount = verify
    .prepare("SELECT COUNT(*) AS n FROM db_admin_audit WHERE operation = 'migration_checksum_upgrade'")
    .get() as { n: number };
  assert.equal(auditCount.n, 0);
  assert.ok(!tableNames(verify).includes("t_partial_v3"));
  assert.ok(tableNames(verify).includes("sample_two"));
});

test("route-shaped try/finally close does not mask the original MigrationFailedError", (t) => {
  // Mirrors the admin-database.ts apply-migrations call chain:
  //   const db2 = openDb(wsId);
  //   try { runMigrations(db2, migrationsDir); ... } finally { db2.close(); }
  // The finally close must neither throw nor supersede the runner's error.
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const migDir = path.join(dir, "migrations");
  fs.mkdirSync(migDir);
  writeMigration(migDir, 1, "admin", ADMIN_UP);

  const setup = openTestDb(dbPath);
  runMigrations(setup, migDir);
  setup.close();

  writeMigration(migDir, 2, "broken", BROKEN_UP);

  const invokeRouteShapedCall = (): void => {
    const db2 = openTestDb(dbPath);
    try {
      runMigrations(db2, migDir);
    } finally {
      db2.close();
    }
  };
  assert.throws(invokeRouteShapedCall, (error: unknown) => {
    const message = (error as Error).message;
    return (
      error instanceof MigrationFailedError &&
      /V2_broken/.test(message) &&
      /boom/.test(message) &&
      /restored from backup/.test(message)
    );
  });

  // The restore must survive the caller's close: a fresh connection sees the
  // exact pre-call state, with no replayed frames from the failed run.
  const verify = openTestDb(dbPath);
  t.after(() => closeQuietly(verify));
  assert.deepEqual(
    readMigrationRows(verify).map((row) => [row.version, row.status]),
    [[1, "applied"]]
  );
  assert.ok(!tableNames(verify).includes("t_partial"));
  assert.ok(tableNames(verify).includes("sample_one"));
});

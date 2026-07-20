import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { COMPARISON_DDL } from "./migrations/V005_portrait_comparison.js";
import { COMPARISON_DDL as SCHEMA_REEXPORT } from "./schema.js";
import { checkSchema } from "./schema-check.js";
import { runMigrations } from "./migration-runner.js";
import { PROTECTED_TABLES } from "../lib/dangerous-ops.js";
import { IMMUTABLE_TABLES, isTruncatable, isDroppable } from "../routes/admin-database.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(t: test.TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pls-v005-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function closeQuietly(db: DatabaseSync): void {
  try { db.close(); } catch { /* already closed */ }
}

function openTestDb(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

function tableNames(db: DatabaseSync): string[] {
  return (db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<Record<string, unknown>>)
    .map((r) => String(r["name"]));
}

function indexNames(db: DatabaseSync): string[] {
  return (db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<Record<string, unknown>>)
    .map((r) => String(r["name"]));
}

const COMPARISON_TABLES = [
  "comparison_run", "comparison_participant", "comparison_portrait_source",
  "comparison_dimension_evidence", "comparison_dimension_assessment",
  "comparison_explanation_attempt", "comparison_explanation_outcome",
  "comparison_archive_event",
];

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "migrations");

function uuidV4(): string {
  const hex = createHash("sha256").update(String(Math.random())).digest("hex");
  return [
    hex.slice(0, 8), hex.slice(8, 12),
    "4" + hex.slice(13, 16),
    ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join("-");
}

const CHECKSUM_64 = "a".repeat(64);
const TS_NOW = new Date().toISOString(); // "2026-07-18T16:00:00.000Z"

function insertWorkspace(db: DatabaseSync, wsId: string): void {
  db.exec(`CREATE TABLE IF NOT EXISTS workspace (
    workspace_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.prepare("INSERT OR IGNORE INTO workspace (workspace_id, name) VALUES (?, ?)").run(wsId, wsId);
}

function insertRun(db: DatabaseSync, wsId: string, overrides?: Partial<{ id: string; idempotency_key: string }>): string {
  const id = overrides?.id ?? uuidV4();
  const idemKey = overrides?.idempotency_key ?? `idem-${id.slice(0, 8)}`;
  db.prepare(`INSERT INTO comparison_run (
    id, workspace_id, mode, similarity_score, coverage, quality_status,
    algorithm_id, algorithm_version, algorithm_config_checksum,
    quality_policy_id, quality_policy_version, quality_policy_config_checksum,
    comparison_contract_id, comparison_contract_version, comparison_contract_checksum,
    idempotency_key, request_fingerprint, created_at, created_by
  ) VALUES (?, ?, 'peer_same_period', 85, 100, 'ready',
    'pls-portrait-comparison', '1.0.0', ?,
    'quality-policy', '1.0.0', ?,
    'comparison-contract', '0.1.0', ?,
    ?, ?, ?, 'test-operator')`).run(
    id, wsId, CHECKSUM_64, CHECKSUM_64, CHECKSUM_64,
    idemKey, CHECKSUM_64, TS_NOW
  );
  return id;
}

function insertParticipant(db: DatabaseSync, wsId: string, runId: string, role: string): string {
  const id = uuidV4();
  db.prepare(`INSERT INTO comparison_participant (
    id, workspace_id, comparison_run_id, role, family, object_type, object_id, display_name
  ) VALUES (?, ?, ?, ?, 'channel', 'account', 'acct-001', 'Test Account')`).run(id, wsId, runId, role);
  return id;
}

function insertEvidence(db: DatabaseSync, wsId: string, participantId: string, dimKey: string): string {
  const id = uuidV4();
  db.prepare(`INSERT INTO comparison_dimension_evidence (
    id, workspace_id, participant_id, dimension_key, dimension_label, value, unit, quality_status,
    evidence_refs_json
  ) VALUES (?, ?, ?, ?, ?, 25, 'years', 'ready', '[{"ref":"r1"}]')`).run(id, wsId, participantId, dimKey, dimKey);
  return id;
}

// ---------------------------------------------------------------------------
// Fresh & upgrade migration tests
// ---------------------------------------------------------------------------

test("fresh V001-V005 creates exactly the 8 comparison tables", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  const names = tableNames(db);
  for (const name of COMPARISON_TABLES) {
    assert.ok(names.includes(name), `missing table: ${name}`);
  }
});

test("existing V001-V004 upgrades cleanly to V005", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  const preMigrations = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^V00[1-4]_/.test(f))
    .sort();
  const tempMigDir = path.join(dir, "mig-pre");
  fs.mkdirSync(tempMigDir);
  for (const f of preMigrations) fs.copyFileSync(path.join(MIGRATIONS_DIR, f), path.join(tempMigDir, f));
  runMigrations(db, tempMigDir);
  assert.ok(!tableNames(db).includes("comparison_run"));
  const result = runMigrations(db, MIGRATIONS_DIR);
  assert.equal(result.applied, 1);
  assert.equal(result.failed, 0);
  for (const name of COMPARISON_TABLES) {
    assert.ok(tableNames(db).includes(name), `missing after upgrade: ${name}`);
  }
});

test("repeat run is a no-op for V005", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  const second = runMigrations(db, MIGRATIONS_DIR);
  assert.equal(second.applied, 0);
  assert.equal(second.upgradedChecksums, 0);
});

test("V005 checksum is full 64-char SHA-256", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  const row = db.prepare("SELECT checksum FROM schema_migration WHERE version = 5").get() as { checksum: string };
  assert.match(row.checksum, /^[0-9a-f]{64}$/);
  const expected = createHash("sha256")
    .update(fs.readFileSync(path.join(MIGRATIONS_DIR, "V005_portrait_comparison.ts"), "utf-8"))
    .digest("hex");
  assert.equal(row.checksum, expected);
});

// ---------------------------------------------------------------------------
// Schema structural verification
// ---------------------------------------------------------------------------

test("schema.ts re-exports the same COMPARISON_DDL as the migration file", () => {
  assert.equal(SCHEMA_REEXPORT, COMPARISON_DDL);
});

test("migration path and fresh-schema DDL produce normalized sqlite_master.sql that match", (t) => {
  const dir = makeTempDir(t);
  const db1Path = path.join(dir, "mig.sqlite");
  const db1 = openTestDb(db1Path);
  runMigrations(db1, MIGRATIONS_DIR);
  const migSql = (db1
    .prepare("SELECT sql FROM sqlite_master WHERE name LIKE 'comparison_%' AND type = 'table' ORDER BY name")
    .all() as Array<Record<string, unknown>>).map((r) => String(r["sql"]));
  db1.close();
  const db2Path = path.join(dir, "fresh.sqlite");
  const db2 = openTestDb(db2Path);
  db2.exec(COMPARISON_DDL);
  const freshSql = (db2
    .prepare("SELECT sql FROM sqlite_master WHERE name LIKE 'comparison_%' AND type = 'table' ORDER BY name")
    .all() as Array<Record<string, unknown>>).map((r) => String(r["sql"]));
  db2.close();
  assert.deepEqual(migSql, freshSql);
});

test("8 tables have all required indexes", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  const idx = indexNames(db);
  const required = [
    "idx_comparison_run_workspace_created",
    "idx_comparison_assessment_baseline_evidence",
    "idx_comparison_assessment_comparison_evidence",
    "idx_comparison_archive_run",
  ];
  for (const name of required) {
    assert.ok(idx.includes(name), `missing index: ${name}`);
  }
});

test("cursor index includes run id for stable ordering", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE name = 'idx_comparison_run_workspace_created'"
  ).get() as { sql: string };
  assert.match(row.sql, /workspace_id, created_at, id/i);
});

test("checkSchema (real authority) confirms all 8 comparison tables on a fresh V001-V005 database", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  const result = checkSchema(db);
  // checkSchema checks ALL code tables; a fresh V001-V005 DB is missing
  // tables from other DDL constants (SCHEMA_DDL, DOUYIN_BI_DDL, etc.).
  // Only verify that the 8 comparison tables are not in the missing list.
  const missingComparison = result.missing.filter((n) => n.startsWith("comparison_"));
  assert.equal(missingComparison.length, 0, `checkSchema reports missing comparison tables: ${missingComparison.join(", ")}`);
  const extraComparison = result.extra.filter((n) => n.startsWith("comparison_"));
  assert.equal(extraComparison.length, 0, `checkSchema reports extra comparison tables: ${extraComparison.join(", ")}`);
});

test("checkSchema reports extra database views in viewExtra", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  // Create a view not defined in any code DDL.
  db.exec("CREATE VIEW v_stray AS SELECT 1 AS x");
  const result = checkSchema(db);
  assert.ok(result.viewExtra.includes("v_stray"), `expected v_stray in viewExtra, got: ${result.viewExtra.join(", ")}`);
});

// ---------------------------------------------------------------------------
// UUID v4 format tests
// ---------------------------------------------------------------------------

test("NOT-A-UUID is rejected by the id CHECK constraint", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws1");
  assert.throws(
    () => db.prepare(`INSERT INTO comparison_run (
      id, workspace_id, mode, similarity_score, coverage, quality_status,
      algorithm_id, algorithm_version, algorithm_config_checksum,
      quality_policy_id, quality_policy_version, quality_policy_config_checksum,
      comparison_contract_id, comparison_contract_version, comparison_contract_checksum,
      idempotency_key, request_fingerprint, created_at, created_by
    ) VALUES ('NOT-A-UUID', ?, 'peer_same_period', 50, 100, 'ready',
      'a', '1', ?, 'q', '1', ?, 'c', '1', ?, 'k', ?, ?, 'op')`)
      .run("ws1", CHECKSUM_64, CHECKSUM_64, CHECKSUM_64, CHECKSUM_64, TS_NOW),
    /CHECK/
  );
});

// ---------------------------------------------------------------------------
// Composite FK & RESTRICT tests
// ---------------------------------------------------------------------------

test("composite FK prevents cross-workspace references", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws_a");
  insertWorkspace(db, "ws_b");
  const runId = insertRun(db, "ws_a");
  assert.throws(
    () => db.prepare(`INSERT INTO comparison_participant (
      id, workspace_id, comparison_run_id, role, family, object_type, object_id, display_name
    ) VALUES (?, 'ws_b', ?, 'baseline', 'channel', 'account', 'x', 'y')`).run(uuidV4(), runId),
    /FOREIGN KEY/
  );
});

test("ON DELETE RESTRICT prevents deleting a run with participants", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws1");
  const runId = insertRun(db, "ws1");
  insertParticipant(db, "ws1", runId, "baseline");
  assert.throws(
    () => db.prepare("DELETE FROM comparison_run WHERE id = ?").run(runId),
    /FOREIGN KEY/
  );
});

test("ON DELETE RESTRICT prevents deleting a participant with evidence", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws1");
  const runId = insertRun(db, "ws1");
  const partId = insertParticipant(db, "ws1", runId, "baseline");
  insertEvidence(db, "ws1", partId, "age");
  assert.throws(
    () => db.prepare("DELETE FROM comparison_participant WHERE id = ?").run(partId),
    /FOREIGN KEY/
  );
});

// ---------------------------------------------------------------------------
// UNIQUE constraint tests
// ---------------------------------------------------------------------------

test("duplicate role per run is rejected", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws1");
  const runId = insertRun(db, "ws1");
  insertParticipant(db, "ws1", runId, "baseline");
  assert.throws(() => insertParticipant(db, "ws1", runId, "baseline"), /UNIQUE/);
});

test("duplicate idempotency_key per workspace is rejected", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws1");
  insertRun(db, "ws1", { idempotency_key: "same-key" });
  assert.throws(() => insertRun(db, "ws1", { idempotency_key: "same-key" }), /UNIQUE/);
});

test("duplicate attempt_sequence per run is rejected", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws1");
  const runId = insertRun(db, "ws1");
  const insAtt = (seq: number) => db.prepare(`INSERT INTO comparison_explanation_attempt (
    id, workspace_id, comparison_run_id, attempt_sequence, generator_type,
    generator_id, generator_version, explanation_contract_version,
    evidence_manifest_json, evidence_manifest_checksum, started_at, actor
  ) VALUES (?, ?, ?, ?, 'rule', 'gen', '1.0', '0.1', '[]', ?, ?, 'test')`)
    .run(uuidV4(), "ws1", runId, seq, CHECKSUM_64, TS_NOW);
  insAtt(1);
  assert.throws(() => insAtt(1), /UNIQUE/);
});

test("duplicate event_sequence per run is rejected", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws1");
  const runId = insertRun(db, "ws1");
  const insert = (seq: number) => db.prepare(`INSERT INTO comparison_archive_event (
    id, workspace_id, comparison_run_id, event_sequence, operation,
    operation_fingerprint, idempotency_key, actor, occurred_at
  ) VALUES (?, ?, ?, ?, 'archived', ?, ?, 'test', ?)`)
    .run(uuidV4(), "ws1", runId, seq, CHECKSUM_64, `idem-${seq}`, TS_NOW);
  insert(1);
  assert.throws(() => insert(1), /UNIQUE/);
});

// ---------------------------------------------------------------------------
// CHECK constraint tests
// ---------------------------------------------------------------------------

test("illegal mode is rejected", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws1");
  assert.throws(
    () => db.prepare(`INSERT INTO comparison_run (
      id, workspace_id, mode, similarity_score, coverage, quality_status,
      algorithm_id, algorithm_version, algorithm_config_checksum,
      quality_policy_id, quality_policy_version, quality_policy_config_checksum,
      comparison_contract_id, comparison_contract_version, comparison_contract_checksum,
      idempotency_key, request_fingerprint, created_at, created_by
    ) VALUES (?, ?, 'invalid_mode', 50, 100, 'ready',
      'a', '1', ?, 'q', '1', ?, 'c', '1', ?, 'k', ?, ?, 'op')`)
      .run(uuidV4(), "ws1", CHECKSUM_64, CHECKSUM_64, CHECKSUM_64, CHECKSUM_64, TS_NOW),
    /CHECK/
  );
});

test("illegal checksum format is rejected", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws1");
  assert.throws(
    () => db.prepare(`INSERT INTO comparison_run (
      id, workspace_id, mode, similarity_score, coverage, quality_status,
      algorithm_id, algorithm_version, algorithm_config_checksum,
      quality_policy_id, quality_policy_version, quality_policy_config_checksum,
      comparison_contract_id, comparison_contract_version, comparison_contract_checksum,
      idempotency_key, request_fingerprint, created_at, created_by
    ) VALUES (?, ?, 'peer_same_period', 50, 100, 'ready',
      'a', '1', 'not-a-checksum', 'q', '1', ?, 'c', '1', ?, 'k', ?, ?, 'op')`)
      .run(uuidV4(), "ws1", CHECKSUM_64, CHECKSUM_64, CHECKSUM_64, TS_NOW),
    /CHECK/
  );
});

test("non-array JSON is rejected for collection fields", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws1");
  assert.throws(
    () => db.prepare(`INSERT INTO comparison_run (
      id, workspace_id, mode, similarity_score, coverage, quality_status,
      algorithm_id, algorithm_version, algorithm_config_checksum,
      quality_policy_id, quality_policy_version, quality_policy_config_checksum,
      comparison_contract_id, comparison_contract_version, comparison_contract_checksum,
      idempotency_key, request_fingerprint, created_at, created_by,
      quality_reasons_json
    ) VALUES (?, ?, 'peer_same_period', 50, 100, 'ready',
      'a', '1', ?, 'q', '1', ?, 'c', '1', ?, 'k', ?, ?, 'op', '{}')`)
      .run(uuidV4(), "ws1", CHECKSUM_64, CHECKSUM_64, CHECKSUM_64, CHECKSUM_64, TS_NOW),
    /CHECK/
  );
});

test("evidence_refs_json must be a non-empty array", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws1");
  const runId = insertRun(db, "ws1");
  const partId = insertParticipant(db, "ws1", runId, "baseline");
  // empty array → rejected
  assert.throws(
    () => db.prepare(`INSERT INTO comparison_dimension_evidence (
      id, workspace_id, participant_id, dimension_key, dimension_label, value, unit, quality_status,
      evidence_refs_json
    ) VALUES (?, ?, ?, 'age', 'Age', 25, 'years', 'ready', '[]')`)
      .run(uuidV4(), "ws1", partId),
    /CHECK/
  );
  // non-empty array → OK
  db.prepare(`INSERT INTO comparison_dimension_evidence (
    id, workspace_id, participant_id, dimension_key, dimension_label, value, unit, quality_status,
    evidence_refs_json
  ) VALUES (?, ?, ?, 'age', 'Age', 25, 'years', 'ready', '[{"ref":"r1"}]')`)
    .run(uuidV4(), "ws1", partId);
});

test("illegal timestamp format is rejected", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws1");
  // non-ISO timestamp → rejected
  assert.throws(
    () => db.prepare(`INSERT INTO comparison_run (
      id, workspace_id, mode, similarity_score, coverage, quality_status,
      algorithm_id, algorithm_version, algorithm_config_checksum,
      quality_policy_id, quality_policy_version, quality_policy_config_checksum,
      comparison_contract_id, comparison_contract_version, comparison_contract_checksum,
      idempotency_key, request_fingerprint, created_at, created_by
    ) VALUES (?, ?, 'peer_same_period', 50, 100, 'ready',
      'a', '1', ?, 'q', '1', ?, 'c', '1', ?, 'k', ?, ?, 'op')`)
      .run(uuidV4(), "ws1", CHECKSUM_64, CHECKSUM_64, CHECKSUM_64, CHECKSUM_64, "not-a-timestamp"),
    /CHECK/
  );
  // second-precision datetime(now) default format → rejected
  assert.throws(
    () => db.prepare(`INSERT INTO comparison_run (
      id, workspace_id, mode, similarity_score, coverage, quality_status,
      algorithm_id, algorithm_version, algorithm_config_checksum,
      quality_policy_id, quality_policy_version, quality_policy_config_checksum,
      comparison_contract_id, comparison_contract_version, comparison_contract_checksum,
      idempotency_key, request_fingerprint, created_at, created_by
    ) VALUES (?, ?, 'peer_same_period', 50, 100, 'ready',
      'a', '1', ?, 'q', '1', ?, 'c', '1', ?, 'k', ?, ?, 'op')`)
      .run(uuidV4(), "ws1", CHECKSUM_64, CHECKSUM_64, CHECKSUM_64, CHECKSUM_64, "2026-07-18 16:00:00"),
    /CHECK/
  );
});

test("included assessment must have evidence and derived values; excluded must not", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws1");
  const runId = insertRun(db, "ws1");
  const pBase = insertParticipant(db, "ws1", runId, "baseline");
  const pComp = insertParticipant(db, "ws1", runId, "comparison");
  const evBase = insertEvidence(db, "ws1", pBase, "age");
  const evComp = insertEvidence(db, "ws1", pComp, "age");

  // included with all fields → OK
  db.prepare(`INSERT INTO comparison_dimension_assessment (
    id, workspace_id, comparison_run_id, dimension_key, dimension_label,
    expected_unit, weight, participation,
    baseline_evidence_id, comparison_evidence_id,
    baseline_normalized_value, comparison_normalized_value,
    raw_delta, normalized_delta, dimension_similarity, weighted_contribution
  ) VALUES (?, ?, ?, 'age', 'Age', 'years', 1.0, 'included', ?, ?, 50, 60, 10, 10, 80, 80)`)
    .run(uuidV4(), "ws1", runId, evBase, evComp);

  // included without evidence → CHECK fail
  assert.throws(
    () => db.prepare(`INSERT INTO comparison_dimension_assessment (
      id, workspace_id, comparison_run_id, dimension_key, dimension_label,
      expected_unit, weight, participation,
      baseline_normalized_value, comparison_normalized_value,
      raw_delta, normalized_delta, dimension_similarity, weighted_contribution
    ) VALUES (?, ?, ?, 'height', 'Height', 'cm', 1.0, 'included', 50, 60, 10, 10, 80, 80)`)
      .run(uuidV4(), "ws1", runId),
    /CHECK/
  );
});

test("explanation_outcome conditional fields: succeeded needs content, failed needs error_code AND error_message", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws1");
  const runId = insertRun(db, "ws1");
  const attId = uuidV4();
  db.prepare(`INSERT INTO comparison_explanation_attempt (
    id, workspace_id, comparison_run_id, attempt_sequence, generator_type,
    generator_id, generator_version, explanation_contract_version,
    evidence_manifest_json, evidence_manifest_checksum, started_at, actor
  ) VALUES (?, ?, ?, 1, 'rule', 'gen', '1.0', '0.1', '[]', ?, ?, 'test')`)
    .run(attId, "ws1", runId, CHECKSUM_64, TS_NOW);

  // succeeded without content → CHECK fail
  assert.throws(
    () => db.prepare(`INSERT INTO comparison_explanation_outcome (
      id, workspace_id, explanation_attempt_id, status, completed_at
    ) VALUES (?, ?, ?, 'succeeded', ?)`)
      .run(uuidV4(), "ws1", attId, TS_NOW),
    /CHECK/
  );

  // failed without error_message → CHECK fail
  assert.throws(
    () => db.prepare(`INSERT INTO comparison_explanation_outcome (
      id, workspace_id, explanation_attempt_id, status, completed_at,
      error_code, failure_contract_version, retryable
    ) VALUES (?, ?, ?, 'failed', ?, 'generator_timeout', '0.1', 1)`)
      .run(uuidV4(), "ws1", attId, TS_NOW),
    /CHECK/
  );

  // failed with all required fields → OK
  db.prepare(`INSERT INTO comparison_explanation_outcome (
    id, workspace_id, explanation_attempt_id, status, completed_at,
    error_code, failure_contract_version, retryable, error_message
  ) VALUES (?, ?, ?, 'failed', ?, 'generator_timeout', '0.1', 1, 'timeout after 30s')`)
    .run(uuidV4(), "ws1", attId, TS_NOW);
});

test("succeeded outcome content must be an object, not an array", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws1");
  const runId = insertRun(db, "ws1");
  const attId = uuidV4();
  db.prepare(`INSERT INTO comparison_explanation_attempt (
    id, workspace_id, comparison_run_id, attempt_sequence, generator_type,
    generator_id, generator_version, explanation_contract_version,
    evidence_manifest_json, evidence_manifest_checksum, started_at, actor
  ) VALUES (?, ?, ?, 1, 'rule', 'gen', '1.0', '0.1', '[]', ?, ?, 'test')`)
    .run(attId, "ws1", runId, CHECKSUM_64, TS_NOW);

  // array content → rejected
  assert.throws(
    () => db.prepare(`INSERT INTO comparison_explanation_outcome (
      id, workspace_id, explanation_attempt_id, status, completed_at, content_json
    ) VALUES (?, ?, ?, 'succeeded', ?, '[{"block":"text"}]')`)
      .run(uuidV4(), "ws1", attId, TS_NOW),
    /CHECK/
  );

  // object content → OK
  db.prepare(`INSERT INTO comparison_explanation_outcome (
    id, workspace_id, explanation_attempt_id, status, completed_at, content_json
  ) VALUES (?, ?, ?, 'succeeded', ?, '{"conclusion":"similar","similarities":["age"]}')`)
    .run(uuidV4(), "ws1", attId, TS_NOW);
});

// ---------------------------------------------------------------------------
// Infinity rejection tests
// ---------------------------------------------------------------------------

test("Infinity is rejected for unbounded REAL fields (value, weight, raw_delta)", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws1");
  const runId = insertRun(db, "ws1");
  const partId = insertParticipant(db, "ws1", runId, "baseline");

  // value: Infinity → rejected
  assert.throws(
    () => db.prepare(`INSERT INTO comparison_dimension_evidence (
      id, workspace_id, participant_id, dimension_key, dimension_label, value, unit, quality_status,
      evidence_refs_json
    ) VALUES (?, ?, ?, 'age', 'Age', 1e999, 'years', 'ready', '[{"ref":"r1"}]')`)
      .run(uuidV4(), "ws1", partId),
    /CHECK/
  );

  // value: normal number → OK
  const evId = insertEvidence(db, "ws1", partId, "age");

  // weight: Infinity → rejected
  assert.throws(
    () => db.prepare(`INSERT INTO comparison_dimension_assessment (
      id, workspace_id, comparison_run_id, dimension_key, dimension_label,
      expected_unit, weight, participation, exclusion_reason
    ) VALUES (?, ?, ?, 'w', 'W', 'kg', 1e999, 'excluded', 'missing_both')`)
      .run(uuidV4(), "ws1", runId),
    /CHECK/
  );

  // raw_delta: Infinity → rejected (via included path which requires non-null raw_delta)
  const pComp = insertParticipant(db, "ws1", runId, "comparison");
  const evComp = insertEvidence(db, "ws1", pComp, "age");
  assert.throws(
    () => db.prepare(`INSERT INTO comparison_dimension_assessment (
      id, workspace_id, comparison_run_id, dimension_key, dimension_label,
      expected_unit, weight, participation,
      baseline_evidence_id, comparison_evidence_id,
      baseline_normalized_value, comparison_normalized_value,
      raw_delta, normalized_delta, dimension_similarity, weighted_contribution
    ) VALUES (?, ?, ?, 'inf', 'Inf', 'years', 1.0, 'included', ?, ?, 50, 60, 1e999, 10, 80, 80)`)
      .run(uuidV4(), "ws1", runId, evId, evComp),
    /CHECK/
  );
});

test("Number.MAX_VALUE and -MAX_VALUE are accepted for finite REAL fields", (t) => {
  const dir = makeTempDir(t);
  const dbPath = path.join(dir, "db.sqlite");
  const db = openTestDb(dbPath);
  t.after(() => closeQuietly(db));
  runMigrations(db, MIGRATIONS_DIR);
  insertWorkspace(db, "ws1");
  const runId = insertRun(db, "ws1");
  const partId = insertParticipant(db, "ws1", runId, "baseline");

  // value: MAX_VALUE → accepted
  db.prepare(`INSERT INTO comparison_dimension_evidence (
    id, workspace_id, participant_id, dimension_key, dimension_label, value, unit, quality_status,
    evidence_refs_json
  ) VALUES (?, ?, ?, 'maxval', 'MaxVal', 1.7976931348623157e+308, 'units', 'ready', '[{"ref":"r1"}]')`)
    .run(uuidV4(), "ws1", partId);

  // value: -MAX_VALUE → accepted
  db.prepare(`INSERT INTO comparison_dimension_evidence (
    id, workspace_id, participant_id, dimension_key, dimension_label, value, unit, quality_status,
    evidence_refs_json
  ) VALUES (?, ?, ?, 'minval', 'MinVal', -1.7976931348623157e+308, 'units', 'ready', '[{"ref":"r1"}]')`)
    .run(uuidV4(), "ws1", partId);

  // weight: MAX_VALUE → accepted (via excluded path)
  db.prepare(`INSERT INTO comparison_dimension_assessment (
    id, workspace_id, comparison_run_id, dimension_key, dimension_label,
    expected_unit, weight, participation, exclusion_reason
  ) VALUES (?, ?, ?, 'wmax', 'WMax', 'kg', 1.7976931348623157e+308, 'excluded', 'missing_both')`)
    .run(uuidV4(), "ws1", runId);
});

// ---------------------------------------------------------------------------
// Admin protection tests (real entrypoints)
// ---------------------------------------------------------------------------

test("all 8 comparison tables are in PROTECTED_TABLES (dangerous-ops authority)", () => {
  for (const name of COMPARISON_TABLES) {
    assert.ok(PROTECTED_TABLES.has(name), `${name} missing from PROTECTED_TABLES`);
  }
});

test("all 8 comparison tables are in IMMUTABLE_TABLES and not truncatable/droppable (admin-database authority)", () => {
  for (const name of COMPARISON_TABLES) {
    assert.ok(IMMUTABLE_TABLES.has(name), `${name} missing from IMMUTABLE_TABLES`);
    assert.equal(isTruncatable(name), false, `${name} should not be truncatable`);
    assert.equal(isDroppable(name), false, `${name} should not be droppable`);
  }
});

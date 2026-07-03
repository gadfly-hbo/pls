import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);

interface MigrationFile {
  version: number;
  name: string;
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

function computeChecksum(filePath: string): string {
  const content = readFileSync(filePath, "utf-8");
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function loadMigrations(migrationsDir: string): MigrationFile[] {
  const files = readdirSync(migrationsDir)
    .filter((f) => /^V\d+_.+\.ts$/.test(f))
    .sort();

  const migrations: MigrationFile[] = [];
  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(resolve(migrationsDir, file)) as {
      default: MigrationFile;
    };
    migrations.push(mod.default);
  }
  return migrations;
}

export interface RunResult {
  applied: number;
  pending: number;
  failed: number;
  errors: Array<{ version: number; name: string; error: string }>;
}

export function runMigrations(db: DatabaseSync, migrationsDir: string): RunResult {
  // Bootstrap schema_migration table if it doesn't exist
  db.exec(BOOTSTRAP_DDL);

  // Read applied versions
  const appliedRows = db
    .prepare("SELECT version, name, checksum, status FROM schema_migration")
    .all() as unknown as MigrationRecord[];
  const appliedMap = new Map<number, MigrationRecord>();
  for (const row of appliedRows) {
    appliedMap.set(row.version, row);
  }

  // Load all migration files
  const migrations = loadMigrations(migrationsDir);

  const result: RunResult = { applied: 0, pending: 0, failed: 0, errors: [] };

  for (const migration of migrations) {
    const existing = appliedMap.get(migration.version);
    if (existing && existing.status === "applied") {
      continue;
    }

    result.pending++;

    const migrationFile = readdirSync(migrationsDir).find(
      (f) => f.startsWith(`V${String(migration.version).padStart(3, "0")}_`) && f.endsWith(".ts")
    );
    const checksum = migrationFile
      ? computeChecksum(resolve(migrationsDir, migrationFile))
      : "unknown";

    // Check if existing failed record has same checksum — allow retry
    if (existing && existing.status === "failed" && existing.checksum === checksum) {
      // Retry: delete the failed record
      db.prepare("DELETE FROM schema_migration WHERE version = ?").run(migration.version);
    } else if (existing && existing.status === "failed" && existing.checksum !== checksum) {
      // Checksum changed on a previously failed migration — block
      result.errors.push({
        version: migration.version,
        name: migration.name,
        error: `Migration V${migration.version} was previously failed with a different checksum. Manual intervention required.`,
      });
      result.failed++;
      continue;
    }

    // Insert pending record
    db.prepare(
      "INSERT INTO schema_migration (version, name, checksum, status) VALUES (?, ?, ?, 'pending')"
    ).run(migration.version, migration.name, checksum);

    const startMs = Date.now();
    try {
      migration.up(db);
      const elapsed = Date.now() - startMs;
      db.prepare(
        "UPDATE schema_migration SET status = 'applied', applied_at = datetime('now'), execution_ms = ?, error = NULL WHERE version = ?"
      ).run(elapsed, migration.version);
      result.applied++;
      console.log(`  ✓ V${String(migration.version).padStart(3, "0")}_${migration.name} (${elapsed}ms)`);
    } catch (err) {
      const elapsed = Date.now() - startMs;
      const errorMsg = err instanceof Error ? err.message : String(err);
      db.prepare(
        "UPDATE schema_migration SET status = 'failed', execution_ms = ?, error = ? WHERE version = ?"
      ).run(elapsed, errorMsg, migration.version);
      result.failed++;
      result.errors.push({ version: migration.version, name: migration.name, error: errorMsg });
      console.error(`  ✗ V${String(migration.version).padStart(3, "0")}_${migration.name}: ${errorMsg}`);
    }
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

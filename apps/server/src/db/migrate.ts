import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { openDb } from "./connection.js";
import { runMigrations } from "./migration-runner.js";
import {
  SCHEMA_DDL,
  DOUYIN_BI_DDL,
  DOUYIN_BI_DDL_PART2,
  DOUYIN_BI_DDL_PART3,
  DATA_MANAGEMENT_DDL,
  CHANNEL_ENTITY_DDL,
  NEW_PRODUCT_DDL,
  FLYWHEEL_DDL,
  CHANNEL_OBJECT_LIBRARY_DDL,
} from "./schema.js";

const dataDir = resolve(import.meta.dirname, "../../../../data");
const wsDir = resolve(dataDir, "workspaces", "ws_demo");
mkdirSync(wsDir, { recursive: true });

const db = openDb("ws_demo");

// Phase 1: Run versioned migrations
console.log("Running versioned migrations...");
const migrationsDir = resolve(import.meta.dirname, "migrations");
const result = runMigrations(db, migrationsDir);
if (result.failed > 0) {
  console.error(`Migration completed with ${result.failed} failure(s), aborting`);
  db.close();
  process.exit(1);
}

// Phase 2: Idempotent DDL re-execution (backward-compatible layer)
// Ensures all tables/views exist even if migration files haven't caught up yet.
console.log("Applying idempotent DDL...");

// P1-B2 migration: rebuild idempotency_key so the PK includes method+path.
const idemRow = db
  .prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='idempotency_key'"
  )
  .get() as { sql?: string } | undefined;
if (idemRow?.sql && !/PRIMARY KEY \(workspace_id, method, path, key\)/.test(idemRow.sql)) {
  console.log("Migrating idempotency_key to (workspace_id, method, path, key) PK");
  db.exec("DROP TABLE idempotency_key");
}

db.exec(SCHEMA_DDL);

// P1-E3: ensure match_result_latest view picks up new columns.
db.exec("DROP VIEW IF EXISTS match_result_latest");
db.exec(SCHEMA_DDL);

// P1-E3 migration: add diagnostic columns to match_result.
const E3_COLS = [
  `ALTER TABLE match_result ADD COLUMN fit_score REAL`,
  `ALTER TABLE match_result ADD COLUMN fit_confidence REAL`,
  `ALTER TABLE match_result ADD COLUMN mismatched_dimensions TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE match_result ADD COLUMN adjustment_advice TEXT NOT NULL DEFAULT '[]'`,
];
for (const sql of E3_COLS) {
  try {
    db.exec(sql);
  } catch {
    // Column already exists
  }
}

// A-P1-F2: Douyin BI tables + latest views.
const DOUYIN_VIEWS = [
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
];

for (const v of DOUYIN_VIEWS) db.exec(`DROP VIEW IF EXISTS ${v}`);
db.exec(SCHEMA_DDL);
db.exec(DOUYIN_BI_DDL);
db.exec(DOUYIN_BI_DDL_PART2);
db.exec(DOUYIN_BI_DDL_PART3);
db.exec(DATA_MANAGEMENT_DDL);
db.exec(CHANNEL_ENTITY_DDL);
db.exec(NEW_PRODUCT_DDL);
db.exec(FLYWHEEL_DDL);
db.exec(CHANNEL_OBJECT_LIBRARY_DDL);

// Ensure workspace row exists
db.prepare(
  "INSERT OR IGNORE INTO workspace (workspace_id, name) VALUES (?, ?)"
).run("ws_demo", "Demo Workspace");

console.log("Migration complete: ws_demo schema ready");
db.close();

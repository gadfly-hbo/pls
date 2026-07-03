import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { openDb } from "./connection.js";
import {
  SCHEMA_DDL,
  DOUYIN_BI_DDL,
  DOUYIN_BI_DDL_PART2,
  DOUYIN_BI_DDL_PART3,
  DATA_MANAGEMENT_DDL,
  CHANNEL_ENTITY_DDL,
  NEW_PRODUCT_DDL,
  FLYWHEEL_DDL,
} from "./schema.js";

const dataDir = resolve(import.meta.dirname, "../../../../data");
const wsDir = resolve(dataDir, "workspaces", "ws_demo");
mkdirSync(wsDir, { recursive: true });

const db = openDb("ws_demo");

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
// CREATE VIEW IF NOT EXISTS is a no-op when the view already exists,
// so drop first to force recreation with the updated column list.
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
    // Column already exists — SQLite doesn't support IF NOT EXISTS on ADD COLUMN
  }
}

// A-P1-F2: Douyin BI tables + latest views.
// Views are dropped first so column additions to the underlying tables get
// picked up on subsequent migrations (same pattern as match_result_latest).
const DOUYIN_VIEWS = [
  "douyin_account_latest",
  "douyin_account_benchmark_tag_latest",
  "douyin_account_report_latest",
  "douyin_product_latest",
  "douyin_product_account_fit_latest",
  "douyin_comparison_dimension_latest",
  "douyin_adjustment_advice_latest",
  "douyin_summary_metric_latest",
  "channel_entity_latest",
];
for (const v of DOUYIN_VIEWS) db.exec(`DROP VIEW IF EXISTS ${v}`);
// Re-exec SCHEMA_DDL to recreate douyin_account_latest (defined there),
// then apply the split DOUYIN_BI_DDL parts which define the remaining views.
db.exec(SCHEMA_DDL);
db.exec(DOUYIN_BI_DDL);
db.exec(DOUYIN_BI_DDL_PART2);
db.exec(DOUYIN_BI_DDL_PART3);
db.exec(DATA_MANAGEMENT_DDL);
db.exec(CHANNEL_ENTITY_DDL);
db.exec(NEW_PRODUCT_DDL);
db.exec(FLYWHEEL_DDL);

// Ensure workspace row exists
db.prepare(
  "INSERT OR IGNORE INTO workspace (workspace_id, name) VALUES (?, ?)"
).run("ws_demo", "Demo Workspace");

console.log("Migration complete: ws_demo schema ready");
db.close();

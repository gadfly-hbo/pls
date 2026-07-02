import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { openDb } from "./connection.js";
import { SCHEMA_DDL } from "./schema.js";

const dataDir = resolve(import.meta.dirname, "../../../../data");
const wsDir = resolve(dataDir, "workspaces", "ws_demo");
mkdirSync(wsDir, { recursive: true });

const db = openDb("ws_demo");

// P1-B2 migration: rebuild idempotency_key so the PK includes method+path.
// Cache entries are ephemeral (24h TTL) and safe to drop on schema upgrade.
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

// Ensure workspace row exists
db.prepare(
  "INSERT OR IGNORE INTO workspace (workspace_id, name) VALUES (?, ?)"
).run("ws_demo", "Demo Workspace");

console.log("Migration complete: ws_demo schema ready");
db.close();

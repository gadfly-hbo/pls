import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { openDb } from "./connection.js";
import { SCHEMA_DDL } from "./schema.js";

const dataDir = resolve(import.meta.dirname, "../../../../data");
const wsDir = resolve(dataDir, "workspaces", "ws_demo");
mkdirSync(wsDir, { recursive: true });

const db = openDb("ws_demo");

db.exec(SCHEMA_DDL);

// Ensure workspace row exists
db.prepare(
  "INSERT OR IGNORE INTO workspace (workspace_id, name) VALUES (?, ?)"
).run("ws_demo", "Demo Workspace");

console.log("Migration complete: ws_demo schema ready");
db.close();

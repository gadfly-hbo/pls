import type { DatabaseSync } from "node:sqlite";

export default {
  version: 3,
  name: "simulated_market_run",
  up(db: DatabaseSync): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS simulation_run (
        run_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
        status TEXT NOT NULL DEFAULT 'pending',
        input_snapshot TEXT NOT NULL DEFAULT '{}',
        result TEXT,
        provider TEXT,
        model_version TEXT,
        quality_flags TEXT NOT NULL DEFAULT '[]',
        generated_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_simulation_run_workspace
        ON simulation_run(workspace_id, generated_at DESC);
    `);
  },
};

import type { DatabaseSync } from "node:sqlite";

export default {
  version: 4,
  name: "simulated_market_subagent",
  up(db: DatabaseSync): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS simulated_market_subagent (
        workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
        agent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        persona TEXT,
        profile TEXT NOT NULL DEFAULT '{}',
        source_type TEXT NOT NULL DEFAULT 'saved_subagent',
        source_ref TEXT NOT NULL DEFAULT '{}',
        weight REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (workspace_id, agent_id)
      );

      CREATE INDEX IF NOT EXISTS idx_simulated_market_subagent_workspace
        ON simulated_market_subagent(workspace_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_simulated_market_subagent_enabled
        ON simulated_market_subagent(workspace_id, enabled);
    `);
  },
};

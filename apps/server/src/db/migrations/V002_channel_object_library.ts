import type { DatabaseSync } from "node:sqlite";

export default {
  version: 2,
  name: "channel_object_library",
  up(db: DatabaseSync): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS channel_object (
        workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
        object_type TEXT NOT NULL,
        source_stable_key TEXT NOT NULL,
        key_source TEXT NOT NULL,
        canonical_object_key TEXT NOT NULL,
        object_version_id TEXT NOT NULL,
        data_version TEXT NOT NULL,
        source_batch_id TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        time_window TEXT,
        display_name TEXT,
        platform_name TEXT,
        platform_type TEXT,
        entity_status TEXT NOT NULL DEFAULT 'active',
        target_object TEXT NOT NULL,
        entity_attributes TEXT NOT NULL DEFAULT '{}',
        possible_duplicate INTEGER NOT NULL DEFAULT 0,
        duplicate_candidate_keys TEXT NOT NULL DEFAULT '[]',
        manual_review_status TEXT NOT NULL DEFAULT 'unreviewed',
        quality_flags TEXT NOT NULL DEFAULT '[]',
        source TEXT,
        source_type TEXT,
        raw TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (workspace_id, canonical_object_key, data_version)
      );

      CREATE INDEX IF NOT EXISTS idx_channel_object_type ON channel_object(workspace_id, object_type);
      CREATE INDEX IF NOT EXISTS idx_channel_object_batch ON channel_object(workspace_id, source_batch_id);
      CREATE INDEX IF NOT EXISTS idx_channel_object_key ON channel_object(workspace_id, canonical_object_key);

      CREATE TABLE IF NOT EXISTS channel_object_binding (
        workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
        binding_id TEXT NOT NULL,
        binding_type TEXT NOT NULL,
        from_canonical_object_key TEXT NOT NULL,
        to_canonical_object_key TEXT NOT NULL,
        source_batch_id TEXT NOT NULL,
        data_version TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        quality_flags TEXT NOT NULL DEFAULT '[]',
        raw TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (workspace_id, binding_id, data_version)
      );

      CREATE INDEX IF NOT EXISTS idx_channel_binding_from ON channel_object_binding(workspace_id, from_canonical_object_key);
      CREATE INDEX IF NOT EXISTS idx_channel_binding_to ON channel_object_binding(workspace_id, to_canonical_object_key);
      CREATE INDEX IF NOT EXISTS idx_channel_binding_batch ON channel_object_binding(workspace_id, source_batch_id);

      CREATE TABLE IF NOT EXISTS audience_profile (
        workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
        profile_id TEXT NOT NULL,
        canonical_object_key TEXT NOT NULL,
        profile_stage TEXT NOT NULL DEFAULT 'channel_audience',
        source TEXT NOT NULL,
        source_batch_id TEXT NOT NULL,
        data_version TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        time_window TEXT NOT NULL,
        sample_size INTEGER,
        confidence REAL NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        unmapped_fields TEXT NOT NULL DEFAULT '[]',
        quality_flags TEXT NOT NULL DEFAULT '[]',
        raw TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (workspace_id, profile_id, data_version)
      );

      CREATE INDEX IF NOT EXISTS idx_audience_profile_object ON audience_profile(workspace_id, canonical_object_key);
      CREATE INDEX IF NOT EXISTS idx_audience_profile_batch ON audience_profile(workspace_id, source_batch_id);

      CREATE TABLE IF NOT EXISTS product_fit_profile (
        workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
        profile_id TEXT NOT NULL,
        canonical_object_key TEXT NOT NULL,
        source TEXT NOT NULL,
        source_batch_id TEXT NOT NULL,
        data_version TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        time_window TEXT,
        sample_size INTEGER,
        confidence REAL NOT NULL,
        fit_categories TEXT NOT NULL DEFAULT '[]',
        fit_price_bands TEXT NOT NULL DEFAULT '[]',
        fit_styles TEXT NOT NULL DEFAULT '[]',
        fit_occasions TEXT NOT NULL DEFAULT '[]',
        fit_launch_types TEXT NOT NULL DEFAULT '[]',
        evidence TEXT NOT NULL DEFAULT '[]',
        quality_flags TEXT NOT NULL DEFAULT '[]',
        raw TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (workspace_id, profile_id, data_version)
      );

      CREATE INDEX IF NOT EXISTS idx_product_fit_object ON product_fit_profile(workspace_id, canonical_object_key);
      CREATE INDEX IF NOT EXISTS idx_product_fit_batch ON product_fit_profile(workspace_id, source_batch_id);
    `);
  },
};

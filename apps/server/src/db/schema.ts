export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS workspace (
  workspace_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sku (
  sku_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  spu_id TEXT,
  category_lv1 TEXT,
  category_lv2 TEXT,
  season TEXT,
  title TEXT,
  attributes TEXT NOT NULL DEFAULT '{}',
  assets TEXT NOT NULL DEFAULT '[]',
  mapped_product_tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sku_workspace ON sku(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS channel_profile (
  channel_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  batch_id TEXT,
  channel_name TEXT,
  channel_type TEXT,
  platform_type TEXT,
  time_window TEXT,
  sample_size INTEGER,
  source TEXT,
  source_type TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  traffic_index REAL,
  conversion_index REAL,
  quality_flags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_channel_workspace ON channel_profile(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wide_table_row (
  sku_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  time_window TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  batch_id TEXT,
  full_row TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (sku_id, channel_id, time_window)
);

CREATE INDEX IF NOT EXISTS idx_wide_table_workspace ON wide_table_row(workspace_id);

CREATE TABLE IF NOT EXISTS batch (
  batch_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  batch_type TEXT NOT NULL,
  source TEXT,
  source_type TEXT,
  time_window TEXT,
  row_count INTEGER,
  entity_counts TEXT NOT NULL DEFAULT '{}',
  quality_report TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_batch_workspace ON batch(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS prediction (
  prediction_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  sku_id TEXT NOT NULL,
  task_id TEXT,
  model_version TEXT,
  model_path TEXT,
  source TEXT,
  source_type TEXT,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  input_snapshot TEXT NOT NULL DEFAULT '{}',
  predicted_profile_tags TEXT NOT NULL DEFAULT '[]',
  top_segments TEXT NOT NULL DEFAULT '[]',
  quality_flags TEXT NOT NULL DEFAULT '[]',
  unmapped_input_tokens TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prediction_workspace ON prediction(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_sku ON prediction(workspace_id, sku_id);

CREATE TABLE IF NOT EXISTS match_result (
  match_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  task_id TEXT,
  prediction_id TEXT,
  sku_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_type TEXT,
  model_version TEXT,
  source TEXT,
  source_type TEXT,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  match_score REAL,
  match_confidence REAL,
  rank INTEGER,
  overlap REAL,
  best_segment_id TEXT,
  best_segment_match REAL,
  positive_drivers TEXT NOT NULL DEFAULT '[]',
  negative_drivers TEXT NOT NULL DEFAULT '[]',
  recommendation TEXT,
  risks TEXT NOT NULL DEFAULT '[]',
  quality_flags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_match_workspace ON match_result(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_prediction ON match_result(prediction_id);
CREATE INDEX IF NOT EXISTS idx_match_sku_channel ON match_result(workspace_id, sku_id, channel_id);

CREATE TABLE IF NOT EXISTS task (
  task_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  resource_id TEXT,
  model_version TEXT,
  input TEXT NOT NULL DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_workspace ON task(workspace_id, task_type, status);
CREATE INDEX IF NOT EXISTS idx_task_status ON task(workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_event (
  audit_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  actor TEXT,
  request_id TEXT,
  task_id TEXT,
  resource_type TEXT,
  resource_id TEXT,
  event TEXT,
  from_status TEXT,
  to_status TEXT,
  reason_code TEXT,
  attempt INTEGER,
  meta TEXT NOT NULL DEFAULT '{}',
  safety_stage TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_event(workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_task ON audit_event(task_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_event(resource_type, resource_id);
`;

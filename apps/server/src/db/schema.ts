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
  -- P1-E3: account-product diagnostic columns (nullable, backward-compatible)
  fit_score REAL,
  fit_confidence REAL,
  mismatched_dimensions TEXT NOT NULL DEFAULT '[]',
  adjustment_advice TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_match_workspace ON match_result(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_prediction ON match_result(prediction_id);
CREATE INDEX IF NOT EXISTS idx_match_sku_channel ON match_result(workspace_id, sku_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_match_latest_lookup
  ON match_result(workspace_id, sku_id, channel_id, generated_at DESC);

-- Latest projection: one row per (workspace_id, sku_id, channel_id) with the newest generated_at.
-- P1-B1: match_result is now append-only; historical rows remain queryable via GET /matches?history=true.
CREATE VIEW IF NOT EXISTS match_result_latest AS
SELECT match_id, workspace_id, task_id, prediction_id, sku_id, channel_id, channel_type,
       model_version, source, source_type, generated_at, match_score, match_confidence,
       rank, overlap, best_segment_id, best_segment_match, positive_drivers, negative_drivers,
       recommendation, risks, quality_flags, fit_score, fit_confidence,
       mismatched_dimensions, adjustment_advice, created_at
FROM (
  SELECT match_result.*,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, sku_id, channel_id
           ORDER BY generated_at DESC, rowid DESC
         ) AS _latest_rank
  FROM match_result
)
WHERE _latest_rank = 1;

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

-- P1-B2: Idempotency cache.
-- request_hash is a SHA-256 hex of the raw JSON body. User-authorized data is
-- admitted by default; this cache stores only hashes plus the response body.
-- response_body is the same JSON payload already returned by the API.
-- PK is (workspace_id, method, path, key) so the same key across different
-- endpoints does NOT collide — a caller may reuse a client-generated key
-- across POST /predictions and POST /matches without cross-replay.
CREATE TABLE IF NOT EXISTS idempotency_key (
  workspace_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_body TEXT NOT NULL,
  resource_id TEXT,
  status_code INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, method, path, key)
);

CREATE INDEX IF NOT EXISTS idx_idem_expires ON idempotency_key(expires_at);

-- ============================================================================
-- A-P1-F2: Douyin BI SQLite storage.
-- D-P1-F1 assetizes the legacy dashboard data.js into
-- data/p1/douyin-bi/ JSONL objects. PLS imports them here so downstream
-- reads never touch the raw HTML / data.js snapshot.
--
-- Every row keeps source_batch_id + data_version + generated_at so re-imports
-- of the same batch/version are idempotent (INSERT OR REPLACE by PK).
-- Business-key snapshots are exposed via *_latest views (newest generated_at
-- wins per business key).
-- ============================================================================

CREATE TABLE IF NOT EXISTS douyin_account (
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  channel_id TEXT NOT NULL,
  source_batch_id TEXT NOT NULL,
  data_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  time_window TEXT,
  account_group_id TEXT,
  account_name TEXT,
  account_kind TEXT,
  platform_type TEXT,
  channel_type TEXT,
  display_name_policy TEXT,
  display_name TEXT,
  is_baseline INTEGER NOT NULL DEFAULT 0,
  has_report INTEGER NOT NULL DEFAULT 0,
  has_benchmark_tags INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  source_type TEXT,
  upsert_hash TEXT,
  raw TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, channel_id, source_batch_id, data_version)
);

CREATE INDEX IF NOT EXISTS idx_douyin_account_ws ON douyin_account(workspace_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_douyin_account_group ON douyin_account(workspace_id, account_group_id);

CREATE VIEW IF NOT EXISTS douyin_account_latest AS
SELECT channel_id, workspace_id, source_batch_id, data_version, generated_at, time_window,
       account_group_id, account_name, account_kind, platform_type, channel_type,
       display_name_policy, display_name, is_baseline, has_report, has_benchmark_tags,
       source, source_type, upsert_hash, raw, created_at
FROM (
  SELECT douyin_account.*,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, channel_id
           ORDER BY generated_at DESC, rowid DESC
         ) AS _latest_rank
  FROM douyin_account
) WHERE _latest_rank = 1;
`;

// ============================================================================
// A-P1-F2: Douyin BI additional tables + latest views.
// Kept as a separate constant so individual tables can be edited without
// touching the long SCHEMA_DDL string; migrate.ts executes both in order.
// ============================================================================
export const DOUYIN_BI_DDL = `
CREATE TABLE IF NOT EXISTS douyin_account_benchmark_tag (
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  channel_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  option_label TEXT NOT NULL,
  source_batch_id TEXT NOT NULL,
  data_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  time_window TEXT,
  account_name TEXT,
  dimension_taxonomy TEXT,
  share_percent REAL,
  share_ratio REAL,
  top1_flag TEXT,
  decision_method TEXT,
  business_interpretation TEXT,
  mapped_tag_id TEXT,
  mapping_confidence REAL,
  sample_size INTEGER,
  order_index INTEGER,
  upsert_hash TEXT,
  raw TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, channel_id, dimension, option_label, source_batch_id, data_version)
);

CREATE INDEX IF NOT EXISTS idx_douyin_bench_channel ON douyin_account_benchmark_tag(workspace_id, channel_id);

CREATE VIEW IF NOT EXISTS douyin_account_benchmark_tag_latest AS
SELECT workspace_id, channel_id, dimension, option_label, source_batch_id, data_version,
       generated_at, time_window, account_name, dimension_taxonomy, share_percent, share_ratio,
       top1_flag, decision_method, business_interpretation, mapped_tag_id, mapping_confidence,
       sample_size, order_index, upsert_hash, raw, created_at
FROM (
  SELECT douyin_account_benchmark_tag.*,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, channel_id, dimension, option_label
           ORDER BY generated_at DESC, rowid DESC
         ) AS _latest_rank
  FROM douyin_account_benchmark_tag
) WHERE _latest_rank = 1;

CREATE TABLE IF NOT EXISTS douyin_account_report (
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  channel_id TEXT NOT NULL,
  report_kind TEXT NOT NULL,
  source_batch_id TEXT NOT NULL,
  data_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  time_window TEXT,
  report_id TEXT,
  account_name TEXT,
  account_kind TEXT,
  channel_type TEXT,
  compare_period TEXT,
  plain_text_excerpt TEXT,
  plain_text_char_count INTEGER,
  raw_html_bytes INTEGER,
  raw_html_hash TEXT,
  raw_html_available INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  source_type TEXT,
  upsert_hash TEXT,
  raw TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, channel_id, report_kind, source_batch_id, data_version)
);

CREATE INDEX IF NOT EXISTS idx_douyin_report_channel ON douyin_account_report(workspace_id, channel_id);

CREATE VIEW IF NOT EXISTS douyin_account_report_latest AS
SELECT workspace_id, channel_id, report_kind, source_batch_id, data_version, generated_at, time_window,
       report_id, account_name, account_kind, channel_type, compare_period,
       plain_text_excerpt, plain_text_char_count, raw_html_bytes, raw_html_hash, raw_html_available,
       source, source_type, upsert_hash, raw, created_at
FROM (
  SELECT douyin_account_report.*,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, channel_id, report_kind
           ORDER BY generated_at DESC, rowid DESC
         ) AS _latest_rank
  FROM douyin_account_report
) WHERE _latest_rank = 1;
`;

export const DOUYIN_BI_DDL_PART2 = `
CREATE TABLE IF NOT EXISTS douyin_product (
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  sku_id TEXT NOT NULL,
  source_batch_id TEXT NOT NULL,
  data_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  time_window TEXT,
  product_name TEXT,
  product_attributes TEXT NOT NULL DEFAULT '{}',
  performance_metrics TEXT NOT NULL DEFAULT '{}',
  performance_index TEXT NOT NULL DEFAULT '{}',
  profile_distribution TEXT NOT NULL DEFAULT '{}',
  mapped_profile_tags TEXT NOT NULL DEFAULT '[]',
  unmapped_profile_fields TEXT NOT NULL DEFAULT '[]',
  source TEXT,
  source_type TEXT,
  quality_flags TEXT NOT NULL DEFAULT '[]',
  upsert_hash TEXT,
  raw TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, sku_id, source_batch_id, data_version)
);

CREATE INDEX IF NOT EXISTS idx_douyin_product_ws ON douyin_product(workspace_id, generated_at DESC);

CREATE VIEW IF NOT EXISTS douyin_product_latest AS
SELECT workspace_id, sku_id, source_batch_id, data_version, generated_at, time_window,
       product_name, product_attributes, performance_metrics, performance_index,
       profile_distribution, mapped_profile_tags, unmapped_profile_fields,
       source, source_type, quality_flags, upsert_hash, raw, created_at
FROM (
  SELECT douyin_product.*,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, sku_id
           ORDER BY generated_at DESC, rowid DESC
         ) AS _latest_rank
  FROM douyin_product
) WHERE _latest_rank = 1;

CREATE TABLE IF NOT EXISTS douyin_product_account_fit (
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  fit_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  account_channel_id TEXT NOT NULL,
  source_batch_id TEXT NOT NULL,
  data_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  time_window TEXT,
  product_name TEXT,
  account_name TEXT,
  legacy_fit_score REAL,
  legacy_fit_score_usage TEXT,
  mismatch_dimension_count INTEGER,
  heavy_adjustment_tag_list TEXT,
  sales_rank INTEGER,
  sales_volume INTEGER,
  source TEXT,
  source_type TEXT,
  quality_flags TEXT NOT NULL DEFAULT '[]',
  upsert_hash TEXT,
  raw TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, sku_id, account_channel_id, source_batch_id, data_version)
);

CREATE INDEX IF NOT EXISTS idx_douyin_fit_sku ON douyin_product_account_fit(workspace_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_douyin_fit_account ON douyin_product_account_fit(workspace_id, account_channel_id);
CREATE INDEX IF NOT EXISTS idx_douyin_fit_fitid ON douyin_product_account_fit(workspace_id, fit_id);

CREATE VIEW IF NOT EXISTS douyin_product_account_fit_latest AS
SELECT workspace_id, fit_id, sku_id, account_channel_id, source_batch_id, data_version,
       generated_at, time_window, product_name, account_name,
       legacy_fit_score, legacy_fit_score_usage, mismatch_dimension_count, heavy_adjustment_tag_list,
       sales_rank, sales_volume, source, source_type, quality_flags, upsert_hash, raw, created_at
FROM (
  SELECT douyin_product_account_fit.*,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, sku_id, account_channel_id
           ORDER BY generated_at DESC, rowid DESC
         ) AS _latest_rank
  FROM douyin_product_account_fit
) WHERE _latest_rank = 1;
`;

export const DOUYIN_BI_DDL_PART3 = `
CREATE TABLE IF NOT EXISTS douyin_comparison_dimension (
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  fit_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  source_batch_id TEXT NOT NULL,
  data_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  time_window TEXT,
  sku_id TEXT,
  account_channel_id TEXT,
  dimension_taxonomy TEXT,
  product_top1_label TEXT,
  product_top1_share_percent REAL,
  account_top1_label TEXT,
  account_top1_share_percent REAL,
  product_top1_tag_id TEXT,
  account_top1_tag_id TEXT,
  decision_method TEXT,
  is_match_label TEXT,
  status TEXT,
  gap_score REAL,
  upsert_hash TEXT,
  raw TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, fit_id, dimension, source_batch_id, data_version)
);

CREATE INDEX IF NOT EXISTS idx_douyin_cmp_fit ON douyin_comparison_dimension(workspace_id, fit_id);
CREATE INDEX IF NOT EXISTS idx_douyin_cmp_sku ON douyin_comparison_dimension(workspace_id, sku_id);

CREATE VIEW IF NOT EXISTS douyin_comparison_dimension_latest AS
SELECT workspace_id, fit_id, dimension, source_batch_id, data_version, generated_at, time_window,
       sku_id, account_channel_id, dimension_taxonomy,
       product_top1_label, product_top1_share_percent, account_top1_label, account_top1_share_percent,
       product_top1_tag_id, account_top1_tag_id, decision_method, is_match_label, status, gap_score,
       upsert_hash, raw, created_at
FROM (
  SELECT douyin_comparison_dimension.*,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, fit_id, dimension
           ORDER BY generated_at DESC, rowid DESC
         ) AS _latest_rank
  FROM douyin_comparison_dimension
) WHERE _latest_rank = 1;

CREATE TABLE IF NOT EXISTS douyin_adjustment_advice (
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  advice_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  account_channel_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  source_batch_id TEXT NOT NULL,
  data_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  time_window TEXT,
  product_name TEXT,
  dimension_taxonomy TEXT,
  product_top1_label TEXT,
  product_top1_share_percent REAL,
  account_top1_label TEXT,
  account_top1_share_percent REAL,
  product_top1_tag_id TEXT,
  account_top1_tag_id TEXT,
  gap_score REAL,
  priority_label TEXT,
  priority TEXT,
  direction TEXT,
  action_type TEXT,
  legacy_fit_score REAL,
  evidence TEXT NOT NULL DEFAULT '{}',
  source TEXT,
  source_type TEXT,
  quality_flags TEXT NOT NULL DEFAULT '[]',
  upsert_hash TEXT,
  raw TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, sku_id, account_channel_id, dimension, order_index, source_batch_id, data_version)
);

CREATE INDEX IF NOT EXISTS idx_douyin_adv_sku ON douyin_adjustment_advice(workspace_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_douyin_adv_account ON douyin_adjustment_advice(workspace_id, account_channel_id);
CREATE INDEX IF NOT EXISTS idx_douyin_adv_priority ON douyin_adjustment_advice(workspace_id, priority);

CREATE VIEW IF NOT EXISTS douyin_adjustment_advice_latest AS
SELECT workspace_id, advice_id, sku_id, account_channel_id, dimension, order_index,
       source_batch_id, data_version, generated_at, time_window, product_name, dimension_taxonomy,
       product_top1_label, product_top1_share_percent, account_top1_label, account_top1_share_percent,
       product_top1_tag_id, account_top1_tag_id, gap_score, priority_label, priority, direction,
       action_type, legacy_fit_score, evidence, source, source_type, quality_flags,
       upsert_hash, raw, created_at
FROM (
  SELECT douyin_adjustment_advice.*,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, sku_id, account_channel_id, dimension, order_index
           ORDER BY generated_at DESC, rowid DESC
         ) AS _latest_rank
  FROM douyin_adjustment_advice
) WHERE _latest_rank = 1;

CREATE TABLE IF NOT EXISTS douyin_summary_metric (
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  metric_name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  source_batch_id TEXT NOT NULL,
  data_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  time_window TEXT,
  metric_value TEXT,
  metric_value_numeric REAL,
  source TEXT,
  source_type TEXT,
  upsert_hash TEXT,
  raw TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, metric_name, order_index, source_batch_id, data_version)
);

CREATE INDEX IF NOT EXISTS idx_douyin_metric_ws ON douyin_summary_metric(workspace_id, generated_at DESC);

CREATE VIEW IF NOT EXISTS douyin_summary_metric_latest AS
SELECT workspace_id, metric_name, order_index, source_batch_id, data_version, generated_at, time_window,
       metric_value, metric_value_numeric, source, source_type, upsert_hash, raw, created_at
FROM (
  SELECT douyin_summary_metric.*,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, metric_name, order_index
           ORDER BY generated_at DESC, rowid DESC
         ) AS _latest_rank
  FROM douyin_summary_metric
) WHERE _latest_rank = 1;
`;

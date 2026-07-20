import type { DatabaseSync } from "node:sqlite";

// Single DDL source of truth for all Comparison tables (ledger S051).
// Used by the migration runner, fresh schema, rebuild, and schema-check.
// All CHECK constraints, UNIQUE indexes, and composite foreign keys are
// named so fail-closed diagnostics identify the exact rule.

// Shared CHECK fragments — inlined into each table's DDL so COMPARISON_DDL
// remains a single self-contained string.

// UUID v4: 36 chars, four hyphens at positions 8/13/18/23, version nibble
// '4' at position 12, variant nibble [89ab] at position 17, remaining
// chars lowercase hex.
const _UUID_V4_CHECK = `length(ID) = 36
  AND substr(ID,9,1) = '-' AND substr(ID,14,1) = '-' AND substr(ID,19,1) = '-' AND substr(ID,24,1) = '-'
  AND substr(ID,15,1) = '4' AND substr(ID,20,1) IN ('8','9','a','b')
  AND length(replace(ID,'-','')) = 32 AND replace(ID,'-','') NOT GLOB '*[^0-9a-f]*'`;

// ISO 8601 UTC millisecond timestamp: YYYY-MM-DDTHH:MM:SS.mmmZ
const _TS_FMT_CHECK = `length(ID) = 24
  AND substr(ID,5,1) = '-' AND substr(ID,8,1) = '-' AND substr(ID,11,1) = 'T'
  AND substr(ID,14,1) = ':' AND substr(ID,17,1) = ':' AND substr(ID,20,1) = '.' AND substr(ID,24,1) = 'Z'
  AND substr(ID,1,4) NOT GLOB '*[^0-9]*' AND substr(ID,6,2) NOT GLOB '*[^0-9]*'
  AND substr(ID,9,2) NOT GLOB '*[^0-9]*' AND substr(ID,12,2) NOT GLOB '*[^0-9]*'
  AND substr(ID,15,2) NOT GLOB '*[^0-9]*' AND substr(ID,18,2) NOT GLOB '*[^0-9]*'
  AND substr(ID,21,3) NOT GLOB '*[^0-9]*'
  AND CAST(substr(ID,6,2) AS INTEGER) BETWEEN 1 AND 12
  AND CAST(substr(ID,9,2) AS INTEGER) BETWEEN 1 AND 31
  AND CAST(substr(ID,12,2) AS INTEGER) BETWEEN 0 AND 23
  AND CAST(substr(ID,15,2) AS INTEGER) BETWEEN 0 AND 59
  AND CAST(substr(ID,18,2) AS INTEGER) BETWEEN 0 AND 59`;

// Period date: YYYY-MM-DD with valid month/day
const _PERIOD_FMT_CHECK = `length(ID) = 10 AND substr(ID,5,1) = '-' AND substr(ID,8,1) = '-'
  AND substr(ID,1,4) NOT GLOB '*[^0-9]*' AND substr(ID,6,2) NOT GLOB '*[^0-9]*'
  AND substr(ID,9,2) NOT GLOB '*[^0-9]*'
  AND CAST(substr(ID,6,2) AS INTEGER) BETWEEN 1 AND 12
  AND CAST(substr(ID,9,2) AS INTEGER) BETWEEN 1 AND 31`;

function _uuid(col: string): string {
  return _UUID_V4_CHECK.replaceAll("ID", col);
}

function _ts(col: string): string {
  return _TS_FMT_CHECK.replaceAll("ID", col);
}

function _period(col: string): string {
  return _PERIOD_FMT_CHECK.replaceAll("ID", col);
}

export const COMPARISON_DDL = `
CREATE TABLE IF NOT EXISTS comparison_run (
  id TEXT PRIMARY KEY CHECK (${_uuid("id")}),
  workspace_id TEXT NOT NULL REFERENCES workspace(workspace_id),
  mode TEXT NOT NULL CHECK (mode IN ('peer_same_period', 'self_cross_period')),
  similarity_score REAL NOT NULL CHECK (typeof(similarity_score) = 'real' AND similarity_score >= 0 AND similarity_score <= 100),
  coverage REAL NOT NULL CHECK (typeof(coverage) = 'real' AND coverage >= 0 AND coverage <= 100),
  quality_status TEXT NOT NULL CHECK (quality_status IN ('ready', 'limited')),
  quality_reasons_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(quality_reasons_json) AND json_type(quality_reasons_json) = 'array'),
  algorithm_id TEXT NOT NULL CHECK (length(trim(algorithm_id)) > 0),
  algorithm_version TEXT NOT NULL CHECK (length(trim(algorithm_version)) > 0),
  algorithm_config_checksum TEXT NOT NULL CHECK (length(algorithm_config_checksum) = 64 AND algorithm_config_checksum NOT GLOB '*[^0-9a-f]*'),
  quality_policy_id TEXT NOT NULL CHECK (length(trim(quality_policy_id)) > 0),
  quality_policy_version TEXT NOT NULL CHECK (length(trim(quality_policy_version)) > 0),
  quality_policy_config_checksum TEXT NOT NULL CHECK (length(quality_policy_config_checksum) = 64 AND quality_policy_config_checksum NOT GLOB '*[^0-9a-f]*'),
  comparison_contract_id TEXT NOT NULL CHECK (length(trim(comparison_contract_id)) > 0),
  comparison_contract_version TEXT NOT NULL CHECK (length(trim(comparison_contract_version)) > 0),
  comparison_contract_checksum TEXT NOT NULL CHECK (length(comparison_contract_checksum) = 64 AND comparison_contract_checksum NOT GLOB '*[^0-9a-f]*'),
  idempotency_key TEXT NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) = 64 AND request_fingerprint NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) CHECK (${_ts("created_at")}),
  created_by TEXT NOT NULL CHECK (length(trim(created_by)) > 0),
  created_by_display_name TEXT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_comparison_run_workspace_created
  ON comparison_run (workspace_id, created_at, id);

CREATE TABLE IF NOT EXISTS comparison_participant (
  id TEXT PRIMARY KEY CHECK (${_uuid("id")}),
  workspace_id TEXT NOT NULL,
  comparison_run_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('baseline', 'comparison')),
  family TEXT NOT NULL CHECK (family IN ('channel', 'product')),
  object_type TEXT NOT NULL CHECK (object_type IN ('platform', 'trade_area', 'store', 'account', 'marketing_event', 'business_scenario', 'sku')),
  object_id TEXT NOT NULL CHECK (length(trim(object_id)) > 0),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  FOREIGN KEY (workspace_id, comparison_run_id) REFERENCES comparison_run (workspace_id, id) ON DELETE RESTRICT,
  CHECK (
    (family = 'channel' AND object_type IN ('platform', 'trade_area', 'store', 'account', 'marketing_event', 'business_scenario'))
    OR (family = 'product' AND object_type = 'sku')
  ),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, comparison_run_id, role)
);

CREATE TABLE IF NOT EXISTS comparison_portrait_source (
  id TEXT PRIMARY KEY CHECK (${_uuid("id")}),
  workspace_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  source_system TEXT NOT NULL CHECK (source_system IN ('pls_workspace', 'agentharness')),
  source_contract_version TEXT NOT NULL CHECK (length(trim(source_contract_version)) > 0),
  snapshot_id TEXT NOT NULL CHECK (length(trim(snapshot_id)) > 0),
  data_version TEXT NOT NULL CHECK (length(trim(data_version)) > 0),
  period_start TEXT NOT NULL CHECK (${_period("period_start")}),
  period_end TEXT NOT NULL CHECK (${_period("period_end")}),
  source_generated_at TEXT NOT NULL CHECK (${_ts("source_generated_at")}),
  source_batch_id TEXT CHECK (source_batch_id IS NULL OR length(trim(source_batch_id)) > 0),
  sample_size INTEGER CHECK (sample_size IS NULL OR (typeof(sample_size) = 'integer' AND sample_size >= 0)),
  confidence REAL CHECK (confidence IS NULL OR (typeof(confidence) = 'real' AND confidence >= 0 AND confidence <= 1)),
  quality_status TEXT NOT NULL CHECK (quality_status IN ('ready', 'limited')),
  source_flags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(source_flags_json) AND json_type(source_flags_json) = 'array'),
  policy_reasons_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(policy_reasons_json) AND json_type(policy_reasons_json) = 'array'),
  CHECK (period_start <= period_end),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, participant_id),
  FOREIGN KEY (workspace_id, participant_id) REFERENCES comparison_participant (workspace_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS comparison_dimension_evidence (
  id TEXT PRIMARY KEY CHECK (${_uuid("id")}),
  workspace_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  dimension_key TEXT NOT NULL CHECK (length(trim(dimension_key)) > 0),
  dimension_label TEXT NOT NULL CHECK (length(trim(dimension_label)) > 0),
  value REAL NOT NULL CHECK (typeof(value) = 'real' AND value >= -1.7976931348623157e+308 AND value <= 1.7976931348623157e+308),
  unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
  quality_status TEXT NOT NULL CHECK (quality_status IN ('ready', 'limited')),
  source_flags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(source_flags_json) AND json_type(source_flags_json) = 'array'),
  policy_reasons_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(policy_reasons_json) AND json_type(policy_reasons_json) = 'array'),
  evidence_refs_json TEXT NOT NULL CHECK (json_valid(evidence_refs_json) AND json_type(evidence_refs_json) = 'array' AND json_array_length(evidence_refs_json) > 0),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, participant_id, dimension_key),
  FOREIGN KEY (workspace_id, participant_id) REFERENCES comparison_participant (workspace_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS comparison_dimension_assessment (
  id TEXT PRIMARY KEY CHECK (${_uuid("id")}),
  workspace_id TEXT NOT NULL,
  comparison_run_id TEXT NOT NULL,
  dimension_key TEXT NOT NULL CHECK (length(trim(dimension_key)) > 0),
  dimension_label TEXT NOT NULL CHECK (length(trim(dimension_label)) > 0),
  expected_unit TEXT NOT NULL CHECK (length(trim(expected_unit)) > 0),
  weight REAL NOT NULL CHECK (typeof(weight) = 'real' AND weight > 0 AND weight <= 1.7976931348623157e+308),
  participation TEXT NOT NULL CHECK (participation IN ('included', 'excluded')),
  exclusion_reason TEXT CHECK (
    exclusion_reason IS NULL
    OR exclusion_reason IN ('missing_baseline', 'missing_comparison', 'missing_both', 'unit_mismatch', 'quality_insufficient')
  ),
  baseline_evidence_id TEXT CHECK (baseline_evidence_id IS NULL OR (${_uuid("baseline_evidence_id")})),
  comparison_evidence_id TEXT CHECK (comparison_evidence_id IS NULL OR (${_uuid("comparison_evidence_id")})),
  baseline_normalized_value REAL CHECK (baseline_normalized_value IS NULL OR (typeof(baseline_normalized_value) = 'real' AND baseline_normalized_value >= 0 AND baseline_normalized_value <= 100)),
  comparison_normalized_value REAL CHECK (comparison_normalized_value IS NULL OR (typeof(comparison_normalized_value) = 'real' AND comparison_normalized_value >= 0 AND comparison_normalized_value <= 100)),
  raw_delta REAL CHECK (raw_delta IS NULL OR (typeof(raw_delta) = 'real' AND raw_delta >= -1.7976931348623157e+308 AND raw_delta <= 1.7976931348623157e+308)),
  normalized_delta REAL CHECK (normalized_delta IS NULL OR (typeof(normalized_delta) = 'real' AND normalized_delta >= -100 AND normalized_delta <= 100)),
  dimension_similarity REAL CHECK (dimension_similarity IS NULL OR (typeof(dimension_similarity) = 'real' AND dimension_similarity >= 0 AND dimension_similarity <= 100)),
  weighted_contribution REAL CHECK (weighted_contribution IS NULL OR (typeof(weighted_contribution) = 'real' AND weighted_contribution >= 0 AND weighted_contribution <= 100)),
  FOREIGN KEY (workspace_id, comparison_run_id) REFERENCES comparison_run (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, baseline_evidence_id) REFERENCES comparison_dimension_evidence (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, comparison_evidence_id) REFERENCES comparison_dimension_evidence (workspace_id, id) ON DELETE RESTRICT,
  CHECK (
    (participation = 'included' AND exclusion_reason IS NULL)
    OR (participation = 'excluded' AND exclusion_reason IS NOT NULL)
  ),
  CHECK (
    (participation = 'included' AND baseline_evidence_id IS NOT NULL AND comparison_evidence_id IS NOT NULL)
    OR (participation = 'excluded' AND exclusion_reason = 'missing_baseline' AND baseline_evidence_id IS NULL AND comparison_evidence_id IS NOT NULL)
    OR (participation = 'excluded' AND exclusion_reason = 'missing_comparison' AND baseline_evidence_id IS NOT NULL AND comparison_evidence_id IS NULL)
    OR (participation = 'excluded' AND exclusion_reason = 'missing_both' AND baseline_evidence_id IS NULL AND comparison_evidence_id IS NULL)
    OR (participation = 'excluded' AND exclusion_reason = 'unit_mismatch' AND baseline_evidence_id IS NOT NULL AND comparison_evidence_id IS NOT NULL)
    OR (participation = 'excluded' AND exclusion_reason = 'quality_insufficient' AND baseline_evidence_id IS NOT NULL AND comparison_evidence_id IS NOT NULL)
  ),
  CHECK (
    (participation = 'included'
      AND baseline_normalized_value IS NOT NULL AND comparison_normalized_value IS NOT NULL
      AND raw_delta IS NOT NULL AND normalized_delta IS NOT NULL
      AND dimension_similarity IS NOT NULL AND weighted_contribution IS NOT NULL)
    OR (participation = 'excluded'
      AND baseline_normalized_value IS NULL AND comparison_normalized_value IS NULL
      AND raw_delta IS NULL AND normalized_delta IS NULL
      AND dimension_similarity IS NULL AND weighted_contribution IS NULL)
  ),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, comparison_run_id, dimension_key)
);

CREATE INDEX IF NOT EXISTS idx_comparison_assessment_baseline_evidence
  ON comparison_dimension_assessment (workspace_id, baseline_evidence_id);
CREATE INDEX IF NOT EXISTS idx_comparison_assessment_comparison_evidence
  ON comparison_dimension_assessment (workspace_id, comparison_evidence_id);

CREATE TABLE IF NOT EXISTS comparison_explanation_attempt (
  id TEXT PRIMARY KEY CHECK (${_uuid("id")}),
  workspace_id TEXT NOT NULL,
  comparison_run_id TEXT NOT NULL,
  attempt_sequence INTEGER NOT NULL CHECK (typeof(attempt_sequence) = 'integer' AND attempt_sequence >= 1),
  generator_type TEXT NOT NULL CHECK (generator_type IN ('rule', 'ai')),
  generator_id TEXT NOT NULL CHECK (length(trim(generator_id)) > 0),
  generator_version TEXT NOT NULL CHECK (length(trim(generator_version)) > 0),
  explanation_contract_version TEXT NOT NULL CHECK (length(trim(explanation_contract_version)) > 0),
  evidence_manifest_json TEXT NOT NULL CHECK (json_valid(evidence_manifest_json) AND json_type(evidence_manifest_json) = 'array'),
  evidence_manifest_checksum TEXT NOT NULL CHECK (length(evidence_manifest_checksum) = 64 AND evidence_manifest_checksum NOT GLOB '*[^0-9a-f]*'),
  started_at TEXT NOT NULL CHECK (${_ts("started_at")}),
  actor TEXT NOT NULL CHECK (length(trim(actor)) > 0),
  FOREIGN KEY (workspace_id, comparison_run_id) REFERENCES comparison_run (workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, comparison_run_id, attempt_sequence)
);

CREATE TABLE IF NOT EXISTS comparison_explanation_outcome (
  id TEXT PRIMARY KEY CHECK (${_uuid("id")}),
  workspace_id TEXT NOT NULL,
  explanation_attempt_id TEXT NOT NULL CHECK (${_uuid("explanation_attempt_id")}),
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
  completed_at TEXT NOT NULL CHECK (${_ts("completed_at")}),
  content_json TEXT CHECK (content_json IS NULL OR (json_valid(content_json) AND json_type(content_json) = 'object')),
  error_code TEXT CHECK (
    error_code IS NULL
    OR error_code IN ('generator_unavailable', 'generator_timeout', 'generator_rejected', 'invalid_generator_output', 'invalid_evidence_reference', 'generator_internal_error')
  ),
  failure_contract_version TEXT CHECK (failure_contract_version IS NULL OR length(trim(failure_contract_version)) > 0),
  retryable INTEGER CHECK (retryable IS NULL OR (typeof(retryable) = 'integer' AND retryable IN (0, 1))),
  error_message TEXT CHECK (error_message IS NULL OR length(trim(error_message)) > 0),
  FOREIGN KEY (workspace_id, explanation_attempt_id) REFERENCES comparison_explanation_attempt (workspace_id, id) ON DELETE RESTRICT,
  CHECK (
    (status = 'succeeded'
      AND content_json IS NOT NULL
      AND error_code IS NULL AND failure_contract_version IS NULL AND retryable IS NULL AND error_message IS NULL)
    OR (status = 'failed'
      AND content_json IS NULL
      AND error_code IS NOT NULL AND failure_contract_version IS NOT NULL AND retryable IS NOT NULL AND error_message IS NOT NULL)
  ),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, explanation_attempt_id)
);

CREATE TABLE IF NOT EXISTS comparison_archive_event (
  id TEXT PRIMARY KEY CHECK (${_uuid("id")}),
  workspace_id TEXT NOT NULL,
  comparison_run_id TEXT NOT NULL,
  event_sequence INTEGER NOT NULL CHECK (typeof(event_sequence) = 'integer' AND event_sequence >= 1),
  operation TEXT NOT NULL CHECK (operation IN ('archived', 'restored')),
  operation_fingerprint TEXT NOT NULL CHECK (length(operation_fingerprint) = 64 AND operation_fingerprint NOT GLOB '*[^0-9a-f]*'),
  idempotency_key TEXT NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  reason TEXT CHECK (reason IS NULL OR length(trim(reason)) > 0),
  actor TEXT NOT NULL CHECK (length(trim(actor)) > 0),
  occurred_at TEXT NOT NULL CHECK (${_ts("occurred_at")}),
  FOREIGN KEY (workspace_id, comparison_run_id) REFERENCES comparison_run (workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, comparison_run_id, event_sequence),
  UNIQUE (workspace_id, comparison_run_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_comparison_archive_run
  ON comparison_archive_event (workspace_id, comparison_run_id, event_sequence);
`;

export default {
  version: 5,
  name: "portrait_comparison",
  up(db: DatabaseSync): void {
    db.exec(COMPARISON_DDL);
  },
};

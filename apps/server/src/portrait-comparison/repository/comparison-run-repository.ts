// Comparison Run repository — raw SQL persistence for V005 core tables.
// All functions accept a DatabaseSync handle; no transaction management here.

import type { DatabaseSync } from "node:sqlite";
import { ComparisonStateError } from "../application/errors.js";
import type {
  ComparisonRunRow,
  ComparisonParticipantRow,
  ComparisonPortraitSourceRow,
  ComparisonDimensionEvidenceRow,
  ComparisonDimensionAssessmentRow,
  ComparisonExplanationAttemptRow,
  ComparisonExplanationOutcomeRow,
  ComparisonArchiveEventRow,
  ComparisonRunGraph,
} from "./types.js";

// ---------------------------------------------------------------------------
// Insert full aggregate graph (run + 2 participants + 2 sources + evidence + assessments)
// ---------------------------------------------------------------------------

export function insertComparisonRunGraph(
  db: DatabaseSync,
  graph: ComparisonRunGraph,
  faultHook?: (stage: string) => void,
): void {
  const run = graph.run;
  db.prepare(`
    INSERT INTO comparison_run (
      id, workspace_id, mode, similarity_score, coverage,
      quality_status, quality_reasons_json,
      algorithm_id, algorithm_version, algorithm_config_checksum,
      quality_policy_id, quality_policy_version, quality_policy_config_checksum,
      comparison_contract_id, comparison_contract_version, comparison_contract_checksum,
      idempotency_key, request_fingerprint, created_at, created_by, created_by_display_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.id, run.workspaceId, run.mode, run.similarityScore, run.coverage,
    run.qualityStatus, run.qualityReasonsJson,
    run.algorithmId, run.algorithmVersion, run.algorithmConfigChecksum,
    run.qualityPolicyId, run.qualityPolicyVersion, run.qualityPolicyConfigChecksum,
    run.comparisonContractId, run.comparisonContractVersion, run.comparisonContractChecksum,
    run.idempotencyKey, run.requestFingerprint, run.createdAt, run.createdBy, run.createdByDisplayName,
  );
  faultHook?.("after_run_insert");

  const participantStmt = db.prepare(`
    INSERT INTO comparison_participant (
      id, workspace_id, comparison_run_id, role, family, object_type, object_id, display_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const p of graph.participants) {
    participantStmt.run(p.id, p.workspaceId, p.comparisonRunId, p.role, p.family, p.objectType, p.objectId, p.displayName);
  }
  faultHook?.("after_participants_insert");

  const sourceStmt = db.prepare(`
    INSERT INTO comparison_portrait_source (
      id, workspace_id, participant_id, source_system, source_contract_version,
      snapshot_id, data_version, period_start, period_end, source_generated_at,
      source_batch_id, sample_size, confidence, quality_status, source_flags_json, policy_reasons_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of graph.portraitSources) {
    sourceStmt.run(
      s.id, s.workspaceId, s.participantId, s.sourceSystem, s.sourceContractVersion,
      s.snapshotId, s.dataVersion, s.periodStart, s.periodEnd, s.sourceGeneratedAt,
      s.sourceBatchId, s.sampleSize, s.confidence, s.qualityStatus, s.sourceFlagsJson, s.policyReasonsJson,
    );
  }
  faultHook?.("after_sources_insert");

  const evidenceStmt = db.prepare(`
    INSERT INTO comparison_dimension_evidence (
      id, workspace_id, participant_id, dimension_key, dimension_label,
      value, unit, quality_status, source_flags_json, policy_reasons_json, evidence_refs_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const e of graph.dimensionEvidence) {
    evidenceStmt.run(
      e.id, e.workspaceId, e.participantId, e.dimensionKey, e.dimensionLabel,
      e.value, e.unit, e.qualityStatus, e.sourceFlagsJson, e.policyReasonsJson, e.evidenceRefsJson,
    );
  }
  faultHook?.("after_evidence_insert");

  const assessmentStmt = db.prepare(`
    INSERT INTO comparison_dimension_assessment (
      id, workspace_id, comparison_run_id, dimension_key, dimension_label, expected_unit, weight,
      participation, exclusion_reason, baseline_evidence_id, comparison_evidence_id,
      baseline_normalized_value, comparison_normalized_value, raw_delta, normalized_delta,
      dimension_similarity, weighted_contribution
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of graph.dimensionAssessments) {
    assessmentStmt.run(
      a.id, a.workspaceId, a.comparisonRunId, a.dimensionKey, a.dimensionLabel, a.expectedUnit, a.weight,
      a.participation, a.exclusionReason, a.baselineEvidenceId, a.comparisonEvidenceId,
      a.baselineNormalizedValue, a.comparisonNormalizedValue, a.rawDelta, a.normalizedDelta,
      a.dimensionSimilarity, a.weightedContribution,
    );
  }
  faultHook?.("after_assessments_insert");
}

// ---------------------------------------------------------------------------
// Idempotency lookup
// ---------------------------------------------------------------------------

export interface IdempotencyRecord {
  readonly runId: string;
  readonly requestFingerprint: string;
}

export function findRunByIdempotencyKey(
  db: DatabaseSync,
  workspaceId: string,
  idempotencyKey: string,
): IdempotencyRecord | null {
  const row = db.prepare(`
    SELECT id, request_fingerprint FROM comparison_run
    WHERE workspace_id = ? AND idempotency_key = ?
  `).get(workspaceId, idempotencyKey) as Record<string, unknown> | undefined;
  if (row === undefined) return null;
  return { runId: String(row["id"]), requestFingerprint: String(row["request_fingerprint"]) };
}

// ---------------------------------------------------------------------------
// Workspace lookup (for cross-workspace guards)
// ---------------------------------------------------------------------------

export function findRunWorkspaceId(db: DatabaseSync, runId: string): string | null {
  const row = db.prepare("SELECT workspace_id FROM comparison_run WHERE id = ?").get(runId) as Record<string, unknown> | undefined;
  if (row === undefined) return null;
  return String(row["workspace_id"]);
}

// ---------------------------------------------------------------------------
// List read model (cursor-based pagination)
// ---------------------------------------------------------------------------

export interface ComparisonRunListRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly mode: string;
  readonly similarityScore: number;
  readonly coverage: number;
  readonly qualityStatus: string;
  readonly createdAt: string;
}

export interface ListComparisonRunsOptions {
  readonly workspaceId: string;
  readonly limit: number;
  readonly afterCreatedAt?: string;
  readonly afterRunId?: string;
  readonly archiveFilter?: "active" | "archived" | "all";
}

export function listComparisonRuns(
  db: DatabaseSync,
  options: ListComparisonRunsOptions,
): ComparisonRunListRow[] {
  const archiveFilter = options.archiveFilter ?? "active";
  let sql: string;
  const params: (string | number)[] = [options.workspaceId];

  if (archiveFilter === "active") {
    sql = `
      SELECT r.id, r.workspace_id, r.mode, r.similarity_score, r.coverage,
             r.quality_status, r.created_at
      FROM comparison_run r
      WHERE r.workspace_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM comparison_archive_event a
          WHERE a.workspace_id = r.workspace_id AND a.comparison_run_id = r.id
            AND a.event_sequence = (
              SELECT MAX(a2.event_sequence) FROM comparison_archive_event a2
              WHERE a2.workspace_id = r.workspace_id AND a2.comparison_run_id = r.id
            )
            AND a.operation = 'archived'
        )
    `;
  } else if (archiveFilter === "archived") {
    sql = `
      SELECT r.id, r.workspace_id, r.mode, r.similarity_score, r.coverage,
             r.quality_status, r.created_at
      FROM comparison_run r
      WHERE r.workspace_id = ?
        AND EXISTS (
          SELECT 1 FROM comparison_archive_event a
          WHERE a.workspace_id = r.workspace_id AND a.comparison_run_id = r.id
            AND a.event_sequence = (
              SELECT MAX(a2.event_sequence) FROM comparison_archive_event a2
              WHERE a2.workspace_id = r.workspace_id AND a2.comparison_run_id = r.id
            )
            AND a.operation = 'archived'
        )
    `;
  } else {
    sql = `
      SELECT r.id, r.workspace_id, r.mode, r.similarity_score, r.coverage,
             r.quality_status, r.created_at
      FROM comparison_run r
      WHERE r.workspace_id = ?
    `;
  }

  if (options.afterCreatedAt !== undefined && options.afterRunId !== undefined) {
    sql += ` AND (r.created_at, r.id) < (?, ?)`;
    params.push(options.afterCreatedAt, options.afterRunId);
  }

  sql += ` ORDER BY r.created_at DESC, r.id DESC LIMIT ?`;
  params.push(options.limit);

  const rows = db.prepare(sql).all(...params as unknown as import("node:sqlite").SQLInputValue[]) as Record<string, unknown>[];
  return rows.map(mapListRow);
}

// ---------------------------------------------------------------------------
// Detail read model (full 8-table aggregation)
// ---------------------------------------------------------------------------

export interface ComparisonRunDetail {
  readonly run: ComparisonRunRow;
  readonly baseline: {
    readonly participant: ComparisonParticipantRow;
    readonly source: ComparisonPortraitSourceRow;
  };
  readonly comparison: {
    readonly participant: ComparisonParticipantRow;
    readonly source: ComparisonPortraitSourceRow;
  };
  readonly dimensionEvidence: readonly ComparisonDimensionEvidenceRow[];
  readonly dimensionAssessments: readonly ComparisonDimensionAssessmentRow[];
  readonly explanationAttempts: readonly ComparisonExplanationAttemptRow[];
  readonly explanationOutcomes: readonly ComparisonExplanationOutcomeRow[];
  readonly archiveEvents: readonly ComparisonArchiveEventRow[];
}

export function getComparisonRunDetail(
  db: DatabaseSync,
  workspaceId: string,
  runId: string,
): ComparisonRunDetail | null {
  const runRow = db.prepare(`
    SELECT * FROM comparison_run WHERE workspace_id = ? AND id = ?
  `).get(workspaceId, runId) as Record<string, unknown> | undefined;
  if (runRow === undefined) return null;

  const run = mapRunRow(runRow);

  const participantRows = db.prepare(`
    SELECT * FROM comparison_participant WHERE workspace_id = ? AND comparison_run_id = ? ORDER BY role
  `).all(workspaceId, runId) as Record<string, unknown>[];
  // Run exists but participant cardinality is corrupted — this is a state
  // violation, not a not-found; fail closed instead of masquerading as null.
  if (participantRows.length !== 2) {
    throw new ComparisonStateError(`corrupted aggregate: expected 2 participants, found ${participantRows.length}`);
  }

  const baselineRow = participantRows.find((r) => r["role"] === "baseline");
  const comparisonRow = participantRows.find((r) => r["role"] === "comparison");
  if (baselineRow === undefined || comparisonRow === undefined) {
    throw new ComparisonStateError("corrupted aggregate: missing baseline or comparison participant role");
  }

  const baselineParticipant = mapParticipantRow(baselineRow);
  const comparisonParticipant = mapParticipantRow(comparisonRow);

  const sourceForParticipant = (participantId: string): ComparisonPortraitSourceRow | null => {
    const row = db.prepare(`
      SELECT * FROM comparison_portrait_source WHERE workspace_id = ? AND participant_id = ?
    `).get(workspaceId, participantId) as Record<string, unknown> | undefined;
    return row === undefined ? null : mapSourceRow(row);
  };

  const baselineSource = sourceForParticipant(baselineParticipant.id);
  const comparisonSource = sourceForParticipant(comparisonParticipant.id);
  if (baselineSource === null || comparisonSource === null) {
    throw new ComparisonStateError("corrupted aggregate: missing portrait source for participant");
  }

  const evidenceRows = db.prepare(`
    SELECT * FROM comparison_dimension_evidence WHERE workspace_id = ?
    AND participant_id IN (?, ?) ORDER BY participant_id, dimension_key
  `).all(workspaceId, baselineParticipant.id, comparisonParticipant.id) as Record<string, unknown>[];

  const assessmentRows = db.prepare(`
    SELECT * FROM comparison_dimension_assessment WHERE workspace_id = ? AND comparison_run_id = ?
    ORDER BY dimension_key
  `).all(workspaceId, runId) as Record<string, unknown>[];

  const attemptRows = db.prepare(`
    SELECT * FROM comparison_explanation_attempt WHERE workspace_id = ? AND comparison_run_id = ?
    ORDER BY attempt_sequence ASC
  `).all(workspaceId, runId) as Record<string, unknown>[];

  const outcomeRows = db.prepare(`
    SELECT o.* FROM comparison_explanation_outcome o
    JOIN comparison_explanation_attempt a ON a.id = o.explanation_attempt_id AND a.workspace_id = o.workspace_id
    WHERE o.workspace_id = ? AND a.comparison_run_id = ?
    ORDER BY a.attempt_sequence ASC
  `).all(workspaceId, runId) as Record<string, unknown>[];

  const archiveRows = db.prepare(`
    SELECT * FROM comparison_archive_event WHERE workspace_id = ? AND comparison_run_id = ?
    ORDER BY event_sequence ASC
  `).all(workspaceId, runId) as Record<string, unknown>[];

  return {
    run,
    baseline: { participant: baselineParticipant, source: baselineSource },
    comparison: { participant: comparisonParticipant, source: comparisonSource },
    dimensionEvidence: evidenceRows.map(mapEvidenceRow),
    dimensionAssessments: assessmentRows.map(mapAssessmentRow),
    explanationAttempts: attemptRows.map(mapAttemptRow),
    explanationOutcomes: outcomeRows.map(mapOutcomeRow),
    archiveEvents: archiveRows.map(mapArchiveEventRow),
  };
}

// ---------------------------------------------------------------------------
// Record existence check (for explanation manifest validation)
// ---------------------------------------------------------------------------

export type ManifestRecordType =
  | "comparison_run"
  | "comparison_participant"
  | "comparison_portrait_source"
  | "comparison_dimension_evidence"
  | "comparison_dimension_assessment";

export function comparisonRecordExists(
  db: DatabaseSync,
  workspaceId: string,
  runId: string,
  recordType: ManifestRecordType,
  recordId: string,
): boolean {
  const exists = (sql: string, params: unknown[]): boolean =>
    db.prepare(sql).get(...params as unknown as import("node:sqlite").SQLInputValue[]) !== undefined;
  switch (recordType) {
    case "comparison_run":
      return recordId === runId && exists(
        "SELECT 1 FROM comparison_run WHERE workspace_id = ? AND id = ?",
        [workspaceId, recordId],
      );
    case "comparison_participant":
      return exists(
        "SELECT 1 FROM comparison_participant WHERE workspace_id = ? AND comparison_run_id = ? AND id = ?",
        [workspaceId, runId, recordId],
      );
    case "comparison_portrait_source":
      return exists(
        `SELECT 1 FROM comparison_portrait_source s
         JOIN comparison_participant p ON p.id = s.participant_id AND p.workspace_id = s.workspace_id
         WHERE s.workspace_id = ? AND p.comparison_run_id = ? AND s.id = ?`,
        [workspaceId, runId, recordId],
      );
    case "comparison_dimension_evidence":
      return exists(
        `SELECT 1 FROM comparison_dimension_evidence e
         JOIN comparison_participant p ON p.id = e.participant_id AND p.workspace_id = e.workspace_id
         WHERE e.workspace_id = ? AND p.comparison_run_id = ? AND e.id = ?`,
        [workspaceId, runId, recordId],
      );
    case "comparison_dimension_assessment":
      return exists(
        "SELECT 1 FROM comparison_dimension_assessment WHERE workspace_id = ? AND comparison_run_id = ? AND id = ?",
        [workspaceId, runId, recordId],
      );
  }
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapRunRow(row: Record<string, unknown>): ComparisonRunRow {
  return {
    id: String(row["id"]),
    workspaceId: String(row["workspace_id"]),
    mode: String(row["mode"]),
    similarityScore: Number(row["similarity_score"]),
    coverage: Number(row["coverage"]),
    qualityStatus: String(row["quality_status"]),
    qualityReasonsJson: String(row["quality_reasons_json"]),
    algorithmId: String(row["algorithm_id"]),
    algorithmVersion: String(row["algorithm_version"]),
    algorithmConfigChecksum: String(row["algorithm_config_checksum"]),
    qualityPolicyId: String(row["quality_policy_id"]),
    qualityPolicyVersion: String(row["quality_policy_version"]),
    qualityPolicyConfigChecksum: String(row["quality_policy_config_checksum"]),
    comparisonContractId: String(row["comparison_contract_id"]),
    comparisonContractVersion: String(row["comparison_contract_version"]),
    comparisonContractChecksum: String(row["comparison_contract_checksum"]),
    idempotencyKey: String(row["idempotency_key"]),
    requestFingerprint: String(row["request_fingerprint"]),
    createdAt: String(row["created_at"]),
    createdBy: String(row["created_by"]),
    createdByDisplayName: row["created_by_display_name"] === null ? null : String(row["created_by_display_name"]),
  };
}

function mapParticipantRow(row: Record<string, unknown>): ComparisonParticipantRow {
  return {
    id: String(row["id"]),
    workspaceId: String(row["workspace_id"]),
    comparisonRunId: String(row["comparison_run_id"]),
    role: String(row["role"]),
    family: String(row["family"]),
    objectType: String(row["object_type"]),
    objectId: String(row["object_id"]),
    displayName: String(row["display_name"]),
  };
}

function mapSourceRow(row: Record<string, unknown>): ComparisonPortraitSourceRow {
  return {
    id: String(row["id"]),
    workspaceId: String(row["workspace_id"]),
    participantId: String(row["participant_id"]),
    sourceSystem: String(row["source_system"]),
    sourceContractVersion: String(row["source_contract_version"]),
    snapshotId: String(row["snapshot_id"]),
    dataVersion: String(row["data_version"]),
    periodStart: String(row["period_start"]),
    periodEnd: String(row["period_end"]),
    sourceGeneratedAt: String(row["source_generated_at"]),
    sourceBatchId: row["source_batch_id"] === null ? null : String(row["source_batch_id"]),
    sampleSize: row["sample_size"] === null ? null : Number(row["sample_size"]),
    confidence: row["confidence"] === null ? null : Number(row["confidence"]),
    qualityStatus: String(row["quality_status"]),
    sourceFlagsJson: String(row["source_flags_json"]),
    policyReasonsJson: String(row["policy_reasons_json"]),
  };
}

function mapEvidenceRow(row: Record<string, unknown>): ComparisonDimensionEvidenceRow {
  return {
    id: String(row["id"]),
    workspaceId: String(row["workspace_id"]),
    participantId: String(row["participant_id"]),
    dimensionKey: String(row["dimension_key"]),
    dimensionLabel: String(row["dimension_label"]),
    value: Number(row["value"]),
    unit: String(row["unit"]),
    qualityStatus: String(row["quality_status"]),
    sourceFlagsJson: String(row["source_flags_json"]),
    policyReasonsJson: String(row["policy_reasons_json"]),
    evidenceRefsJson: String(row["evidence_refs_json"]),
  };
}

function mapAssessmentRow(row: Record<string, unknown>): ComparisonDimensionAssessmentRow {
  return {
    id: String(row["id"]),
    workspaceId: String(row["workspace_id"]),
    comparisonRunId: String(row["comparison_run_id"]),
    dimensionKey: String(row["dimension_key"]),
    dimensionLabel: String(row["dimension_label"]),
    expectedUnit: String(row["expected_unit"]),
    weight: Number(row["weight"]),
    participation: String(row["participation"]),
    exclusionReason: row["exclusion_reason"] === null ? null : String(row["exclusion_reason"]),
    baselineEvidenceId: row["baseline_evidence_id"] === null ? null : String(row["baseline_evidence_id"]),
    comparisonEvidenceId: row["comparison_evidence_id"] === null ? null : String(row["comparison_evidence_id"]),
    baselineNormalizedValue: row["baseline_normalized_value"] === null ? null : Number(row["baseline_normalized_value"]),
    comparisonNormalizedValue: row["comparison_normalized_value"] === null ? null : Number(row["comparison_normalized_value"]),
    rawDelta: row["raw_delta"] === null ? null : Number(row["raw_delta"]),
    normalizedDelta: row["normalized_delta"] === null ? null : Number(row["normalized_delta"]),
    dimensionSimilarity: row["dimension_similarity"] === null ? null : Number(row["dimension_similarity"]),
    weightedContribution: row["weighted_contribution"] === null ? null : Number(row["weighted_contribution"]),
  };
}

function mapAttemptRow(row: Record<string, unknown>): ComparisonExplanationAttemptRow {
  return {
    id: String(row["id"]),
    workspaceId: String(row["workspace_id"]),
    comparisonRunId: String(row["comparison_run_id"]),
    attemptSequence: Number(row["attempt_sequence"]),
    generatorType: String(row["generator_type"]),
    generatorId: String(row["generator_id"]),
    generatorVersion: String(row["generator_version"]),
    explanationContractVersion: String(row["explanation_contract_version"]),
    evidenceManifestJson: String(row["evidence_manifest_json"]),
    evidenceManifestChecksum: String(row["evidence_manifest_checksum"]),
    startedAt: String(row["started_at"]),
    actor: String(row["actor"]),
  };
}

function mapOutcomeRow(row: Record<string, unknown>): ComparisonExplanationOutcomeRow {
  return {
    id: String(row["id"]),
    workspaceId: String(row["workspace_id"]),
    explanationAttemptId: String(row["explanation_attempt_id"]),
    status: String(row["status"]),
    completedAt: String(row["completed_at"]),
    contentJson: row["content_json"] === null ? null : String(row["content_json"]),
    errorCode: row["error_code"] === null ? null : String(row["error_code"]),
    failureContractVersion: row["failure_contract_version"] === null ? null : String(row["failure_contract_version"]),
    retryable: row["retryable"] === null ? null : Number(row["retryable"]),
    errorMessage: row["error_message"] === null ? null : String(row["error_message"]),
  };
}

function mapArchiveEventRow(row: Record<string, unknown>): ComparisonArchiveEventRow {
  return {
    id: String(row["id"]),
    workspaceId: String(row["workspace_id"]),
    comparisonRunId: String(row["comparison_run_id"]),
    eventSequence: Number(row["event_sequence"]),
    operation: String(row["operation"]),
    operationFingerprint: String(row["operation_fingerprint"]),
    idempotencyKey: String(row["idempotency_key"]),
    reason: row["reason"] === null ? null : String(row["reason"]),
    actor: String(row["actor"]),
    occurredAt: String(row["occurred_at"]),
  };
}

function mapListRow(row: Record<string, unknown>): ComparisonRunListRow {
  return {
    id: String(row["id"]),
    workspaceId: String(row["workspace_id"]),
    mode: String(row["mode"]),
    similarityScore: Number(row["similarity_score"]),
    coverage: Number(row["coverage"]),
    qualityStatus: String(row["quality_status"]),
    createdAt: String(row["created_at"]),
  };
}

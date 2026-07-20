// Explanation repository — raw SQL for comparison_explanation_attempt/outcome.

import type { DatabaseSync } from "node:sqlite";
import type { ComparisonExplanationAttemptRow, ComparisonExplanationOutcomeRow } from "./types.js";

export function insertExplanationAttempt(db: DatabaseSync, row: ComparisonExplanationAttemptRow): void {
  db.prepare(`
    INSERT INTO comparison_explanation_attempt (
      id, workspace_id, comparison_run_id, attempt_sequence,
      generator_type, generator_id, generator_version, explanation_contract_version,
      evidence_manifest_json, evidence_manifest_checksum, started_at, actor
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.workspaceId, row.comparisonRunId, row.attemptSequence,
    row.generatorType, row.generatorId, row.generatorVersion, row.explanationContractVersion,
    row.evidenceManifestJson, row.evidenceManifestChecksum, row.startedAt, row.actor,
  );
}

export function insertExplanationOutcome(db: DatabaseSync, row: ComparisonExplanationOutcomeRow): void {
  db.prepare(`
    INSERT INTO comparison_explanation_outcome (
      id, workspace_id, explanation_attempt_id, status, completed_at,
      content_json, error_code, failure_contract_version, retryable, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.workspaceId, row.explanationAttemptId, row.status, row.completedAt,
    row.contentJson, row.errorCode, row.failureContractVersion, row.retryable, row.errorMessage,
  );
}

export function findExplanationAttempt(
  db: DatabaseSync,
  workspaceId: string,
  attemptId: string,
): ComparisonExplanationAttemptRow | null {
  const row = db.prepare(`
    SELECT * FROM comparison_explanation_attempt WHERE workspace_id = ? AND id = ?
  `).get(workspaceId, attemptId) as Record<string, unknown> | undefined;
  if (row === undefined) return null;
  return mapAttemptRow(row);
}

export function findOutcomeByAttemptId(
  db: DatabaseSync,
  workspaceId: string,
  attemptId: string,
): ComparisonExplanationOutcomeRow | null {
  const row = db.prepare(`
    SELECT * FROM comparison_explanation_outcome WHERE workspace_id = ? AND explanation_attempt_id = ?
  `).get(workspaceId, attemptId) as Record<string, unknown> | undefined;
  if (row === undefined) return null;
  return mapOutcomeRow(row);
}

export function getMaxAttemptSequence(db: DatabaseSync, workspaceId: string, runId: string): number | null {
  const row = db.prepare(`
    SELECT MAX(attempt_sequence) AS max_seq FROM comparison_explanation_attempt
    WHERE workspace_id = ? AND comparison_run_id = ?
  `).get(workspaceId, runId) as Record<string, unknown> | undefined;
  const value = (row as Record<string, unknown> | undefined)?.["max_seq"];
  return value === null || value === undefined ? null : Number(value);
}

export function listAttemptsWithOutcomes(
  db: DatabaseSync,
  workspaceId: string,
  runId: string,
): Array<{ attempt: ComparisonExplanationAttemptRow; outcome: ComparisonExplanationOutcomeRow | null }> {
  const rows = db.prepare(`
    SELECT a.*, o.id AS outcome_id, o.status AS outcome_status, o.completed_at AS outcome_completed_at,
           o.content_json AS outcome_content_json, o.error_code AS outcome_error_code,
           o.failure_contract_version AS outcome_failure_contract_version,
           o.retryable AS outcome_retryable, o.error_message AS outcome_error_message
    FROM comparison_explanation_attempt a
    LEFT JOIN comparison_explanation_outcome o
      ON o.explanation_attempt_id = a.id AND o.workspace_id = a.workspace_id
    WHERE a.workspace_id = ? AND a.comparison_run_id = ?
    ORDER BY a.attempt_sequence ASC
  `).all(workspaceId, runId) as Record<string, unknown>[];

  return rows.map((row) => {
    const attempt = mapAttemptRow(row);
    const outcome = row["outcome_id"] === null ? null : mapOutcomeRow({
      id: row["outcome_id"],
      workspace_id: row["workspace_id"],
      explanation_attempt_id: attempt.id,
      status: row["outcome_status"],
      completed_at: row["outcome_completed_at"],
      content_json: row["outcome_content_json"],
      error_code: row["outcome_error_code"],
      failure_contract_version: row["outcome_failure_contract_version"],
      retryable: row["outcome_retryable"],
      error_message: row["outcome_error_message"],
    });
    return { attempt, outcome };
  });
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

// Archive repository — raw SQL for comparison_archive_event.

import type { DatabaseSync } from "node:sqlite";
import type { ComparisonArchiveEventRow } from "./types.js";

export function insertArchiveEvent(db: DatabaseSync, row: ComparisonArchiveEventRow): void {
  db.prepare(`
    INSERT INTO comparison_archive_event (
      id, workspace_id, comparison_run_id, event_sequence,
      operation, operation_fingerprint, idempotency_key, reason, actor, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.workspaceId, row.comparisonRunId, row.eventSequence,
    row.operation, row.operationFingerprint, row.idempotencyKey, row.reason, row.actor, row.occurredAt,
  );
}

export function findArchiveEventByIdempotencyKey(
  db: DatabaseSync,
  workspaceId: string,
  runId: string,
  idempotencyKey: string,
): ComparisonArchiveEventRow | null {
  const row = db.prepare(`
    SELECT * FROM comparison_archive_event
    WHERE workspace_id = ? AND comparison_run_id = ? AND idempotency_key = ?
  `).get(workspaceId, runId, idempotencyKey) as Record<string, unknown> | undefined;
  if (row === undefined) return null;
  return mapArchiveEventRow(row);
}

export function getMaxArchiveSequence(db: DatabaseSync, workspaceId: string, runId: string): number | null {
  const row = db.prepare(`
    SELECT MAX(event_sequence) AS max_seq FROM comparison_archive_event
    WHERE workspace_id = ? AND comparison_run_id = ?
  `).get(workspaceId, runId) as Record<string, unknown> | undefined;
  const value = (row as Record<string, unknown> | undefined)?.["max_seq"];
  return value === null || value === undefined ? null : Number(value);
}

export function getLatestArchiveEvent(
  db: DatabaseSync,
  workspaceId: string,
  runId: string,
): ComparisonArchiveEventRow | null {
  const row = db.prepare(`
    SELECT * FROM comparison_archive_event
    WHERE workspace_id = ? AND comparison_run_id = ?
    ORDER BY event_sequence DESC LIMIT 1
  `).get(workspaceId, runId) as Record<string, unknown> | undefined;
  if (row === undefined) return null;
  return mapArchiveEventRow(row);
}

export function listArchiveEvents(
  db: DatabaseSync,
  workspaceId: string,
  runId: string,
): ComparisonArchiveEventRow[] {
  const rows = db.prepare(`
    SELECT * FROM comparison_archive_event
    WHERE workspace_id = ? AND comparison_run_id = ?
    ORDER BY event_sequence ASC
  `).all(workspaceId, runId) as Record<string, unknown>[];
  return rows.map(mapArchiveEventRow);
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

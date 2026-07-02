import type { DatabaseSync } from "node:sqlite";

interface AuditEventInput {
  workspaceId: string;
  actor: string;
  requestId: string;
  taskId?: string;
  resourceType: string;
  resourceId?: string;
  event: string;
  fromStatus?: string;
  toStatus?: string;
  reasonCode?: string;
  attempt?: number;
  meta?: Record<string, unknown>;
  admissionStage?: string;
}

export function writeAudit(
  db: DatabaseSync,
  input: AuditEventInput
): string {
  const auditId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(`
    INSERT INTO audit_event (audit_id, workspace_id, actor, request_id, task_id,
      resource_type, resource_id, event, from_status, to_status, reason_code,
      attempt, meta, safety_stage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    auditId,
    input.workspaceId,
    input.actor,
    input.requestId,
    input.taskId ?? null,
    input.resourceType,
    input.resourceId ?? null,
    input.event,
    input.fromStatus ?? null,
    input.toStatus ?? null,
    input.reasonCode ?? null,
    input.attempt ?? null,
    JSON.stringify(input.meta ?? {}),
    input.admissionStage ?? null
  );
  return auditId;
}

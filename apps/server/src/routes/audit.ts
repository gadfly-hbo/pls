import { Hono } from "hono";
import { openDb } from "../db/connection.js";
import { ok } from "../lib/response.js";

const audit = new Hono();

// GET /audit
audit.get("/", (c) => {
  const wsId = c.get("workspaceId");
  const resourceType = c.req.query("resourceType");
  const resourceId = c.req.query("resourceId");
  const actor = c.req.query("actor");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const cursor = c.req.query("cursor");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);

  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params: (string | number | null)[] = [wsId];

  if (resourceType) {
    conditions.push("resource_type = ?");
    params.push(resourceType);
  }
  if (resourceId) {
    conditions.push("resource_id = ?");
    params.push(resourceId);
  }
  if (actor) {
    conditions.push("actor = ?");
    params.push(actor);
  }
  if (from) {
    conditions.push("occurred_at >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("occurred_at <= ?");
    params.push(to);
  }
  if (cursor) {
    conditions.push("occurred_at < ?");
    params.push(cursor);
  }

  const rows = db
    .prepare(
      `SELECT * FROM audit_event WHERE ${conditions.join(" AND ")} ORDER BY occurred_at DESC LIMIT ?`
    )
    .all(...params, pageSize + 1) as Array<Record<string, unknown>>;

  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map((row) => ({
    auditId: row.audit_id,
    workspaceId: row.workspace_id,
    actor: row.actor,
    action: row.event,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    requestId: row.request_id,
    modelVersion: row.meta ? (JSON.parse(row.meta as string) as Record<string, unknown>).modelVersion : null,
    safetyStage: row.safety_stage,
    occurredAt: row.occurred_at,
  }));

  db.close();
  return ok(c, {
    items,
    page: {
      cursor: null,
      nextCursor: hasMore ? (items[items.length - 1]?.occurredAt as string) ?? null : null,
      pageSize,
      hasMore,
    },
  });
});

export default audit;

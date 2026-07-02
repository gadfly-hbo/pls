import { Hono } from "hono";
import { openDb } from "../db/connection.js";
import { ok, notFound, conflict } from "../lib/response.js";
import { writeAudit } from "../lib/audit.js";

const tasks = new Hono();

// GET /tasks/:taskId
tasks.get("/:taskId", (c) => {
  const wsId = c.get("workspaceId");
  const taskId = c.req.param("taskId");
  const db = openDb(wsId);
  const row = db
    .prepare("SELECT * FROM task WHERE task_id = ? AND workspace_id = ?")
    .get(taskId, wsId) as Record<string, unknown> | undefined;
  db.close();

  if (!row) return notFound(c, `Task ${taskId} not found`);
  const error = row.error ? JSON.parse(row.error as string) : null;
  return ok(c, {
    taskId: row.task_id,
    workspaceId: row.workspace_id,
    taskType: row.task_type,
    status: row.status,
    resourceId: row.resource_id,
    modelVersion: row.model_version,
    input: JSON.parse(row.input as string),
    attempts: row.attempts,
    error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  });
});

// GET /tasks
tasks.get("/", (c) => {
  const wsId = c.get("workspaceId");
  const taskType = c.req.query("taskType");
  const status = c.req.query("status");
  const cursor = c.req.query("cursor");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);

  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params: (string | number | null)[] = [wsId];

  if (taskType) {
    conditions.push("task_type = ?");
    params.push(taskType);
  }
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  if (cursor) {
    conditions.push("created_at < ?");
    params.push(cursor);
  }

  const rows = db
    .prepare(
      `SELECT * FROM task WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT ?`
    )
    .all(...params, pageSize + 1) as Array<Record<string, unknown>>;

  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map((row) => {
    const error = row.error ? JSON.parse(row.error as string) : null;
    return {
      taskId: row.task_id,
      workspaceId: row.workspace_id,
      taskType: row.task_type,
      status: row.status,
      resourceId: row.resource_id,
      modelVersion: row.model_version,
      input: JSON.parse(row.input as string),
      attempts: row.attempts,
      error,
      createdAt: row.created_at,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    };
  });

  db.close();
  return ok(c, {
    items,
    page: {
      cursor: null,
      nextCursor: hasMore ? (items[items.length - 1]?.createdAt as string) ?? null : null,
      pageSize,
      hasMore,
    },
  });
});

// POST /tasks/:taskId/cancel
tasks.post("/:taskId/cancel", (c) => {
  const wsId = c.get("workspaceId");
  const taskId = c.req.param("taskId");
  const db = openDb(wsId);
  const row = db
    .prepare("SELECT status FROM task WHERE task_id = ? AND workspace_id = ?")
    .get(taskId, wsId) as Record<string, unknown> | undefined;
  if (!row) {
    db.close();
    return notFound(c, `Task ${taskId} not found`);
  }
  if (row.status !== "queued") {
    db.close();
    return conflict(c, `Task ${taskId} is in status ${row.status}, only queued tasks can be cancelled`);
  }

  db.prepare("UPDATE task SET status = 'cancelled', finished_at = datetime('now') WHERE task_id = ? AND workspace_id = ?")
    .run(taskId, wsId);

  writeAudit(db, {
    workspaceId: wsId,
    actor: "user:user_demo",
    requestId: c.get("requestId") ?? "",
    taskId,
    resourceType: "task",
    resourceId: taskId,
    event: "cancel",
    fromStatus: "queued",
    toStatus: "cancelled",
  });

  db.close();
  return ok(c, { taskId, status: "cancelled" });
});

export default tasks;

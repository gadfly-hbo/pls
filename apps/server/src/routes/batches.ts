import { Hono } from "hono";
import { openDb } from "../db/connection.js";
import { ok, accepted, notFound, invalidInput } from "../lib/response.js";
import { writeAudit } from "../lib/audit.js";
import { idempotencyMiddleware, readJson, storeIdempotent } from "../lib/idempotency.js";

const batches = new Hono();

// POST /batches
// Content-type handling:
//  - application/json → body = { meta: {...} } (also accepts { meta: "<json>" })
//    This path is idempotency-eligible; the middleware hashes the raw JSON body.
//  - multipart/form-data → legacy path: body.meta is a JSON string, plus files.
//    The middleware short-circuits for non-JSON so idempotency is skipped here.
batches.post("/", idempotencyMiddleware(), async (c) => {
  const wsId = c.get("workspaceId");
  const contentType = (c.req.header("content-type") ?? "").toLowerCase();

  let meta: Record<string, unknown>;
  if (contentType.startsWith("application/json")) {
    const body = await readJson<{ meta?: Record<string, unknown> | string }>(c);
    const metaField = body.meta;
    if (metaField === undefined || metaField === null) {
      return invalidInput(c, "meta field is required", "meta");
    }
    if (typeof metaField === "string") {
      try {
        meta = JSON.parse(metaField) as Record<string, unknown>;
      } catch {
        return invalidInput(c, "meta must be valid JSON", "meta");
      }
    } else {
      meta = metaField;
    }
  } else {
    const form = await c.req.parseBody();
    const metaStr = form.meta as string | undefined;
    if (!metaStr) return invalidInput(c, "meta field is required", "meta");
    try {
      meta = JSON.parse(metaStr) as Record<string, unknown>;
    } catch {
      return invalidInput(c, "meta must be valid JSON", "meta");
    }
  }

  const batchType = meta.batchType as string | undefined;
  const source = meta.source as string | undefined;
  const sourceType = meta.sourceType as string | undefined;
  const timeWindow = meta.timeWindow as string | undefined;

  if (!batchType) return invalidInput(c, "meta.batchType is required", "batchType");
  if (!source) return invalidInput(c, "meta.source is required", "source");

  const db = openDb(wsId);
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const taskId = `task_batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  // Store batch
  db.prepare(`
    INSERT INTO batch (batch_id, workspace_id, batch_type, source, source_type, time_window, row_count, entity_counts, quality_report, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 0, '{}', '{}', ?)
  `).run(batchId, wsId, batchType, source, sourceType ?? null, timeWindow ?? null, "user_demo");

  // Store task
  db.prepare(`
    INSERT INTO task (task_id, workspace_id, task_type, status, resource_id, input, attempts, started_at, finished_at)
    VALUES (?, ?, 'batch_import', 'succeeded', ?, ?, 1, ?, ?)
  `).run(taskId, wsId, batchId, JSON.stringify({ batchId, batchType }), now, now);

  writeAudit(db, {
    workspaceId: wsId,
    actor: "user:user_demo",
    requestId: c.get("requestId") ?? "",
    taskId,
    resourceType: "batch",
    resourceId: batchId,
    event: "succeed",
    fromStatus: "queued",
    toStatus: "succeeded",
    admissionStage: "admission_ok",
    meta: { batchType, source },
  });

  db.close();

  return storeIdempotent(
    c,
    accepted(c, {
      task: { taskId, status: "succeeded", resourceUrl: `/api/v0/batches/${batchId}` },
    }),
    batchId
  );
});

// GET /batches/:batchId
batches.get("/:batchId", (c) => {
  const wsId = c.get("workspaceId");
  const batchId = c.req.param("batchId");
  const db = openDb(wsId);
  const row = db
    .prepare("SELECT * FROM batch WHERE batch_id = ? AND workspace_id = ?")
    .get(batchId, wsId) as Record<string, unknown> | undefined;
  db.close();

  if (!row) return notFound(c, `Batch ${batchId} not found`);
  return ok(c, {
    batchId: row.batch_id,
    workspaceId: row.workspace_id,
    batchType: row.batch_type,
    source: row.source,
    sourceType: row.source_type,
    timeWindow: row.time_window,
    rowCount: row.row_count,
    entityCounts: JSON.parse(row.entity_counts as string),
    qualityReport: JSON.parse(row.quality_report as string),
    createdAt: row.created_at,
    createdBy: row.created_by,
  });
});

// GET /batches
batches.get("/", (c) => {
  const wsId = c.get("workspaceId");
  const cursor = c.req.query("cursor");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);

  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params: (string | number | null)[] = [wsId];
  if (cursor) {
    conditions.push("created_at < ?");
    params.push(cursor);
  }

  const rows = db
    .prepare(
      `SELECT * FROM batch WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT ?`
    )
    .all(...params, pageSize + 1) as Array<Record<string, unknown>>;

  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map((row) => ({
    batchId: row.batch_id,
    workspaceId: row.workspace_id,
    batchType: row.batch_type,
    source: row.source,
    sourceType: row.source_type,
    timeWindow: row.time_window,
    rowCount: row.row_count,
    entityCounts: JSON.parse(row.entity_counts as string),
    qualityReport: JSON.parse(row.quality_report as string),
    createdAt: row.created_at,
    createdBy: row.created_by,
  }));

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

export default batches;

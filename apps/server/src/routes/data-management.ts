import { Hono } from "hono";
import type { Context } from "hono";
import { openDb } from "../db/connection.js";
import { ok, notFound, invalidInput, err } from "../lib/response.js";
import { adapterFor } from "../services/data-source-registry.js";

// A-P2-1: Data management foundation API.
//
// Generic, source-agnostic read surface for PLS data imports, versions,
// quality and audit. Write paths (HTTP import, version rollback) are
// reserved as 501 stubs — Phase 2 will wire them when the import pipeline
// contract is frozen.
//
// The API is NOT a douyin-BI-only surface. Every endpoint keys off the
// data_source registry; the adapter pattern hides where a given source's
// rows physically live.

const dm = new Hono();

interface DataSourceRow {
  source_id: string;
  workspace_id: string;
  source_kind: string;
  display_name: string | null;
  adapter: string;
  schema_prefix: string | null;
  status: string;
  description: string | null;
  config: string;
  created_at: string;
  updated_at: string;
}

function projectSource(row: DataSourceRow) {
  let config: Record<string, unknown> = {};
  try { config = JSON.parse(row.config ?? "{}"); } catch { config = {}; }
  return {
    sourceId: row.source_id,
    sourceKind: row.source_kind,
    displayName: row.display_name,
    adapter: row.adapter,
    schemaPrefix: row.schema_prefix,
    status: row.status,
    description: row.description,
    config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getSourceRow(db: ReturnType<typeof openDb>, wsId: string, sourceId: string) {
  return db
    .prepare("SELECT * FROM data_source WHERE source_id = ? AND workspace_id = ?")
    .get(sourceId, wsId) as DataSourceRow | undefined;
}

function writeAudit(
  db: ReturnType<typeof openDb>,
  wsId: string,
  requestId: string | undefined,
  resourceType: string,
  resourceId: string | null,
  meta: Record<string, unknown>
): void {
  db.prepare(`INSERT INTO audit_event (audit_id, workspace_id, actor, request_id, resource_type, resource_id, event, meta, occurred_at)
    VALUES (?, ?, 'api', ?, ?, ?, 'query', ?, datetime('now'))`).run(
    `au_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    wsId, requestId ?? null, resourceType, resourceId, JSON.stringify(meta ?? {}));
}

// ---------------------------------------------------------------------------
// GET /data-management/data-sources
// ---------------------------------------------------------------------------
dm.get("/data-sources", (c) => {
  const wsId = c.get("workspaceId");
  const status = c.req.query("status");
  const sourceKind = c.req.query("sourceKind");
  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params: (string | number)[] = [wsId];
  if (status) { conditions.push("status = ?"); params.push(status); }
  if (sourceKind) { conditions.push("source_kind = ?"); params.push(sourceKind); }
  const rows = db
    .prepare(`SELECT * FROM data_source WHERE ${conditions.join(" AND ")} ORDER BY source_id`)
    .all(...params) as unknown as DataSourceRow[];
  const items = rows.map(projectSource);
  writeAudit(db, wsId, c.get("requestId"), "bi_data_source", null,
    { count: items.length, status: status ?? null, sourceKind: sourceKind ?? null });
  db.close();
  return ok(c, { items });
});

// ---------------------------------------------------------------------------
// GET /data-management/data-sources/:sourceId
// ---------------------------------------------------------------------------
dm.get("/data-sources/:sourceId", (c) => {
  const wsId = c.get("workspaceId");
  const sourceId = c.req.param("sourceId");
  const db = openDb(wsId);
  const row = getSourceRow(db, wsId, sourceId);
  if (!row) { db.close(); return notFound(c, `Data source ${sourceId} not found`); }

  const adapter = adapterFor(row.adapter);
  const versions = adapter ? adapter.listVersions(db, wsId, sourceId) : { sourceId, versions: [], latestDataVersion: null };
  writeAudit(db, wsId, c.get("requestId"), "bi_data_source", sourceId, { hasVersions: true });
  db.close();
  return ok(c, { ...projectSource(row), versions });
});

// ---------------------------------------------------------------------------
// GET /data-management/import-batches
// Reads the existing batch table (authoritative import log) filtered by
// batch type. Generic — not douyin-only.
// ---------------------------------------------------------------------------
dm.get("/import-batches", (c) => {
  const wsId = c.get("workspaceId");
  const batchType = c.req.query("batchType");
  const sourceBatchId = c.req.query("sourceBatchId");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "50"), 200);
  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params: (string | number)[] = [wsId];
  if (batchType) { conditions.push("batch_type = ?"); params.push(batchType); }
  if (sourceBatchId) { conditions.push("source LIKE ?"); params.push(`%${sourceBatchId}%`); }
  const rows = db
    .prepare(`SELECT * FROM batch WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, pageSize) as Array<Record<string, unknown>>;
  const items = rows.map((r) => {
    let ec: Record<string, number> = {}; try { ec = JSON.parse((r.entity_counts as string) ?? "{}"); } catch { ec = {}; }
    let qr: Record<string, unknown> = {}; try { qr = JSON.parse((r.quality_report as string) ?? "{}"); } catch { qr = {}; }
    return {
      batchId: r.batch_id,
      workspaceId: r.workspace_id,
      batchType: r.batch_type,
      source: r.source,
      sourceType: r.source_type,
      timeWindow: r.time_window,
      rowCount: r.row_count,
      entityCounts: ec,
      qualityReport: qr,
      createdAt: r.created_at,
      createdBy: r.created_by,
    };
  });
  writeAudit(db, wsId, c.get("requestId"), "bi_batch", null,
    { count: items.length, batchType: batchType ?? null });
  db.close();
  return ok(c, { items });
});

// ---------------------------------------------------------------------------
// GET /data-management/import-batches/:batchId
// ---------------------------------------------------------------------------
dm.get("/import-batches/:batchId", (c) => {
  const wsId = c.get("workspaceId");
  const batchId = c.req.param("batchId");
  const db = openDb(wsId);
  const r = db
    .prepare("SELECT * FROM batch WHERE batch_id = ? AND workspace_id = ?")
    .get(batchId, wsId) as Record<string, unknown> | undefined;
  if (!r) { db.close(); return notFound(c, `Import batch ${batchId} not found`); }
  let ec: Record<string, number> = {}; try { ec = JSON.parse((r.entity_counts as string) ?? "{}"); } catch { ec = {}; }
  let qr: Record<string, unknown> = {}; try { qr = JSON.parse((r.quality_report as string) ?? "{}"); } catch { qr = {}; }
  writeAudit(db, wsId, c.get("requestId"), "bi_batch", batchId, {});
  db.close();
  return ok(c, {
    batchId: r.batch_id,
    workspaceId: r.workspace_id,
    batchType: r.batch_type,
    source: r.source,
    sourceType: r.source_type,
    timeWindow: r.time_window,
    rowCount: r.row_count,
    entityCounts: ec,
    qualityReport: qr,
    createdAt: r.created_at,
    createdBy: r.created_by,
  });
});

// ---------------------------------------------------------------------------
// GET /data-management/data-versions
// Cross-source version listing. Optionally filter by sourceId / sourceKind.
// Each active source's adapter is consulted; stub sources return empty.
// ---------------------------------------------------------------------------
dm.get("/data-versions", (c) => {
  const wsId = c.get("workspaceId");
  const sourceId = c.req.query("sourceId");
  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params: (string | number)[] = [wsId];
  if (sourceId) { conditions.push("source_id = ?"); params.push(sourceId); }
  const sourceRows = db
    .prepare(`SELECT * FROM data_source WHERE ${conditions.join(" AND ")} ORDER BY source_id`)
    .all(...params) as unknown as DataSourceRow[];

  const items: Array<{
    sourceId: string;
    sourceKind: string;
    sourceBatchId: string;
    dataVersion: string;
    generatedAt: string | null;
    timeWindow: string | null;
    isLatest: boolean;
    rowCount: number;
  }> = [];
  for (const sr of sourceRows) {
    const adapter = adapterFor(sr.adapter);
    if (!adapter) continue;
    const v = adapter.listVersions(db, wsId, sr.source_id);
    for (const ver of v.versions) {
      items.push({
        sourceId: sr.source_id,
        sourceKind: sr.source_kind,
        sourceBatchId: ver.sourceBatchId,
        dataVersion: ver.dataVersion,
        generatedAt: ver.generatedAt,
        timeWindow: ver.timeWindow,
        isLatest: ver.isLatest,
        rowCount: ver.rowCount,
      });
    }
  }
  writeAudit(db, wsId, c.get("requestId"), "bi_data_version", null,
    { count: items.length, sourceId: sourceId ?? null });
  db.close();
  return ok(c, { items });
});

// ---------------------------------------------------------------------------
// GET /data-management/data-versions/:sourceId/:dataVersion/quality
// ---------------------------------------------------------------------------
dm.get("/data-versions/:sourceId/:dataVersion/quality", (c) => {
  const wsId = c.get("workspaceId");
  const sourceId = c.req.param("sourceId");
  const dataVersion = c.req.param("dataVersion");
  const db = openDb(wsId);
  const sr = getSourceRow(db, wsId, sourceId);
  if (!sr) { db.close(); return notFound(c, `Data source ${sourceId} not found`); }
  const adapter = adapterFor(sr.adapter);
  if (!adapter) { db.close(); return invalidInput(c, `No adapter for source ${sourceId}`); }
  const report = adapter.getQualityReport(db, wsId, sourceId, dataVersion);
  if (!report) {
    db.close();
    return notFound(c, `No quality report for ${sourceId} @ ${dataVersion}`);
  }
  writeAudit(db, wsId, c.get("requestId"), "bi_data_version", `${sourceId}:${dataVersion}`, {});
  db.close();
  return ok(c, report);
});

// ---------------------------------------------------------------------------
// GET /data-management/audit
// Query import-related audit events. Filters: resourceType, resourceId,
// sourceBatchId, dataVersion, actor. Reuses the existing audit_event table.
// ---------------------------------------------------------------------------
dm.get("/audit", (c) => {
  const wsId = c.get("workspaceId");
  const resourceType = c.req.query("resourceType");
  const resourceId = c.req.query("resourceId");
  const actor = c.req.query("actor");
  const event = c.req.query("event");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "50"), 200);
  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params: (string | number)[] = [wsId];
  // Default to import + data-management events when no resourceType filter.
  if (resourceType) { conditions.push("resource_type = ?"); params.push(resourceType); }
  else { conditions.push("resource_type IN ('bi_batch','bi_data_source','bi_data_version','bi_account','bi_product','bi_fit','bi_advice','bi_summary')"); }
  if (resourceId) { conditions.push("resource_id = ?"); params.push(resourceId); }
  if (actor) { conditions.push("actor = ?"); params.push(actor); }
  if (event) { conditions.push("event = ?"); params.push(event); }
  const rows = db
    .prepare(`SELECT * FROM audit_event WHERE ${conditions.join(" AND ")} ORDER BY occurred_at DESC LIMIT ?`)
    .all(...params, pageSize) as Array<Record<string, unknown>>;
  const items = rows.map((r) => {
    let meta: Record<string, unknown> = {}; try { meta = JSON.parse((r.meta as string) ?? "{}"); } catch { meta = {}; }
    return {
      auditId: r.audit_id,
      workspaceId: r.workspace_id,
      actor: r.actor,
      requestId: r.request_id,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      event: r.event,
      meta,
      occurredAt: r.occurred_at,
    };
  });
  db.close();
  return ok(c, { items });
});

// ---------------------------------------------------------------------------
// POST /data-management/import-batches            (reserved — 501)
// POST /data-management/data-versions/:sourceId/:dataVersion/rollback (reserved — 501)
// These are reserved shapes so V/M domains can design against them. Phase 2
// will implement once the HTTP import + rollback contract is frozen by X.
// ---------------------------------------------------------------------------
dm.post("/import-batches", (c) =>
  err(c, "not_implemented",
    "HTTP import endpoint is reserved. Use scripts/import-douyin-bi.mjs for now; HTTP pipeline lands in a later P2 task.",
    501)
);
dm.post("/data-versions/:sourceId/:dataVersion/rollback", (c) =>
  err(c, "not_implemented",
    "Version rollback is reserved. Latest projection is controlled by generated_at; manual rollback requires a new P2 task to define semantics.",
    501)
);

export default dm;

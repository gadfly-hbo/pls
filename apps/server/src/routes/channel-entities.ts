import { Hono } from "hono";
import type { Context } from "hono";
import { openDb } from "../db/connection.js";
import { ok, notFound } from "../lib/response.js";

const entities = new Hono();

// GET /channels/entities
// Read-only; no audit write to keep fixture workspaces stable.
entities.get("/", (c) => {
  const wsId = c.get("workspaceId") as string;
  const entityType = c.req.query("entityType");
  const platformType = c.req.query("platformType");
  const sourceId = c.req.query("sourceId");
  const dataVersion = c.req.query("dataVersion");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "50"), 200);
  const db = openDb(wsId);
  const useLatest = !dataVersion;
  const table = useLatest ? "channel_entity_latest" : "channel_entity";
  const conds = ["workspace_id = ?"];
  const params: (string | number)[] = [wsId];
  if (entityType) { conds.push("entity_type = ?"); params.push(entityType); }
  if (platformType) { conds.push("platform_type = ?"); params.push(platformType); }
  if (sourceId) { conds.push("source_id = ?"); params.push(sourceId); }
  if (dataVersion) { conds.push("data_version = ?"); params.push(dataVersion); }
  const rows = db.prepare(`SELECT * FROM ${table} WHERE ${conds.join(" AND ")} ORDER BY entity_type, display_name LIMIT ?`).all(...params, pageSize) as Array<Record<string, unknown>>;
  const items = rows.map(r => ({
    channelEntityId: r.channel_entity_id, entityType: r.entity_type, sourceEntityKey: r.source_entity_key,
    displayName: r.display_name, platformType: r.platform_type, platformName: r.platform_name,
    parentEntityId: r.parent_entity_id, entityStatus: r.entity_status,
    shopId: r.shop_id, accountId: r.account_id, accountKind: r.account_kind,
    profileTags: JSON.parse((r.profile_tags as string) ?? "[]"),
    benchmarkTags: JSON.parse((r.benchmark_tags as string) ?? "[]"),
    performanceMetrics: JSON.parse((r.performance_metrics as string) ?? "{}"),
    unmappedProfileFields: JSON.parse((r.unmapped_profile_fields as string) ?? "[]"),
    sourceId: r.source_id, sourceBatchId: r.source_batch_id, dataVersion: r.data_version,
    generatedAt: r.generated_at, timeWindow: r.time_window, sourceType: r.source_type,
    qualityFlags: JSON.parse((r.quality_flags as string) ?? "[]"),
  }));
  db.close();
  return ok(c, { items });
});

// GET /channels/entities/:entityId
// Read-only; no audit write to keep fixture workspaces stable.
entities.get("/:entityId", (c) => {
  const wsId = c.get("workspaceId") as string;
  const eid = c.req.param("entityId");
  const dataVersion = c.req.query("dataVersion");
  const table = dataVersion ? "channel_entity" : "channel_entity_latest";
  const db = openDb(wsId);
  const conds = ["workspace_id = ?", "channel_entity_id = ?"];
  const params: (string | number)[] = [wsId, eid];
  if (dataVersion) { conds.push("data_version = ?"); params.push(dataVersion); }
  const r = db.prepare(`SELECT * FROM ${table} WHERE ${conds.join(" AND ")} LIMIT 1`).get(...params) as Record<string, unknown> | undefined;
  if (!r) { db.close(); return notFound(c, `Channel entity ${eid} not found`); }
  db.close();
  return ok(c, {
    channelEntityId: r.channel_entity_id, entityType: r.entity_type, sourceEntityKey: r.source_entity_key,
    displayName: r.display_name, platformType: r.platform_type, platformName: r.platform_name,
    parentEntityId: r.parent_entity_id, entityPath: JSON.parse((r.entity_path as string) ?? "[]"),
    entityStatus: r.entity_status,
    shopId: r.shop_id, accountId: r.account_id, accountKind: r.account_kind,
    contentFormat: JSON.parse((r.content_format as string) ?? "[]"),
    country: r.country, province: r.province, city: r.city, district: r.district,
    tradeArea: r.trade_area, mallName: r.mall_name, storeId: r.store_id, storeFormat: r.store_format,
    profileTags: JSON.parse((r.profile_tags as string) ?? "[]"),
    benchmarkTags: JSON.parse((r.benchmark_tags as string) ?? "[]"),
    performanceMetrics: JSON.parse((r.performance_metrics as string) ?? "{}"),
    unmappedProfileFields: JSON.parse((r.unmapped_profile_fields as string) ?? "[]"),
    rawBusinessFields: JSON.parse((r.raw_business_fields as string) ?? "{}"),
    sourceId: r.source_id, sourceBatchId: r.source_batch_id, dataVersion: r.data_version,
    generatedAt: r.generated_at, timeWindow: r.time_window, sourceType: r.source_type,
    qualityFlags: JSON.parse((r.quality_flags as string) ?? "[]"),
  });
});

export default entities;

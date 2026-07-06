import { Hono } from "hono";
import type { Context } from "hono";
import { openDb } from "../db/connection.js";
import { invalidInput, ok, notFound } from "../lib/response.js";

const channelObjects = new Hono();

function audit(db: ReturnType<typeof openDb>, wsId: string, rid: string | undefined, rt: string, ri: string | null, meta: Record<string, unknown>) {
  db.prepare(`INSERT INTO audit_event (audit_id, workspace_id, actor, request_id, resource_type, resource_id, event, meta, occurred_at) VALUES (?, ?, 'api', ?, ?, ?, 'query', ?, datetime('now'))`).run(`au_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, wsId, rid ?? null, rt, ri, JSON.stringify(meta));
}

function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function parseCursor(cursor: string | undefined): number | null {
  if (!cursor) return 0;
  const match = /^offset:(\d+)$/.exec(cursor);
  return match ? Number(match[1]) : null;
}

// GET /channel-objects
channelObjects.get("/", (c) => {
  const wsId = c.get("workspaceId") as string;
  const objectType = c.req.query("objectType");
  const platformType = c.req.query("platformType");
  const sourceBatchId = c.req.query("sourceBatchId");
  const dataVersion = c.req.query("dataVersion");
  const pageSize = Math.min(Math.max(parseInt(c.req.query("pageSize") ?? "20", 10) || 20, 1), 100);
  const cursor = c.req.query("cursor");
  const offset = parseCursor(cursor);
  if (offset == null) return invalidInput(c, "cursor must be an opaque channel object list cursor", "cursor");
  const db = openDb(wsId);
  const useLatest = !dataVersion;
  const table = useLatest ? "channel_object_latest" : "channel_object";
  const conds = ["workspace_id = ?"];
  const params: (string | number)[] = [wsId];
  if (objectType) { conds.push("object_type = ?"); params.push(objectType); }
  if (platformType) { conds.push("platform_type = ?"); params.push(platformType); }
  if (sourceBatchId) { conds.push("source_batch_id = ?"); params.push(sourceBatchId); }
  if (dataVersion) { conds.push("data_version = ?"); params.push(dataVersion); }
  const rows = db.prepare(`SELECT * FROM ${table} WHERE ${conds.join(" AND ")} ORDER BY generated_at DESC, object_type, display_name, canonical_object_key LIMIT ? OFFSET ?`).all(...params, pageSize + 1, offset) as Array<Record<string, unknown>>;
  const pageRows = rows.slice(0, pageSize);
  const items = pageRows.map((r) => ({
    workspaceId: r.workspace_id,
    objectType: r.object_type,
    sourceStableKey: r.source_stable_key,
    keySource: r.key_source,
    canonicalObjectKey: r.canonical_object_key,
    objectVersionId: r.object_version_id,
    dataVersion: r.data_version,
    sourceBatchId: r.source_batch_id,
    generatedAt: r.generated_at,
    timeWindow: r.time_window,
    displayName: r.display_name,
    platformName: r.platform_name,
    platformType: r.platform_type,
    entityStatus: r.entity_status,
    targetObject: r.target_object,
    entityAttributes: parseJson(r.entity_attributes as string, {}),
    possibleDuplicate: Boolean(r.possible_duplicate),
    duplicateCandidateKeys: parseJson(r.duplicate_candidate_keys as string, []),
    manualReviewStatus: r.manual_review_status,
    qualityFlags: parseJson(r.quality_flags as string, []),
    source: r.source,
    sourceType: r.source_type,
  }));
  audit(db, wsId, c.get("requestId"), "channel_object", null, { count: items.length, objectType: objectType ?? null });
  db.close();
  return ok(c, {
    items,
    page: {
      cursor: cursor ?? null,
      nextCursor: rows.length > pageSize ? `offset:${offset + pageSize}` : null,
      pageSize,
      hasMore: rows.length > pageSize,
    },
  });
});

// GET /channel-objects/:canonicalObjectKey
channelObjects.get("/:canonicalObjectKey", (c) => {
  const wsId = c.get("workspaceId") as string;
  const key = c.req.param("canonicalObjectKey");
  const dataVersion = c.req.query("dataVersion");
  const table = dataVersion ? "channel_object" : "channel_object_latest";
  const db = openDb(wsId);
  const conds = ["workspace_id = ?", "canonical_object_key = ?"];
  const params: (string | number)[] = [wsId, key];
  if (dataVersion) { conds.push("data_version = ?"); params.push(dataVersion); }
  const r = db.prepare(`SELECT * FROM ${table} WHERE ${conds.join(" AND ")} LIMIT 1`).get(...params) as Record<string, unknown> | undefined;
  if (!r) { db.close(); return notFound(c, `Channel object ${key} not found`); }
  audit(db, wsId, c.get("requestId"), "channel_object", key, { dataVersion: dataVersion ?? "latest" });
  db.close();
  return ok(c, {
    workspaceId: r.workspace_id,
    objectType: r.object_type,
    sourceStableKey: r.source_stable_key,
    keySource: r.key_source,
    canonicalObjectKey: r.canonical_object_key,
    objectVersionId: r.object_version_id,
    dataVersion: r.data_version,
    sourceBatchId: r.source_batch_id,
    generatedAt: r.generated_at,
    timeWindow: r.time_window,
    displayName: r.display_name,
    platformName: r.platform_name,
    platformType: r.platform_type,
    entityStatus: r.entity_status,
    targetObject: r.target_object,
    entityAttributes: parseJson(r.entity_attributes as string, {}),
    possibleDuplicate: Boolean(r.possible_duplicate),
    duplicateCandidateKeys: parseJson(r.duplicate_candidate_keys as string, []),
    manualReviewStatus: r.manual_review_status,
    qualityFlags: parseJson(r.quality_flags as string, []),
    source: r.source,
    sourceType: r.source_type,
  });
});

// GET /channel-objects/:canonicalObjectKey/audience-profiles
channelObjects.get("/:canonicalObjectKey/audience-profiles", (c) => {
  const wsId = c.get("workspaceId") as string;
  const key = c.req.param("canonicalObjectKey");
  const dataVersion = c.req.query("dataVersion");
  const table = dataVersion ? "audience_profile" : "audience_profile_latest";
  const db = openDb(wsId);
  const conds = ["workspace_id = ?", "canonical_object_key = ?"];
  const params: (string | number)[] = [wsId, key];
  if (dataVersion) { conds.push("data_version = ?"); params.push(dataVersion); }
  const rows = db.prepare(`SELECT * FROM ${table} WHERE ${conds.join(" AND ")} ORDER BY generated_at DESC`).all(...params) as Array<Record<string, unknown>>;
  const items = rows.map((r) => ({
    profileId: r.profile_id,
    canonicalObjectKey: r.canonical_object_key,
    profileStage: r.profile_stage,
    source: r.source,
    sourceBatchId: r.source_batch_id,
    dataVersion: r.data_version,
    generatedAt: r.generated_at,
    timeWindow: r.time_window,
    sampleSize: r.sample_size,
    confidence: r.confidence,
    tags: parseJson(r.tags as string, []),
    unmappedFields: parseJson(r.unmapped_fields as string, []),
    qualityFlags: parseJson(r.quality_flags as string, []),
  }));
  audit(db, wsId, c.get("requestId"), "audience_profile", key, { count: items.length, dataVersion: dataVersion ?? "latest" });
  db.close();
  return ok(c, { items });
});

// GET /channel-objects/:canonicalObjectKey/product-fit-profiles
channelObjects.get("/:canonicalObjectKey/product-fit-profiles", (c) => {
  const wsId = c.get("workspaceId") as string;
  const key = c.req.param("canonicalObjectKey");
  const dataVersion = c.req.query("dataVersion");
  const table = dataVersion ? "product_fit_profile" : "product_fit_profile_latest";
  const db = openDb(wsId);
  const conds = ["workspace_id = ?", "canonical_object_key = ?"];
  const params: (string | number)[] = [wsId, key];
  if (dataVersion) { conds.push("data_version = ?"); params.push(dataVersion); }
  const rows = db.prepare(`SELECT * FROM ${table} WHERE ${conds.join(" AND ")} ORDER BY generated_at DESC`).all(...params) as Array<Record<string, unknown>>;
  const items = rows.map((r) => ({
    profileId: r.profile_id,
    canonicalObjectKey: r.canonical_object_key,
    source: r.source,
    sourceBatchId: r.source_batch_id,
    dataVersion: r.data_version,
    generatedAt: r.generated_at,
    timeWindow: r.time_window,
    sampleSize: r.sample_size,
    confidence: r.confidence,
    fitCategories: parseJson(r.fit_categories as string, []),
    fitPriceBands: parseJson(r.fit_price_bands as string, []),
    fitStyles: parseJson(r.fit_styles as string, []),
    fitOccasions: parseJson(r.fit_occasions as string, []),
    fitLaunchTypes: parseJson(r.fit_launch_types as string, []),
    evidence: parseJson(r.evidence as string, []),
    qualityFlags: parseJson(r.quality_flags as string, []),
  }));
  audit(db, wsId, c.get("requestId"), "product_fit_profile", key, { count: items.length, dataVersion: dataVersion ?? "latest" });
  db.close();
  return ok(c, { items });
});

// GET /channel-objects/:canonicalObjectKey/bindings
channelObjects.get("/:canonicalObjectKey/bindings", (c) => {
  const wsId = c.get("workspaceId") as string;
  const key = c.req.param("canonicalObjectKey");
  const bindingType = c.req.query("bindingType");
  const dataVersion = c.req.query("dataVersion");
  const table = dataVersion ? "channel_object_binding" : "channel_object_binding_latest";
  const db = openDb(wsId);
  const conds = ["workspace_id = ?", "(from_canonical_object_key = ? OR to_canonical_object_key = ?)"];
  const params: (string | number)[] = [wsId, key, key];
  if (bindingType) { conds.push("binding_type = ?"); params.push(bindingType); }
  if (dataVersion) { conds.push("data_version = ?"); params.push(dataVersion); }
  const rows = db.prepare(`SELECT * FROM ${table} WHERE ${conds.join(" AND ")} ORDER BY generated_at DESC`).all(...params) as Array<Record<string, unknown>>;
  const items = rows.map((r) => ({
    bindingId: r.binding_id,
    bindingType: r.binding_type,
    fromCanonicalObjectKey: r.from_canonical_object_key,
    toCanonicalObjectKey: r.to_canonical_object_key,
    sourceBatchId: r.source_batch_id,
    dataVersion: r.data_version,
    generatedAt: r.generated_at,
    qualityFlags: parseJson(r.quality_flags as string, []),
  }));
  audit(db, wsId, c.get("requestId"), "channel_object_binding", key, { count: items.length, bindingType: bindingType ?? null });
  db.close();
  return ok(c, { items });
});

export default channelObjects;

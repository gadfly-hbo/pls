import { Hono } from "hono";
import type { Context } from "hono";
import { openDb } from "../db/connection.js";
import { invalidInput, ok, notFound, err } from "../lib/response.js";
import { readJson } from "../lib/idempotency.js";

const channelObjects = new Hono();

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

interface ObjectContextFields {
  eventType?: string;
  customTags?: string[];
  scenarioType?: string;
  description?: string | null;
}

function buildContextFields(
  objectType: string,
  entityAttributes: Record<string, unknown>
): ObjectContextFields {
  if (objectType === "marketing_event") {
    const customTags = Array.isArray(entityAttributes.customTags)
      ? entityAttributes.customTags.filter((t): t is string => typeof t === "string")
      : [];
    return {
      eventType: typeof entityAttributes.eventType === "string" ? entityAttributes.eventType : undefined,
      customTags,
    };
  }
  if (objectType === "business_scenario") {
    return {
      scenarioType: typeof entityAttributes.scenarioType === "string" ? entityAttributes.scenarioType : undefined,
      description: typeof entityAttributes.description === "string" ? entityAttributes.description : null,
    };
  }
  return {};
}

interface CompanionObject {
  canonicalObjectKey: string | number | null;
  objectType: string | number | null;
  displayName: string | number | null;
  dataVersion: string | number | null;
}

interface EnrichedBinding {
  bindingId: string | number | null;
  bindingType: string | number | null;
  fromCanonicalObjectKey: string | number | null;
  toCanonicalObjectKey: string | number | null;
  sourceBatchId: string | number | null;
  dataVersion: string | number | null;
  generatedAt: string | number | null;
  qualityFlags: unknown;
  fromObject: CompanionObject;
  toObject: CompanionObject;
}

function enrichBindings(
  db: ReturnType<typeof openDb>,
  wsId: string,
  rows: Array<Record<string, unknown>>
): EnrichedBinding[] {
  const keys = new Set<string>();
  for (const r of rows) {
    const from = String(r.from_canonical_object_key ?? "");
    const to = String(r.to_canonical_object_key ?? "");
    if (from) keys.add(from);
    if (to) keys.add(to);
  }

  const companions = new Map<string, Record<string, unknown>>();
  if (keys.size > 0) {
    const placeholders = Array(keys.size).fill("?").join(",");
    const companionRows = db
      .prepare(
        `SELECT canonical_object_key, object_type, display_name, data_version FROM channel_object_latest WHERE workspace_id = ? AND canonical_object_key IN (${placeholders})`
      )
      .all(wsId, ...keys) as Array<Record<string, unknown>>;
    for (const cr of companionRows) {
      companions.set(String(cr.canonical_object_key ?? ""), cr);
    }
  }

  return rows.map((r) => {
    const fromKey = String(r.from_canonical_object_key ?? "");
    const toKey = String(r.to_canonical_object_key ?? "");
    const fromCompanion = companions.get(fromKey);
    const toCompanion = companions.get(toKey);

    return {
      bindingId: r.binding_id,
      bindingType: r.binding_type,
      fromCanonicalObjectKey: r.from_canonical_object_key,
      toCanonicalObjectKey: r.to_canonical_object_key,
      sourceBatchId: r.source_batch_id,
      dataVersion: r.data_version,
      generatedAt: r.generated_at,
      qualityFlags: parseJson(r.quality_flags as string, []),
      fromObject: {
        canonicalObjectKey: fromCompanion?.canonical_object_key ?? r.from_canonical_object_key,
        objectType: fromCompanion?.object_type ?? null,
        displayName: fromCompanion?.display_name ?? null,
        dataVersion: fromCompanion?.data_version ?? null,
      },
      toObject: {
        canonicalObjectKey: toCompanion?.canonical_object_key ?? r.to_canonical_object_key,
        objectType: toCompanion?.object_type ?? null,
        displayName: toCompanion?.display_name ?? null,
        dataVersion: toCompanion?.data_version ?? null,
      },
    };
  }) as EnrichedBinding[];
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
  db.close();
  const entityAttributes = parseJson(r.entity_attributes as string, {});
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
    entityAttributes,
    possibleDuplicate: Boolean(r.possible_duplicate),
    duplicateCandidateKeys: parseJson(r.duplicate_candidate_keys as string, []),
    manualReviewStatus: r.manual_review_status,
    qualityFlags: parseJson(r.quality_flags as string, []),
    source: r.source,
    sourceType: r.source_type,
    ...buildContextFields(String(r.object_type ?? ""), entityAttributes),
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
  const items = enrichBindings(db, wsId, rows);
  db.close();
  return ok(c, { items });
});

// POST /channel-objects/analysis
channelObjects.post("/analysis", async (c) => {
  // Analysis with full marketing event / business scenario context is not
  // implemented yet. Do not write audit events for this stub endpoint; otherwise
  // read-only smoke tests against ws_demo would dirtify the fixture DB.
  return err(
    c,
    "not_implemented",
    "Channel object analysis with marketing event / business scenario context is not implemented in this version",
    501,
    "analysis"
  );
});

export default channelObjects;

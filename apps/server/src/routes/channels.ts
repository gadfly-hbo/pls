import { Hono } from "hono";
import { openDb } from "../db/connection.js";
import { ok, notFound } from "../lib/response.js";

const channels = new Hono();

// GET /channels
channels.get("/", (c) => {
  const wsId = c.get("workspaceId");
  const channelType = c.req.query("channelType");
  const platformType = c.req.query("platformType");
  const cursor = c.req.query("cursor");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);

  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params: (string | number | null)[] = [wsId];

  if (channelType) {
    conditions.push("channel_type = ?");
    params.push(channelType);
  }
  if (platformType) {
    conditions.push("platform_type = ?");
    params.push(platformType);
  }
  if (cursor) {
    conditions.push("created_at < ?");
    params.push(cursor);
  }

  const rows = db
    .prepare(
      `SELECT * FROM channel_profile WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT ?`
    )
    .all(...params, pageSize + 1) as Array<Record<string, unknown>>;

  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map((row) => ({
    channelId: row.channel_id,
    workspaceId: row.workspace_id,
    batchId: row.batch_id,
    channelName: row.channel_name,
    channelType: row.channel_type,
    platformType: row.platform_type,
    timeWindow: row.time_window,
    sampleSize: row.sample_size,
    source: row.source,
    sourceType: row.source_type,
    tags: JSON.parse(row.tags as string),
    trafficIndex: row.traffic_index,
    conversionIndex: row.conversion_index,
    qualityFlags: JSON.parse(row.quality_flags as string),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

// GET /channels/:channelId
channels.get("/:channelId", (c) => {
  const wsId = c.get("workspaceId");
  const channelId = c.req.param("channelId");
  const db = openDb(wsId);
  const row = db
    .prepare("SELECT * FROM channel_profile WHERE channel_id = ? AND workspace_id = ?")
    .get(channelId, wsId) as Record<string, unknown> | undefined;
  db.close();

  if (!row) return notFound(c, `Channel ${channelId} not found`);
  return ok(c, {
    channelId: row.channel_id,
    workspaceId: row.workspace_id,
    batchId: row.batch_id,
    channelName: row.channel_name,
    channelType: row.channel_type,
    platformType: row.platform_type,
    timeWindow: row.time_window,
    sampleSize: row.sample_size,
    source: row.source,
    sourceType: row.source_type,
    tags: JSON.parse(row.tags as string),
    trafficIndex: row.traffic_index,
    conversionIndex: row.conversion_index,
    qualityFlags: JSON.parse(row.quality_flags as string),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
});

export default channels;

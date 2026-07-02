import { Hono } from "hono";
import { openDb } from "../db/connection.js";
import { ok, notFound, invalidInput, safetyViolation, taxonomyViolation } from "../lib/response.js";
import { deepScanSafety } from "../lib/safety.js";
import { isValidTagId } from "../lib/taxonomy.js";
import { writeAudit } from "../lib/audit.js";

const products = new Hono();

// POST /products - upsert SKU
products.post("/", async (c) => {
  const wsId = c.get("workspaceId");
  const body = await c.req.json();
  const skuId = body.skuId as string | undefined;
  if (!skuId) return invalidInput(c, "skuId is required", "skuId");

  // Safety gate: deep scan nested fields (attributes, assets, etc.)
  const safety = deepScanSafety(body);
  if (!safety.safe) {
    const db = openDb(wsId);
    writeAudit(db, {
      workspaceId: wsId,
      actor: "system:sanitizer",
      requestId: c.get("requestId") ?? "",
      resourceType: "sku",
      resourceId: skuId,
      event: "reject",
      reasonCode: "safety_violation",
      safetyStage: "sanitize_rejected",
      meta: { fieldNames: safety.violations.map((v) => v.field) },
    });
    db.close();
    return safetyViolation(
      c,
      `blocked fields: ${safety.violations.map((v) => v.field).join(", ")}`,
      safety.violations[0]?.field
    );
  }

  // Taxonomy gate: validate mappedProductTags
  const tags = (body.mappedProductTags as Array<{ tagId: string }>) ?? [];
  for (const t of tags) {
    if (!isValidTagId(t.tagId)) {
      return taxonomyViolation(c, `invalid tagId: ${t.tagId}`, "mappedProductTags");
    }
  }

  const db = openDb(wsId);
  const existing = db
    .prepare("SELECT sku_id FROM sku WHERE sku_id = ? AND workspace_id = ?")
    .get(skuId, wsId);

  if (existing) {
    db.prepare(`
      UPDATE sku SET spu_id = ?, category_lv1 = ?, category_lv2 = ?, season = ?,
        title = ?, attributes = ?, assets = ?, mapped_product_tags = ?, updated_at = datetime('now')
      WHERE sku_id = ? AND workspace_id = ?
    `).run(
      body.spuId ?? null,
      body.categoryLv1 ?? null,
      body.categoryLv2 ?? null,
      body.season ?? null,
      body.title ?? null,
      JSON.stringify(body.attributes ?? {}),
      JSON.stringify(body.assets ?? []),
      JSON.stringify(tags),
      skuId,
      wsId
    );
  } else {
    db.prepare(`
      INSERT INTO sku (sku_id, workspace_id, spu_id, category_lv1, category_lv2,
        season, title, attributes, assets, mapped_product_tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      skuId,
      wsId,
      body.spuId ?? null,
      body.categoryLv1 ?? null,
      body.categoryLv2 ?? null,
      body.season ?? null,
      body.title ?? null,
      JSON.stringify(body.attributes ?? {}),
      JSON.stringify(body.assets ?? []),
      JSON.stringify(tags)
    );
  }

  const row = db
    .prepare("SELECT * FROM sku WHERE sku_id = ? AND workspace_id = ?")
    .get(skuId, wsId) as Record<string, unknown>;
  db.close();

  return ok(c, {
    skuId: row.sku_id,
    workspaceId: row.workspace_id,
    spuId: row.spu_id,
    categoryLv1: row.category_lv1,
    categoryLv2: row.category_lv2,
    season: row.season,
    title: row.title,
    attributes: JSON.parse(row.attributes as string),
    assets: JSON.parse(row.assets as string),
    mappedProductTags: JSON.parse(row.mapped_product_tags as string),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
});

// GET /products/:skuId
products.get("/:skuId", (c) => {
  const wsId = c.get("workspaceId");
  const skuId = c.req.param("skuId");
  const db = openDb(wsId);
  const row = db
    .prepare("SELECT * FROM sku WHERE sku_id = ? AND workspace_id = ?")
    .get(skuId, wsId) as Record<string, unknown> | undefined;
  db.close();

  if (!row) return notFound(c, `SKU ${skuId} not found`);
  return ok(c, {
    skuId: row.sku_id,
    workspaceId: row.workspace_id,
    spuId: row.spu_id,
    categoryLv1: row.category_lv1,
    categoryLv2: row.category_lv2,
    season: row.season,
    title: row.title,
    attributes: JSON.parse(row.attributes as string),
    assets: JSON.parse(row.assets as string),
    mappedProductTags: JSON.parse(row.mapped_product_tags as string),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
});

// GET /products
products.get("/", (c) => {
  const wsId = c.get("workspaceId");
  const categoryLv2 = c.req.query("categoryLv2");
  const season = c.req.query("season");
  const priceBand = c.req.query("priceBand");
  const cursor = c.req.query("cursor");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);

  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params: (string | number | null)[] = [wsId];

  if (categoryLv2) {
    conditions.push("category_lv2 = ?");
    params.push(categoryLv2);
  }
  if (season) {
    conditions.push("season = ?");
    params.push(season);
  }
  if (priceBand) {
    // priceBand is inside attributes JSON
    conditions.push("json_extract(attributes, '$.priceBand') = ?");
    params.push(priceBand);
  }
  if (cursor) {
    conditions.push("created_at < ?");
    params.push(cursor);
  }

  const rows = db
    .prepare(
      `SELECT * FROM sku WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT ?`
    )
    .all(...params, pageSize + 1) as Array<Record<string, unknown>>;

  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map((row) => ({
    skuId: row.sku_id,
    workspaceId: row.workspace_id,
    spuId: row.spu_id,
    categoryLv1: row.category_lv1,
    categoryLv2: row.category_lv2,
    season: row.season,
    title: row.title,
    attributes: JSON.parse(row.attributes as string),
    assets: JSON.parse(row.assets as string),
    mappedProductTags: JSON.parse(row.mapped_product_tags as string),
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

// DELETE /products/:skuId - soft delete (set updated_at, doesn't remove)
products.delete("/:skuId", (c) => {
  const wsId = c.get("workspaceId");
  const skuId = c.req.param("skuId");
  const db = openDb(wsId);
  const result = db
    .prepare("UPDATE sku SET updated_at = datetime('now') WHERE sku_id = ? AND workspace_id = ?")
    .run(skuId, wsId);
  db.close();

  if (result.changes === 0) return notFound(c, `SKU ${skuId} not found`);
  return ok(c, { deleted: skuId });
});

export default products;

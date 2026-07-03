import { Hono } from "hono";
import type { Context } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "../db/connection.js";
import { ok, notFound } from "../lib/response.js";

// A-P1-F2: Douyin BI read API.
// Serves latest-projection (by default) or a specific dataVersion / sourceBatchId
// snapshot of the imported Douyin BI package. All rows carry source_batch_id
// and data_version so multiple imports coexist and are queryable.
//
// Convention:
//   - Default view: `douyin_*_latest` (newest generated_at per business key).
//   - When ?dataVersion or ?sourceBatchId provided, query the base table with
//     those filters instead (returns historical snapshot).
//   - `raw` column preserves the exact JSONL row from D-P1-F1 so user-authorized
//     BI fields (八大消费群体, legacyFitScore, etc.) can be surfaced verbatim.

const bi = new Hono();

interface VersionFilters {
  dataVersion?: string;
  sourceBatchId?: string;
}

function writeAudit(
  db: DatabaseSync,
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

function tableFor(baseTable: string, c: Context): { table: string; filters: VersionFilters } {
  const dataVersion = c.req.query("dataVersion");
  const sourceBatchId = c.req.query("sourceBatchId");
  if (dataVersion || sourceBatchId) {
    return { table: baseTable, filters: { dataVersion, sourceBatchId } };
  }
  return { table: `${baseTable}_latest`, filters: {} };
}

function applyVersionFilter(
  conditions: string[],
  params: (string | number)[],
  filters: VersionFilters
): void {
  if (filters.dataVersion) { conditions.push("data_version = ?"); params.push(filters.dataVersion); }
  if (filters.sourceBatchId) { conditions.push("source_batch_id = ?"); params.push(filters.sourceBatchId); }
}

// ---------------------------------------------------------------------------
// GET /bi/douyin/accounts
// ---------------------------------------------------------------------------
bi.get("/accounts", (c) => {
  const wsId = c.get("workspaceId");
  const { table, filters } = tableFor("douyin_account", c);
  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params = [wsId];
  applyVersionFilter(conditions, params, filters);
  const isBaseline = c.req.query("isBaseline");
  if (isBaseline === "true") { conditions.push("is_baseline = 1"); }
  if (isBaseline === "false") { conditions.push("is_baseline = 0"); }
  const rows = db.prepare(
    `SELECT * FROM ${table} WHERE ${conditions.join(" AND ")} ORDER BY is_baseline DESC, channel_id ASC`
  ).all(...params);
  const items = rows.map((row) => ({
    channelId: row.channel_id,
    accountGroupId: row.account_group_id,
    accountName: row.account_name,
    accountKind: row.account_kind,
    platformType: row.platform_type,
    channelType: row.channel_type,
    displayName: row.display_name,
    displayNamePolicy: row.display_name_policy,
    isBaseline: !!row.is_baseline,
    hasReport: !!row.has_report,
    hasBenchmarkTags: !!row.has_benchmark_tags,
    source: row.source,
    sourceType: row.source_type,
    sourceBatchId: row.source_batch_id,
    dataVersion: row.data_version,
    generatedAt: row.generated_at,
    timeWindow: row.time_window,
  }));
  writeAudit(db, wsId, c.get("requestId"), "bi_account", null,
    { view: table, filters, count: items.length });
  db.close();
  return ok(c, { items });
});

// ---------------------------------------------------------------------------
// GET /bi/douyin/accounts/:channelId
// ---------------------------------------------------------------------------
bi.get("/accounts/:channelId", (c) => {
  const wsId = c.get("workspaceId");
  const channelId = c.req.param("channelId");
  const { table, filters } = tableFor("douyin_account", c);
  const db = openDb(wsId);
  const conditions = ["workspace_id = ?", "channel_id = ?"];
  const params = [wsId, channelId];
  applyVersionFilter(conditions, params, filters);
  const row = db.prepare(
    `SELECT * FROM ${table} WHERE ${conditions.join(" AND ")} LIMIT 1`
  ).get(...params);
  if (!row) {
    db.close();
    return notFound(c, `Douyin account ${channelId} not found`);
  }
  // Benchmark tags (always latest projection filtered by dataVersion if provided)
  const btTable = filters.dataVersion || filters.sourceBatchId
    ? "douyin_account_benchmark_tag" : "douyin_account_benchmark_tag_latest";
  const btConditions = ["workspace_id = ?", "channel_id = ?"];
  const btParams = [wsId, channelId];
  applyVersionFilter(btConditions, btParams, filters);
  const benchmarkTags = db.prepare(
    `SELECT * FROM ${btTable} WHERE ${btConditions.join(" AND ")} ORDER BY dimension, share_percent DESC`
  ).all(...btParams).map((r) => ({
    dimension: r.dimension,
    dimensionTaxonomy: r.dimension_taxonomy,
    optionLabel: r.option_label,
    sharePercent: r.share_percent,
    shareRatio: r.share_ratio,
    top1Flag: r.top1_flag,
    decisionMethod: r.decision_method,
    businessInterpretation: r.business_interpretation,
    mappedTagId: r.mapped_tag_id,
    mappingConfidence: r.mapping_confidence,
    sampleSize: r.sample_size,
    orderIndex: r.order_index,
  }));

  // Reports
  const rpTable = filters.dataVersion || filters.sourceBatchId
    ? "douyin_account_report" : "douyin_account_report_latest";
  const rpConditions = ["workspace_id = ?", "channel_id = ?"];
  const rpParams = [wsId, channelId];
  applyVersionFilter(rpConditions, rpParams, filters);
  const reports = db.prepare(
    `SELECT * FROM ${rpTable} WHERE ${rpConditions.join(" AND ")} ORDER BY report_kind`
  ).all(...rpParams).map((r) => ({
    reportId: r.report_id,
    reportKind: r.report_kind,
    comparePeriod: r.compare_period,
    plainTextExcerpt: r.plain_text_excerpt,
    plainTextCharCount: r.plain_text_char_count,
    rawHtmlBytes: r.raw_html_bytes,
    rawHtmlHash: r.raw_html_hash,
    rawHtmlAvailable: !!r.raw_html_available,
    source: r.source,
    sourceType: r.source_type,
  }));

  writeAudit(db, wsId, c.get("requestId"), "bi_account", channelId,
    { view: table, filters });
  db.close();
  return ok(c, {
    channelId: row.channel_id,
    accountGroupId: row.account_group_id,
    accountName: row.account_name,
    accountKind: row.account_kind,
    platformType: row.platform_type,
    channelType: row.channel_type,
    displayName: row.display_name,
    displayNamePolicy: row.display_name_policy,
    isBaseline: !!row.is_baseline,
    source: row.source,
    sourceType: row.source_type,
    sourceBatchId: row.source_batch_id,
    dataVersion: row.data_version,
    generatedAt: row.generated_at,
    timeWindow: row.time_window,
    benchmarkTags,
    reports,
  });
});

// ---------------------------------------------------------------------------
// GET /bi/douyin/products
// ---------------------------------------------------------------------------
bi.get("/products", (c) => {
  const wsId = c.get("workspaceId");
  const { table, filters } = tableFor("douyin_product", c);
  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params: (string | number)[] = [wsId];
  applyVersionFilter(conditions, params, filters);
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "50"), 200);
  const rows = db.prepare(
    `SELECT * FROM ${table} WHERE ${conditions.join(" AND ")} ORDER BY sku_id ASC LIMIT ?`
  ).all(...params, pageSize) as Array<Record<string, unknown>>;
  const items = rows.map((row) => ({
    skuId: row.sku_id,
    productName: row.product_name,
    productAttributes: JSON.parse((row.product_attributes as string) ?? "{}"),
    performanceIndex: JSON.parse((row.performance_index as string) ?? "{}"),
    mappedProfileTags: JSON.parse((row.mapped_profile_tags as string) ?? "[]"),
    unmappedProfileFields: JSON.parse((row.unmapped_profile_fields as string) ?? "[]"),
    qualityFlags: JSON.parse((row.quality_flags as string) ?? "[]"),
    source: row.source,
    sourceType: row.source_type,
    sourceBatchId: row.source_batch_id,
    dataVersion: row.data_version,
    generatedAt: row.generated_at,
    timeWindow: row.time_window,
  }));
  writeAudit(db, wsId, c.get("requestId"), "bi_product", null,
    { view: table, filters, count: items.length });
  db.close();
  return ok(c, { items });
});

bi.get("/products/:skuId", (c) => {
  const wsId = c.get("workspaceId");
  const skuId = c.req.param("skuId");
  const { table, filters } = tableFor("douyin_product", c);
  const db = openDb(wsId);
  const conditions = ["workspace_id = ?", "sku_id = ?"];
  const params: (string | number)[] = [wsId, skuId];
  applyVersionFilter(conditions, params, filters);
  const row = db.prepare(
    `SELECT * FROM ${table} WHERE ${conditions.join(" AND ")} LIMIT 1`
  ).get(...params) as Record<string, unknown> | undefined;
  if (!row) {
    db.close();
    return notFound(c, `Douyin product ${skuId} not found`);
  }
  writeAudit(db, wsId, c.get("requestId"), "bi_product", skuId,
    { view: table, filters });
  db.close();
  return ok(c, {
    skuId: row.sku_id,
    productName: row.product_name,
    productAttributes: JSON.parse((row.product_attributes as string) ?? "{}"),
    performanceMetrics: JSON.parse((row.performance_metrics as string) ?? "{}"),
    performanceIndex: JSON.parse((row.performance_index as string) ?? "{}"),
    profileDistribution: JSON.parse((row.profile_distribution as string) ?? "{}"),
    mappedProfileTags: JSON.parse((row.mapped_profile_tags as string) ?? "[]"),
    unmappedProfileFields: JSON.parse((row.unmapped_profile_fields as string) ?? "[]"),
    qualityFlags: JSON.parse((row.quality_flags as string) ?? "[]"),
    source: row.source,
    sourceType: row.source_type,
    sourceBatchId: row.source_batch_id,
    dataVersion: row.data_version,
    generatedAt: row.generated_at,
    timeWindow: row.time_window,
  });
});

// ---------------------------------------------------------------------------
// GET /bi/douyin/fits
// ---------------------------------------------------------------------------
bi.get("/fits", (c) => {
  const wsId = c.get("workspaceId");
  const { table, filters } = tableFor("douyin_product_account_fit", c);
  const skuId = c.req.query("skuId");
  const accountChannelId = c.req.query("accountChannelId");
  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params: (string | number)[] = [wsId];
  applyVersionFilter(conditions, params, filters);
  if (skuId) { conditions.push("sku_id = ?"); params.push(skuId); }
  if (accountChannelId) { conditions.push("account_channel_id = ?"); params.push(accountChannelId); }
  const rows = db.prepare(
    `SELECT * FROM ${table} WHERE ${conditions.join(" AND ")} ORDER BY sales_rank ASC LIMIT 200`
  ).all(...params) as Array<Record<string, unknown>>;
  const items = rows.map((r) => ({
    fitId: r.fit_id,
    skuId: r.sku_id,
    accountChannelId: r.account_channel_id,
    productName: r.product_name,
    accountName: r.account_name,
    legacyFitScore: r.legacy_fit_score,
    legacyFitScoreUsage: r.legacy_fit_score_usage,
    mismatchDimensionCount: r.mismatch_dimension_count,
    heavyAdjustmentTagList: r.heavy_adjustment_tag_list,
    salesRank: r.sales_rank,
    salesVolume: r.sales_volume,
    qualityFlags: JSON.parse((r.quality_flags as string) ?? "[]"),
    source: r.source,
    sourceType: r.source_type,
    sourceBatchId: r.source_batch_id,
    dataVersion: r.data_version,
    generatedAt: r.generated_at,
    timeWindow: r.time_window,
  }));
  writeAudit(db, wsId, c.get("requestId"), "bi_fit", null,
    { view: table, filters, count: items.length, skuId: skuId ?? null, accountChannelId: accountChannelId ?? null });
  db.close();
  return ok(c, { items });
});

bi.get("/fits/:fitId", (c) => {
  const wsId = c.get("workspaceId");
  const fitId = c.req.param("fitId");
  const { table, filters } = tableFor("douyin_product_account_fit", c);
  const db = openDb(wsId);
  const conditions = ["workspace_id = ?", "fit_id = ?"];
  const params: (string | number)[] = [wsId, fitId];
  applyVersionFilter(conditions, params, filters);
  const row = db.prepare(
    `SELECT * FROM ${table} WHERE ${conditions.join(" AND ")} LIMIT 1`
  ).get(...params) as Record<string, unknown> | undefined;
  if (!row) {
    db.close();
    return notFound(c, `Douyin fit ${fitId} not found`);
  }
  const cmpTable = filters.dataVersion || filters.sourceBatchId
    ? "douyin_comparison_dimension" : "douyin_comparison_dimension_latest";
  const cmpConditions = ["workspace_id = ?", "fit_id = ?"];
  const cmpParams: (string | number)[] = [wsId, fitId];
  applyVersionFilter(cmpConditions, cmpParams, filters);
  const dimensions = (db.prepare(
    `SELECT * FROM ${cmpTable} WHERE ${cmpConditions.join(" AND ")} ORDER BY dimension`
  ).all(...cmpParams) as Array<Record<string, unknown>>).map((r) => ({
    dimension: r.dimension,
    dimensionTaxonomy: r.dimension_taxonomy,
    productTop1Label: r.product_top1_label,
    productTop1SharePercent: r.product_top1_share_percent,
    accountTop1Label: r.account_top1_label,
    accountTop1SharePercent: r.account_top1_share_percent,
    productTop1TagId: r.product_top1_tag_id,
    accountTop1TagId: r.account_top1_tag_id,
    decisionMethod: r.decision_method,
    isMatchLabel: r.is_match_label,
    status: r.status,
    gapScore: r.gap_score,
  }));
  writeAudit(db, wsId, c.get("requestId"), "bi_fit", fitId, { view: table, filters });
  db.close();
  return ok(c, {
    fitId: row.fit_id,
    skuId: row.sku_id,
    accountChannelId: row.account_channel_id,
    productName: row.product_name,
    accountName: row.account_name,
    legacyFitScore: row.legacy_fit_score,
    legacyFitScoreUsage: row.legacy_fit_score_usage,
    mismatchDimensionCount: row.mismatch_dimension_count,
    heavyAdjustmentTagList: row.heavy_adjustment_tag_list,
    salesRank: row.sales_rank,
    salesVolume: row.sales_volume,
    qualityFlags: JSON.parse((row.quality_flags as string) ?? "[]"),
    source: row.source,
    sourceType: row.source_type,
    sourceBatchId: row.source_batch_id,
    dataVersion: row.data_version,
    generatedAt: row.generated_at,
    timeWindow: row.time_window,
    dimensions,
  });
});

// ---------------------------------------------------------------------------
// GET /bi/douyin/advice — flat, filterable optimization list.
// ---------------------------------------------------------------------------
bi.get("/advice", (c) => {
  const wsId = c.get("workspaceId");
  const { table, filters } = tableFor("douyin_adjustment_advice", c);
  const skuId = c.req.query("skuId");
  const accountChannelId = c.req.query("accountChannelId");
  const priority = c.req.query("priority");
  const dimension = c.req.query("dimension");
  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params: (string | number)[] = [wsId];
  applyVersionFilter(conditions, params, filters);
  if (skuId) { conditions.push("sku_id = ?"); params.push(skuId); }
  if (accountChannelId) { conditions.push("account_channel_id = ?"); params.push(accountChannelId); }
  if (priority) { conditions.push("priority = ?"); params.push(priority); }
  if (dimension) { conditions.push("dimension = ?"); params.push(dimension); }
  // priority ordering: high > medium > low > null.
  const rows = db.prepare(
    `SELECT * FROM ${table} WHERE ${conditions.join(" AND ")}
     ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
              sku_id ASC, order_index ASC LIMIT 500`
  ).all(...params) as Array<Record<string, unknown>>;
  const items = rows.map((r) => ({
    adviceId: r.advice_id,
    skuId: r.sku_id,
    productName: r.product_name,
    accountChannelId: r.account_channel_id,
    dimension: r.dimension,
    dimensionTaxonomy: r.dimension_taxonomy,
    productTop1Label: r.product_top1_label,
    productTop1SharePercent: r.product_top1_share_percent,
    accountTop1Label: r.account_top1_label,
    accountTop1SharePercent: r.account_top1_share_percent,
    productTop1TagId: r.product_top1_tag_id,
    accountTop1TagId: r.account_top1_tag_id,
    gapScore: r.gap_score,
    priorityLabel: r.priority_label,
    priority: r.priority,
    direction: r.direction,
    actionType: r.action_type,
    legacyFitScore: r.legacy_fit_score,
    evidence: JSON.parse((r.evidence as string) ?? "{}"),
    orderIndex: r.order_index,
    qualityFlags: JSON.parse((r.quality_flags as string) ?? "[]"),
    source: r.source,
    sourceType: r.source_type,
    sourceBatchId: r.source_batch_id,
    dataVersion: r.data_version,
    generatedAt: r.generated_at,
    timeWindow: r.time_window,
  }));
  writeAudit(db, wsId, c.get("requestId"), "bi_advice", null,
    { view: table, filters, count: items.length,
      skuId: skuId ?? null, accountChannelId: accountChannelId ?? null,
      priority: priority ?? null, dimension: dimension ?? null });
  db.close();
  return ok(c, { items });
});

// ---------------------------------------------------------------------------
// GET /bi/douyin/summary-metrics — KPI totals from dashboard insightsSheet4.
// ---------------------------------------------------------------------------
bi.get("/summary-metrics", (c) => {
  const wsId = c.get("workspaceId");
  const { table, filters } = tableFor("douyin_summary_metric", c);
  const db = openDb(wsId);
  const conditions = ["workspace_id = ?"];
  const params: (string | number)[] = [wsId];
  applyVersionFilter(conditions, params, filters);
  const rows = db.prepare(
    `SELECT * FROM ${table} WHERE ${conditions.join(" AND ")} ORDER BY order_index ASC`
  ).all(...params) as Array<Record<string, unknown>>;
  const items = rows.map((r) => ({
    metricName: r.metric_name,
    metricValue: r.metric_value,
    metricValueNumeric: r.metric_value_numeric,
    orderIndex: r.order_index,
    source: r.source,
    sourceType: r.source_type,
    sourceBatchId: r.source_batch_id,
    dataVersion: r.data_version,
    generatedAt: r.generated_at,
    timeWindow: r.time_window,
  }));
  writeAudit(db, wsId, c.get("requestId"), "bi_summary", null,
    { view: table, filters, count: items.length });
  db.close();
  return ok(c, { items });
});

// ---------------------------------------------------------------------------
// GET /bi/douyin/versions — inspection of imported (sourceBatchId, dataVersion).
// ---------------------------------------------------------------------------
bi.get("/versions", (c) => {
  const wsId = c.get("workspaceId");
  const db = openDb(wsId);
  const rows = db.prepare(
    `SELECT DISTINCT source_batch_id, data_version, generated_at, time_window
     FROM douyin_account WHERE workspace_id = ?
     ORDER BY generated_at DESC`
  ).all(wsId) as Array<Record<string, unknown>>;
  db.close();
  return ok(c, {
    items: rows.map((r) => ({
      sourceBatchId: r.source_batch_id,
      dataVersion: r.data_version,
      generatedAt: r.generated_at,
      timeWindow: r.time_window,
    })),
  });
});

export default bi;

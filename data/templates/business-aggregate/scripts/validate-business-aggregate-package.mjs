#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const packageDir = path.resolve(process.argv[2] ?? path.join(repoRoot, "data/templates/business-aggregate/sample_package"));
const taxonomyPath = path.join(repoRoot, "docs/profile-taxonomy-v0.md");

const requiredFiles = [
  "run_manifest.json",
  "source_manifest.json",
  "product_master.jsonl",
  "channel_entity.jsonl",
  "product_aggregate.jsonl",
  "channel_aggregate.jsonl",
  "sku_channel_wide_table.jsonl",
  "field_mapping.csv",
  "unmapped_fields.csv",
  "quality_report.json",
  "report.md",
];
const allowedTagIds = new Set(
  [...fs.readFileSync(taxonomyPath, "utf8").matchAll(/`((?:demo|style|price|occasion|intent|channel)\.[a-z0-9_]+)`/g)].map((match) => match[1]),
);
const allowedUnmappedReasons = new Set(["unknown_semantics", "low_confidence", "not_in_taxonomy", "not_required_for_target"]);
const requiredQualityRules = [
  "missing_primary_key",
  "missing_time_window",
  "unrecognized_channel",
  "unrecognized_product",
  "invalid_amount_or_quantity",
  "low_profile_mapping_coverage",
  "unapproved_tag_id",
];
const errors = [];
const warnings = [];

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(packageDir, name), "utf8"));

const parseJsonl = (name) => {
  const text = fs.readFileSync(path.join(packageDir, name), "utf8").trim();
  if (!text) return [];
  return text.split(/\r?\n/).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      errors.push(`${name}:${index + 1} invalid JSON: ${error.message}`);
      return null;
    }
  }).filter(Boolean);
};

const parseCsv = (name) => {
  const text = fs.readFileSync(path.join(packageDir, name), "utf8").trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const header = lines[0].split(",");
  return lines.slice(1).map((line, index) => {
    const values = line.split(",");
    if (values.length !== header.length) errors.push(`${name}:${index + 2} has ${values.length} columns, expected ${header.length}`);
    return Object.fromEntries(header.map((key, valueIndex) => [key, values[valueIndex] ?? ""]));
  });
};

const assertRequired = (record, fields, label) => {
  for (const field of fields) {
    if (!(field in record) || record[field] === "" || record[field] === null || record[field] === undefined) errors.push(`${label} missing ${field}`);
  }
};

const assertRange = (value, label) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) errors.push(`${label} must be a number in 0-1`);
};

const assertPositiveInteger = (value, label) => {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) errors.push(`${label} must be a positive integer`);
};

const assertTimeWindow = (value, label) => {
  if (!/^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/.test(String(value))) errors.push(`${label} must use YYYY-MM-DD/YYYY-MM-DD`);
};

const validateTags = (tags, label) => {
  if (!Array.isArray(tags)) {
    errors.push(`${label} must be an array`);
    return;
  }
  tags.forEach((tag, index) => {
    const tagLabel = `${label}[${index}]`;
    assertRequired(tag, ["tagId", "score", "confidence", "source", "sampleSize", "timeWindow"], tagLabel);
    if (tag.tagId && !allowedTagIds.has(tag.tagId)) errors.push(`${tagLabel} unknown tagId ${tag.tagId}`);
    if ("score" in tag) assertRange(tag.score, `${tagLabel} score`);
    if ("confidence" in tag) assertRange(tag.confidence, `${tagLabel} confidence`);
    if ("sampleSize" in tag) assertPositiveInteger(tag.sampleSize, `${tagLabel} sampleSize`);
    if (tag.timeWindow) assertTimeWindow(tag.timeWindow, `${tagLabel} timeWindow`);
  });
};

const validateUpsertKey = (row, label, seenHashes) => {
  if (!row.upsertKey || typeof row.upsertKey !== "object") {
    errors.push(`${label} missing upsertKey`);
    return;
  }
  if (!Array.isArray(row.upsertKey.fields) || row.upsertKey.fields.length === 0) errors.push(`${label} upsertKey.fields must be a non-empty array`);
  if (!row.upsertKey.hash) errors.push(`${label} upsertKey.hash missing`);
  if (row.upsertKey.hash && seenHashes.has(row.upsertKey.hash)) errors.push(`${label} duplicate upsertKey.hash ${row.upsertKey.hash}`);
  if (row.upsertKey.hash) seenHashes.add(row.upsertKey.hash);
};

for (const name of requiredFiles) {
  if (!fs.existsSync(path.join(packageDir, name))) errors.push(`missing required file: ${name}`);
}

if (errors.length === 0) {
  const runManifest = readJson("run_manifest.json");
  const sourceManifest = readJson("source_manifest.json");
  const qualityReport = readJson("quality_report.json");
  const productMaster = parseJsonl("product_master.jsonl");
  const channelEntity = parseJsonl("channel_entity.jsonl");
  const productAggregate = parseJsonl("product_aggregate.jsonl");
  const channelAggregate = parseJsonl("channel_aggregate.jsonl");
  const wideTable = parseJsonl("sku_channel_wide_table.jsonl");
  const fieldMapping = parseCsv("field_mapping.csv");
  const unmappedFields = parseCsv("unmapped_fields.csv");

  assertRequired(runManifest, ["packageType", "packageVersion", "runId", "toolId", "workspaceId", "status", "startedAt", "finishedAt", "artifacts", "importAdapter"], "run_manifest");
  if (runManifest.packageType !== "business-aggregate") errors.push("run_manifest packageType must be business-aggregate");
  if (!runManifest.importAdapter || runManifest.importAdapter.packageType !== "business-aggregate") errors.push("run_manifest importAdapter.packageType must be business-aggregate");
  for (const field of ["sourceBatchId", "dataVersion", "targetTables", "confirmText", "idempotencyScope"]) {
    if (!runManifest.importAdapter || !(field in runManifest.importAdapter)) errors.push(`run_manifest importAdapter missing ${field}`);
  }

  assertRequired(sourceManifest, ["packageType", "sourceBatchId", "dataVersion", "generatedAt", "source", "sourceType", "workspaceId", "timeWindows", "inputSources", "entityCounts"], "source_manifest");
  if (sourceManifest.packageType !== "business-aggregate") errors.push("source_manifest packageType must be business-aggregate");
  (sourceManifest.timeWindows ?? []).forEach((timeWindow, index) => assertTimeWindow(timeWindow, `source_manifest timeWindows[${index}]`));

  const productIds = new Set(productMaster.map((row) => row.skuId || row.productId));
  const channelIds = new Set(channelEntity.map((row) => row.channelId || row.sourceEntityKey));
  const seenHashes = new Set();

  productMaster.forEach((row, index) => {
    const label = `product_master row ${index + 1}`;
    assertRequired(row, ["productMasterId", "workspaceId", "productId", "sourceProductKey", "sourceKeyPolicy", "categoryLv1", "mappedProductTags", "unmappedProductFields", "sourceId", "sourceBatchId", "dataVersion", "generatedAt", "sourceType", "qualityFlags", "upsertKey"], label);
    validateTags(row.mappedProductTags, `${label} mappedProductTags`);
    validateUpsertKey(row, label, seenHashes);
  });

  channelEntity.forEach((row, index) => {
    const label = `channel_entity row ${index + 1}`;
    assertRequired(row, ["channelEntityId", "workspaceId", "channelId", "entityType", "sourceEntityKey", "profileTags", "unmappedProfileFields", "sourceId", "sourceBatchId", "dataVersion", "generatedAt", "sourceType", "qualityFlags", "upsertKey"], label);
    validateTags(row.profileTags, `${label} profileTags`);
    if (row.channelTouchpointTags) validateTags(row.channelTouchpointTags, `${label} channelTouchpointTags`);
    validateUpsertKey(row, label, seenHashes);
  });

  productAggregate.forEach((row, index) => {
    const label = `product_aggregate row ${index + 1}`;
    assertRequired(row, ["productAggregateId", "workspaceId", "productId", "skuId", "timeWindow", "dataVersion", "source", "sourceType", "sourceBatchId", "generatedAt", "sampleSize", "metrics", "buyerProfileTags", "qualityFlags", "upsertKey"], label);
    if (!productIds.has(row.skuId) && !productIds.has(row.productId)) errors.push(`${label} references unknown product ${row.skuId ?? row.productId}`);
    assertTimeWindow(row.timeWindow, `${label} timeWindow`);
    assertPositiveInteger(row.sampleSize, `${label} sampleSize`);
    validateTags(row.buyerProfileTags, `${label} buyerProfileTags`);
    validateUpsertKey(row, label, seenHashes);
  });

  channelAggregate.forEach((row, index) => {
    const label = `channel_aggregate row ${index + 1}`;
    assertRequired(row, ["channelAggregateId", "workspaceId", "channelId", "timeWindow", "dataVersion", "source", "sourceType", "sourceBatchId", "generatedAt", "sampleSize", "metrics", "profileTags", "qualityFlags", "upsertKey"], label);
    if (!channelIds.has(row.channelId)) errors.push(`${label} references unknown channel ${row.channelId}`);
    assertTimeWindow(row.timeWindow, `${label} timeWindow`);
    assertPositiveInteger(row.sampleSize, `${label} sampleSize`);
    validateTags(row.profileTags, `${label} profileTags`);
    validateUpsertKey(row, label, seenHashes);
  });

  wideTable.forEach((row, index) => {
    const label = `sku_channel_wide_table row ${index + 1}`;
    assertRequired(row, ["wideTableRowId", "workspaceId", "skuId", "channelId", "timeWindow", "source", "sourceType", "sourceBatchId", "dataVersion", "generatedAt", "buyerProfileTags", "sampleSize", "profileCoverageRate", "missingFieldRate", "lowConfidenceTagCount", "isTrainable", "qualityFlags", "upsertKey"], label);
    if (!productIds.has(row.skuId)) errors.push(`${label} references unknown sku ${row.skuId}`);
    if (!channelIds.has(row.channelId)) errors.push(`${label} references unknown channel ${row.channelId}`);
    assertTimeWindow(row.timeWindow, `${label} timeWindow`);
    assertPositiveInteger(row.sampleSize, `${label} sampleSize`);
    assertRange(row.profileCoverageRate, `${label} profileCoverageRate`);
    assertRange(row.missingFieldRate, `${label} missingFieldRate`);
    validateTags(row.buyerProfileTags, `${label} buyerProfileTags`);
    if (row.mappedProductTags) validateTags(row.mappedProductTags, `${label} mappedProductTags`);
    if (row.channelProfileTags) validateTags(row.channelProfileTags, `${label} channelProfileTags`);
    validateUpsertKey(row, label, seenHashes);
  });

  fieldMapping.forEach((row, index) => {
    const label = `field_mapping row ${index + 1}`;
    assertRequired(row, ["mappingRuleId", "inputClass", "sourceObject", "sourceField", "sourceValuePattern", "targetObject", "targetField", "confidence", "usage", "requiredFor", "owner", "version"], label);
    if (row.mappedTagId && !allowedTagIds.has(row.mappedTagId)) errors.push(`${label} unknown mappedTagId ${row.mappedTagId}`);
    if (row.confidence) assertRange(row.confidence, `${label} confidence`);
  });

  unmappedFields.forEach((row, index) => {
    const label = `unmapped_fields row ${index + 1}`;
    assertRequired(row, ["inputClass", "sourceObject", "sourceField", "sourceValueBucket", "targetObject", "reason", "confidence", "recommendedHandling", "sampleSize", "timeWindow", "source", "sourceType", "sourceBatchId", "dataVersion"], label);
    if (row.reason && !allowedUnmappedReasons.has(row.reason)) errors.push(`${label} invalid reason ${row.reason}`);
    if (row.confidence) assertRange(row.confidence, `${label} confidence`);
    if (row.sampleSize) assertPositiveInteger(row.sampleSize, `${label} sampleSize`);
    if (row.timeWindow) assertTimeWindow(row.timeWindow, `${label} timeWindow`);
  });

  const expectedCounts = {
    productMaster: productMaster.length,
    channelEntity: channelEntity.length,
    productAggregate: productAggregate.length,
    channelAggregate: channelAggregate.length,
    skuChannelWideTable: wideTable.length,
    fieldMapping: fieldMapping.length,
    unmappedFields: unmappedFields.length,
  };
  for (const [key, count] of Object.entries(expectedCounts)) {
    if (sourceManifest.entityCounts?.[key] !== count) errors.push(`source_manifest entityCounts.${key} does not match package rows`);
    if (qualityReport.rowCounts?.[key] !== count) errors.push(`quality_report rowCounts.${key} does not match package rows`);
  }
  for (const rule of requiredQualityRules) {
    if (!(rule in (qualityReport.qualityRuleCounts ?? {}))) errors.push(`quality_report qualityRuleCounts missing ${rule}`);
  }
  if (qualityReport.packageType !== "business-aggregate") errors.push("quality_report packageType must be business-aggregate");
  if ("mappingCoverageRate" in qualityReport) assertRange(qualityReport.mappingCoverageRate, "quality_report mappingCoverageRate");
  if ("profileCoverageRate" in qualityReport) assertRange(qualityReport.profileCoverageRate, "quality_report profileCoverageRate");
  if (qualityReport.shareable !== true) errors.push("quality_report shareable must be true for valid sample package");
  if (sourceManifest.sourceBatchId !== runManifest.importAdapter?.sourceBatchId) errors.push("source_manifest sourceBatchId must match run_manifest importAdapter.sourceBatchId");
  if (sourceManifest.dataVersion !== runManifest.importAdapter?.dataVersion) errors.push("source_manifest dataVersion must match run_manifest importAdapter.dataVersion");
}

if (errors.length > 0) {
  console.error(JSON.stringify({ status: "fail", packageDir, errors, warnings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "pass", packageDir, warnings }, null, 2));

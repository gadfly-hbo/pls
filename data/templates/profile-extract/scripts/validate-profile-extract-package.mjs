#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const packageDir = path.resolve(process.argv[2] ?? path.join(repoRoot, "data/templates/profile-extract/sample_package"));
const taxonomyPath = path.join(repoRoot, "docs/profile-taxonomy-v0.md");

const requiredFiles = [
  "run_manifest.json",
  "source_manifest.json",
  "extracted_profiles.jsonl",
  "aggregate_profile.csv",
  "aggregate_profile.jsonl",
  "field_dictionary.csv",
  "unmapped_fields.csv",
  "quality_report.json",
  "report.md",
];
const allowedTagIds = new Set(
  [...fs.readFileSync(taxonomyPath, "utf8").matchAll(/`((?:demo|style|price|occasion|intent|channel)\.[a-z0-9_]+)`/g)].map((match) => match[1]),
);
const allowedUnmappedReasons = new Set(["unknown_semantics", "low_confidence", "not_in_taxonomy", "not_required_for_target"]);
const errors = [];
const warnings = [];

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(packageDir, name), "utf8"));

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

const assertRequired = (record, fields, label) => {
  for (const field of fields) {
    if (!(field in record) || record[field] === "" || record[field] === null || record[field] === undefined) {
      errors.push(`${label} missing ${field}`);
    }
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

for (const name of requiredFiles) {
  if (!fs.existsSync(path.join(packageDir, name))) errors.push(`missing required file: ${name}`);
}

if (errors.length === 0) {
  const runManifest = readJson("run_manifest.json");
  const sourceManifest = readJson("source_manifest.json");
  const qualityReport = readJson("quality_report.json");
  const extractedProfiles = parseJsonl("extracted_profiles.jsonl");
  const aggregateCsv = parseCsv("aggregate_profile.csv");
  const aggregateJsonl = parseJsonl("aggregate_profile.jsonl");
  const fieldDictionary = parseCsv("field_dictionary.csv");
  const unmappedFields = parseCsv("unmapped_fields.csv");

  assertRequired(runManifest, ["packageType", "packageVersion", "runId", "toolId", "workspaceId", "status", "startedAt", "finishedAt", "artifacts", "importAdapter"], "run_manifest");
  if (runManifest.packageType !== "profile-extract") errors.push("run_manifest packageType must be profile-extract");
  if (!Array.isArray(runManifest.artifacts)) errors.push("run_manifest artifacts must be an array");
  if (!runManifest.importAdapter || runManifest.importAdapter.packageType !== "profile-extract") errors.push("run_manifest importAdapter.packageType must be profile-extract");
  for (const field of ["sourceBatchId", "dataVersion", "targetTables", "confirmText", "idempotencyScope"]) {
    if (!runManifest.importAdapter || !(field in runManifest.importAdapter)) errors.push(`run_manifest importAdapter missing ${field}`);
  }

  assertRequired(sourceManifest, ["packageType", "sourceBatchId", "dataVersion", "generatedAt", "sourceType", "source", "platform", "timeWindows", "sources", "entityCounts"], "source_manifest");
  if (sourceManifest.packageType !== "profile-extract") errors.push("source_manifest packageType must be profile-extract");
  if (!Array.isArray(sourceManifest.timeWindows) || sourceManifest.timeWindows.length === 0) errors.push("source_manifest timeWindows must be a non-empty array");
  (sourceManifest.timeWindows ?? []).forEach((timeWindow, index) => assertTimeWindow(timeWindow, `source_manifest timeWindows[${index}]`));

  extractedProfiles.forEach((profile, index) => {
    const label = `extracted_profiles row ${index + 1}`;
    assertRequired(profile, ["profileId", "profileType", "entityType", "entityId", "platform", "source", "sourceType", "sourceBatchId", "dataVersion", "generatedAt", "timeWindow", "sampleSize", "tags", "unmappedFields", "qualityFlags", "upsertKey"], label);
    assertPositiveInteger(profile.sampleSize, `${label} sampleSize`);
    assertTimeWindow(profile.timeWindow, `${label} timeWindow`);
    if (!Array.isArray(profile.tags)) errors.push(`${label} tags must be an array`);
    (profile.tags ?? []).forEach((tag, tagIndex) => {
      const tagLabel = `${label} tags[${tagIndex}]`;
      assertRequired(tag, ["tagId", "score", "sourceField", "sourceValue", "confidence", "mappingRuleId"], tagLabel);
      if (tag.tagId && !allowedTagIds.has(tag.tagId)) errors.push(`${tagLabel} unknown tagId ${tag.tagId}`);
      if ("score" in tag) assertRange(tag.score, `${tagLabel} score`);
      if ("confidence" in tag) assertRange(tag.confidence, `${tagLabel} confidence`);
    });
    (profile.unmappedFields ?? []).forEach((field, fieldIndex) => {
      const fieldLabel = `${label} unmappedFields[${fieldIndex}]`;
      assertRequired(field, ["sourceField", "sourceValueBucket", "reason", "confidence", "recommendedHandling"], fieldLabel);
      if (field.reason && !allowedUnmappedReasons.has(field.reason)) errors.push(`${fieldLabel} invalid reason ${field.reason}`);
    });
  });

  aggregateCsv.forEach((row, index) => {
    const label = `aggregate_profile.csv row ${index + 1}`;
    assertRequired(row, ["profileId", "entityType", "entityId", "profileType", "platform", "sourceField", "sourceValue", "mappedTagId", "score", "confidence", "mappingRuleId", "sampleSize", "timeWindow", "source", "sourceType", "sourceBatchId", "dataVersion"], label);
    if (row.mappedTagId && !allowedTagIds.has(row.mappedTagId)) errors.push(`${label} unknown mappedTagId ${row.mappedTagId}`);
    if (row.score) assertRange(row.score, `${label} score`);
    if (row.confidence) assertRange(row.confidence, `${label} confidence`);
    if (row.sampleSize) assertPositiveInteger(row.sampleSize, `${label} sampleSize`);
    if (row.timeWindow) assertTimeWindow(row.timeWindow, `${label} timeWindow`);
  });

  aggregateJsonl.forEach((row, index) => {
    const label = `aggregate_profile.jsonl row ${index + 1}`;
    assertRequired(row, ["profileId", "mappedTagId", "score", "confidence", "sampleSize", "timeWindow", "source", "sourceType", "sourceBatchId", "dataVersion"], label);
    if (row.mappedTagId && !allowedTagIds.has(row.mappedTagId)) errors.push(`${label} unknown mappedTagId ${row.mappedTagId}`);
  });

  fieldDictionary.forEach((row, index) => {
    assertRequired(row, ["sourceObject", "sourceField", "sourceType", "targetObject", "targetField", "usage", "required"], `field_dictionary row ${index + 1}`);
  });

  unmappedFields.forEach((row, index) => {
    const label = `unmapped_fields row ${index + 1}`;
    assertRequired(row, ["profileId", "entityType", "entityId", "profileType", "platform", "sourceField", "sourceValueBucket", "reason", "confidence", "recommendedHandling", "sampleSize", "timeWindow", "source", "sourceType", "sourceBatchId", "dataVersion"], label);
    if (row.reason && !allowedUnmappedReasons.has(row.reason)) errors.push(`${label} invalid reason ${row.reason}`);
    if (row.confidence) assertRange(row.confidence, `${label} confidence`);
    if (row.sampleSize) assertPositiveInteger(row.sampleSize, `${label} sampleSize`);
  });

  if (sourceManifest.entityCounts?.extractedProfiles !== extractedProfiles.length) errors.push("source_manifest entityCounts.extractedProfiles does not match extracted_profiles.jsonl");
  if (sourceManifest.entityCounts?.aggregateProfileRows !== aggregateCsv.length) errors.push("source_manifest entityCounts.aggregateProfileRows does not match aggregate_profile.csv");
  if (sourceManifest.entityCounts?.unmappedFields !== unmappedFields.length) errors.push("source_manifest entityCounts.unmappedFields does not match unmapped_fields.csv");
  if (sourceManifest.entityCounts?.fieldDictionaryRows !== fieldDictionary.length) errors.push("source_manifest entityCounts.fieldDictionaryRows does not match field_dictionary.csv");
  if (aggregateCsv.length !== aggregateJsonl.length) errors.push("aggregate_profile.csv and aggregate_profile.jsonl row counts differ");

  if (qualityReport.packageType !== "profile-extract") errors.push("quality_report packageType must be profile-extract");
  if (qualityReport.profileCount !== extractedProfiles.length) errors.push("quality_report profileCount does not match extracted_profiles.jsonl");
  if (qualityReport.aggregateProfileRowCount !== aggregateCsv.length) errors.push("quality_report aggregateProfileRowCount does not match aggregate_profile.csv");
  if (qualityReport.fieldDictionaryRowCount !== fieldDictionary.length) errors.push("quality_report fieldDictionaryRowCount does not match field_dictionary.csv");
  if (qualityReport.unmappedFieldCount !== unmappedFields.length) errors.push("quality_report unmappedFieldCount does not match unmapped_fields.csv");
  if ("mappingCoverageRate" in qualityReport) assertRange(qualityReport.mappingCoverageRate, "quality_report mappingCoverageRate");
  if (qualityReport.shareable !== true) errors.push("quality_report shareable must be true for valid sample package");

  if (sourceManifest.sourceBatchId !== runManifest.importAdapter?.sourceBatchId) errors.push("source_manifest sourceBatchId must match run_manifest importAdapter.sourceBatchId");
  if (sourceManifest.dataVersion !== runManifest.importAdapter?.dataVersion) errors.push("source_manifest dataVersion must match run_manifest importAdapter.dataVersion");
}

if (errors.length > 0) {
  console.error(JSON.stringify({ status: "fail", packageDir, errors, warnings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "pass", packageDir, warnings }, null, 2));

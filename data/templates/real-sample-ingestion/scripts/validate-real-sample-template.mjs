#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const targetDir = path.resolve(process.argv[2] ?? path.join(repoRoot, "data/templates/real-sample-ingestion"));
const taxonomyPath = path.join(repoRoot, "docs/profile-taxonomy-v0.md");
const configPath = path.join(repoRoot, "data/templates/real-sample-ingestion/redline_scan_config.json");

const taxonomy = fs.readFileSync(taxonomyPath, "utf8");
const tagIds = new Set([...taxonomy.matchAll(/`((?:demo|style|price|occasion|intent|channel)\.[a-z0-9_]+)`/g)].map((match) => match[1]));
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const blockedFieldNames = new Set(config.blockedFieldNames.map((field) => field.toLowerCase()));

const requiredFiles = [
  "aggregate_profile.csv",
  "unmapped_fields.csv",
  "quality_report.json",
  "redline_scan_report.json",
];

const templateFallbacks = new Map([
  ["aggregate_profile.csv", "aggregate_profile.template.csv"],
  ["unmapped_fields.csv", "unmapped_fields.template.csv"],
  ["quality_report.json", "quality_report.template.json"],
  ["redline_scan_report.json", "redline_scan_report.template.json"],
]);

const errors = [];
const warnings = [];

const resolveInput = (name) => {
  const direct = path.join(targetDir, name);
  if (fs.existsSync(direct)) return direct;
  const fallback = templateFallbacks.get(name);
  const fallbackPath = fallback ? path.join(targetDir, fallback) : "";
  if (fallback && fs.existsSync(fallbackPath)) return fallbackPath;
  errors.push(`missing required file: ${name}`);
  return null;
};

const parseCsv = (filePath) => {
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const header = lines[0].split(",");
  return lines.slice(1).map((line, index) => {
    const values = line.split(",");
    if (values.length !== header.length) {
      errors.push(`${path.basename(filePath)}:${index + 2} has ${values.length} columns, expected ${header.length}`);
    }
    return Object.fromEntries(header.map((key, valueIndex) => [key, values[valueIndex] ?? ""]));
  });
};

const assertNumberRange = (value, label) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 1) {
    errors.push(`${label} must be a number in 0-1`);
  }
};

const assertPositiveInteger = (value, label) => {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    errors.push(`${label} must be a positive integer`);
  }
};

const scanObjectKeys = (value, label) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanObjectKeys(item, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (blockedFieldNames.has(key.toLowerCase())) {
      errors.push(`${label}.${key} uses a blocked field name`);
    }
    scanObjectKeys(child, `${label}.${key}`);
  }
};

const scanTextPatterns = (filePath) => {
  const text = fs.readFileSync(filePath, "utf8");
  const relative = path.relative(repoRoot, filePath);
  const patterns = [
    ["phone_cn", /\b1[3-9]\d{9}\b/],
    ["email", /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
    ["id_card_cn", /\b\d{17}[\dXx]\b/],
    ["long_numeric_identifier", /\b\d{16,}\b/],
  ];
  for (const [patternId, pattern] of patterns) {
    if (pattern.test(text)) {
      errors.push(`${relative} matches blocked pattern ${patternId}`);
    }
  }
};

for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const filePath = path.join(targetDir, entry.name);
  scanTextPatterns(filePath);
}

const aggregatePath = resolveInput("aggregate_profile.csv");
if (aggregatePath) {
  const rows = parseCsv(aggregatePath);
  if (rows.length === 0) errors.push("aggregate_profile.csv must contain at least one aggregate row");
  rows.forEach((row, index) => {
    const rowLabel = `aggregate row ${index + 1}`;
    for (const field of ["entityType", "entityId", "profileStage", "sourceField", "mappedTagId", "score", "confidence", "sampleSize", "timeWindow", "source", "sourceType", "batchId", "mappingRuleId"]) {
      if (!row[field]) errors.push(`${rowLabel} missing ${field}`);
    }
    if (row.mappedTagId && !tagIds.has(row.mappedTagId)) errors.push(`${rowLabel} unknown mappedTagId ${row.mappedTagId}`);
    if (row.score) assertNumberRange(row.score, `${rowLabel} score`);
    if (row.confidence) assertNumberRange(row.confidence, `${rowLabel} confidence`);
    if (row.sampleSize) assertPositiveInteger(row.sampleSize, `${rowLabel} sampleSize`);
    if (row.sourceType && row.sourceType !== "sanitized_aggregate") warnings.push(`${rowLabel} sourceType should be sanitized_aggregate for real samples`);
  });
}

const unmappedPath = resolveInput("unmapped_fields.csv");
if (unmappedPath) {
  const rows = parseCsv(unmappedPath);
  rows.forEach((row, index) => {
    const rowLabel = `unmapped row ${index + 1}`;
    for (const field of ["entityType", "entityId", "sourceField", "sourceValueBucket", "sampleSize", "timeWindow", "reason", "source", "batchId"]) {
      if (!row[field]) errors.push(`${rowLabel} missing ${field}`);
    }
    if (row.sampleSize) assertPositiveInteger(row.sampleSize, `${rowLabel} sampleSize`);
    if (row.reason && !["unknown_semantics", "low_confidence", "not_in_taxonomy"].includes(row.reason)) {
      errors.push(`${rowLabel} invalid reason ${row.reason}`);
    }
  });
}

const qualityPath = resolveInput("quality_report.json");
if (qualityPath) {
  const quality = JSON.parse(fs.readFileSync(qualityPath, "utf8"));
  scanObjectKeys(quality, "quality_report");
  for (const field of ["batchId", "source", "sourceType", "generatedAt", "timeWindows", "rowCount", "mappingCoverageRate", "unmappedFieldCount", "blockedFieldHitCount", "blockedPatternHitCount", "qualityFlags", "shareable"]) {
    if (!(field in quality)) errors.push(`quality_report missing ${field}`);
  }
  if (quality.sourceType && quality.sourceType !== "sanitized_aggregate") errors.push("quality_report sourceType must be sanitized_aggregate");
  if ("mappingCoverageRate" in quality) assertNumberRange(quality.mappingCoverageRate, "quality_report mappingCoverageRate");
  if (quality.shareable === true && ((quality.blockedFieldHitCount ?? 0) > 0 || (quality.blockedPatternHitCount ?? 0) > 0)) {
    errors.push("quality_report cannot be shareable when redline hits are present");
  }
}

const redlinePath = resolveInput("redline_scan_report.json");
if (redlinePath) {
  const report = JSON.parse(fs.readFileSync(redlinePath, "utf8"));
  scanObjectKeys(report, "redline_scan_report");
  if (report.rawValueSamplesIncluded !== false) errors.push("redline_scan_report rawValueSamplesIncluded must be false");
  if (!["pass", "fail"].includes(report.status)) errors.push("redline_scan_report status must be pass or fail");
  if (report.status === "pass") {
    const fieldHits = Array.isArray(report.blockedFieldHits) ? report.blockedFieldHits.length : 0;
    const patternHits = Array.isArray(report.blockedPatternHits) ? report.blockedPatternHits.length : 0;
    if (fieldHits > 0 || patternHits > 0) errors.push("redline_scan_report cannot pass with blocked hits");
  }
}

if (errors.length > 0) {
  console.error(JSON.stringify({ status: "fail", targetDir, errors, warnings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "pass", targetDir, warnings }, null, 2));

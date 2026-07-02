#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const targetDir = path.resolve(process.argv[2] ?? path.join(repoRoot, "data/p1/multi-timewindow-demo"));
const taxonomyPath = path.join(repoRoot, "docs/profile-taxonomy-v0.md");
const configPath = path.join(repoRoot, "data/templates/real-sample-ingestion/redline_scan_config.json");

const taxonomyText = fs.readFileSync(taxonomyPath, "utf8");
const allowedTagIds = new Set([...taxonomyText.matchAll(/`((?:demo|style|price|occasion|intent|channel)\.[a-z0-9_]+)`/g)].map((match) => match[1]));
const redlineConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
const blockedFieldNames = new Set(redlineConfig.blockedFieldNames.map((field) => field.toLowerCase()));

const errors = [];
const warnings = [];

const requiredFiles = ["wide_table.jsonl", "quality_report.json", "field_mapping.csv", "untrainable_rows.jsonl", "redline_scan_report.json", "README.md"];
for (const name of requiredFiles) {
  if (!fs.existsSync(path.join(targetDir, name))) errors.push(`missing required file: ${name}`);
}

const readJsonl = (filePath) => {
  const text = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        errors.push(`${path.basename(filePath)}:${index + 1} is not valid JSON`);
        return null;
      }
    })
    .filter(Boolean);
};

const isRange = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const isClosedWindow = (value) => /^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/.test(value);

const scanKeys = (value, label) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanKeys(item, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (blockedFieldNames.has(key.toLowerCase())) errors.push(`${label}.${key} uses blocked field name`);
    scanKeys(child, `${label}.${key}`);
  }
};

const scanPatterns = (filePath) => {
  const text = fs.readFileSync(filePath, "utf8");
  const relative = path.relative(repoRoot, filePath);
  const patterns = [
    ["phone_cn", /\b1[3-9]\d{9}\b/],
    ["email", /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
    ["id_card_cn", /\b\d{17}[\dXx]\b/],
    ["long_numeric_identifier", /\b\d{16,}\b/],
  ];
  for (const [patternId, pattern] of patterns) {
    if (pattern.test(text)) errors.push(`${relative} matches blocked pattern ${patternId}`);
  }
};

if (fs.existsSync(targetDir)) {
  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (entry.isFile()) scanPatterns(path.join(targetDir, entry.name));
  }
}

const rows = readJsonl(path.join(targetDir, "wide_table.jsonl"));
const grainKeys = new Set();
const timeWindows = new Set();
const skuIds = new Set();
const channelIds = new Set();

for (const [index, row] of rows.entries()) {
  const rowLabel = `wide_table row ${index + 1}`;
  scanKeys(row, rowLabel);
  for (const field of ["skuId", "channelId", "timeWindow", "batchId", "source", "sourceType", "sampleSize", "profileCoverageRate", "qualityFlags"]) {
    if (!(field in row)) errors.push(`${rowLabel} missing ${field}`);
  }
  if (row.sourceType !== "mock") warnings.push(`${rowLabel} sourceType is ${row.sourceType}, expected mock for this demo package`);
  if (!isClosedWindow(row.timeWindow)) errors.push(`${rowLabel} invalid timeWindow ${row.timeWindow}`);
  if (!Number.isInteger(row.sampleSize) || row.sampleSize <= 0) errors.push(`${rowLabel} sampleSize must be a positive integer`);
  if (!isRange(row.profileCoverageRate)) errors.push(`${rowLabel} profileCoverageRate must be in 0-1`);
  if (!isRange(row.missingFieldRate)) errors.push(`${rowLabel} missingFieldRate must be in 0-1`);
  for (const metric of ["gmvIndex", "conversionRate", "returnRate", "sellThroughRate", "trafficIndex"]) {
    if (metric in row && !isRange(row[metric])) errors.push(`${rowLabel} ${metric} must be in 0-1`);
  }
  const grainKey = `${row.skuId}|${row.channelId}|${row.timeWindow}`;
  if (grainKeys.has(grainKey)) errors.push(`${rowLabel} duplicates grain ${grainKey}`);
  grainKeys.add(grainKey);
  timeWindows.add(row.timeWindow);
  skuIds.add(row.skuId);
  channelIds.add(row.channelId);
  for (const tag of [...(row.mappedProductTags ?? []), ...(row.buyerProfileTags ?? [])]) {
    if (!allowedTagIds.has(tag.tagId)) errors.push(`${rowLabel} unknown tagId ${tag.tagId}`);
    if (!isRange(tag.score)) errors.push(`${rowLabel} tag ${tag.tagId} score must be in 0-1`);
    if (!isRange(tag.confidence)) errors.push(`${rowLabel} tag ${tag.tagId} confidence must be in 0-1`);
    if (tag.timeWindow !== row.timeWindow) errors.push(`${rowLabel} tag ${tag.tagId} timeWindow mismatch`);
  }
}

if (timeWindows.size < 2) errors.push("wide_table must cover at least two timeWindow values");
if (rows.length !== skuIds.size * channelIds.size * timeWindows.size) {
  errors.push(`wide_table row count ${rows.length} does not cover sku x channel x timeWindow = ${skuIds.size * channelIds.size * timeWindows.size}`);
}

const qualityPath = path.join(targetDir, "quality_report.json");
if (fs.existsSync(qualityPath)) {
  const quality = JSON.parse(fs.readFileSync(qualityPath, "utf8"));
  scanKeys(quality, "quality_report");
  if (quality.rowCount !== rows.length) errors.push("quality_report rowCount does not match wide_table");
  if (quality.skuCount !== skuIds.size) errors.push("quality_report skuCount does not match wide_table");
  if (quality.channelCount !== channelIds.size) errors.push("quality_report channelCount does not match wide_table");
  if (!Array.isArray(quality.timeWindows) || quality.timeWindows.length !== timeWindows.size) errors.push("quality_report timeWindows does not match wide_table");
}

const redlinePath = path.join(targetDir, "redline_scan_report.json");
if (fs.existsSync(redlinePath)) {
  const redline = JSON.parse(fs.readFileSync(redlinePath, "utf8"));
  scanKeys(redline, "redline_scan_report");
  if (redline.rawValueSamplesIncluded !== false) errors.push("redline_scan_report rawValueSamplesIncluded must be false");
  if (redline.status !== "pass") errors.push("redline_scan_report status must be pass");
  if ((redline.blockedFieldHits ?? []).length > 0 || (redline.blockedPatternHits ?? []).length > 0) errors.push("redline_scan_report cannot pass with blocked hits");
}

if (errors.length > 0) {
  console.error(JSON.stringify({ status: "fail", targetDir, errors, warnings }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "pass",
      targetDir,
      rowCount: rows.length,
      skuCount: skuIds.size,
      channelCount: channelIds.size,
      timeWindowCount: timeWindows.size,
      warnings,
    },
    null,
    2,
  ),
);

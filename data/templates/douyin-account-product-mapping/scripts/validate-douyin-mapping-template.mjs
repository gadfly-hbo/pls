#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const targetDir = path.resolve(process.argv[2] ?? path.join(repoRoot, "data/templates/douyin-account-product-mapping"));
const taxonomyPath = path.join(repoRoot, "docs/profile-taxonomy-v0.md");
const redlineConfigPath = path.join(repoRoot, "data/templates/real-sample-ingestion/redline_scan_config.json");

const requiredFiles = [
  "field_inventory.csv",
  "mapping_rules.template.csv",
  "unmapped_fields.template.csv",
  "quality_report.template.json",
  "redline_scan_report.template.json",
  "README.md",
];

const requiredSourceAreas = new Set(["product_basic", "product_performance", "account_profile", "fit_comparison", "adjustment_advice"]);
const requiredCoverage = new Set([
  "audience_age_band",
  "audience_gender_tendency",
  "audience_consumption_power",
  "audience_life_stage",
  "audience_city_tier",
  "audience_interest_behavior",
  "touchpoint_preference",
]);
const allowedReasons = new Set(["unknown_semantics", "low_confidence", "not_in_taxonomy"]);

const errors = [];
const warnings = [];

const taxonomyText = fs.readFileSync(taxonomyPath, "utf8");
const allowedTagIds = new Set([...taxonomyText.matchAll(/`((?:demo|style|price|occasion|intent|channel)\.[a-z0-9_]+)`/g)].map((match) => match[1]));
const redlineConfig = JSON.parse(fs.readFileSync(redlineConfigPath, "utf8"));
const blockedFieldNames = new Set(redlineConfig.blockedFieldNames.map((field) => field.toLowerCase()));
const blockedPatternIds = new Set(redlineConfig.blockedPatternIds ?? []);

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

const assertRange = (value, label) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    errors.push(`${label} must be a number in 0-1`);
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
    if (!blockedPatternIds.has(patternId)) continue;
    if (pattern.test(text)) errors.push(`${relative} matches blocked pattern ${patternId}`);
  }
};

for (const name of requiredFiles) {
  const filePath = path.join(targetDir, name);
  if (!fs.existsSync(filePath)) errors.push(`missing required file: ${name}`);
}

if (fs.existsSync(targetDir)) {
  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (entry.isFile()) scanTextPatterns(path.join(targetDir, entry.name));
  }
}

const fieldInventory = fs.existsSync(path.join(targetDir, "field_inventory.csv"))
  ? parseCsv(path.join(targetDir, "field_inventory.csv"))
  : [];
const mappingRules = fs.existsSync(path.join(targetDir, "mapping_rules.template.csv"))
  ? parseCsv(path.join(targetDir, "mapping_rules.template.csv"))
  : [];
const unmappedFields = fs.existsSync(path.join(targetDir, "unmapped_fields.template.csv"))
  ? parseCsv(path.join(targetDir, "unmapped_fields.template.csv"))
  : [];

const sourceAreas = new Set(fieldInventory.map((row) => row.sourceArea));
for (const area of requiredSourceAreas) {
  if (!sourceAreas.has(area)) errors.push(`field_inventory missing sourceArea ${area}`);
}

const coveredFields = new Set(mappingRules.map((row) => row.sourceField));
for (const sourceField of requiredCoverage) {
  if (!coveredFields.has(sourceField)) errors.push(`mapping_rules missing required coverage for ${sourceField}`);
}

mappingRules.forEach((row, index) => {
  const label = `mapping_rules row ${index + 1}`;
  for (const field of ["mappingRuleId", "sourceArea", "sourceField", "sourceValuePattern", "mappedTagId", "dimension", "confidence", "ruleType", "targetObject"]) {
    if (!row[field]) errors.push(`${label} missing ${field}`);
  }
  if (row.mappedTagId && !allowedTagIds.has(row.mappedTagId)) errors.push(`${label} unknown mappedTagId ${row.mappedTagId}`);
  if (row.confidence) assertRange(row.confidence, `${label} confidence`);
  if (Number(row.confidence) < 0.55) warnings.push(`${label} confidence below training threshold`);
});

unmappedFields.forEach((row, index) => {
  const label = `unmapped_fields row ${index + 1}`;
  for (const field of ["sourceArea", "sourceField", "sourceValueBucket", "reason", "targetObject", "recommendedHandling", "sampleSize", "timeWindow", "source", "batchId"]) {
    if (!row[field]) errors.push(`${label} missing ${field}`);
  }
  if (row.reason && !allowedReasons.has(row.reason)) errors.push(`${label} invalid reason ${row.reason}`);
  const sampleSize = Number(row.sampleSize);
  if (!Number.isInteger(sampleSize) || sampleSize <= 0) errors.push(`${label} sampleSize must be a positive integer`);
});

const qualityPath = path.join(targetDir, "quality_report.template.json");
if (fs.existsSync(qualityPath)) {
  const quality = JSON.parse(fs.readFileSync(qualityPath, "utf8"));
  scanObjectKeys(quality, "quality_report");
  if (quality.sourceType !== "manual_mapping") errors.push("quality_report sourceType must be manual_mapping");
  if (quality.fieldInventoryRowCount !== fieldInventory.length) errors.push("quality_report fieldInventoryRowCount does not match field_inventory.csv");
  if (quality.mappingRuleCount !== mappingRules.length) errors.push("quality_report mappingRuleCount does not match mapping_rules.template.csv");
  if (quality.unmappedFieldCount !== unmappedFields.length) errors.push("quality_report unmappedFieldCount does not match unmapped_fields.template.csv");
  if ("mappingCoverageRate" in quality) assertRange(quality.mappingCoverageRate, "quality_report mappingCoverageRate");
  if (quality.shareable !== true) errors.push("quality_report shareable must be true for this template");
  if (redlineConfig.shareableStatus?.privacyRedlineDisabled !== true && ((quality.blockedFieldHitCount ?? 0) !== 0 || (quality.blockedPatternHitCount ?? 0) !== 0)) {
    errors.push("quality_report must not contain blocked hits");
  }
}

const redlinePath = path.join(targetDir, "redline_scan_report.template.json");
if (fs.existsSync(redlinePath)) {
  const report = JSON.parse(fs.readFileSync(redlinePath, "utf8"));
  scanObjectKeys(report, "redline_scan_report");
  if (redlineConfig.reportPolicy?.includeRawValues !== true && report.rawValueSamplesIncluded !== false) errors.push("redline_scan_report rawValueSamplesIncluded must be false");
  if (report.status !== "pass") errors.push("redline_scan_report status must be pass");
  if (redlineConfig.shareableStatus?.privacyRedlineDisabled !== true && ((report.blockedFieldHits ?? []).length > 0 || (report.blockedPatternHits ?? []).length > 0)) {
    errors.push("redline_scan_report cannot pass with blocked hits");
  }
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
      fieldInventoryRowCount: fieldInventory.length,
      mappingRuleCount: mappingRules.length,
      unmappedFieldCount: unmappedFields.length,
      warnings,
    },
    null,
    2,
  ),
);

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const packageDir = path.resolve(process.argv[2] ?? path.join(repoRoot, "data/templates/single-product-portrait-sample/sample_package"));

const requiredFiles = [
  "source_manifest.json",
  "product_attributes.jsonl",
  "platform_portrait.csv",
  "field_mapping.csv",
  "quality_report.json",
  "report.md",
];
const requiredProductFields = ["skuId", "sourceProductKey", "gender", "category", "source", "sourceType", "sourceBatchId", "dataVersion", "timeWindow", "qualityFlags"];
const requiredPortraitFields = ["skuId", "sourceProductKey", "labelType", "label", "share", "source", "sourceType", "sourceBatchId", "dataVersion", "timeWindow", "qualityFlags"];
const requiredMappingFields = ["sourceObject", "sourceField", "targetObject", "targetField", "mappingRule", "required", "confidence", "owner", "version"];
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

const assertNonNegativeNumberOrBlank = (value, label) => {
  if (value === "" || value === null || value === undefined) return;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) errors.push(`${label} must be blank or a non-negative number`);
};

const assertTimeWindow = (value, label) => {
  if (!/^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/.test(String(value))) errors.push(`${label} must use YYYY-MM-DD/YYYY-MM-DD`);
};

for (const name of requiredFiles) {
  if (!fs.existsSync(path.join(packageDir, name))) errors.push(`missing required file: ${name}`);
}

if (errors.length === 0) {
  const sourceManifest = readJson("source_manifest.json");
  const qualityReport = readJson("quality_report.json");
  const productAttributes = parseJsonl("product_attributes.jsonl");
  const portraitRows = parseCsv("platform_portrait.csv");
  const fieldMapping = parseCsv("field_mapping.csv");
  const allowedLabelTypes = new Set(sourceManifest.allowedLabelTypes ?? []);
  const productKeys = new Set();
  const productTimeWindows = new Set();
  let missingRequiredAttributeCount = 0;
  let unboundPortraitRowCount = 0;

  assertRequired(sourceManifest, ["packageType", "packageVersion", "sourceBatchId", "dataVersion", "generatedAt", "source", "sourceType", "workspaceId", "timeWindows", "allowedLabelTypes", "inputSources", "entityCounts", "calibrationReadiness"], "source_manifest");
  if (sourceManifest.packageType !== "single-product-portrait-sample") errors.push("source_manifest packageType must be single-product-portrait-sample");
  if (!Array.isArray(sourceManifest.timeWindows) || sourceManifest.timeWindows.length === 0) errors.push("source_manifest timeWindows must be a non-empty array");
  (sourceManifest.timeWindows ?? []).forEach((timeWindow, index) => assertTimeWindow(timeWindow, `source_manifest timeWindows[${index}]`));
  if (!Array.isArray(sourceManifest.allowedLabelTypes) || sourceManifest.allowedLabelTypes.length === 0) errors.push("source_manifest allowedLabelTypes must be a non-empty array");

  productAttributes.forEach((row, index) => {
    const label = `product_attributes row ${index + 1}`;
    assertRequired(row, requiredProductFields, label);
    for (const field of ["skuId", "sourceProductKey", "gender", "category"]) {
      if (!row[field]) missingRequiredAttributeCount += 1;
    }
    assertTimeWindow(row.timeWindow, `${label} timeWindow`);
    if (!sourceManifest.timeWindows.includes(row.timeWindow)) errors.push(`${label} timeWindow must be declared in source_manifest.timeWindows`);
    if (row.source !== sourceManifest.source) errors.push(`${label} source must match source_manifest.source`);
    if (row.sourceType !== sourceManifest.sourceType) errors.push(`${label} sourceType must match source_manifest.sourceType`);
    if (row.sourceBatchId !== sourceManifest.sourceBatchId) errors.push(`${label} sourceBatchId must match source_manifest.sourceBatchId`);
    if (row.dataVersion !== sourceManifest.dataVersion) errors.push(`${label} dataVersion must match source_manifest.dataVersion`);
    if (!Array.isArray(row.qualityFlags)) errors.push(`${label} qualityFlags must be an array`);
    if (!row.upsertKey?.hash) errors.push(`${label} missing upsertKey.hash`);
    productKeys.add(`${row.skuId}::${row.sourceProductKey}`);
    productTimeWindows.add(row.timeWindow);
  });

  portraitRows.forEach((row, index) => {
    const label = `platform_portrait row ${index + 1}`;
    assertRequired(row, requiredPortraitFields, label);
    if (!allowedLabelTypes.has(row.labelType)) errors.push(`${label} labelType ${row.labelType} is not declared in source_manifest.allowedLabelTypes`);
    if (!productKeys.has(`${row.skuId}::${row.sourceProductKey}`)) {
      unboundPortraitRowCount += 1;
      errors.push(`${label} is not bound to product_attributes by skuId + sourceProductKey`);
    }
    assertRange(row.share, `${label} share`);
    assertNonNegativeNumberOrBlank(row.tgi, `${label} tgi`);
    assertTimeWindow(row.timeWindow, `${label} timeWindow`);
    if (row.source !== sourceManifest.source) errors.push(`${label} source must match source_manifest.source`);
    if (row.sourceType !== sourceManifest.sourceType) errors.push(`${label} sourceType must match source_manifest.sourceType`);
    if (row.sourceBatchId !== sourceManifest.sourceBatchId) errors.push(`${label} sourceBatchId must match source_manifest.sourceBatchId`);
    if (row.dataVersion !== sourceManifest.dataVersion) errors.push(`${label} dataVersion must match source_manifest.dataVersion`);
    if (!sourceManifest.timeWindows.includes(row.timeWindow)) errors.push(`${label} timeWindow must be declared in source_manifest.timeWindows`);
  });

  fieldMapping.forEach((row, index) => {
    const label = `field_mapping row ${index + 1}`;
    assertRequired(row, requiredMappingFields, label);
    if (row.confidence) assertRange(row.confidence, `${label} confidence`);
  });

  if (sourceManifest.entityCounts?.productAttributes !== productAttributes.length) errors.push("source_manifest entityCounts.productAttributes does not match product_attributes.jsonl");
  if (sourceManifest.entityCounts?.platformPortraitRows !== portraitRows.length) errors.push("source_manifest entityCounts.platformPortraitRows does not match platform_portrait.csv");
  if (sourceManifest.entityCounts?.fieldMappingRows !== fieldMapping.length) errors.push("source_manifest entityCounts.fieldMappingRows does not match field_mapping.csv");
  if (sourceManifest.entityCounts?.abnormalRows !== qualityReport.abnormalRowCount) errors.push("source_manifest entityCounts.abnormalRows must match quality_report abnormalRowCount");

  if (qualityReport.packageType !== "single-product-portrait-sample") errors.push("quality_report packageType must be single-product-portrait-sample");
  if (qualityReport.productAttributeCount !== productAttributes.length) errors.push("quality_report productAttributeCount does not match product_attributes.jsonl");
  if (qualityReport.platformPortraitRowCount !== portraitRows.length) errors.push("quality_report platformPortraitRowCount does not match platform_portrait.csv");
  if (qualityReport.fieldMappingRowCount !== fieldMapping.length) errors.push("quality_report fieldMappingRowCount does not match field_mapping.csv");
  if (qualityReport.missingRequiredAttributeCount !== missingRequiredAttributeCount) errors.push("quality_report missingRequiredAttributeCount does not match validation result");
  if (qualityReport.unboundPortraitRowCount !== unboundPortraitRowCount) errors.push("quality_report unboundPortraitRowCount does not match validation result");
  if (qualityReport.labelTypeCount !== allowedLabelTypes.size) errors.push("quality_report labelTypeCount does not match source_manifest.allowedLabelTypes");
  if (qualityReport.shareable !== true) errors.push("quality_report shareable must be true for valid sample package");

  const validProductCount = productAttributes.filter((row) => productKeys.has(`${row.skuId}::${row.sourceProductKey}`)).length;
  if (qualityReport.validProductCount !== validProductCount) errors.push("quality_report validProductCount does not match validation result");
  const minimumValidProducts = qualityReport.calibrationReadiness?.minimumValidProducts;
  const currentValidProducts = qualityReport.calibrationReadiness?.currentValidProducts;
  if (minimumValidProducts !== 5) errors.push("quality_report calibrationReadiness.minimumValidProducts must be 5 for small-sample calibration");
  if (currentValidProducts !== validProductCount) errors.push("quality_report calibrationReadiness.currentValidProducts does not match validProductCount");
  if (validProductCount < 5 && qualityReport.calibrationReadiness?.readyForSmallSampleCalibration !== false) errors.push("quality_report must mark readyForSmallSampleCalibration=false when validProductCount < 5");

  if (productTimeWindows.size === 0) warnings.push("no product timeWindow found");
}

if (errors.length > 0) {
  console.error(JSON.stringify({ status: "fail", packageDir, errors, warnings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "pass", packageDir, warnings }, null, 2));

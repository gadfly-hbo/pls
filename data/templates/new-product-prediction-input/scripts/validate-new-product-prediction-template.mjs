#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templateDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(templateDir, "..", "..", "..");

const files = {
  schema: path.join(templateDir, "new_product_prediction_input.schema.json"),
  input: path.join(templateDir, "new_product_prediction_input.template.json"),
  mapping: path.join(templateDir, "field_mapping.template.csv"),
  quality: path.join(templateDir, "quality_report.template.json"),
  readme: path.join(templateDir, "README.md"),
  taxonomy: path.join(repoRoot, "docs", "profile-taxonomy-v0.md"),
};

const errors = [];
const warnings = [];

function requireFile(label, filePath) {
  if (!fs.existsSync(filePath)) {
    errors.push(`missing ${label}: ${path.relative(repoRoot, filePath)}`);
    return false;
  }
  return true;
}

function readJson(label, filePath) {
  if (!requireFile(label, filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    errors.push(`invalid json ${label}: ${err.message}`);
    return null;
  }
}

for (const [label, filePath] of Object.entries(files)) requireFile(label, filePath);

const schema = readJson("schema", files.schema);
const input = readJson("input", files.input);
const quality = readJson("quality", files.quality);
const mappingCsv = fs.existsSync(files.mapping) ? fs.readFileSync(files.mapping, "utf8") : "";
const taxonomy = fs.existsSync(files.taxonomy) ? fs.readFileSync(files.taxonomy, "utf8") : "";

if (schema?.title !== "PLS New Product Prediction Input Template") {
  errors.push("schema title mismatch");
}

const requiredGroups = [
  "identity",
  "category",
  "priceAndSeason",
  "sellingPoints",
  "material",
  "styleAndScenario",
  "assets",
  "similarProducts",
  "lineage",
  "quality",
];

if (input) {
  if (input.schemaVersion !== "d-p2-7.new_product_prediction_input.v0.1") {
    errors.push("input schemaVersion mismatch");
  }
  if (input.templateMode !== true) {
    errors.push("input.templateMode must be true");
  }
  for (const group of requiredGroups) {
    if (!input.productMaster || !Object.prototype.hasOwnProperty.call(input.productMaster, group)) {
      errors.push(`missing productMaster group: ${group}`);
    }
  }

  const identity = input.productMaster?.identity ?? {};
  const forbiddenFilledFields = [
    ["productMaster.identity.workspaceId", identity.workspaceId],
    ["productMaster.identity.productMasterId", identity.productMasterId],
    ["productMaster.identity.productId", identity.productId],
    ["productMaster.identity.sourceProductKey", identity.sourceProductKey],
    ["productMaster.category.categoryLv1", input.productMaster?.category?.categoryLv1],
    ["productMaster.lineage.sourceBatchId", input.productMaster?.lineage?.sourceBatchId],
    ["productMaster.lineage.dataVersion", input.productMaster?.lineage?.dataVersion],
  ];
  for (const [field, value] of forbiddenFilledFields) {
    if (value !== null) {
      errors.push(`${field} must remain null in template mode`);
    }
  }

  const mappedTags = input.productMaster?.styleAndScenario?.mappedProductTags ?? [];
  if (!Array.isArray(mappedTags)) {
    errors.push("mappedProductTags must be an array");
  } else {
    for (const tag of mappedTags) {
      if (!tag.tagId || !taxonomy.includes(`\`${tag.tagId}\``)) {
        errors.push(`mappedProductTags contains tagId not in taxonomy: ${tag.tagId}`);
      }
    }
  }

  const allowedNamespaces = input.mappingContext?.allowedTagNamespaces ?? [];
  for (const ns of allowedNamespaces) {
    if (!["demo", "style", "price", "occasion", "intent", "channel"].includes(ns)) {
      errors.push(`unapproved tag namespace: ${ns}`);
    }
  }
}

const expectedHeader = [
  "mappingId",
  "sourceId",
  "sourceBatchId",
  "dataVersion",
  "sourceObject",
  "sourceField",
  "sourceValuePattern",
  "targetObject",
  "targetField",
  "targetUsage",
  "mappingRule",
  "mappedTagId",
  "confidence",
  "requiredFor",
  "unmappedReason",
  "recommendedHandling",
  "owner",
  "version",
  "notes",
];
const header = mappingCsv.split("\n")[0]?.split(",") ?? [];
for (const column of expectedHeader) {
  if (!header.includes(column)) errors.push(`mapping csv missing column: ${column}`);
}

if (quality) {
  for (const group of ["missing", "conflict", "unmappable", "lowConfidence"]) {
    if (!Array.isArray(quality.qualityRules?.[group]) || quality.qualityRules[group].length === 0) {
      errors.push(`quality_report qualityRules.${group} must be a non-empty array`);
    }
  }
  if (quality.admissionPolicy !== "user_authorized_full_passthrough") {
    errors.push("quality_report admissionPolicy mismatch");
  }
}

const summary = {
  templateDir: path.relative(repoRoot, templateDir),
  requiredGroups,
  errorCount: errors.length,
  warningCount: warnings.length,
  errors,
  warnings,
};

process.stdout.write(JSON.stringify(summary, null, 2) + "\n");

if (errors.length > 0) {
  process.stderr.write(`[validate-new-product-prediction-template] ${errors.length} error(s)\n`);
  process.exit(1);
}

process.stderr.write("[validate-new-product-prediction-template] ok\n");

import fs from "node:fs";
import path from "node:path";

const packageDir = process.argv[2] ?? path.join("data", "templates", "channel-profile-object-library", "sample_package");
const requiredFiles = [
  "run_manifest.json",
  "source_manifest.json",
  "basic_templates.csv",
  "channel_objects.jsonl",
  "bindings.jsonl",
  "audience_profiles.jsonl",
  "product_fit_profiles.jsonl",
  "field_dictionary.csv",
  "quality_report.json",
  "report.md",
];

const requiredObjectTypes = ["platform", "trade_area", "store", "account", "marketing_event", "business_scenario"];
const requiredQualityRules = [
  "missing_parent_reference",
  "generated_key_needs_review",
  "manual_entity_without_profile",
  "possible_duplicate",
  "unapproved_tag_id",
  "invalid_object_type",
  "event_or_scenario_as_channel_entity",
  "missing_profile_lineage",
];
const requiredFailureExamples = ["missing_parent_reference", "generated_key_needs_review", "possible_duplicate"];

const failures = [];

function readText(fileName) {
  return fs.readFileSync(path.join(packageDir, fileName), "utf8");
}

function readJson(fileName) {
  return JSON.parse(readText(fileName));
}

function readJsonl(fileName) {
  return readText(fileName)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        failures.push(`${fileName}:${index + 1} is not valid JSON: ${error.message}`);
        return null;
      }
    })
    .filter(Boolean);
}

for (const fileName of requiredFiles) {
  if (!fs.existsSync(path.join(packageDir, fileName))) {
    failures.push(`Missing required file: ${fileName}`);
  }
}

if (failures.length === 0) {
  const runManifest = readJson("run_manifest.json");
  const sourceManifest = readJson("source_manifest.json");
  const qualityReport = readJson("quality_report.json");
  const basicTemplates = readText("basic_templates.csv").trim().split(/\r?\n/).slice(1);
  const objects = readJsonl("channel_objects.jsonl");
  const bindings = readJsonl("bindings.jsonl");
  const audienceProfiles = readJsonl("audience_profiles.jsonl");
  const productFitProfiles = readJsonl("product_fit_profiles.jsonl");
  const fieldDictionaryRows = readText("field_dictionary.csv").trim().split(/\r?\n/).slice(1);

  if (runManifest.packageType !== "channel-profile-object-library") failures.push("run_manifest.packageType must be channel-profile-object-library");
  if (sourceManifest.packageType !== "channel-profile-object-library") failures.push("source_manifest.packageType must be channel-profile-object-library");
  if (qualityReport.packageType !== "channel-profile-object-library") failures.push("quality_report.packageType must be channel-profile-object-library");

  const basicTemplateTypes = new Set(basicTemplates.map((line) => line.split(",")[0]));
  const objectTypes = new Set(objects.map((row) => row.objectType));
  for (const objectType of requiredObjectTypes) {
    if (!basicTemplateTypes.has(objectType)) failures.push(`basic_templates.csv missing ${objectType}`);
    if (!objectTypes.has(objectType)) failures.push(`channel_objects.jsonl missing ${objectType}`);
  }

  const objectKeys = new Set(objects.map((row) => row.canonicalObjectKey));
  for (const row of objects) {
    if (!requiredObjectTypes.includes(row.objectType)) failures.push(`Invalid objectType: ${row.objectType}`);
    if (row.canonicalObjectKey !== `${row.objectType}:${row.sourceStableKey}`) failures.push(`Invalid canonicalObjectKey for ${row.canonicalObjectKey}`);
    if (row.objectVersionId !== `${row.workspaceId}:${row.objectType}:${row.sourceStableKey}:${row.dataVersion}`) failures.push(`Invalid objectVersionId for ${row.canonicalObjectKey}`);
    if ((row.objectType === "marketing_event" || row.objectType === "business_scenario") && row.targetObject === "ChannelEntity") {
      failures.push(`${row.objectType} must not target ChannelEntity`);
    }
    if (!Array.isArray(row.duplicateCandidateKeys) || typeof row.possibleDuplicate !== "boolean" || !row.manualReviewStatus) {
      failures.push(`Duplicate review fields incomplete for ${row.canonicalObjectKey}`);
    }
  }

  for (const binding of bindings) {
    if (!objectKeys.has(binding.fromCanonicalObjectKey)) failures.push(`Binding from key missing: ${binding.fromCanonicalObjectKey}`);
    if (!objectKeys.has(binding.toCanonicalObjectKey)) failures.push(`Binding to key missing: ${binding.toCanonicalObjectKey}`);
  }

  const taxonomyText = fs.readFileSync(path.resolve("docs", "profile-taxonomy-v0.md"), "utf8");
  const allowedTagIds = new Set([...taxonomyText.matchAll(/`([a-z]+\.[a-z0-9_]+)`/g)].map((match) => match[1]));
  for (const profile of audienceProfiles) {
    if (!objectKeys.has(profile.canonicalObjectKey)) failures.push(`AudienceProfile object missing: ${profile.canonicalObjectKey}`);
    for (const field of ["source", "sourceBatchId", "dataVersion", "timeWindow", "confidence"]) {
      if (profile[field] === undefined || profile[field] === null || profile[field] === "") failures.push(`AudienceProfile ${profile.profileId} missing ${field}`);
    }
    if (typeof profile.sampleSize !== "number") failures.push(`AudienceProfile ${profile.profileId} must provide numeric sampleSize`);
    for (const tag of profile.tags ?? []) {
      if (!allowedTagIds.has(tag.tagId)) failures.push(`Unapproved tagId in ${profile.profileId}: ${tag.tagId}`);
    }
  }

  for (const profile of productFitProfiles) {
    if (!objectKeys.has(profile.canonicalObjectKey)) failures.push(`ProductFitProfile object missing: ${profile.canonicalObjectKey}`);
    for (const field of ["source", "sourceBatchId", "dataVersion", "confidence", "fitCategories", "fitPriceBands", "fitStyles", "fitOccasions", "fitLaunchTypes", "evidence"]) {
      if (profile[field] === undefined || profile[field] === null) failures.push(`ProductFitProfile ${profile.profileId} missing ${field}`);
    }
  }

  const expectedCounts = qualityReport.rowCounts ?? {};
  const actualCounts = {
    basicTemplates: basicTemplates.length,
    channelObjects: objects.length,
    bindings: bindings.length,
    audienceProfiles: audienceProfiles.length,
    productFitProfiles: productFitProfiles.length,
    fieldDictionary: fieldDictionaryRows.length,
  };
  for (const [key, count] of Object.entries(actualCounts)) {
    if (expectedCounts[key] !== count) failures.push(`quality_report.rowCounts.${key} expected ${expectedCounts[key]}, got ${count}`);
  }

  for (const ruleId of requiredQualityRules) {
    if (qualityReport.qualityRuleCounts?.[ruleId] === undefined) failures.push(`quality_report missing rule ${ruleId}`);
  }
  const failureExampleIds = new Set((qualityReport.failureExamples ?? []).map((example) => example.ruleId));
  for (const ruleId of requiredFailureExamples) {
    if (!failureExampleIds.has(ruleId)) failures.push(`quality_report.failureExamples missing ${ruleId}`);
  }
}

const summary = {
  ok: failures.length === 0,
  packageDir,
  failures,
};

console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exit(1);

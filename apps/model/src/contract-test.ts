import {
  loadChannelProfiles,
  loadDemoSkus,
  matchChannels,
  MODEL_VERSION,
  predictProductProfile,
  toProductDNA,
} from "./baseline.js";

interface ContractCheckResult {
  ok: boolean;
  checkedSkuId: string;
  predictionFields: string[];
  matchFields: string[];
  failures: string[];
}

const REQUIRED_PREDICTION_FIELDS = [
  "modelVersion",
  "modelPath",
  "predictedProfileTags",
  "topSegments",
  "qualityFlags",
  "unmappedInputTokens",
] as const;

const REQUIRED_MATCH_FIELDS = [
  "channelId",
  "channelType",
  "matchScore",
  "matchConfidence",
  "rank",
  "overlap",
  "bestSegmentId",
  "bestSegmentMatch",
  "positiveDrivers",
  "negativeDrivers",
  "qualityFlags",
] as const;

const sku = loadDemoSkus()[0];
if (!sku) {
  throw new Error("No demo SKU found for contract test");
}

const prediction = predictProductProfile(toProductDNA(sku));
const matches = matchChannels(prediction, loadChannelProfiles());
const failures: string[] = [];

for (const field of REQUIRED_PREDICTION_FIELDS) {
  if (!(field in prediction)) failures.push(`missing prediction field: ${field}`);
}

if (prediction.modelVersion !== MODEL_VERSION) failures.push("prediction.modelVersion mismatch");
if (prediction.predictedProfileTags.length === 0) failures.push("prediction.predictedProfileTags is empty");
if (prediction.topSegments.length === 0 || prediction.topSegments.length > 3) failures.push("prediction.topSegments length must be 1..3");
if (prediction.predictedProfileTags.some((tag) => !tag.tagId.includes("."))) failures.push("prediction tagId must be taxonomy-like");

for (const match of matches) {
  for (const field of REQUIRED_MATCH_FIELDS) {
    if (!(field in match)) failures.push(`missing match field: ${field}`);
  }
  if (match.matchScore < 0 || match.matchScore > 1) failures.push(`matchScore out of range: ${match.channelId}`);
  if (match.matchConfidence < 0 || match.matchConfidence > 1) failures.push(`matchConfidence out of range: ${match.channelId}`);
  if (match.positiveDrivers.some((driver) => !driver.tagId.includes("."))) failures.push(`positive driver tagId invalid: ${match.channelId}`);
  if (match.negativeDrivers.some((driver) => !driver.tagId.includes("."))) failures.push(`negative driver tagId invalid: ${match.channelId}`);
}

if (matches.length < 4) failures.push("expected at least 4 channel matches");

const result: ContractCheckResult = {
  ok: failures.length === 0,
  checkedSkuId: sku.skuId,
  predictionFields: [...REQUIRED_PREDICTION_FIELDS],
  matchFields: [...REQUIRED_MATCH_FIELDS],
  failures,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;

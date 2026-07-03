import {
  type ChannelProfile,
  loadChannelProfiles,
  loadDemoSkus,
  matchChannels,
  MODEL_VERSION,
  predictProductProfile,
  type ProductProfileDraft,
  type ProfileTagScore,
  toProductDNA,
} from "./baseline.js";
import {
  predictNewProductProfile,
  toProductChannelFitProfile,
  type NewProductMasterPredictionInput,
  type PredictedProductProfile,
  type SimilarProductReference,
} from "./new-product-prediction.js";
import { explainProductChannelFit, type ProductChannelFit, type ProductChannelFitInput } from "./product-channel-fit.js";

interface ContractCheckResult {
  ok: boolean;
  checkedSkuId: string;
  predictionFields: string[];
  matchFields: string[];
  productChannelFitScenarios: string[];
  newProductPredictionScenarios: string[];
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

const productChannelFitScenarios = runProductChannelFitContractChecks();
const newProductPredictionScenarios = runNewProductPredictionContractChecks();

const result: ContractCheckResult = {
  ok: failures.length === 0,
  checkedSkuId: sku.skuId,
  predictionFields: [...REQUIRED_PREDICTION_FIELDS],
  matchFields: [...REQUIRED_MATCH_FIELDS],
  productChannelFitScenarios,
  newProductPredictionScenarios,
  failures,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;

function runProductChannelFitContractChecks(): string[] {
  const scenarios: Array<{ name: string; input: ProductChannelFitInput; check: (fit: ProductChannelFit) => string[] }> = [
    {
      name: "matched",
      input: fitInput("matched", tags(["demo.female", "price.mid", "style.minimal"]), tags(["demo.female", "price.mid", "style.minimal"]), 1000),
      check: (fit) => [
        fit.recommendation === "priority_launch" ? "" : `matched expected priority_launch, got ${fit.recommendation}`,
        fit.explanation.matchedTags.length >= 3 ? "" : "matched expected at least 3 matchedTags",
        fit.explanation.conflictTags.length === 0 ? "" : "matched expected no conflictTags",
      ],
    },
    {
      name: "mismatch",
      input: fitInput("mismatch", tags(["demo.female", "price.premium", "style.elegant"]), tags(["demo.male", "price.value", "style.sporty"]), 1000),
      check: (fit) => [
        fit.explanation.conflictTags.length > 0 ? "" : "mismatch expected conflictTags",
        fit.explanation.missingTags.length > 0 ? "" : "mismatch expected missingTags",
        fit.recommendation === "observe" || fit.recommendation === "avoid" ? "" : `mismatch expected observe or avoid, got ${fit.recommendation}`,
      ],
    },
    {
      name: "low_confidence",
      input: fitInput("low_confidence", tags(["demo.female", "price.mid"], 0.42), tags(["demo.female", "price.mid"], 0.42), 1000),
      check: (fit) => [
        fit.explanation.lowConfidenceTags.length > 0 ? "" : "low_confidence expected lowConfidenceTags",
        fit.riskFlags.includes("low_confidence_tags") ? "" : "low_confidence expected risk flag",
      ],
    },
    {
      name: "unmapped",
      input: {
        ...fitInput("unmapped", tags(["demo.female", "price.mid"]), tags(["demo.female", "price.mid"]), 1000),
        unmappedSourceFields: [{ sourceField: "comparison_dimensions.八大消费群体", reason: "not_in_taxonomy" }],
      },
      check: (fit) => [
        fit.explanation.missingTags.some((tag) => tag.sourceField === "comparison_dimensions.八大消费群体") ? "" : "unmapped expected sourceField in missingTags",
        fit.riskFlags.includes("unmapped_source_fields") ? "" : "unmapped expected risk flag",
      ],
    },
    {
      name: "insufficient_sample",
      input: fitInput("insufficient_sample", tags(["demo.female", "price.mid"]), tags(["demo.female", "price.mid"]), 120, 80),
      check: (fit) => [
        fit.riskFlags.includes("insufficient_product_sample") ? "" : "insufficient_sample expected product sample risk",
        fit.riskFlags.includes("insufficient_channel_sample") ? "" : "insufficient_sample expected channel sample risk",
        fit.recommendation === "observe" ? "" : `insufficient_sample expected observe, got ${fit.recommendation}`,
      ],
    },
  ];

  const checked: string[] = [];
  for (const scenario of scenarios) {
    const fit = explainProductChannelFit(scenario.input);
    checked.push(scenario.name);
    failures.push(...productChannelFitFieldFailures(scenario.name, fit));
    failures.push(...productChannelFitTraceFailures(scenario.name, fit));
    failures.push(...scenario.check(fit).filter((item) => item.length > 0));
  }
  return checked;
}

function runNewProductPredictionContractChecks(): string[] {
  const scenarios: Array<{ name: string; input: NewProductMasterPredictionInput; check: (profile: PredictedProductProfile) => string[] }> = [
    {
      name: "baseline_with_similar_sku",
      input: newProductInput({
        mappedTags: tags(["style.minimal", "price.mid"]),
        similarProducts: [{ productId: "historical_sku_reference", similarityScore: 0.86, confidence: 0.82, source: "contract.similarProducts", profileTags: tags(["demo.female", "style.minimal", "price.mid"]) }],
      }),
      check: (profile) => [
        profile.predictedProfileTags.length >= 3 ? "" : "baseline expected predicted tags from mapped and similar sources",
        profile.similarHistoricalProducts.length === 1 ? "" : "baseline expected similar historical product",
        toProductChannelFitProfile(profile).predictedProfileTags.length === profile.predictedProfileTags.length ? "" : "baseline bridge to ProductChannelFit profile failed",
      ],
    },
    {
      name: "insufficient_input",
      input: newProductInput({ productId: null, sourceProductKey: null, categoryLv1: null, sourceBatchId: null, dataVersion: null, mappedTags: [], similarProducts: [] }),
      check: (profile) => [
        profile.skuId === null ? "" : "insufficient_input must not synthesize skuId",
        profile.resolvedProductKey.value === null ? "" : "insufficient_input must not synthesize resolvedProductKey",
        profile.riskFlags.includes("missing_required_identity") ? "" : "insufficient_input expected missing identity risk",
        profile.riskFlags.includes("missing_required_category") ? "" : "insufficient_input expected missing category risk",
        profile.unavailableReasons.length > 0 ? "" : "insufficient_input expected unavailable reasons",
        bridgeFailsWithoutProductIdentity(profile) ? "" : "insufficient_input must not bridge to ProductChannelFit",
      ],
    },
    {
      name: "no_similar_sample",
      input: newProductInput({ mappedTags: tags(["style.minimal", "price.mid"]), similarProducts: [] }),
      check: (profile) => [
        profile.riskFlags.includes("no_similar_sample") ? "" : "no_similar_sample expected risk flag",
        profile.riskFlags.includes("similar_product_reference_missing") ? "" : "no_similar_sample expected missing reference flag",
        profile.predictedProfileTags.length > 0 ? "" : "no_similar_sample should still use mappedProductTags",
      ],
    },
    {
      name: "low_confidence",
      input: newProductInput({
        mappedTags: tags(["style.minimal", "price.mid"], 0.42),
        averageMappingConfidence: 0.42,
        similarProducts: [{ productId: "low_conf_similar", similarityScore: 0.6, confidence: 0.4, source: "contract.similarProducts", profileTags: tags(["demo.female"], 0.42) }],
      }),
      check: (profile) => [
        profile.riskFlags.includes("low_mapping_confidence") ? "" : "low_confidence expected mapping confidence risk",
        profile.riskFlags.includes("low_similar_product_confidence") ? "" : "low_confidence expected similar confidence risk",
        profile.confidence < 0.5 ? "" : `low_confidence expected confidence below 0.5, got ${profile.confidence}`,
      ],
    },
    {
      name: "similar_missing_identity",
      input: newProductInput({
        mappedTags: tags(["style.minimal"]),
        similarProducts: [{ similarityScore: 0.74, confidence: 0.72, source: "contract.similarProducts.missingIdentity", profileTags: tags(["demo.female"]) }],
      }),
      check: (profile) => [
        profile.similarHistoricalProducts.length === 1 ? "" : "similar_missing_identity expected one similar summary",
        profile.similarHistoricalProducts.every((item) => !("productId" in item) && !("skuId" in item) && !("sourceProductKey" in item)) ? "" : "similar_missing_identity must not synthesize similar product identity",
      ],
    },
    {
      name: "tag_unmapped",
      input: newProductInput({
        mappedTags: [tag("style.minimal", 0.8, 0.8), tag("unknown.not_allowed", 0.9, 0.9)],
        unmappedProductFields: [{ sourceField: "styleAndScenario.sourceLabel", sourceValue: "unknown", reason: "not_in_taxonomy" }],
        similarProducts: [],
      }),
      check: (profile) => [
        profile.riskFlags.includes("tag_unmapped") ? "" : "tag_unmapped expected risk flag",
        profile.predictedProfileTags.every((item) => item.tagId !== "unknown.not_allowed") ? "" : "tag_unmapped must filter unapproved tagId",
      ],
    },
  ];

  const checked: string[] = [];
  for (const scenario of scenarios) {
    const profile = predictNewProductProfile(scenario.input);
    checked.push(scenario.name);
    failures.push(...newProductPredictionFieldFailures(scenario.name, profile));
    failures.push(...newProductPredictionTraceFailures(scenario.name, profile));
    failures.push(...scenario.check(profile).filter((item) => item.length > 0));
  }
  return checked;
}

function newProductPredictionFieldFailures(scenario: string, profile: PredictedProductProfile): string[] {
  const fieldFailures: string[] = [];
  for (const field of ["skuId", "resolvedProductKey", "modelVersion", "contractVersion", "modelPath", "predictedProfileTags", "confidence", "similarHistoricalProducts", "explanationSources", "riskFlags", "unavailableReasons", "qualityFlags", "lineage"] as const) {
    if (!(field in profile)) fieldFailures.push(`${scenario} missing PredictedProductProfile field: ${field}`);
  }
  if (profile.confidence < 0 || profile.confidence > 1) fieldFailures.push(`${scenario} confidence out of range`);
  if (!profile.riskFlags.includes("baseline_not_trained_model")) fieldFailures.push(`${scenario} missing baseline_not_trained_model risk`);
  if (!profile.qualityFlags.includes("baseline_not_trained_model")) fieldFailures.push(`${scenario} missing baseline_not_trained_model quality flag`);
  if (containsFakeProductId(profile)) fieldFailures.push(`${scenario} must not contain unresolved fake product id`);
  return fieldFailures;
}

function newProductPredictionTraceFailures(scenario: string, profile: PredictedProductProfile): string[] {
  const traceFailures: string[] = [];
  for (const tag of profile.predictedProfileTags) {
    if (!tag.tagId.includes(".")) traceFailures.push(`${scenario} predicted tagId is not traceable`);
    if (!tag.source) traceFailures.push(`${scenario} predicted tag missing source`);
  }
  for (const source of profile.explanationSources) {
    if (!source.sourceField && !source.sourceProductId) traceFailures.push(`${scenario} explanation source missing sourceField or sourceProductId`);
  }
  return traceFailures;
}

function bridgeFailsWithoutProductIdentity(profile: PredictedProductProfile): boolean {
  try {
    toProductChannelFitProfile(profile);
    return false;
  } catch (error) {
    return error instanceof Error && error.message.includes("traceable product identity");
  }
}

function containsFakeProductId(profile: PredictedProductProfile): boolean {
  return JSON.stringify(profile).includes("unresolved_new_product") || JSON.stringify(profile).includes("unresolved_similar_product");
}

function productChannelFitFieldFailures(scenario: string, fit: ProductChannelFit): string[] {
  const fieldFailures: string[] = [];
  for (const field of ["skuId", "channelId", "channelType", "modelVersion", "contractVersion", "fitScore", "confidence", "recommendation", "explanation", "riskFlags", "qualityFlags"] as const) {
    if (!(field in fit)) fieldFailures.push(`${scenario} missing ProductChannelFit field: ${field}`);
  }
  if (fit.fitScore < 0 || fit.fitScore > 1) fieldFailures.push(`${scenario} fitScore out of range`);
  if (fit.confidence < 0 || fit.confidence > 1) fieldFailures.push(`${scenario} confidence out of range`);
  if (!fit.riskFlags.includes("algorithm_pending_user_formula")) fieldFailures.push(`${scenario} missing algorithm_pending_user_formula risk`);
  if (!fit.qualityFlags.includes("algorithm_pending_user_formula")) fieldFailures.push(`${scenario} missing algorithm_pending_user_formula quality flag`);
  return fieldFailures;
}

function productChannelFitTraceFailures(scenario: string, fit: ProductChannelFit): string[] {
  const traceFailures: string[] = [];
  const evidence = [
    ...fit.explanation.matchedTags,
    ...fit.explanation.conflictTags,
    ...fit.explanation.missingTags,
    ...fit.explanation.lowConfidenceTags,
  ];
  for (const item of evidence) {
    if (!item.tagId?.includes(".") && !item.sourceField) traceFailures.push(`${scenario} explanation item missing tagId or sourceField`);
  }
  if (fit.legacyFitScore && fit.legacyFitScore.usage !== "diagnostic_reference_only") traceFailures.push(`${scenario} legacyFitScore usage must be diagnostic_reference_only`);
  return traceFailures;
}

function fitInput(name: string, productTags: ProfileTagScore[], channelTags: ProfileTagScore[], channelSampleSize: number, productSampleSize = 1000): ProductChannelFitInput {
  return {
    productProfile: productProfile(name, productTags, productSampleSize),
    channelProfile: channelProfile(name, channelTags, channelSampleSize),
    legacyFitScore: { score: 0.91, source: "legacy_dashboard", usage: "diagnostic_reference_only" },
  };
}

function productProfile(name: string, predictedProfileTags: ProfileTagScore[], sampleSize: number): ProductChannelFitInput["productProfile"] {
  return {
    skuId: `mock_p2_sku_${name}`,
    predictedProfileTags,
    qualityFlags: [],
    sampleSize,
  } satisfies ProductChannelFitInput["productProfile"] & Pick<ProductProfileDraft, "skuId" | "predictedProfileTags" | "qualityFlags">;
}

function channelProfile(name: string, channelTags: ProfileTagScore[], sampleSize: number): ProductChannelFitInput["channelProfile"] {
  return {
    channelId: `mock_p2_channel_${name}`,
    channelType: "short_video",
    tags: channelTags,
    sampleSize,
    qualityFlags: [],
  } satisfies ProductChannelFitInput["channelProfile"] & Pick<ChannelProfile, "channelId" | "channelType" | "tags" | "sampleSize" | "qualityFlags">;
}

function tags(tagIds: string[], confidence = 0.84): ProfileTagScore[] {
  return tagIds.map((tagId, index) => ({
    tagId,
    score: round(0.82 - index * 0.06),
    confidence,
    source: `p2_contract.${tagId}`,
    sampleSize: null,
    timeWindow: null,
  }));
}

function newProductInput(options: {
  productId?: string | null;
  sourceProductKey?: string | null;
  categoryLv1?: string | null;
  sourceBatchId?: string | null;
  dataVersion?: string | null;
  mappedTags?: ProfileTagScore[];
  similarProducts?: SimilarProductReference[];
  unmappedProductFields?: Array<{ sourceField?: string; sourceValue?: string; reason?: string }>;
  averageMappingConfidence?: number | null;
}): NewProductMasterPredictionInput {
  return {
    productMaster: {
      identity: {
        productId: options.productId === undefined ? "contract_new_product" : options.productId,
        productVariantId: null,
        sourceProductKey: options.sourceProductKey === undefined ? "contract_source_product" : options.sourceProductKey,
      },
      category: {
        categoryLv1: options.categoryLv1 === undefined ? "apparel" : options.categoryLv1,
        categoryLv2: "top",
      },
      priceAndSeason: {
        priceBand: "mid",
        season: "spring",
      },
      styleAndScenario: {
        mappedProductTags: options.mappedTags ?? [],
        unmappedProductFields: options.unmappedProductFields ?? [],
      },
      similarProducts: {
        similarProducts: options.similarProducts ?? [],
      },
      lineage: {
        sourceBatchId: options.sourceBatchId === undefined ? "contract_batch" : options.sourceBatchId,
        dataVersion: options.dataVersion === undefined ? "contract_version" : options.dataVersion,
        generatedAt: "2026-07-03T00:00:00Z",
        sourceType: "contract_fixture",
        timeWindow: null,
      },
      quality: {
        qualityFlags: [],
        blockingIssues: [],
        fieldCoverageRate: 0.8,
        mappingCoverageRate: 0.8,
        averageMappingConfidence: options.averageMappingConfidence ?? 0.8,
      },
    },
  };
}

function tag(tagId: string, score: number, confidence: number): ProfileTagScore {
  return { tagId, score, confidence, source: `p2_new_product_contract.${tagId}`, sampleSize: null, timeWindow: null };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

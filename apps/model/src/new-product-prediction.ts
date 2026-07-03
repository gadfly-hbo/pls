import { loadAllowedTagIds, MODEL_VERSION, type ProductProfileDraft, type ProfileTagScore, type SegmentDraft } from "./baseline.js";

export const NEW_PRODUCT_PREDICTION_CONTRACT_VERSION = "new-product-prediction-contract-0.1";

export type NewProductPredictionRisk =
  | "baseline_not_trained_model"
  | "missing_required_identity"
  | "missing_required_category"
  | "source_lineage_incomplete"
  | "insufficient_product_master_fields"
  | "similar_product_reference_missing"
  | "low_similar_product_confidence"
  | "low_mapping_confidence"
  | "tag_unmapped"
  | "no_similar_sample";

export interface NewProductPredictionSource {
  sourceType: "mapped_product_tag" | "similar_product" | "quality_signal";
  sourceField?: string;
  sourceProductId?: string;
  similarityScore?: number;
  confidence: number;
  rationale: string;
}

export interface SimilarProductReference {
  productId?: string;
  skuId?: string;
  sourceProductKey?: string;
  similarityScore?: number;
  confidence?: number;
  source?: string;
  profileTags?: ProfileTagScore[];
}

export interface ResolvedProductKey {
  productId?: string;
  productVariantId?: string;
  sourceProductKey?: string;
  value: string | null;
}

export interface NewProductMasterPredictionInput {
  productMaster: {
    identity: {
      productId?: string | null;
      productVariantId?: string | null;
      sourceProductKey?: string | null;
    };
    category: {
      categoryLv1?: string | null;
      categoryLv2?: string | null;
    };
    priceAndSeason?: {
      priceBand?: string | null;
      season?: string | null;
    };
    styleAndScenario?: {
      mappedProductTags?: ProfileTagScore[];
      unmappedProductFields?: Array<{ sourceField?: string; sourceValue?: string; reason?: string }>;
    };
    similarProducts?: {
      similarProducts?: SimilarProductReference[];
    };
    lineage: {
      sourceBatchId?: string | null;
      dataVersion?: string | null;
      generatedAt?: string | null;
      sourceType?: string | null;
      timeWindow?: string | null;
    };
    quality?: {
      qualityFlags?: string[];
      blockingIssues?: string[];
      fieldCoverageRate?: number | null;
      mappingCoverageRate?: number | null;
      averageMappingConfidence?: number | null;
    };
  };
}

export interface PredictedProductProfile {
  skuId: string | null;
  resolvedProductKey: ResolvedProductKey;
  modelVersion: string;
  contractVersion: string;
  modelPath: "new_product_explainable_baseline";
  source: "new_product_prediction_baseline";
  sourceType: "derived";
  predictedProfileTags: ProfileTagScore[];
  confidence: number;
  topSegments: SegmentDraft[];
  similarHistoricalProducts: Array<{
    productId?: string;
    skuId?: string;
    sourceProductKey?: string;
    similarityScore: number;
    confidence: number;
    source?: string;
  }>;
  explanationSources: NewProductPredictionSource[];
  riskFlags: NewProductPredictionRisk[];
  unavailableReasons: string[];
  qualityFlags: string[];
  lineage: NewProductMasterPredictionInput["productMaster"]["lineage"];
}

export function predictNewProductProfile(input: NewProductMasterPredictionInput): PredictedProductProfile {
  const allowedTagIds = loadAllowedTagIds();
  const productMaster = input.productMaster;
  const mappedTags = sanitizeTags(productMaster.styleAndScenario?.mappedProductTags ?? [], allowedTagIds);
  const similarProducts = productMaster.similarProducts?.similarProducts ?? [];
  const similarTags = weightedSimilarProductTags(similarProducts, allowedTagIds);
  const predictedProfileTags = mergePredictedTags(mappedTags, similarTags).slice(0, 12);
  const riskFlags = buildRiskFlags(input, predictedProfileTags, similarProducts);
  const unavailableReasons = buildUnavailableReasons(riskFlags, predictedProfileTags);
  const confidence = predictionConfidence(input, predictedProfileTags, similarProducts, riskFlags);
  const resolvedProductKey = resolveProductKey(productMaster.identity);

  return {
    skuId: resolvedProductKey.value,
    resolvedProductKey,
    modelVersion: MODEL_VERSION,
    contractVersion: NEW_PRODUCT_PREDICTION_CONTRACT_VERSION,
    modelPath: "new_product_explainable_baseline",
    source: "new_product_prediction_baseline",
    sourceType: "derived",
    predictedProfileTags,
    confidence,
    topSegments: buildBaselineSegments(predictedProfileTags),
    similarHistoricalProducts: similarProductSummaries(similarProducts),
    explanationSources: explanationSources(productMaster, similarProducts),
    riskFlags,
    unavailableReasons,
    qualityFlags: [...new Set(["baseline_not_trained_model", ...(productMaster.quality?.qualityFlags ?? [])])].sort(),
    lineage: productMaster.lineage,
  };
}

export function toProductChannelFitProfile(profile: PredictedProductProfile): ProductProfileDraft {
  if (!profile.skuId) {
    throw new Error("Cannot bridge PredictedProductProfile to ProductChannelFit without a traceable product identity.");
  }
  return {
    skuId: profile.skuId,
    modelVersion: profile.modelVersion,
    modelPath: "rule",
    input: {
      dnaHash: profile.contractVersion,
      categoryLv1: "",
      categoryLv2: "",
      season: "",
      priceBand: "",
      styleKeywords: [],
    },
    predictedProfileTags: profile.predictedProfileTags,
    topSegments: profile.topSegments,
    qualityFlags: profile.qualityFlags,
    unmappedInputTokens: profile.unavailableReasons,
  };
}

function sanitizeTags(tags: ProfileTagScore[], allowedTagIds: Set<string>): ProfileTagScore[] {
  return tags
    .filter((tag) => allowedTagIds.has(tag.tagId))
    .map((tag) => ({ ...tag, score: round(tag.score), confidence: round(tag.confidence), source: tag.source || "productMaster.styleAndScenario.mappedProductTags" }));
}

function weightedSimilarProductTags(similarProducts: SimilarProductReference[], allowedTagIds: Set<string>): ProfileTagScore[] {
  const byTag = new Map<string, { score: number; confidence: number; weight: number; source: string }>();
  for (const item of similarProducts) {
    const similarity = clamp(item.similarityScore ?? 0, 0, 1);
    const confidence = clamp(item.confidence ?? 0.5, 0, 1);
    const weight = similarity * confidence;
    for (const tag of item.profileTags ?? []) {
      if (!allowedTagIds.has(tag.tagId)) continue;
      const current = byTag.get(tag.tagId) ?? { score: 0, confidence: 0, weight: 0, source: item.source ?? "productMaster.similarProducts" };
      byTag.set(tag.tagId, {
        score: current.score + tag.score * weight,
        confidence: current.confidence + Math.min(tag.confidence, confidence) * weight,
        weight: current.weight + weight,
        source: current.source,
      });
    }
  }
  return [...byTag.entries()]
    .filter(([, value]) => value.weight > 0)
    .map(([tagId, value]) => ({
      tagId,
      score: round(value.score / value.weight),
      confidence: round(value.confidence / value.weight),
      source: value.source,
      sampleSize: null,
      timeWindow: null,
    }));
}

function mergePredictedTags(mappedTags: ProfileTagScore[], similarTags: ProfileTagScore[]): ProfileTagScore[] {
  const byTag = new Map<string, ProfileTagScore>();
  for (const tag of similarTags) byTag.set(tag.tagId, tag);
  for (const tag of mappedTags) {
    const current = byTag.get(tag.tagId);
    byTag.set(tag.tagId, current ? { ...tag, score: round(Math.max(tag.score, current.score)), confidence: round(Math.max(tag.confidence, current.confidence)) } : tag);
  }
  return [...byTag.values()].sort((left, right) => right.score * right.confidence - left.score * left.confidence);
}

function buildRiskFlags(input: NewProductMasterPredictionInput, predictedTags: ProfileTagScore[], similarProducts: SimilarProductReference[]): NewProductPredictionRisk[] {
  const flags = new Set<NewProductPredictionRisk>(["baseline_not_trained_model"]);
  const productMaster = input.productMaster;
  if (!productMaster.identity.productId && !productMaster.identity.sourceProductKey) flags.add("missing_required_identity");
  if (!productMaster.category.categoryLv1) flags.add("missing_required_category");
  if (!productMaster.lineage.sourceBatchId || !productMaster.lineage.dataVersion) flags.add("source_lineage_incomplete");
  if (similarProducts.length === 0) flags.add("similar_product_reference_missing");
  if (similarProducts.length === 0) flags.add("no_similar_sample");
  if (similarProducts.some((item) => (item.confidence ?? 0) < 0.55)) flags.add("low_similar_product_confidence");
  if ((productMaster.quality?.averageMappingConfidence ?? 1) < 0.6) flags.add("low_mapping_confidence");
  if ((productMaster.styleAndScenario?.unmappedProductFields ?? []).length > 0) flags.add("tag_unmapped");
  if (predictedTags.length === 0) flags.add("insufficient_product_master_fields");
  for (const issue of productMaster.quality?.blockingIssues ?? []) {
    if (isNewProductPredictionRisk(issue)) flags.add(issue);
  }
  return [...flags].sort();
}

function buildUnavailableReasons(riskFlags: NewProductPredictionRisk[], predictedTags: ProfileTagScore[]): string[] {
  const reasons: string[] = [];
  if (riskFlags.includes("missing_required_identity")) reasons.push("Product identity is missing.");
  if (riskFlags.includes("missing_required_category")) reasons.push("Product category is missing.");
  if (riskFlags.includes("source_lineage_incomplete")) reasons.push("Source lineage is incomplete.");
  if (predictedTags.length === 0) reasons.push("No traceable taxonomy tag can be predicted from current input.");
  return reasons;
}

function predictionConfidence(
  input: NewProductMasterPredictionInput,
  predictedTags: ProfileTagScore[],
  similarProducts: SimilarProductReference[],
  riskFlags: NewProductPredictionRisk[],
): number {
  if (predictedTags.length === 0) return 0;
  const tagConfidence = mean(predictedTags.map((tag) => tag.confidence));
  const fieldCoverage = input.productMaster.quality?.fieldCoverageRate ?? 0.7;
  const mappingCoverage = input.productMaster.quality?.mappingCoverageRate ?? 0.7;
  const similarConfidence = similarProducts.length === 0 ? 0.55 : mean(similarProducts.map((item) => item.confidence ?? 0.5));
  const blockingPenalty = riskFlags.some((flag) => flag === "missing_required_identity" || flag === "missing_required_category" || flag === "source_lineage_incomplete") ? 0.65 : 1;
  return round(clamp(tagConfidence * fieldCoverage * mappingCoverage * similarConfidence * blockingPenalty, 0, 1));
}

function similarProductSummaries(similarProducts: SimilarProductReference[]): PredictedProductProfile["similarHistoricalProducts"] {
  return similarProducts
    .map((item) => compactSimilarProductSummary(item))
    .slice(0, 8);
}

function compactSimilarProductSummary(item: SimilarProductReference): PredictedProductProfile["similarHistoricalProducts"][number] {
  return {
    ...(item.productId ? { productId: item.productId } : {}),
    ...(item.skuId ? { skuId: item.skuId } : {}),
    ...(item.sourceProductKey ? { sourceProductKey: item.sourceProductKey } : {}),
    similarityScore: round(item.similarityScore ?? 0),
    confidence: round(item.confidence ?? 0),
    ...(item.source ? { source: item.source } : {}),
  };
}

function resolveProductKey(identity: NewProductMasterPredictionInput["productMaster"]["identity"]): ResolvedProductKey {
  return {
    productId: identity.productId ?? undefined,
    productVariantId: identity.productVariantId ?? undefined,
    sourceProductKey: identity.sourceProductKey ?? undefined,
    value: identity.productVariantId ?? identity.productId ?? identity.sourceProductKey ?? null,
  };
}

function explanationSources(productMaster: NewProductMasterPredictionInput["productMaster"], similarProducts: SimilarProductReference[]): NewProductPredictionSource[] {
  const sources: NewProductPredictionSource[] = [];
  for (const tag of productMaster.styleAndScenario?.mappedProductTags ?? []) {
    sources.push({
      sourceType: "mapped_product_tag",
      sourceField: tag.source,
      confidence: tag.confidence,
      rationale: `Mapped product tag ${tag.tagId}.`,
    });
  }
  for (const item of similarProducts) {
    sources.push({
      sourceType: "similar_product",
      sourceField: item.source,
      sourceProductId: item.productId ?? item.skuId ?? item.sourceProductKey,
      similarityScore: item.similarityScore,
      confidence: item.confidence ?? 0.5,
      rationale: "Similar historical product contributes profile tags.",
    });
  }
  for (const flag of productMaster.quality?.qualityFlags ?? []) {
    sources.push({ sourceType: "quality_signal", sourceField: flag, confidence: 0, rationale: `Quality flag ${flag}.` });
  }
  return sources;
}

function buildBaselineSegments(tags: ProfileTagScore[]): SegmentDraft[] {
  return tags.slice(0, 3).map((tag, index) => ({
    segmentId: `baseline_${tag.tagId.replace(".", "_")}`,
    name: `Baseline segment for ${tag.tagId}`,
    rank: index + 1,
    confidence: tag.confidence,
    tags: [{ tagId: tag.tagId, score: tag.score }],
    drivers: [tag.tagId],
  }));
}

function isNewProductPredictionRisk(value: string): value is NewProductPredictionRisk {
  return [
    "missing_required_identity",
    "missing_required_category",
    "source_lineage_incomplete",
    "low_mapping_confidence",
    "low_similar_product_confidence",
    "tag_unmapped",
  ].includes(value);
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

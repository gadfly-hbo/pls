import { MODEL_VERSION, type ProfileTagScore } from "./baseline.js";

export const ACCOUNT_FIT_ADAPTER_VERSION = "account-fit-rule-baseline-0.1";

export type AccountFitDimension = "demo" | "style" | "price" | "occasion" | "intent" | "channel" | "external";
export type AccountFitRecommendation = "priority_launch" | "test_launch" | "observe" | "avoid";
export type DimensionStatus = "matched" | "mismatch" | "partial" | "unmapped";

export interface AccountBenchmarkTopTag {
  dimension: AccountFitDimension;
  tagId?: string;
  sourceField: string;
  score: number;
  confidence: number;
}

export interface AccountFitQualityMetadata {
  productSampleSize?: number;
  accountSampleSize?: number;
  productProfileCoverageRate?: number;
  accountProfileCoverageRate?: number;
  qualityFlags?: string[];
}

export interface AccountFitAdapterInput {
  skuId: string;
  accountChannelId: string;
  productProfileTags: ProfileTagScore[];
  accountProfileTags: ProfileTagScore[];
  productTopTags?: AccountBenchmarkTopTag[];
  accountBenchmarkTopTags?: AccountBenchmarkTopTag[];
  qualityMetadata?: AccountFitQualityMetadata;
}

export interface AccountFitDriver {
  dimension: AccountFitDimension;
  tagId: string;
  productScore: number;
  accountScore: number;
  contribution: number;
}

export interface AccountFitDimensionDiagnostic {
  dimension: AccountFitDimension;
  productTopTagId?: string;
  accountTopTagId?: string;
  status: DimensionStatus;
  gapScore: number;
  confidence: number;
  reasonCode: "same_top_tag" | "nearby_tag" | "top_tag_gap" | "missing_product_tag" | "missing_account_tag" | "unmapped_external_dimension";
}

export interface AccountFitAdjustmentAdvice {
  adviceId: string;
  priority: "high" | "medium" | "low";
  dimension: AccountFitDimension;
  currentProductTagId?: string;
  targetAccountTagId?: string;
  actionType: "copy_adjustment" | "content_angle_adjustment" | "pricing_position_review" | "account_selection_review" | "mapping_review";
  direction: string;
  rationale: string;
  expectedImpactIndex?: number;
  evidence: {
    productScore?: number;
    accountScore?: number;
    gapScore?: number;
    sourceField?: string;
  };
}

export interface AccountFitDiagnostic {
  skuId: string;
  accountChannelId: string;
  modelVersion: string;
  adapterVersion: string;
  source: "account_fit_rule_baseline";
  sourceType: "derived";
  fitScore: number;
  fitConfidence: number;
  recommendation: AccountFitRecommendation;
  matchedDimensions: AccountFitDimensionDiagnostic[];
  mismatchedDimensions: AccountFitDimensionDiagnostic[];
  positiveDrivers: AccountFitDriver[];
  negativeDrivers: AccountFitDriver[];
  adjustmentAdvice: AccountFitAdjustmentAdvice[];
  qualityFlags: string[];
}

interface DimensionScores {
  dimension: AccountFitDimension;
  productTopTag?: ProfileTagScore;
  accountTopTag?: ProfileTagScore;
  overlap: number;
  gap: number;
  confidence: number;
}

const DIMENSION_WEIGHTS: Record<AccountFitDimension, number> = {
  demo: 0.2,
  style: 0.25,
  price: 0.2,
  occasion: 0.15,
  intent: 0.1,
  channel: 0.1,
  external: 0,
};

const DIMENSIONS: AccountFitDimension[] = ["demo", "style", "price", "occasion", "intent", "channel"];

export function diagnoseAccountFit(input: AccountFitAdapterInput): AccountFitDiagnostic {
  const productTags = sanitizeTags(input.productProfileTags);
  const accountTags = sanitizeTags(input.accountProfileTags);
  const productByDimension = topTagsByDimension(productTags, input.productTopTags);
  const accountByDimension = topTagsByDimension(accountTags, input.accountBenchmarkTopTags);
  const dimensionScores = DIMENSIONS.map((dimension) => scoreDimension(dimension, productByDimension.get(dimension), accountByDimension.get(dimension)));
  const diagnostics = dimensionScores.map(toDimensionDiagnostic);
  const matchedDimensions = diagnostics.filter((item) => item.status === "matched" || item.status === "partial");
  const mismatchedDimensions = diagnostics.filter((item) => item.status === "mismatch" || item.status === "unmapped");
  const positiveDrivers = buildPositiveDrivers(dimensionScores);
  const negativeDrivers = buildNegativeDrivers(dimensionScores);
  const fitScore = weightedFitScore(dimensionScores);
  const fitConfidence = confidenceScore(dimensionScores, input.qualityMetadata);
  const qualityFlags = buildQualityFlags(input, dimensionScores, fitConfidence);

  return {
    skuId: input.skuId,
    accountChannelId: input.accountChannelId,
    modelVersion: MODEL_VERSION,
    adapterVersion: ACCOUNT_FIT_ADAPTER_VERSION,
    source: "account_fit_rule_baseline",
    sourceType: "derived",
    fitScore: round(fitScore),
    fitConfidence: round(fitConfidence),
    recommendation: recommendation(fitScore, fitConfidence, qualityFlags),
    matchedDimensions,
    mismatchedDimensions,
    positiveDrivers,
    negativeDrivers,
    adjustmentAdvice: buildAdjustmentAdvice(mismatchedDimensions),
    qualityFlags,
  };
}

function sanitizeTags(tags: ProfileTagScore[]): ProfileTagScore[] {
  return tags.filter((tag) => tag.tagId.includes("."));
}

function topTagsByDimension(tags: ProfileTagScore[], explicitTopTags: AccountBenchmarkTopTag[] = []): Map<AccountFitDimension, ProfileTagScore> {
  const byTagId = new Map(tags.map((tag) => [tag.tagId, tag]));
  const result = new Map<AccountFitDimension, ProfileTagScore>();
  for (const topTag of explicitTopTags) {
    if (!topTag.tagId || topTag.dimension === "external") continue;
    const tag = byTagId.get(topTag.tagId) ?? {
      tagId: topTag.tagId,
      score: topTag.score,
      confidence: topTag.confidence,
      source: "account_fit_explicit_top_tag",
      sampleSize: null,
      timeWindow: null,
    };
    result.set(topTag.dimension, tag);
  }

  for (const tag of tags) {
    const dimension = tagDimension(tag.tagId);
    if (!dimension || dimension === "external" || result.has(dimension)) continue;
    const current = result.get(dimension);
    if (!current || tag.score > current.score) result.set(dimension, tag);
  }
  return result;
}

function scoreDimension(dimension: AccountFitDimension, productTopTag?: ProfileTagScore, accountTopTag?: ProfileTagScore): DimensionScores {
  if (!productTopTag || !accountTopTag) {
    return { dimension, productTopTag, accountTopTag, overlap: 0, gap: 1, confidence: mean([productTopTag?.confidence ?? 0.4, accountTopTag?.confidence ?? 0.4]) };
  }
  const sameTopTag = productTopTag.tagId === accountTopTag.tagId;
  const overlap = sameTopTag ? Math.min(productTopTag.score, accountTopTag.score) : 0;
  const gap = sameTopTag ? Math.abs(productTopTag.score - accountTopTag.score) : Math.max(productTopTag.score, accountTopTag.score);
  return { dimension, productTopTag, accountTopTag, overlap, gap, confidence: mean([productTopTag.confidence, accountTopTag.confidence]) };
}

function toDimensionDiagnostic(score: DimensionScores): AccountFitDimensionDiagnostic {
  const missingProduct = !score.productTopTag;
  const missingAccount = !score.accountTopTag;
  const sameTopTag = score.productTopTag?.tagId === score.accountTopTag?.tagId;
  const status: DimensionStatus = missingProduct || missingAccount ? "unmapped" : sameTopTag ? "matched" : score.gap < 0.45 ? "partial" : "mismatch";
  const reasonCode = missingProduct
    ? "missing_product_tag"
    : missingAccount
      ? "missing_account_tag"
      : sameTopTag
        ? "same_top_tag"
        : status === "partial"
          ? "nearby_tag"
          : "top_tag_gap";
  return {
    dimension: score.dimension,
    productTopTagId: score.productTopTag?.tagId,
    accountTopTagId: score.accountTopTag?.tagId,
    status,
    gapScore: round(score.gap),
    confidence: round(score.confidence),
    reasonCode,
  };
}

function buildPositiveDrivers(scores: DimensionScores[]): AccountFitDriver[] {
  return scores
    .filter((score) => score.productTopTag && score.accountTopTag && score.productTopTag.tagId === score.accountTopTag.tagId)
    .map((score) => ({
      dimension: score.dimension,
      tagId: score.productTopTag?.tagId ?? "",
      productScore: round(score.productTopTag?.score ?? 0),
      accountScore: round(score.accountTopTag?.score ?? 0),
      contribution: round(score.overlap * DIMENSION_WEIGHTS[score.dimension]),
    }))
    .filter((driver) => driver.tagId.includes("."))
    .sort((left, right) => right.contribution - left.contribution)
    .slice(0, 5);
}

function buildNegativeDrivers(scores: DimensionScores[]): AccountFitDriver[] {
  return scores
    .filter((score) => score.productTopTag && score.accountTopTag && score.productTopTag.tagId !== score.accountTopTag.tagId)
    .map((score) => ({
      dimension: score.dimension,
      tagId: score.productTopTag?.tagId ?? "",
      productScore: round(score.productTopTag?.score ?? 0),
      accountScore: round(score.accountTopTag?.score ?? 0),
      contribution: round(score.gap * DIMENSION_WEIGHTS[score.dimension]),
    }))
    .filter((driver) => driver.tagId.includes("."))
    .sort((left, right) => right.contribution - left.contribution)
    .slice(0, 5);
}

function buildAdjustmentAdvice(mismatches: AccountFitDimensionDiagnostic[]): AccountFitAdjustmentAdvice[] {
  return mismatches.slice(0, 4).map((item, index) => ({
    adviceId: `account_fit_advice_${index + 1}`,
    priority: item.gapScore >= 0.7 ? "high" : item.gapScore >= 0.45 ? "medium" : "low",
    dimension: item.dimension,
    currentProductTagId: item.productTopTagId,
    targetAccountTagId: item.accountTopTagId,
    actionType: adviceActionType(item.dimension, item.status),
    direction: adviceDirection(item),
    rationale: `Dimension ${item.dimension} has status ${item.status} with reason ${item.reasonCode}.`,
    expectedImpactIndex: round(Math.min(1, item.gapScore * DIMENSION_WEIGHTS[item.dimension] * 2)),
    evidence: { gapScore: item.gapScore },
  }));
}

function weightedFitScore(scores: DimensionScores[]): number {
  const totalWeight = scores.reduce((sum, score) => sum + DIMENSION_WEIGHTS[score.dimension], 0);
  if (totalWeight === 0) return 0;
  const weighted = scores.reduce((sum, score) => {
    const sameTag = score.productTopTag?.tagId === score.accountTopTag?.tagId;
    const dimensionScore = sameTag ? score.overlap : Math.max(0, 0.35 - score.gap * 0.25);
    return sum + dimensionScore * DIMENSION_WEIGHTS[score.dimension];
  }, 0);
  return clamp(weighted / totalWeight, 0, 1);
}

function confidenceScore(scores: DimensionScores[], quality?: AccountFitQualityMetadata): number {
  const base = mean(scores.map((score) => score.confidence));
  const accountSampleFactor = Math.min(1, (quality?.accountSampleSize ?? 500) / 500);
  const productSampleFactor = Math.min(1, (quality?.productSampleSize ?? 500) / 500);
  const coverageFactor = Math.min(quality?.accountProfileCoverageRate ?? 1, quality?.productProfileCoverageRate ?? 1);
  return clamp(base * accountSampleFactor * productSampleFactor * coverageFactor, 0, 1);
}

function buildQualityFlags(input: AccountFitAdapterInput, scores: DimensionScores[], fitConfidence: number): string[] {
  const flags = new Set(["algorithm_pending_user_formula", ...(input.qualityMetadata?.qualityFlags ?? [])]);
  if ((input.qualityMetadata?.accountSampleSize ?? 500) < 500) flags.add("low_account_sample");
  if ((input.qualityMetadata?.productSampleSize ?? 500) < 500) flags.add("low_product_sample");
  if ((input.qualityMetadata?.accountProfileCoverageRate ?? 1) < 0.7) flags.add("low_account_profile_coverage");
  if ((input.qualityMetadata?.productProfileCoverageRate ?? 1) < 0.7) flags.add("low_product_profile_coverage");
  if (fitConfidence < 0.5) flags.add("low_fit_confidence");
  if (scores.some((score) => !score.productTopTag || !score.accountTopTag)) flags.add("missing_dimension_top_tag");
  return [...flags].sort();
}

function recommendation(fitScore: number, fitConfidence: number, qualityFlags: string[]): AccountFitRecommendation {
  if (qualityFlags.includes("low_fit_confidence")) return fitScore >= 0.55 ? "test_launch" : "observe";
  if (fitScore >= 0.7 && fitConfidence >= 0.65) return "priority_launch";
  if (fitScore >= 0.5) return "test_launch";
  if (fitScore >= 0.3) return "observe";
  return "avoid";
}

function adviceActionType(dimension: AccountFitDimension, status: DimensionStatus): AccountFitAdjustmentAdvice["actionType"] {
  if (status === "unmapped") return "mapping_review";
  if (dimension === "price") return "pricing_position_review";
  if (dimension === "channel") return "account_selection_review";
  if (dimension === "style" || dimension === "occasion" || dimension === "intent") return "content_angle_adjustment";
  return "copy_adjustment";
}

function adviceDirection(item: AccountFitDimensionDiagnostic): string {
  if (!item.productTopTagId) return `Provide product ${item.dimension} tag before account-fit diagnosis.`;
  if (!item.accountTopTagId) return `Provide account ${item.dimension} benchmark tag before account-fit diagnosis.`;
  return `Align product ${item.dimension} signal ${item.productTopTagId} with account benchmark ${item.accountTopTagId}.`;
}

function tagDimension(tagId: string): AccountFitDimension | undefined {
  const dimension = tagId.split(".")[0] as AccountFitDimension | undefined;
  return dimension && dimension in DIMENSION_WEIGHTS ? dimension : undefined;
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

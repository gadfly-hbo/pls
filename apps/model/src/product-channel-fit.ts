import { MODEL_VERSION, type ChannelProfile, type ProductProfileDraft, type ProfileTagScore } from "./baseline.js";
import type { LegacyFitScoreReference } from "./account-fit.js";

export const PRODUCT_CHANNEL_FIT_CONTRACT_VERSION = "product-channel-fit-contract-0.1";

export type ProductChannelRecommendation = "priority_launch" | "test_launch" | "observe" | "avoid";
export type ProductChannelRiskFlag =
  | "algorithm_pending_user_formula"
  | "legacy_fit_score_reference_only"
  | "low_confidence_tags"
  | "missing_required_tags"
  | "unmapped_source_fields"
  | "insufficient_product_sample"
  | "insufficient_channel_sample";

export interface FitTagEvidence {
  tagId?: string;
  sourceField?: string;
  productScore?: number;
  channelScore?: number;
  confidence?: number;
  reasonCode:
    | "shared_tag"
    | "product_only_tag"
    | "channel_only_tag"
    | "low_confidence_tag"
    | "unmapped_source_field"
    | "insufficient_sample";
}

export interface FitExplanation {
  matchedTags: FitTagEvidence[];
  conflictTags: FitTagEvidence[];
  missingTags: FitTagEvidence[];
  lowConfidenceTags: FitTagEvidence[];
  summary: string;
}

export interface ProductChannelFitInput {
  productProfile: Pick<ProductProfileDraft, "skuId" | "predictedProfileTags" | "qualityFlags"> & {
    sampleSize?: number;
    sourceFields?: string[];
  };
  channelProfile: Pick<ChannelProfile, "channelId" | "channelType" | "tags" | "sampleSize" | "qualityFlags"> & {
    sourceFields?: string[];
  };
  legacyFitScore?: LegacyFitScoreReference;
  unmappedSourceFields?: Array<{ sourceField: string; reason: string }>;
}

export interface ProductChannelFit {
  skuId: string;
  channelId: string;
  channelType: string;
  modelVersion: string;
  contractVersion: string;
  source: "product_channel_fit_contract_baseline";
  sourceType: "derived";
  fitScore: number;
  confidence: number;
  recommendation: ProductChannelRecommendation;
  explanation: FitExplanation;
  riskFlags: ProductChannelRiskFlag[];
  qualityFlags: string[];
  legacyFitScore?: LegacyFitScoreReference;
}

const LOW_CONFIDENCE_THRESHOLD = 0.55;
const MIN_SAMPLE_SIZE = 500;

export function explainProductChannelFit(input: ProductChannelFitInput): ProductChannelFit {
  const productTags = traceableTags(input.productProfile.predictedProfileTags);
  const channelTags = traceableTags(input.channelProfile.tags);
  const productByTag = new Map(productTags.map((tag) => [tag.tagId, tag]));
  const channelByTag = new Map(channelTags.map((tag) => [tag.tagId, tag]));
  const matchedTags = buildMatchedTags(productTags, channelByTag);
  const conflictTags = buildConflictTags(productTags, channelByTag);
  const missingTags = buildMissingTags(channelTags, productByTag);
  const lowConfidenceTags = buildLowConfidenceTags(productTags, channelTags);
  const unmappedTags = buildUnmappedSourceFieldTags(input.unmappedSourceFields);
  const riskFlags = buildRiskFlags(input, lowConfidenceTags, missingTags, unmappedTags);
  const confidence = fitConfidence(matchedTags, lowConfidenceTags, input);
  const fitScore = baselineFitScore(matchedTags, conflictTags, missingTags);

  return {
    skuId: input.productProfile.skuId,
    channelId: input.channelProfile.channelId,
    channelType: input.channelProfile.channelType,
    modelVersion: MODEL_VERSION,
    contractVersion: PRODUCT_CHANNEL_FIT_CONTRACT_VERSION,
    source: "product_channel_fit_contract_baseline",
    sourceType: "derived",
    fitScore,
    confidence,
    recommendation: recommendation(fitScore, confidence, riskFlags),
    explanation: {
      matchedTags,
      conflictTags,
      missingTags: [...missingTags, ...unmappedTags],
      lowConfidenceTags,
      summary: explanationSummary(matchedTags, conflictTags, missingTags, lowConfidenceTags, unmappedTags),
    },
    riskFlags,
    qualityFlags: [...new Set(["algorithm_pending_user_formula", ...input.productProfile.qualityFlags, ...input.channelProfile.qualityFlags])].sort(),
    legacyFitScore: input.legacyFitScore,
  };
}

function buildMatchedTags(productTags: ProfileTagScore[], channelByTag: Map<string, ProfileTagScore>): FitTagEvidence[] {
  return productTags
    .filter((tag) => channelByTag.has(tag.tagId))
    .map((tag) => {
      const channelTag = channelByTag.get(tag.tagId);
      return {
        tagId: tag.tagId,
        sourceField: tag.source,
        productScore: round(tag.score),
        channelScore: round(channelTag?.score ?? 0),
        confidence: round(Math.min(tag.confidence, channelTag?.confidence ?? tag.confidence)),
        reasonCode: "shared_tag" as const,
      };
    })
    .sort((left, right) => (right.confidence ?? 0) - (left.confidence ?? 0))
    .slice(0, 8);
}

function buildConflictTags(productTags: ProfileTagScore[], channelByTag: Map<string, ProfileTagScore>): FitTagEvidence[] {
  return productTags
    .filter((tag) => !channelByTag.has(tag.tagId))
    .map((tag) => ({
      tagId: tag.tagId,
      sourceField: tag.source,
      productScore: round(tag.score),
      channelScore: 0,
      confidence: round(tag.confidence),
      reasonCode: "product_only_tag" as const,
    }))
    .sort((left, right) => (right.productScore ?? 0) - (left.productScore ?? 0))
    .slice(0, 8);
}

function buildMissingTags(channelTags: ProfileTagScore[], productByTag: Map<string, ProfileTagScore>): FitTagEvidence[] {
  return channelTags
    .filter((tag) => !productByTag.has(tag.tagId))
    .map((tag) => ({
      tagId: tag.tagId,
      sourceField: tag.source,
      productScore: 0,
      channelScore: round(tag.score),
      confidence: round(tag.confidence),
      reasonCode: "channel_only_tag" as const,
    }))
    .sort((left, right) => (right.channelScore ?? 0) - (left.channelScore ?? 0))
    .slice(0, 8);
}

function buildLowConfidenceTags(productTags: ProfileTagScore[], channelTags: ProfileTagScore[]): FitTagEvidence[] {
  return [...productTags, ...channelTags]
    .filter((tag) => tag.confidence < LOW_CONFIDENCE_THRESHOLD)
    .map((tag) => ({
      tagId: tag.tagId,
      sourceField: tag.source,
      productScore: round(tag.score),
      channelScore: round(tag.score),
      confidence: round(tag.confidence),
      reasonCode: "low_confidence_tag" as const,
    }))
    .slice(0, 8);
}

function buildUnmappedSourceFieldTags(fields: ProductChannelFitInput["unmappedSourceFields"] = []): FitTagEvidence[] {
  return fields.map((field) => ({
    sourceField: field.sourceField,
    confidence: 0,
    reasonCode: "unmapped_source_field",
  }));
}

function buildRiskFlags(
  input: ProductChannelFitInput,
  lowConfidenceTags: FitTagEvidence[],
  missingTags: FitTagEvidence[],
  unmappedTags: FitTagEvidence[],
): ProductChannelRiskFlag[] {
  const flags = new Set<ProductChannelRiskFlag>(["algorithm_pending_user_formula"]);
  if (input.legacyFitScore) flags.add("legacy_fit_score_reference_only");
  if (lowConfidenceTags.length > 0) flags.add("low_confidence_tags");
  if (missingTags.length > 0) flags.add("missing_required_tags");
  if (unmappedTags.length > 0) flags.add("unmapped_source_fields");
  if ((input.productProfile.sampleSize ?? MIN_SAMPLE_SIZE) < MIN_SAMPLE_SIZE) flags.add("insufficient_product_sample");
  if (input.channelProfile.sampleSize < MIN_SAMPLE_SIZE) flags.add("insufficient_channel_sample");
  return [...flags].sort();
}

function baselineFitScore(matchedTags: FitTagEvidence[], conflictTags: FitTagEvidence[], missingTags: FitTagEvidence[]): number {
  const matched = matchedTags.reduce((sum, tag) => sum + Math.min(tag.productScore ?? 0, tag.channelScore ?? 0), 0);
  const conflict = conflictTags.reduce((sum, tag) => sum + (tag.productScore ?? 0), 0);
  const missing = missingTags.reduce((sum, tag) => sum + (tag.channelScore ?? 0), 0);
  const total = matched + conflict + missing;
  if (total === 0) return 0;
  return round(matched / total);
}

function fitConfidence(matchedTags: FitTagEvidence[], lowConfidenceTags: FitTagEvidence[], input: ProductChannelFitInput): number {
  const tagConfidence = matchedTags.length === 0 ? 0.4 : mean(matchedTags.map((tag) => tag.confidence ?? 0.4));
  const lowConfidencePenalty = Math.max(0.5, 1 - lowConfidenceTags.length * 0.08);
  const productSampleFactor = Math.min(1, (input.productProfile.sampleSize ?? MIN_SAMPLE_SIZE) / MIN_SAMPLE_SIZE);
  const channelSampleFactor = Math.min(1, input.channelProfile.sampleSize / MIN_SAMPLE_SIZE);
  return round(tagConfidence * lowConfidencePenalty * productSampleFactor * channelSampleFactor);
}

function recommendation(fitScore: number, confidence: number, riskFlags: ProductChannelRiskFlag[]): ProductChannelRecommendation {
  if (riskFlags.includes("insufficient_channel_sample") || riskFlags.includes("insufficient_product_sample")) return "observe";
  if (confidence < 0.5) return fitScore >= 0.55 ? "test_launch" : "observe";
  if (fitScore >= 0.7 && confidence >= 0.65) return "priority_launch";
  if (fitScore >= 0.5) return "test_launch";
  if (fitScore >= 0.3) return "observe";
  return "avoid";
}

function explanationSummary(
  matchedTags: FitTagEvidence[],
  conflictTags: FitTagEvidence[],
  missingTags: FitTagEvidence[],
  lowConfidenceTags: FitTagEvidence[],
  unmappedTags: FitTagEvidence[],
): string {
  return `matched=${matchedTags.length}; conflict=${conflictTags.length}; missing=${missingTags.length}; lowConfidence=${lowConfidenceTags.length}; unmapped=${unmappedTags.length}`;
}

function traceableTags(tags: ProfileTagScore[]): ProfileTagScore[] {
  return tags.filter((tag) => tag.tagId.includes("."));
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

import { MODEL_VERSION, type ProfileTagScore } from "./baseline.js";

export const ACCOUNT_FIT_ADAPTER_VERSION = "account-fit-rule-baseline-0.1";

export type AccountFitDimension = "demo" | "style" | "price" | "occasion" | "intent" | "channel" | "external";
export type AccountFitRecommendation = "priority_launch" | "test_launch" | "observe" | "avoid";
export type DimensionStatus = "matched" | "mismatch" | "partial" | "unmapped";
export type AccountFitRisk =
  | "algorithm_formula_pending"
  | "legacy_score_reference_only"
  | "low_fit_confidence"
  | "missing_dimension_top_tag"
  | "unmapped_external_dimension"
  | "low_profile_coverage"
  | "low_sample_size";

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

export interface LegacyFitScoreReference {
  score: number;
  source: "legacy_dashboard";
  usage: "diagnostic_reference_only";
}

export interface AccountFitExternalDimensionInput {
  sourceField: string;
  productTopLabel?: string;
  accountTopLabel?: string;
  productScore?: number;
  accountScore?: number;
  gapScore?: number;
  confidence?: number;
  status?: DimensionStatus;
}

export interface AccountFitAdjustmentAdviceHint {
  adviceId?: string;
  priority?: AccountFitAdjustmentAdvice["priority"];
  dimension: AccountFitDimension;
  currentProductTagId?: string;
  targetAccountTagId?: string;
  actionType?: AccountFitAdjustmentAdvice["actionType"];
  direction?: string;
  rationale?: string;
  expectedImpactIndex?: number;
  evidence?: AccountFitAdjustmentAdvice["evidence"];
}

export interface AccountFitAdapterInput {
  skuId: string;
  accountChannelId: string;
  productProfileTags: ProfileTagScore[];
  accountProfileTags: ProfileTagScore[];
  productTopTags?: AccountBenchmarkTopTag[];
  accountBenchmarkTopTags?: AccountBenchmarkTopTag[];
  externalDimensionDiagnostics?: AccountFitExternalDimensionInput[];
  adjustmentAdviceHints?: AccountFitAdjustmentAdviceHint[];
  legacyFitScore?: LegacyFitScoreReference;
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
  sourceField?: string;
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
  dimensionDiagnostics: AccountFitDimensionDiagnostic[];
  positiveDrivers: AccountFitDriver[];
  negativeDrivers: AccountFitDriver[];
  adjustmentAdvice: AccountFitAdjustmentAdvice[];
  risks: AccountFitRisk[];
  qualityFlags: string[];
  legacyFitScore?: LegacyFitScoreReference;
}

interface DimensionScores {
  dimension: AccountFitDimension;
  productTopTag?: TopTagScore;
  accountTopTag?: TopTagScore;
  overlap: number;
  gap: number;
  confidence: number;
}

interface TopTagScore extends ProfileTagScore {
  sourceField?: string;
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
  const diagnostics = [...dimensionScores.map(toDimensionDiagnostic), ...externalDimensionDiagnostics(input.externalDimensionDiagnostics)];
  const matchedDimensions = diagnostics.filter((item) => item.status === "matched" || item.status === "partial");
  const mismatchedDimensions = diagnostics.filter((item) => item.status === "mismatch" || item.status === "unmapped");
  const positiveDrivers = buildPositiveDrivers(dimensionScores);
  const negativeDrivers = buildNegativeDrivers(dimensionScores);
  const fitScore = weightedFitScore(dimensionScores);
  const fitConfidence = confidenceScore(dimensionScores, input.qualityMetadata);
  const qualityFlags = buildQualityFlags(input, dimensionScores, fitConfidence);
  const risks = buildRisks(input, diagnostics, qualityFlags);
  const adjustmentAdvice = buildAdjustmentAdvice(mismatchedDimensions, input.adjustmentAdviceHints);

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
    dimensionDiagnostics: diagnostics,
    positiveDrivers,
    negativeDrivers,
    adjustmentAdvice,
    risks,
    qualityFlags,
    legacyFitScore: input.legacyFitScore,
  };
}

function sanitizeTags(tags: ProfileTagScore[]): ProfileTagScore[] {
  return tags.filter((tag) => tag.tagId.includes("."));
}

function topTagsByDimension(tags: ProfileTagScore[], explicitTopTags: AccountBenchmarkTopTag[] = []): Map<AccountFitDimension, TopTagScore> {
  const byTagId = new Map(tags.map((tag) => [tag.tagId, tag]));
  const result = new Map<AccountFitDimension, TopTagScore>();
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
    result.set(topTag.dimension, { ...tag, sourceField: topTag.sourceField });
  }

  for (const tag of tags) {
    const dimension = tagDimension(tag.tagId);
    if (!dimension || dimension === "external" || result.has(dimension)) continue;
    const current = result.get(dimension);
    if (!current || tag.score > current.score) result.set(dimension, { ...tag, sourceField: tag.source });
  }
  return result;
}

function scoreDimension(dimension: AccountFitDimension, productTopTag?: TopTagScore, accountTopTag?: TopTagScore): DimensionScores {
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
    sourceField: score.productTopTag?.sourceField ?? score.accountTopTag?.sourceField,
  };
}

function externalDimensionDiagnostics(inputs: AccountFitExternalDimensionInput[] = []): AccountFitDimensionDiagnostic[] {
  return inputs.map((item) => ({
    dimension: "external",
    status: item.status ?? "unmapped",
    gapScore: round(normalizeGap(item.gapScore ?? Math.abs((item.productScore ?? 0) - (item.accountScore ?? 0)))),
    confidence: round(item.confidence ?? 0.4),
    reasonCode: "unmapped_external_dimension",
    sourceField: item.sourceField,
  }));
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

function buildAdjustmentAdvice(mismatches: AccountFitDimensionDiagnostic[], hints: AccountFitAdjustmentAdviceHint[] = []): AccountFitAdjustmentAdvice[] {
  const hinted = hints.map((hint, index) => normalizeAdviceHint(hint, index));
  const hintedKeys = new Set(hinted.map((item) => adviceKey(item.dimension, item.currentProductTagId, item.targetAccountTagId, item.evidence.sourceField)));
  const generated: AccountFitAdjustmentAdvice[] = mismatches
    .filter((item) => !hintedKeys.has(adviceKey(item.dimension, item.productTopTagId, item.accountTopTagId, item.sourceField)))
    .map((item, index): AccountFitAdjustmentAdvice => ({
      adviceId: `account_fit_advice_${index + 1}`,
      priority: advicePriority(item.gapScore),
      dimension: item.dimension,
      currentProductTagId: item.productTopTagId,
      targetAccountTagId: item.accountTopTagId,
      actionType: adviceActionType(item.dimension, item.status),
      direction: adviceDirection(item),
      rationale: `Dimension ${item.dimension} has status ${item.status} with reason ${item.reasonCode}.`,
      expectedImpactIndex: round(Math.min(1, item.gapScore * DIMENSION_WEIGHTS[item.dimension] * 2)),
      evidence: { gapScore: item.gapScore, sourceField: item.sourceField },
    }));
  return [...hinted, ...generated].slice(0, 4);
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
  if (input.legacyFitScore) flags.add("legacy_fit_score_reference_only");
  if ((input.qualityMetadata?.accountSampleSize ?? 500) < 500) flags.add("low_account_sample");
  if ((input.qualityMetadata?.productSampleSize ?? 500) < 500) flags.add("low_product_sample");
  if ((input.qualityMetadata?.accountProfileCoverageRate ?? 1) < 0.7) flags.add("low_account_profile_coverage");
  if ((input.qualityMetadata?.productProfileCoverageRate ?? 1) < 0.7) flags.add("low_product_profile_coverage");
  if (fitConfidence < 0.5) flags.add("low_fit_confidence");
  if (scores.some((score) => !score.productTopTag || !score.accountTopTag)) flags.add("missing_dimension_top_tag");
  if ((input.externalDimensionDiagnostics ?? []).length > 0) flags.add("unmapped_external_dimension");
  return [...flags].sort();
}

function buildRisks(input: AccountFitAdapterInput, diagnostics: AccountFitDimensionDiagnostic[], qualityFlags: string[]): AccountFitRisk[] {
  const risks = new Set<AccountFitRisk>(["algorithm_formula_pending"]);
  if (input.legacyFitScore) risks.add("legacy_score_reference_only");
  if (qualityFlags.includes("low_fit_confidence")) risks.add("low_fit_confidence");
  if (qualityFlags.includes("missing_dimension_top_tag")) risks.add("missing_dimension_top_tag");
  if (qualityFlags.includes("low_account_profile_coverage") || qualityFlags.includes("low_product_profile_coverage")) risks.add("low_profile_coverage");
  if (qualityFlags.includes("low_account_sample") || qualityFlags.includes("low_product_sample")) risks.add("low_sample_size");
  if (diagnostics.some((item) => item.reasonCode === "unmapped_external_dimension")) risks.add("unmapped_external_dimension");
  return [...risks].sort();
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

function normalizeAdviceHint(hint: AccountFitAdjustmentAdviceHint, index: number): AccountFitAdjustmentAdvice {
  const gapScore = hint.evidence?.gapScore ?? 0;
  return {
    adviceId: hint.adviceId ?? `account_fit_hint_${index + 1}`,
    priority: hint.priority ?? advicePriority(gapScore),
    dimension: hint.dimension,
    currentProductTagId: hint.currentProductTagId,
    targetAccountTagId: hint.targetAccountTagId,
    actionType: hint.actionType ?? adviceActionType(hint.dimension, hint.currentProductTagId && hint.targetAccountTagId ? "mismatch" : "unmapped"),
    direction: hint.direction ?? `Review ${hint.dimension} account-fit signal.`,
    rationale: hint.rationale ?? "User-authorized BI advice was normalized into PLS adjustment advice.",
    expectedImpactIndex: hint.expectedImpactIndex ?? round(Math.min(1, gapScore * DIMENSION_WEIGHTS[hint.dimension] * 2)),
    evidence: hint.evidence ?? {},
  };
}

function advicePriority(gapScore: number): AccountFitAdjustmentAdvice["priority"] {
  if (gapScore >= 0.7) return "high";
  if (gapScore >= 0.45) return "medium";
  return "low";
}

function adviceKey(dimension: AccountFitDimension, productTagId?: string, accountTagId?: string, sourceField?: string): string {
  return [dimension, productTagId ?? "", accountTagId ?? "", sourceField ?? ""].join("|");
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

function normalizeGap(value: number): number {
  return value > 1 ? value / 100 : value;
}

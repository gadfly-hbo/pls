import { MODEL_VERSION, type ProfileTagScore } from "./baseline.js";

export const CHANNEL_ENTITY_FIT_CONTRACT_VERSION = "channel-entity-fit-contract-0.1";

export type ChannelEntityFitRecommendation = "priority_launch" | "test_launch" | "observe" | "avoid";

export type ChannelEntityFitRiskFlag =
  | "algorithm_pending_user_formula"
  | "missing_product_fit_profile"
  | "low_product_fit_confidence"
  | "low_product_sample"
  | "low_channel_sample"
  | "missing_audience_profile"
  | "context_adjustment_low_confidence";

export type ChannelEntityType = "platform" | "trade_area" | "store" | "account";
export type MarketingEventType = "platform_promotion" | "traditional_holiday" | "brand_event";
export type BusinessScenarioType =
  | "new_product_launch"
  | "member_repurchase"
  | "inventory_clearance"
  | "hero_product_boost"
  | "regional_test"
  | "daily_replenishment";

export interface AudienceProfile {
  tags: ProfileTagScore[];
  sampleSize?: number;
  qualityFlags?: string[];
}

export interface ProductFitProfile {
  fitCategories: string[];
  fitPriceBands: string[];
  fitStyles: string[];
  fitOccasions: string[];
  fitLaunchTypes: string[];
  evidence?: string;
  confidence: number;
  qualityFlags?: string[];
}

export interface MarketingEvent {
  eventType: MarketingEventType;
  customTags?: string[];
}

export interface BusinessScenario {
  scenarioType: BusinessScenarioType;
  displayName?: string;
}

export interface ChannelEntityProfileV2 {
  channelId: string;
  channelType: string;
  channelEntityType?: ChannelEntityType;
  audienceProfile: AudienceProfile;
  productFitProfile?: ProductFitProfile;
  qualityFlags?: string[];
}

export interface ProductProfileForChannelEntityFit {
  skuId: string;
  predictedProfileTags: ProfileTagScore[];
  productDNA?: {
    categoryLv1?: string;
    categoryLv2?: string;
    priceBand?: string;
    styleKeywords?: string[];
    launchType?: string;
    season?: string;
  };
  qualityFlags?: string[];
  sampleSize?: number;
}

export interface ContextWeightAdjustment {
  dimension: string;
  tagId?: string;
  adjustment: number;
  active: boolean;
  reason: string;
}

export interface ChannelEntityFitDriver {
  dimension: string;
  tagId?: string;
  productScore: number;
  channelScore: number;
  contribution: number;
  reasonCode: "audience_match" | "product_fit_match" | "context_boost" | "context_penalty";
  contextReason?: string;
}

export interface ChannelEntityFit {
  skuId: string;
  channelId: string;
  channelType: string;
  modelVersion: string;
  contractVersion: string;
  source: "channel_entity_fit_contract_baseline";
  sourceType: "derived";
  audienceFit: number;
  productFit: number | null;
  baseScore: number;
  contextWeightAdjustments: ContextWeightAdjustment[];
  contextAdjustedScore: number;
  confidence: number;
  recommendation: ChannelEntityFitRecommendation;
  audienceDrivers: ChannelEntityFitDriver[];
  productFitDrivers: ChannelEntityFitDriver[];
  contextDrivers: ChannelEntityFitDriver[];
  riskFlags: ChannelEntityFitRiskFlag[];
  qualityFlags: string[];
}

export interface ChannelEntityFitInput {
  productProfile: ProductProfileForChannelEntityFit;
  channelProfile: ChannelEntityProfileV2;
  marketingEvent?: MarketingEvent;
  businessScenario?: BusinessScenario;
}

interface AudienceFitResult {
  score: number;
  drivers: ChannelEntityFitDriver[];
}

interface ProductFitResult {
  score: number | null;
  drivers: ChannelEntityFitDriver[];
}

const DEFAULT_DIMENSION_WEIGHTS: Record<string, number> = {
  demo: 0.2,
  style: 0.25,
  price: 0.2,
  occasion: 0.15,
  intent: 0.1,
  channel: 0.1,
};

const PRODUCT_FIT_FIELD_WEIGHTS: Record<string, number> = {
  category: 0.2,
  price: 0.2,
  style: 0.25,
  occasion: 0.2,
  launch: 0.15,
};

const STYLE_LABEL_MAP: Record<string, string> = {
  minimal: "style.minimal",
  basic: "style.basic",
  trendy: "style.trendy",
  sweet: "style.sweet",
  elegant: "style.elegant",
  sporty: "style.sporty",
  street: "style.street",
  luxury: "style.luxury",
};

const OCCASION_LABEL_MAP: Record<string, string> = {
  work: "occasion.work",
  daily: "occasion.daily",
  party: "occasion.party",
  travel: "occasion.travel",
  home: "occasion.home",
  seasonal: "occasion.seasonal",
};

const PRICE_BAND_LABEL_MAP: Record<string, string> = {
  value: "price.value",
  mid: "price.mid",
  premium: "price.premium",
  promo_sensitive: "price.promo_sensitive",
  new_arrival_sensitive: "price.new_arrival_sensitive",
};

const LAUNCH_TYPE_TAG_MAP: Record<string, string[]> = {
  new_arrival: ["intent.try_new", "price.new_arrival_sensitive"],
};

interface ContextAdjustmentRule {
  dimension: string;
  tagIds: string[];
  multiplier: number;
  reason: string;
}

const MARKETING_EVENT_RULES: Record<MarketingEventType, ContextAdjustmentRule[]> = {
  platform_promotion: [
    { dimension: "price", tagIds: ["price.promo_sensitive", "price.value"], multiplier: 1.2, reason: "Platform promotion boosts promo-sensitive and value price signals." },
    { dimension: "intent", tagIds: ["intent.repeat_purchase"], multiplier: 1.1, reason: "Platform promotion slightly boosts repeat-purchase intent." },
  ],
  traditional_holiday: [
    { dimension: "intent", tagIds: ["intent.gift"], multiplier: 1.25, reason: "Traditional holiday boosts gift intent." },
    { dimension: "occasion", tagIds: ["occasion.seasonal"], multiplier: 1.15, reason: "Traditional holiday boosts seasonal occasion." },
  ],
  brand_event: [
    { dimension: "style", tagIds: ["style.trendy", "style.luxury"], multiplier: 1.1, reason: "Brand event slightly boosts trendy and luxury style signals." },
  ],
};

const BUSINESS_SCENARIO_RULES: Record<BusinessScenarioType, ContextAdjustmentRule[]> = {
  new_product_launch: [
    { dimension: "intent", tagIds: ["intent.try_new"], multiplier: 1.25, reason: "New product launch boosts try-new intent." },
    { dimension: "price", tagIds: ["price.new_arrival_sensitive"], multiplier: 1.15, reason: "New product launch boosts new-arrival-sensitive price signal." },
  ],
  member_repurchase: [
    { dimension: "intent", tagIds: ["intent.repeat_purchase"], multiplier: 1.25, reason: "Member repurchase boosts repeat-purchase intent." },
  ],
  inventory_clearance: [
    { dimension: "price", tagIds: ["price.promo_sensitive", "price.value"], multiplier: 1.2, reason: "Inventory clearance boosts promo and value price signals." },
  ],
  hero_product_boost: [
    { dimension: "style", tagIds: ["style.trendy", "style.luxury", "style.basic"], multiplier: 1.1, reason: "Hero product boost slightly boosts style signals." },
  ],
  regional_test: [],
  daily_replenishment: [
    { dimension: "occasion", tagIds: ["occasion.daily"], multiplier: 1.15, reason: "Daily replenishment boosts daily occasion." },
  ],
};

const LOW_CONFIDENCE_THRESHOLD = 0.6;
const MIN_SAMPLE_SIZE = 500;

export function explainChannelEntityFit(input: ChannelEntityFitInput): ChannelEntityFit {
  const productTags = traceableTags(input.productProfile.predictedProfileTags);
  const audienceTags = traceableTags(input.channelProfile.audienceProfile.tags);

  const audienceFitResult = computeAudienceFit(productTags, audienceTags, DEFAULT_DIMENSION_WEIGHTS);
  const productFitResult = computeProductFit(input.productProfile, input.channelProfile.productFitProfile);

  const baseScore = computeBaseScore(audienceFitResult.score, productFitResult.score);

  const adjustments = buildContextAdjustments(input.marketingEvent, input.businessScenario, productTags);
  const contextAdjustedScore = applyContextAdjustment(baseScore, adjustments);

  const contextDrivers = buildContextDrivers(adjustments, baseScore, contextAdjustedScore);
  const confidence = computeConfidence(audienceFitResult, productFitResult, adjustments, input, productTags, audienceTags);
  const riskFlags = buildRiskFlags(input, productFitResult, audienceFitResult, adjustments);
  const qualityFlags = buildQualityFlags(input, productFitResult, audienceFitResult, riskFlags);

  return {
    skuId: input.productProfile.skuId,
    channelId: input.channelProfile.channelId,
    channelType: input.channelProfile.channelType,
    modelVersion: MODEL_VERSION,
    contractVersion: CHANNEL_ENTITY_FIT_CONTRACT_VERSION,
    source: "channel_entity_fit_contract_baseline",
    sourceType: "derived",
    audienceFit: audienceFitResult.score,
    productFit: productFitResult.score,
    baseScore,
    contextWeightAdjustments: adjustments,
    contextAdjustedScore,
    confidence,
    recommendation: recommendation(contextAdjustedScore, confidence, riskFlags),
    audienceDrivers: audienceFitResult.drivers,
    productFitDrivers: productFitResult.drivers,
    contextDrivers,
    riskFlags,
    qualityFlags,
  };
}

function computeAudienceFit(
  productTags: ProfileTagScore[],
  audienceTags: ProfileTagScore[],
  weights: Record<string, number>,
): AudienceFitResult {
  const productMap = toScoreMap(productTags);
  const audienceMap = toScoreMap(audienceTags);
  const tagIds = new Set([...productMap.keys(), ...audienceMap.keys()]);

  let numerator = 0;
  let denominator = 0;
  for (const tagId of tagIds) {
    const weight = weights[tagDimension(tagId)] ?? 0;
    const productScore = productMap.get(tagId) ?? 0;
    const audienceScore = audienceMap.get(tagId) ?? 0;
    numerator += Math.min(productScore, audienceScore) * weight;
    denominator += Math.max(productScore, audienceScore) * weight;
  }

  const score = denominator === 0 ? 0 : round(numerator / denominator);
  const drivers = buildAudienceDrivers(productMap, audienceMap, weights);
  return { score, drivers };
}

function buildAudienceDrivers(
  productMap: Map<string, number>,
  audienceMap: Map<string, number>,
  weights: Record<string, number>,
): ChannelEntityFitDriver[] {
  const drivers: ChannelEntityFitDriver[] = [];
  for (const [tagId, productScore] of productMap) {
    const audienceScore = audienceMap.get(tagId);
    if (!audienceScore || audienceScore <= 0) continue;
    const contribution = Math.min(productScore, audienceScore) * (weights[tagDimension(tagId)] ?? 0);
    drivers.push({
      dimension: tagDimension(tagId),
      tagId,
      productScore: round(productScore),
      channelScore: round(audienceScore),
      contribution: round(contribution),
      reasonCode: "audience_match",
    });
  }
  return drivers.sort((left, right) => right.contribution - left.contribution).slice(0, 3);
}

function computeProductFit(
  productProfile: ProductProfileForChannelEntityFit,
  productFitProfile: ProductFitProfile | undefined,
): ProductFitResult {
  if (!productFitProfile) {
    return { score: null, drivers: [] };
  }

  const productTagMap = toScoreMap(productProfile.predictedProfileTags);
  const dna = productProfile.productDNA ?? {};
  const fieldScores = new Map<string, number>();

  const categoryScore = computeCategoryFit(dna.categoryLv1, dna.categoryLv2, productFitProfile.fitCategories);
  if (productFitProfile.fitCategories.length > 0) {
    fieldScores.set("category", categoryScore);
  }

  const priceScore = computePriceFit(dna.priceBand, productTagMap, productFitProfile.fitPriceBands);
  if (productFitProfile.fitPriceBands.length > 0) {
    fieldScores.set("price", priceScore);
  }

  const styleScore = computeStyleFit(productTagMap, productFitProfile.fitStyles);
  if (productFitProfile.fitStyles.length > 0) {
    fieldScores.set("style", styleScore);
  }

  const occasionScore = computeOccasionFit(productTagMap, productFitProfile.fitOccasions);
  if (productFitProfile.fitOccasions.length > 0) {
    fieldScores.set("occasion", occasionScore);
  }

  const launchScore = computeLaunchFit(dna.launchType, productTagMap, productFitProfile.fitLaunchTypes);
  if (productFitProfile.fitLaunchTypes.length > 0) {
    fieldScores.set("launch", launchScore);
  }

  if (fieldScores.size === 0) {
    return { score: 0, drivers: [] };
  }

  let weightedSum = 0;
  let totalWeight = 0;
  for (const [field, score] of fieldScores) {
    const weight = PRODUCT_FIT_FIELD_WEIGHTS[field] ?? 0;
    weightedSum += score * weight;
    totalWeight += weight;
  }
  const score = totalWeight === 0 ? 0 : round(weightedSum / totalWeight);
  const drivers = buildProductFitDrivers(fieldScores, productTagMap);
  return { score, drivers };
}

function computeCategoryFit(categoryLv1: string | undefined, categoryLv2: string | undefined, fitCategories: string[]): number {
  if (fitCategories.length === 0) return 0;
  return fitCategories.some((category) => category === categoryLv1 || category === categoryLv2) ? 1 : 0;
}

function computePriceFit(
  priceBand: string | undefined,
  productTagMap: Map<string, number>,
  fitPriceBands: string[],
): number {
  if (fitPriceBands.length === 0) return 0;
  const priceBandMatch = priceBand && fitPriceBands.includes(priceBand) ? 1 : 0;
  const matchedTagScore = fitPriceBands
    .map((band) => PRICE_BAND_LABEL_MAP[band])
    .filter((tagId): tagId is string => Boolean(tagId))
    .reduce((sum, tagId) => sum + (productTagMap.get(tagId) ?? 0), 0);
  return Math.max(priceBandMatch, clamp(matchedTagScore, 0, 1));
}

function computeStyleFit(productTagMap: Map<string, number>, fitStyles: string[]): number {
  if (fitStyles.length === 0) return 0;
  const matched = fitStyles.filter((style) => productTagMap.get(STYLE_LABEL_MAP[style]) ?? 0 > 0).length;
  return matched === 0 ? 0 : round(matched / fitStyles.length);
}

function computeOccasionFit(productTagMap: Map<string, number>, fitOccasions: string[]): number {
  if (fitOccasions.length === 0) return 0;
  const matched = fitOccasions.filter((occasion) => productTagMap.get(OCCASION_LABEL_MAP[occasion]) ?? 0 > 0).length;
  return matched === 0 ? 0 : round(matched / fitOccasions.length);
}

function computeLaunchFit(
  launchType: string | undefined,
  productTagMap: Map<string, number>,
  fitLaunchTypes: string[],
): number {
  if (fitLaunchTypes.length === 0) return 0;
  const launchMatch = launchType && fitLaunchTypes.includes(launchType) ? 1 : 0;
  const tagScore = fitLaunchTypes
    .flatMap((type) => LAUNCH_TYPE_TAG_MAP[type] ?? [])
    .reduce((sum, tagId) => sum + (productTagMap.get(tagId) ?? 0), 0);
  return Math.max(launchMatch, clamp(tagScore, 0, 1));
}

function buildProductFitDrivers(
  fieldScores: Map<string, number>,
  productTagMap: Map<string, number>,
): ChannelEntityFitDriver[] {
  const drivers: ChannelEntityFitDriver[] = [];
  for (const [field, score] of fieldScores) {
    if (score <= 0) continue;
    const dimension = field === "category" ? "category" : field;
    const representativeTagId = findRepresentativeTag(field, productTagMap);
    drivers.push({
      dimension,
      tagId: representativeTagId,
      productScore: round(score),
      channelScore: 1,
      contribution: round(score * (PRODUCT_FIT_FIELD_WEIGHTS[field] ?? 0)),
      reasonCode: "product_fit_match",
    });
  }
  return drivers.sort((left, right) => right.contribution - left.contribution).slice(0, 3);
}

function findRepresentativeTag(field: string, productTagMap: Map<string, number>): string | undefined {
  if (field === "style") {
    for (const [label, tagId] of Object.entries(STYLE_LABEL_MAP)) {
      if (productTagMap.get(tagId)) return tagId;
    }
  }
  if (field === "occasion") {
    for (const [label, tagId] of Object.entries(OCCASION_LABEL_MAP)) {
      if (productTagMap.get(tagId)) return tagId;
    }
  }
  if (field === "price") {
    for (const [label, tagId] of Object.entries(PRICE_BAND_LABEL_MAP)) {
      if (productTagMap.get(tagId)) return tagId;
    }
  }
  if (field === "launch") {
    for (const tagIds of Object.values(LAUNCH_TYPE_TAG_MAP)) {
      for (const tagId of tagIds) {
        if (productTagMap.get(tagId)) return tagId;
      }
    }
  }
  return undefined;
}

function computeBaseScore(audienceFit: number, productFit: number | null): number {
  if (productFit === null) return round(audienceFit);
  return round(0.7 * audienceFit + 0.3 * productFit);
}

function buildContextAdjustments(
  marketingEvent: MarketingEvent | undefined,
  businessScenario: BusinessScenario | undefined,
  productTags: ProfileTagScore[],
): ContextWeightAdjustment[] {
  const productTagMap = toScoreMap(productTags);
  const rules: ContextAdjustmentRule[] = [
    ...(marketingEvent ? MARKETING_EVENT_RULES[marketingEvent.eventType] ?? [] : []),
    ...(businessScenario ? BUSINESS_SCENARIO_RULES[businessScenario.scenarioType] ?? [] : []),
  ];

  const adjustments: ContextWeightAdjustment[] = [];
  for (const rule of rules) {
    const activeTagId = rule.tagIds.find((tagId) => (productTagMap.get(tagId) ?? 0) > 0);
    adjustments.push({
      dimension: rule.dimension,
      tagId: activeTagId ?? rule.tagIds[0],
      adjustment: rule.multiplier,
      active: Boolean(activeTagId),
      reason: rule.reason,
    });
  }
  return adjustments;
}

function applyContextAdjustment(baseScore: number, adjustments: ContextWeightAdjustment[]): number {
  const active = adjustments.filter((item) => item.active);
  if (active.length === 0) return baseScore;
  const combined = active.reduce((product, item) => product * item.adjustment, 1);
  return round(clamp(baseScore * clamp(combined, 0.9, 1.3), 0, 1));
}

function buildContextDrivers(
  adjustments: ContextWeightAdjustment[],
  baseScore: number,
  contextAdjustedScore: number,
): ChannelEntityFitDriver[] {
  const active = adjustments.filter((item) => item.active);
  if (active.length === 0) return [];

  const delta = contextAdjustedScore - baseScore;
  const totalWeight = active.reduce((sum, item) => sum + (item.adjustment - 1), 0);
  const unit = totalWeight > 0 ? delta / totalWeight : 0;
  return active.map((adjustment) => ({
    dimension: adjustment.dimension,
    tagId: adjustment.tagId,
    productScore: round(adjustment.adjustment),
    channelScore: 0,
    contribution: round((adjustment.adjustment - 1) * unit),
    reasonCode: delta >= 0 ? "context_boost" : "context_penalty",
    contextReason: adjustment.reason,
  }));
}

function computeConfidence(
  audienceFitResult: AudienceFitResult,
  productFitResult: ProductFitResult,
  adjustments: ContextWeightAdjustment[],
  input: ChannelEntityFitInput,
  productTags: ProfileTagScore[],
  audienceTags: ProfileTagScore[],
): number {
  const productConfidenceByTag = new Map(productTags.map((tag) => [tag.tagId, tag.confidence]));
  const audienceConfidenceByTag = new Map(audienceTags.map((tag) => [tag.tagId, tag.confidence]));
  const matchedTagIds = audienceFitResult.drivers.map((driver) => driver.tagId).filter((tagId): tagId is string => Boolean(tagId));
  const audienceConfidence =
    matchedTagIds.length > 0
      ? mean(matchedTagIds.map((tagId) => Math.min(productConfidenceByTag.get(tagId) ?? 0.4, audienceConfidenceByTag.get(tagId) ?? 0.4)))
      : 0.4;

  const productSampleFactor = Math.min(1, (input.productProfile.sampleSize ?? MIN_SAMPLE_SIZE) / MIN_SAMPLE_SIZE);
  const channelSampleFactor = Math.min(
    1,
    (input.channelProfile.audienceProfile.sampleSize ?? MIN_SAMPLE_SIZE) / MIN_SAMPLE_SIZE,
  );

  let confidence = audienceConfidence * productSampleFactor * channelSampleFactor;
  if (productFitResult.score !== null && input.channelProfile.productFitProfile) {
    confidence *= input.channelProfile.productFitProfile.confidence;
  }
  if (adjustments.some((item) => item.active)) {
    confidence *= 0.98;
  }
  return round(clamp(confidence, 0, 1));
}

function buildRiskFlags(
  input: ChannelEntityFitInput,
  productFitResult: ProductFitResult,
  audienceFitResult: AudienceFitResult,
  adjustments: ContextWeightAdjustment[],
): ChannelEntityFitRiskFlag[] {
  const flags = new Set<ChannelEntityFitRiskFlag>(["algorithm_pending_user_formula"]);
  if (productFitResult.score === null) {
    flags.add("missing_product_fit_profile");
  } else if (input.channelProfile.productFitProfile && input.channelProfile.productFitProfile.confidence < LOW_CONFIDENCE_THRESHOLD) {
    flags.add("low_product_fit_confidence");
  }
  if (audienceFitResult.drivers.length === 0) {
    flags.add("missing_audience_profile");
  }
  if ((input.productProfile.sampleSize ?? MIN_SAMPLE_SIZE) < MIN_SAMPLE_SIZE) {
    flags.add("low_product_sample");
  }
  if ((input.channelProfile.audienceProfile.sampleSize ?? MIN_SAMPLE_SIZE) < MIN_SAMPLE_SIZE) {
    flags.add("low_channel_sample");
  }
  if (adjustments.some((item) => item.active && item.adjustment < 1)) {
    flags.add("context_adjustment_low_confidence");
  }
  return [...flags].sort();
}

function buildQualityFlags(
  input: ChannelEntityFitInput,
  productFitResult: ProductFitResult,
  audienceFitResult: AudienceFitResult,
  riskFlags: ChannelEntityFitRiskFlag[],
): string[] {
  const flags = new Set<string>([
    "algorithm_pending_user_formula",
    ...(input.productProfile.qualityFlags ?? []),
    ...(input.channelProfile.qualityFlags ?? []),
  ]);
  if (productFitResult.score === null) {
    flags.add("missing_product_fit_profile");
  }
  if (audienceFitResult.drivers.length === 0) {
    flags.add("missing_audience_profile");
  }
  for (const risk of riskFlags) {
    flags.add(risk);
  }
  if (input.channelProfile.productFitProfile?.qualityFlags) {
    for (const flag of input.channelProfile.productFitProfile.qualityFlags) {
      flags.add(flag);
    }
  }
  return [...flags].sort();
}

function recommendation(
  contextAdjustedScore: number,
  confidence: number,
  riskFlags: ChannelEntityFitRiskFlag[],
): ChannelEntityFitRecommendation {
  if (riskFlags.includes("missing_audience_profile")) return "observe";
  if (riskFlags.includes("low_product_sample") || riskFlags.includes("low_channel_sample")) return "observe";
  if (confidence < 0.5) return contextAdjustedScore >= 0.55 ? "test_launch" : "observe";
  if (contextAdjustedScore >= 0.7 && confidence >= 0.65) return "priority_launch";
  if (contextAdjustedScore >= 0.5) return "test_launch";
  if (contextAdjustedScore >= 0.3) return "observe";
  return "avoid";
}

function traceableTags(tags: ProfileTagScore[]): ProfileTagScore[] {
  return tags.filter((tag) => tag.tagId.includes("."));
}

function toScoreMap(tags: Array<{ tagId: string; score: number }>): Map<string, number> {
  return new Map(tags.map((tag) => [tag.tagId, tag.score]));
}

function tagDimension(tagId: string): string {
  return tagId.split(".")[0] ?? "";
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

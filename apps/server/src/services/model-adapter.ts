import {
  MODEL_VERSION,
  matchChannels,
  predictProductProfile,
  type ChannelMatchDraft,
  type ChannelProfile,
  type ProductDNA,
  type ProductProfileDraft,
  type ProfileTagScore,
} from "../../../model/src/baseline.js";

type DbRow = Record<string, unknown>;

export interface AdaptedProductProfile extends ProductProfileDraft {
  source: string;
  sourceType: "derived";
}

export interface AdaptedChannelMatch extends ChannelMatchDraft {
  recommendation: "priority_launch" | "test_launch" | "observe" | "avoid";
  risks: string[];
}

export function predictFromSkuRow(row: DbRow): AdaptedProductProfile {
  const profile = predictProductProfile(toProductDNA(row));
  return {
    ...profile,
    source: MODEL_VERSION,
    sourceType: "derived",
  };
}

export function matchFromPredictionAndChannels(
  profile: ProductProfileDraft,
  channels: DbRow[]
): AdaptedChannelMatch[] {
  return matchChannels(profile, channels.map(toChannelProfile)).map((match) => ({
    ...match,
    recommendation: toRecommendation(match.matchScore, match.matchConfidence, match.negativeDrivers),
    risks: buildRisks(match),
  }));
}

function toProductDNA(row: DbRow): ProductDNA {
  const attributes = JSON.parse((row.attributes as string) ?? "{}") as Record<string, unknown>;
  return {
    skuId: String(row.sku_id),
    categoryLv1: String(row.category_lv1 ?? ""),
    categoryLv2: String(row.category_lv2 ?? ""),
    season: String(row.season ?? ""),
    titleTokens: toStringArray(attributes.titleTokens),
    styleKeywords: toStringArray(attributes.styleKeywords),
    colorFamily: String(attributes.colorFamily ?? "unknown"),
    fitType: toOptionalString(attributes.fitType),
    fabricType: toOptionalString(attributes.fabricType),
    patternType: toOptionalString(attributes.patternType),
    sleeveType: toOptionalString(attributes.sleeveType),
    lengthType: toOptionalString(attributes.lengthType),
    priceBand: String(attributes.priceBand ?? "mid"),
    launchType: toOptionalString(attributes.launchType),
    imageFeatureSummary: isRecord(attributes.imageFeatureSummary) ? attributes.imageFeatureSummary : undefined,
    mappedProductTags: JSON.parse((row.mapped_product_tags as string) ?? "[]") as ProfileTagScore[],
  };
}

function toChannelProfile(row: DbRow): ChannelProfile {
  return {
    channelId: String(row.channel_id),
    channelType: String(row.channel_type ?? ""),
    sampleSize: Number(row.sample_size ?? 0),
    tags: JSON.parse((row.tags as string) ?? "[]") as ProfileTagScore[],
    qualityFlags: JSON.parse((row.quality_flags as string) ?? "[]") as string[],
  };
}

function toRecommendation(
  matchScore: number,
  matchConfidence: number,
  negativeDrivers: Array<{ tagId: string }>
): "priority_launch" | "test_launch" | "observe" | "avoid" {
  const negativeDimensions = new Set(
    negativeDrivers.map((driver) => String(driver.tagId).split(".")[0]).filter(Boolean)
  );

  if (matchScore < 0.35 || negativeDimensions.size >= 2) {
    return "avoid";
  }
  if (matchScore >= 0.7 && matchConfidence >= 0.6) {
    return "priority_launch";
  }
  if (matchScore >= 0.5 && matchScore < 0.7 && matchConfidence >= 0.5) {
    return "test_launch";
  }
  return "observe";
}

function buildRisks(match: ChannelMatchDraft): string[] {
  const risks = new Set<string>();
  if (match.positiveDrivers.length === 0) {
    risks.add("no_common_tags");
  }
  if (match.channelType === "live_stream" && match.negativeDrivers.some((driver) => driver.tagId.startsWith("price."))) {
    risks.add("channel_price_sensitivity_gap");
  }
  if (match.matchConfidence < 0.5) {
    risks.add("prediction_below_threshold");
  }
  if (match.qualityFlags.includes("low_channel_sample")) {
    risks.add("channel_sample_thin");
  }
  return [...risks];
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

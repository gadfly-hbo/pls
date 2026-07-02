// Mock M domain adapter: returns hardcoded ProductProfile / MatchResult
// aligned with model-plan.md §3.3 / §4.4 and demo data

export interface MockProductProfile {
  skuId: string;
  modelVersion: string;
  modelPath: string;
  input: Record<string, unknown>;
  predictedProfileTags: Array<{
    tagId: string;
    score: number;
    confidence: number;
    source: string;
    sampleSize: null;
    timeWindow: null;
  }>;
  topSegments: Array<{
    segmentId: string;
    name: string;
    rank: number;
    confidence: number;
    tags: Array<{ tagId: string; score: number }>;
    drivers: string[];
  }>;
  qualityFlags: string[];
  unmappedInputTokens: string[];
}

export interface MockChannelMatch {
  channelId: string;
  channelType: string;
  matchScore: number;
  matchConfidence: number;
  rank: number;
  overlap: number;
  bestSegmentId: string;
  bestSegmentMatch: number;
  positiveDrivers: Array<{ tagId: string; productScore: number; channelScore: number }>;
  negativeDrivers: Array<{ tagId: string; productScore: number; channelScore: number }>;
  recommendation: string;
  risks: string[];
  qualityFlags: string[];
}

const MOCK_PRODUCT_PROFILES: Record<string, MockProductProfile> = {
  mock_sku_101: {
    skuId: "mock_sku_101",
    modelVersion: "m-p0-baseline-0.1",
    modelPath: "gbdt",
    input: {
      dnaHash: "d5f2a1",
      categoryLv1: "apparel",
      categoryLv2: "dress",
      season: "spring_summer",
      priceBand: "mid",
      styleKeywords: ["minimal", "commute"],
    },
    predictedProfileTags: [
      { tagId: "demo.age_25_34", score: 0.79, confidence: 0.72, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
      { tagId: "demo.female", score: 0.74, confidence: 0.7, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
      { tagId: "style.minimal", score: 0.74, confidence: 0.7, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
      { tagId: "occasion.work", score: 0.69, confidence: 0.66, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
      { tagId: "price.mid", score: 0.61, confidence: 0.65, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
      { tagId: "demo.city_high_tier", score: 0.58, confidence: 0.6, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
    ],
    topSegments: [
      {
        segmentId: "seg_work_minimal_25_34",
        name: "25-34 岁简约通勤女性",
        rank: 1,
        confidence: 0.68,
        tags: [
          { tagId: "demo.age_25_34", score: 0.79 },
          { tagId: "demo.female", score: 0.74 },
          { tagId: "style.minimal", score: 0.74 },
          { tagId: "occasion.work", score: 0.69 },
          { tagId: "price.mid", score: 0.61 },
        ],
        drivers: ["style.minimal", "occasion.work", "price.mid"],
      },
    ],
    qualityFlags: [],
    unmappedInputTokens: [],
  },
  mock_sku_102: {
    skuId: "mock_sku_102",
    modelVersion: "m-p0-baseline-0.1",
    modelPath: "knn",
    input: {
      dnaHash: "a3c7e9",
      categoryLv1: "apparel",
      categoryLv2: "top",
      season: "spring_summer",
      priceBand: "value",
      styleKeywords: ["sweet", "travel"],
    },
    predictedProfileTags: [
      { tagId: "style.sweet", score: 0.72, confidence: 0.68, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
      { tagId: "occasion.travel", score: 0.66, confidence: 0.62, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
      { tagId: "price.value", score: 0.7, confidence: 0.72, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
      { tagId: "price.promo_sensitive", score: 0.58, confidence: 0.6, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
      { tagId: "intent.try_new", score: 0.62, confidence: 0.58, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
      { tagId: "demo.age_18_24", score: 0.55, confidence: 0.54, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
    ],
    topSegments: [
      {
        segmentId: "seg_trendy_young_18_24",
        name: "18-24 岁潮流个性青年",
        rank: 1,
        confidence: 0.55,
        tags: [
          { tagId: "demo.age_18_24", score: 0.55 },
          { tagId: "intent.try_new", score: 0.62 },
          { tagId: "price.value", score: 0.7 },
        ],
        drivers: ["intent.try_new", "price.value", "style.sweet"],
      },
    ],
    qualityFlags: ["low_training_sample"],
    unmappedInputTokens: [],
  },
  mock_sku_103: {
    skuId: "mock_sku_103",
    modelVersion: "m-p0-baseline-0.1",
    modelPath: "rule",
    input: {
      dnaHash: "f8b2d4",
      categoryLv1: "apparel",
      categoryLv2: "outerwear",
      season: "fall_winter",
      priceBand: "premium",
      styleKeywords: ["elegant", "luxury", "commute"],
    },
    predictedProfileTags: [
      { tagId: "style.elegant", score: 0.76, confidence: 0.6, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
      { tagId: "style.luxury", score: 0.7, confidence: 0.58, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
      { tagId: "price.premium", score: 0.78, confidence: 0.65, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
      { tagId: "demo.city_high_tier", score: 0.58, confidence: 0.52, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
      { tagId: "occasion.work", score: 0.62, confidence: 0.56, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
      { tagId: "demo.age_35_44", score: 0.54, confidence: 0.5, source: "m-p0-baseline-0.1", sampleSize: null, timeWindow: null },
    ],
    topSegments: [
      {
        segmentId: "seg_elegant_35_44_premium",
        name: "35-44 岁优雅轻熟高客单",
        rank: 1,
        confidence: 0.52,
        tags: [
          { tagId: "demo.age_35_44", score: 0.54 },
          { tagId: "style.elegant", score: 0.76 },
          { tagId: "price.premium", score: 0.78 },
        ],
        drivers: ["price.premium", "style.elegant", "occasion.work"],
      },
    ],
    qualityFlags: ["fallback_rule_only", "low_training_sample"],
    unmappedInputTokens: [],
  },
};

// Channel match scenarios per expected_scenarios.md
const MOCK_CHANNEL_MATCHES: Record<string, MockChannelMatch[]> = {
  mock_sku_101: [
    {
      channelId: "mock_channel_shelf_001",
      channelType: "shelf_ecommerce",
      matchScore: 0.78,
      matchConfidence: 0.72,
      rank: 1,
      overlap: 0.74,
      bestSegmentId: "seg_work_minimal_25_34",
      bestSegmentMatch: 0.8,
      positiveDrivers: [
        { tagId: "style.minimal", productScore: 0.74, channelScore: 0.72 },
        { tagId: "occasion.work", productScore: 0.69, channelScore: 0.7 },
        { tagId: "price.mid", productScore: 0.61, channelScore: 0.66 },
      ],
      negativeDrivers: [],
      recommendation: "priority_launch",
      risks: [],
      qualityFlags: [],
    },
    {
      channelId: "mock_channel_short_video_001",
      channelType: "short_video",
      matchScore: 0.45,
      matchConfidence: 0.52,
      rank: 2,
      overlap: 0.38,
      bestSegmentId: "seg_work_minimal_25_34",
      bestSegmentMatch: 0.48,
      positiveDrivers: [
        { tagId: "demo.female", productScore: 0.74, channelScore: 0.7 },
      ],
      negativeDrivers: [
        { tagId: "style.minimal", productScore: 0.74, channelScore: 0.2 },
        { tagId: "intent.try_new", productScore: 0.3, channelScore: 0.76 },
      ],
      recommendation: "observe",
      risks: ["prediction_below_threshold"],
      qualityFlags: [],
    },
    {
      channelId: "mock_channel_live_001",
      channelType: "live_stream",
      matchScore: 0.48,
      matchConfidence: 0.5,
      rank: 3,
      overlap: 0.42,
      bestSegmentId: "seg_work_minimal_25_34",
      bestSegmentMatch: 0.5,
      positiveDrivers: [
        { tagId: "demo.age_25_34", productScore: 0.79, channelScore: 0.58 },
      ],
      negativeDrivers: [
        { tagId: "price.mid", productScore: 0.61, channelScore: 0.15 },
        { tagId: "price.promo_sensitive", productScore: 0.1, channelScore: 0.78 },
      ],
      recommendation: "observe",
      risks: ["channel_price_sensitivity_gap"],
      qualityFlags: [],
    },
    {
      channelId: "mock_channel_private_001",
      channelType: "private_domain",
      matchScore: 0.55,
      matchConfidence: 0.58,
      rank: 4,
      overlap: 0.5,
      bestSegmentId: "seg_work_minimal_25_34",
      bestSegmentMatch: 0.56,
      positiveDrivers: [
        { tagId: "demo.age_25_34", productScore: 0.79, channelScore: 0.42 },
        { tagId: "style.minimal", productScore: 0.74, channelScore: 0.32 },
      ],
      negativeDrivers: [
        { tagId: "price.mid", productScore: 0.61, channelScore: 0.12 },
      ],
      recommendation: "test_launch",
      risks: ["channel_sample_thin"],
      qualityFlags: ["low_channel_sample"],
    },
  ],
  mock_sku_102: [
    {
      channelId: "mock_channel_live_001",
      channelType: "live_stream",
      matchScore: 0.55,
      matchConfidence: 0.56,
      rank: 1,
      overlap: 0.52,
      bestSegmentId: "seg_trendy_young_18_24",
      bestSegmentMatch: 0.54,
      positiveDrivers: [
        { tagId: "price.value", productScore: 0.7, channelScore: 0.82 },
        { tagId: "price.promo_sensitive", productScore: 0.58, channelScore: 0.78 },
        { tagId: "intent.try_new", productScore: 0.62, channelScore: 0.56 },
      ],
      negativeDrivers: [
        { tagId: "style.basic", productScore: 0.15, channelScore: 0.64 },
      ],
      recommendation: "test_launch",
      risks: [],
      qualityFlags: [],
    },
    {
      channelId: "mock_channel_short_video_001",
      channelType: "short_video",
      matchScore: 0.62,
      matchConfidence: 0.6,
      rank: 2,
      overlap: 0.58,
      bestSegmentId: "seg_trendy_young_18_24",
      bestSegmentMatch: 0.64,
      positiveDrivers: [
        { tagId: "style.sweet", productScore: 0.72, channelScore: 0.68 },
        { tagId: "occasion.travel", productScore: 0.66, channelScore: 0.62 },
        { tagId: "intent.try_new", productScore: 0.62, channelScore: 0.76 },
      ],
      negativeDrivers: [],
      recommendation: "test_launch",
      risks: [],
      qualityFlags: [],
    },
  ],
  mock_sku_103: [
    {
      channelId: "mock_channel_short_video_001",
      channelType: "short_video",
      matchScore: 0.42,
      matchConfidence: 0.48,
      rank: 1,
      overlap: 0.35,
      bestSegmentId: "seg_elegant_35_44_premium",
      bestSegmentMatch: 0.4,
      positiveDrivers: [
        { tagId: "intent.try_new", productScore: 0.35, channelScore: 0.76 },
      ],
      negativeDrivers: [
        { tagId: "style.trendy", productScore: 0.15, channelScore: 0.74 },
        { tagId: "demo.age_18_24", productScore: 0.1, channelScore: 0.72 },
      ],
      recommendation: "observe",
      risks: ["prediction_below_threshold", "no_common_tags"],
      qualityFlags: [],
    },
    {
      channelId: "mock_channel_live_001",
      channelType: "live_stream",
      matchScore: 0.22,
      matchConfidence: 0.38,
      rank: 2,
      overlap: 0.18,
      bestSegmentId: "seg_elegant_35_44_premium",
      bestSegmentMatch: 0.2,
      positiveDrivers: [],
      negativeDrivers: [
        { tagId: "price.value", productScore: 0.05, channelScore: 0.82 },
        { tagId: "price.promo_sensitive", productScore: 0.05, channelScore: 0.78 },
        { tagId: "demo.city_lower_tier", productScore: 0.1, channelScore: 0.66 },
      ],
      recommendation: "avoid",
      risks: ["channel_price_sensitivity_gap", "no_common_tags"],
      qualityFlags: ["no_common_tags"],
    },
    {
      channelId: "mock_channel_private_001",
      channelType: "private_domain",
      matchScore: 0.68,
      matchConfidence: 0.64,
      rank: 3,
      overlap: 0.62,
      bestSegmentId: "seg_elegant_35_44_premium",
      bestSegmentMatch: 0.7,
      positiveDrivers: [
        { tagId: "style.elegant", productScore: 0.76, channelScore: 0.7 },
        { tagId: "price.premium", productScore: 0.78, channelScore: 0.62 },
        { tagId: "demo.city_high_tier", productScore: 0.58, channelScore: 0.64 },
      ],
      negativeDrivers: [],
      recommendation: "priority_launch",
      risks: [],
      qualityFlags: [],
    },
    {
      channelId: "mock_channel_shelf_001",
      channelType: "shelf_ecommerce",
      matchScore: 0.52,
      matchConfidence: 0.54,
      rank: 4,
      overlap: 0.48,
      bestSegmentId: "seg_elegant_35_44_premium",
      bestSegmentMatch: 0.5,
      positiveDrivers: [
        { tagId: "occasion.work", productScore: 0.62, channelScore: 0.7 },
        { tagId: "style.elegant", productScore: 0.76, channelScore: 0.32 },
      ],
      negativeDrivers: [
        { tagId: "price.premium", productScore: 0.78, channelScore: 0.15 },
      ],
      recommendation: "test_launch",
      risks: [],
      qualityFlags: [],
    },
  ],
};

export function predict(skuId: string): MockProductProfile | null {
  return MOCK_PRODUCT_PROFILES[skuId] ?? null;
}

export function match(skuId: string, channelIds?: string[]): MockChannelMatch[] {
  const all = MOCK_CHANNEL_MATCHES[skuId] ?? [];
  if (!channelIds || channelIds.length === 0) return all;
  const set = new Set(channelIds);
  return all.filter((m) => set.has(m.channelId));
}

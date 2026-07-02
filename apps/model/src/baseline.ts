import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const MODEL_VERSION = "m-p0-baseline-0.1";

const ROOT_DIR = resolve(import.meta.dirname, "../../..");
const DEMO_DIR = resolve(ROOT_DIR, "data/demo");
const P1_MULTI_TIMEWINDOW_DIR = resolve(ROOT_DIR, "data/p1/multi-timewindow-demo");
const TAXONOMY_PATH = resolve(ROOT_DIR, "docs/profile-taxonomy-v0.md");

export interface ProfileTagScore {
  tagId: string;
  score: number;
  confidence: number;
  source: string;
  sampleSize: number | null;
  timeWindow: string | null;
}

export interface ProductDNA {
  skuId: string;
  categoryLv1: string;
  categoryLv2: string;
  season: string;
  titleTokens: string[];
  styleKeywords: string[];
  colorFamily: string;
  fitType?: string;
  fabricType?: string;
  patternType?: string;
  sleeveType?: string;
  lengthType?: string;
  priceBand: string;
  launchType?: string;
  imageFeatureSummary?: Record<string, unknown>;
  mappedProductTags: ProfileTagScore[];
}

export interface DemoSku {
  skuId: string;
  categoryLv1: string;
  categoryLv2: string;
  season: string;
  attributes: Omit<ProductDNA, "skuId" | "categoryLv1" | "categoryLv2" | "season" | "mappedProductTags">;
  mappedProductTags: ProfileTagScore[];
}

export interface WideTableRow extends ProductDNA {
  channelId: string;
  channelType: string;
  timeWindow: string;
  source?: string;
  sourceType?: string;
  batchId?: string;
  buyerProfileTags: ProfileTagScore[];
  sampleSize: number;
  profileCoverageRate: number;
  missingFieldRate: number;
  lowConfidenceTagCount: number;
  isTrainable: boolean;
  sellThroughRate?: number;
  returnRate?: number;
}

export interface ChannelProfile {
  channelId: string;
  channelType: string;
  sampleSize: number;
  tags: ProfileTagScore[];
  qualityFlags: string[];
}

export interface SegmentDraft {
  segmentId: string;
  name: string;
  rank: number;
  confidence: number;
  tags: Array<{ tagId: string; score: number }>;
  drivers: string[];
}

export interface SegmentTemplateReport {
  segmentId: string;
  name: string;
  templateTags: Record<string, number>;
}

export interface ProductProfileDraft {
  skuId: string;
  modelVersion: string;
  modelPath: "knn" | "rule";
  input: {
    dnaHash: string;
    categoryLv1: string;
    categoryLv2: string;
    season: string;
    priceBand: string;
    styleKeywords: string[];
  };
  predictedProfileTags: ProfileTagScore[];
  topSegments: SegmentDraft[];
  qualityFlags: string[];
  unmappedInputTokens: string[];
}

export interface DriverDraft {
  tagId: string;
  productScore: number;
  channelScore: number;
}

export interface ChannelMatchDraft {
  channelId: string;
  channelType: string;
  matchScore: number;
  matchConfidence: number;
  rank: number;
  overlap: number;
  bestSegmentId: string;
  bestSegmentMatch: number;
  positiveDrivers: DriverDraft[];
  negativeDrivers: DriverDraft[];
  qualityFlags: string[];
}

export interface BacktestReport {
  reportId: string;
  modelVersion: string;
  evaluationMode: "demo_only_leave_one_sku_out" | "cutoff_time_split";
  inputPath?: string;
  cutoffTimeWindow?: string;
  trainWindows?: string[];
  validationWindows?: string[];
  trainSize: number;
  testSize: number;
  trainSkuCount?: number;
  testSkuCount?: number;
  channelCount?: number;
  qualityFlags?: string[];
  predictionMetrics: {
    "topKTagHit@5": number;
    segmentTop1Hit?: number;
    driverPrecision: number;
  };
  matchMetrics: {
    "matchNDCG@3": number;
  };
  stratifiedMetrics?: BacktestSlice[];
  notes: string[];
}

export interface BacktestSlice {
  dimension: "categoryLv2" | "channelType" | "sampleSizeBucket";
  value: string;
  trainSize: number;
  testSize: number;
  metrics: {
    "topKTagHit@5"?: number;
    segmentTop1Hit?: number;
    driverPrecision?: number;
    "matchNDCG@3"?: number;
    positiveMatchRate?: number;
  };
  qualityFlags: string[];
}

export interface CutoffBacktestOptions {
  inputPath?: string;
  cutoffTimeWindow?: string;
}

export interface SegmentCalibrationReport {
  reportId: string;
  modelVersion: string;
  inputPath: string;
  baseline: {
    segmentTop1Hit: number;
    templateCount: number;
    templates: SegmentTemplateReport[];
  };
  candidates: Array<{
    candidateId: string;
    description: string;
    segmentTop1Hit: number;
    delta: number;
    qualityFlags: string[];
  }>;
  recommendation: "keep_current_weights" | "requires_more_data";
  qualityFlags: string[];
  notes: string[];
}

export interface TokenGovernanceReport {
  reportId: string;
  modelVersion: string;
  structuralTokens: Array<{ token: string; field: string; action: "ignore"; reason: string }>;
  mappableTokenReviewQueue: Array<{ token: string; proposedTagIds: string[]; reason: string }>;
  unknownBusinessTokens: Array<{ token: string; occurrences: number; exampleSkuIds: string[] }>;
  taxonomyChangeRequired: false;
  notes: string[];
}

interface SkuBacktestResult {
  skuId: string;
  categoryLv2: string;
  topKTagHitAt5: number;
  segmentTop1Hit: number;
  driverPrecision: number;
}

interface MatchBacktestResult {
  skuId: string;
  channelId: string;
  channelType: string;
  sampleSizeBucket: string;
  relevance: number;
  rankedRelevance: number;
}

interface SegmentTemplate {
  segmentId: string;
  name: string;
  templateTags: Record<string, number>;
}

const DIMENSION_WEIGHTS: Record<string, number> = {
  demo: 0.2,
  style: 0.25,
  price: 0.2,
  occasion: 0.15,
  intent: 0.1,
  channel: 0.1,
};

const SEGMENT_TEMPLATES: SegmentTemplate[] = [
  {
    segmentId: "seg_work_minimal_25_34",
    name: "25-34 岁简约通勤女性",
    templateTags: { "demo.age_25_34": 0.9, "demo.female": 0.9, "style.minimal": 1, "occasion.work": 0.9, "price.mid": 0.7 },
  },
  {
    segmentId: "seg_trendy_young_18_24",
    name: "18-24 岁潮流个性青年",
    templateTags: { "demo.age_18_24": 0.9, "style.trendy": 1, "intent.try_new": 0.8, "channel.short_video": 0.6 },
  },
  {
    segmentId: "seg_elegant_35_44_premium",
    name: "35-44 岁优雅轻熟高客单",
    templateTags: { "demo.age_35_44": 0.9, "style.elegant": 1, "price.premium": 0.9, "intent.gift": 0.4 },
  },
  {
    segmentId: "seg_sporty_daily",
    name: "运动休闲日常客群",
    templateTags: { "style.sporty": 1, "occasion.daily": 0.8, "price.mid": 0.6 },
  },
  {
    segmentId: "seg_value_promo_lower_tier",
    name: "下沉价值促销客群",
    templateTags: { "demo.city_lower_tier": 0.9, "price.value": 1, "price.promo_sensitive": 0.9, "intent.repeat_purchase": 0.6 },
  },
  {
    segmentId: "seg_gift_seasonal",
    name: "节令送礼客群",
    templateTags: { "intent.gift": 1, "occasion.seasonal": 0.8, "price.premium": 0.6 },
  },
];

const KEYWORD_TAGS: Record<string, string[]> = {
  minimal: ["style.minimal"],
  basic: ["style.basic"],
  commute: ["occasion.work", "style.minimal"],
  street: ["style.street"],
  sport: ["style.sporty"],
  sporty: ["style.sporty"],
  elegant: ["style.elegant"],
  sweet: ["style.sweet"],
  trendy: ["style.trendy"],
  luxury: ["style.luxury"],
  party: ["occasion.party"],
  travel: ["occasion.travel"],
  home: ["occasion.home"],
  gift: ["intent.gift"],
  new_arrival: ["price.new_arrival_sensitive", "intent.try_new"],
  new: ["price.new_arrival_sensitive", "intent.try_new"],
};

const PRICE_TAGS: Record<string, string> = {
  value: "price.value",
  mid: "price.mid",
  premium: "price.premium",
};

const STRUCTURAL_TOKEN_RULES: Record<string, { field: string; reason: string }> = {
  dress: { field: "categoryLv2", reason: "category structure, not an audience profile tag" },
  top: { field: "categoryLv2", reason: "category structure, not an audience profile tag" },
  bottom: { field: "categoryLv2", reason: "category structure, not an audience profile tag" },
  outerwear: { field: "categoryLv2", reason: "category structure, not an audience profile tag" },
  set: { field: "categoryLv2", reason: "category structure, not an audience profile tag" },
  midi: { field: "lengthType", reason: "product length structure, not an audience profile tag" },
  short: { field: "lengthType", reason: "product length structure, not an audience profile tag" },
  regular: { field: "lengthType", reason: "product length structure, not an audience profile tag" },
  long: { field: "lengthType", reason: "product length structure, not an audience profile tag" },
  chiffon: { field: "fabricType", reason: "product material structure, not an audience profile tag" },
  wool: { field: "fabricType", reason: "product material structure, not an audience profile tag" },
  blazer: { field: "categoryLv2", reason: "category descriptor, not an audience profile tag" },
};

const TOKEN_REVIEW_CANDIDATES: Record<string, { proposedTagIds: string[]; reason: string }> = {
  premium: { proposedTagIds: ["price.premium"], reason: "title token may duplicate existing priceBand mapping; D/X should decide whether keyword mapping is needed" },
};

export function loadAllowedTagIds(): Set<string> {
  const content = readFileSync(TAXONOMY_PATH, "utf8");
  const tagIds = new Set<string>();
  for (const match of content.matchAll(/\| `([a-z]+\.[a-z0-9_]+)` \|/g)) {
    const tagId = match[1];
    if (tagId) {
      tagIds.add(tagId);
    }
  }
  return tagIds;
}

export function loadDemoSkus(): DemoSku[] {
  return readJsonl<DemoSku>(resolve(DEMO_DIR, "skus.jsonl"));
}

export function loadWideTable(): WideTableRow[] {
  return readJsonl<WideTableRow>(resolve(DEMO_DIR, "wide_table.jsonl"));
}

export function loadP1MultiTimeWindowWideTable(inputPath = resolve(P1_MULTI_TIMEWINDOW_DIR, "wide_table.jsonl")): WideTableRow[] {
  return readJsonl<WideTableRow>(inputPath);
}

export function loadChannelProfiles(): ChannelProfile[] {
  return readJsonl<ChannelProfile>(resolve(DEMO_DIR, "channel_profiles.jsonl"));
}

export function toProductDNA(sku: DemoSku): ProductDNA {
  return {
    skuId: sku.skuId,
    categoryLv1: sku.categoryLv1,
    categoryLv2: sku.categoryLv2,
    season: sku.season,
    ...sku.attributes,
    mappedProductTags: sku.mappedProductTags,
  };
}

export function predictProductProfile(input: ProductDNA, trainRows = loadWideTable()): ProductProfileDraft {
  const allowedTagIds = loadAllowedTagIds();
  const { ruleTags, unmappedInputTokens } = buildRuleTags(input, allowedTagIds);
  const trainableRows = trainRows.filter((row) => row.isTrainable !== false);
  const qualityFlags: string[] = [];

  const useKnn = trainableRows.length >= 10;
  if (!useKnn) {
    qualityFlags.push("fallback_rule_only", "low_training_sample");
  }

  const predictedTags = useKnn
    ? blendTagScores(knnPredict(input, trainableRows), ruleTags, 0.7, 0.3)
    : ruleTags;

  const validPredictedTags = predictedTags
    .filter((tag) => allowedTagIds.has(tag.tagId))
    .sort((left, right) => right.score - left.score)
    .slice(0, 12)
    .map((tag) => ({ ...tag, score: round(tag.score), confidence: round(tag.confidence), source: MODEL_VERSION, sampleSize: null, timeWindow: null }));

  if (validPredictedTags.length === 0) {
    qualityFlags.push("no_valid_profile_tags");
  }

  return {
    skuId: input.skuId,
    modelVersion: MODEL_VERSION,
    modelPath: useKnn ? "knn" : "rule",
    input: {
      dnaHash: dnaHash(input),
      categoryLv1: input.categoryLv1,
      categoryLv2: input.categoryLv2,
      season: input.season,
      priceBand: input.priceBand,
      styleKeywords: input.styleKeywords,
    },
    predictedProfileTags: validPredictedTags,
    topSegments: buildTopSegments(validPredictedTags),
    qualityFlags,
    unmappedInputTokens,
  };
}

export function matchChannels(profile: ProductProfileDraft, channels = loadChannelProfiles()): ChannelMatchDraft[] {
  const productVector = toScoreMap(profile.predictedProfileTags);
  const confidenceByTag = new Map(profile.predictedProfileTags.map((tag) => [tag.tagId, tag.confidence]));
  const ranked = channels.map((channel) => {
    const channelVector = toScoreMap(channel.tags);
    const overlap = weightedJaccard(productVector, channelVector);
    const segmentMatches = profile.topSegments.map((segment) => ({
      segmentId: segment.segmentId,
      score: segmentMatch(segment, channelVector),
    }));
    const bestSegment = segmentMatches.sort((left, right) => right.score - left.score)[0] ?? { segmentId: "", score: 0 };
    const positiveDrivers = buildPositiveDrivers(productVector, channelVector);
    const negativeDrivers = buildNegativeDrivers(productVector, channelVector);
    const alignmentBonus = channelAlignmentBonus(channel.channelType, productVector, channelVector);
    const matchScore = clamp(0.6 * overlap + 0.4 * bestSegment.score + alignmentBonus, 0, 1);
    const matchConfidence = mean(positiveDrivers.slice(0, 3).map((driver) => confidenceByTag.get(driver.tagId) ?? 0.5)) * Math.min(1, channel.sampleSize / 500);
    const qualityFlags = [...channel.qualityFlags];
    if (positiveDrivers.length === 0) qualityFlags.push("no_common_tags");
    if (channel.sampleSize < 500) qualityFlags.push("low_channel_sample");

    return {
      channelId: channel.channelId,
      channelType: channel.channelType,
      matchScore: round(matchScore),
      matchConfidence: round(matchConfidence),
      rank: 0,
      overlap: round(overlap),
      bestSegmentId: bestSegment.segmentId,
      bestSegmentMatch: round(bestSegment.score),
      positiveDrivers,
      negativeDrivers,
      qualityFlags,
    };
  });

  return ranked
    .sort((left, right) => right.matchScore - left.matchScore)
    .map((match, index) => ({ ...match, rank: index + 1 }));
}

export function validateDemoTagIds(): { ok: boolean; invalidTagIds: string[] } {
  const allowedTagIds = loadAllowedTagIds();
  const found = new Set<string>();
  for (const sku of loadDemoSkus()) collectTags(sku.mappedProductTags, found);
  for (const row of loadWideTable()) {
    collectTags(row.mappedProductTags, found);
    collectTags(row.buyerProfileTags, found);
  }
  for (const channel of loadChannelProfiles()) collectTags(channel.tags, found);

  const invalidTagIds = [...found].filter((tagId) => !allowedTagIds.has(tagId)).sort();
  return { ok: invalidTagIds.length === 0, invalidTagIds };
}

export function runBacktest(): BacktestReport {
  const skus = loadDemoSkus();
  const rows = loadWideTable();
  const channels = loadChannelProfiles();
  const topKHits: number[] = [];
  const driverPrecisions: number[] = [];
  const ndcgs: number[] = [];

  for (const sku of skus) {
    const testRows = rows.filter((row) => row.skuId === sku.skuId);
    const trainRows = rows.filter((row) => row.skuId !== sku.skuId);
    const profile = predictProductProfile(toProductDNA(sku), trainRows);
    const truth = aggregateTruthTags(testRows);
    const predictedTop5 = profile.predictedProfileTags.slice(0, 5).map((tag) => tag.tagId);
    const truthTop5 = truth.slice(0, 5).map((tag) => tag.tagId);
    topKHits.push(intersectionSize(predictedTop5, truthTop5) / 5);

    const drivers = new Set(profile.topSegments.flatMap((segment) => segment.drivers));
    const driverHitCount = [...drivers].filter((tagId) => truthTop5.includes(tagId)).length;
    driverPrecisions.push(drivers.size === 0 ? 0 : driverHitCount / drivers.size);

    const matches = matchChannels(profile, channels);
    const relevanceByChannel = new Map(testRows.map((row) => [row.channelId, isPositiveMatch(row) ? 1 : 0]));
    ndcgs.push(ndcgAt3(matches.map((match) => relevanceByChannel.get(match.channelId) ?? 0)));
  }

  return {
    reportId: `backtest_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}_demo`,
    modelVersion: MODEL_VERSION,
    evaluationMode: "demo_only_leave_one_sku_out",
    trainSize: rows.length - Math.max(...skus.map((sku) => rows.filter((row) => row.skuId === sku.skuId).length)),
    testSize: rows.length,
    predictionMetrics: {
      "topKTagHit@5": round(mean(topKHits)),
      driverPrecision: round(mean(driverPrecisions)),
    },
    matchMetrics: {
      "matchNDCG@3": round(mean(ndcgs)),
    },
    notes: [
      "Demo data has one timeWindow; production time split is not meaningful yet.",
      "LightGBM is deferred; P0 baseline uses rule + kNN only.",
    ],
  };
}

export function runCutoffBacktest(options: CutoffBacktestOptions = {}): BacktestReport {
  const inputPath = resolve(options.inputPath ?? resolve(P1_MULTI_TIMEWINDOW_DIR, "wide_table.jsonl"));
  if (!existsSync(inputPath)) {
    throw new Error(`Cutoff backtest input not found: ${inputPath}`);
  }

  const rows = loadP1MultiTimeWindowWideTable(inputPath).filter((row) => row.isTrainable !== false);
  const allRows = loadP1MultiTimeWindowWideTable(inputPath);
  const timeWindows = [...new Set(allRows.map((row) => row.timeWindow))].sort();
  const cutoffTimeWindow = options.cutoffTimeWindow ?? timeWindows.at(-1);
  if (!cutoffTimeWindow) {
    throw new Error("Cutoff backtest input has no timeWindow values.");
  }

  const trainRows = rows.filter((row) => row.timeWindow < cutoffTimeWindow);
  const testRows = rows.filter((row) => row.timeWindow === cutoffTimeWindow);
  const trainWindows = [...new Set(trainRows.map((row) => row.timeWindow))].sort();
  const validationWindows = [...new Set(testRows.map((row) => row.timeWindow))].sort();
  const testSkuIds = [...new Set(testRows.map((row) => row.skuId))].sort();
  const qualityFlags = collectCutoffQualityFlags(allRows, trainRows, testRows, timeWindows);

  const topKHits: number[] = [];
  const segmentTop1Hits: number[] = [];
  const driverPrecisions: number[] = [];
  const ndcgs: number[] = [];
  const skuResults: SkuBacktestResult[] = [];
  const matchResults: MatchBacktestResult[] = [];
  const channelProfiles = buildChannelProfilesFromRows(trainRows);

  for (const skuId of testSkuIds) {
    const skuTestRows = testRows.filter((row) => row.skuId === skuId);
    const inputRow = skuTestRows[0];
    if (!inputRow) continue;

    const profile = predictProductProfile(inputRow, trainRows);
    const truth = aggregateTruthTags(skuTestRows);
    const predictedTop5 = profile.predictedProfileTags.slice(0, 5).map((tag) => tag.tagId);
    const truthTop5 = truth.slice(0, 5).map((tag) => tag.tagId);
    const topKHitAt5 = intersectionSize(predictedTop5, truthTop5) / 5;
    topKHits.push(topKHitAt5);

    const predictedSegmentTop1 = profile.topSegments[0]?.segmentId ?? "";
    const truthSegmentTop1 = buildTopSegments(truth)[0]?.segmentId ?? "";
    const segmentTop1Hit = predictedSegmentTop1 !== "" && predictedSegmentTop1 === truthSegmentTop1 ? 1 : 0;
    segmentTop1Hits.push(segmentTop1Hit);

    const drivers = new Set(profile.topSegments.flatMap((segment) => segment.drivers));
    const driverHitCount = [...drivers].filter((tagId) => truthTop5.includes(tagId)).length;
    const driverPrecision = drivers.size === 0 ? 0 : driverHitCount / drivers.size;
    driverPrecisions.push(driverPrecision);

    const matches = matchChannels(profile, channelProfiles);
    const relevanceByChannel = new Map(skuTestRows.map((row) => [row.channelId, isPositiveMatch(row) ? 1 : 0]));
    const rankedRelevances = matches.map((match) => relevanceByChannel.get(match.channelId) ?? 0);
    ndcgs.push(ndcgAt3(rankedRelevances));
    skuResults.push({ skuId, categoryLv2: inputRow.categoryLv2, topKTagHitAt5: topKHitAt5, segmentTop1Hit, driverPrecision });
    for (const match of matches) {
      const testRow = skuTestRows.find((row) => row.channelId === match.channelId);
      matchResults.push({
        skuId,
        channelId: match.channelId,
        channelType: match.channelType,
        sampleSizeBucket: sampleSizeBucket(testRow?.sampleSize ?? 0),
        relevance: relevanceByChannel.get(match.channelId) ?? 0,
        rankedRelevance: relevanceByChannel.get(match.channelId) ?? 0,
      });
    }
  }

  return {
    reportId: `backtest_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}_cutoff`,
    modelVersion: MODEL_VERSION,
    evaluationMode: "cutoff_time_split",
    inputPath,
    cutoffTimeWindow,
    trainWindows,
    validationWindows,
    trainSize: trainRows.length,
    testSize: testRows.length,
    trainSkuCount: new Set(trainRows.map((row) => row.skuId)).size,
    testSkuCount: testSkuIds.length,
    channelCount: new Set(allRows.map((row) => row.channelId)).size,
    qualityFlags,
    predictionMetrics: {
      "topKTagHit@5": round(mean(topKHits)),
      segmentTop1Hit: round(mean(segmentTop1Hits)),
      driverPrecision: round(mean(driverPrecisions)),
    },
    matchMetrics: {
      "matchNDCG@3": round(mean(ndcgs)),
    },
    stratifiedMetrics: buildBacktestSlices(trainRows, testRows, skuResults, matchResults),
    notes: buildCutoffNotes(timeWindows, trainRows, testRows),
  };
}

export function runSegmentCalibrationReport(options: CutoffBacktestOptions = {}): SegmentCalibrationReport {
  const cutoffReport = runCutoffBacktest(options);
  const baselineSegmentTop1Hit = cutoffReport.predictionMetrics.segmentTop1Hit ?? 0;
  const candidateFlags = cutoffReport.qualityFlags?.filter((flag) => flag === "low_sku_count" || flag === "mock_aggregate_input") ?? [];
  return {
    reportId: `segment_calibration_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`,
    modelVersion: MODEL_VERSION,
    inputPath: cutoffReport.inputPath ?? resolve(P1_MULTI_TIMEWINDOW_DIR, "wide_table.jsonl"),
    baseline: {
      segmentTop1Hit: baselineSegmentTop1Hit,
      templateCount: SEGMENT_TEMPLATES.length,
      templates: SEGMENT_TEMPLATES.map((template) => ({ segmentId: template.segmentId, name: template.name, templateTags: template.templateTags })),
    },
    candidates: [
      {
        candidateId: "current_manual_weights",
        description: "Keep X-approved P0 manual segment template weights.",
        segmentTop1Hit: baselineSegmentTop1Hit,
        delta: 0,
        qualityFlags: candidateFlags,
      },
    ],
    recommendation: candidateFlags.length > 0 ? "requires_more_data" : "keep_current_weights",
    qualityFlags: [...new Set([...(cutoffReport.qualityFlags ?? []), "no_weight_change_applied"])].sort(),
    notes: [
      "No segmentId or template tag semantics were changed.",
      "The current input is too small and mock-only; changing template weights would overfit smoke data.",
      "Re-run calibration after real aggregate input reaches at least 30 SKUs and 6 time windows.",
    ],
  };
}

export function runTokenGovernanceReport(): TokenGovernanceReport {
  const tokenOccurrences = new Map<string, { occurrences: number; skuIds: Set<string> }>();
  for (const sku of loadDemoSkus()) {
    for (const token of [...sku.attributes.titleTokens, ...sku.attributes.styleKeywords]) {
      if (KEYWORD_TAGS[token] || STRUCTURAL_TOKEN_RULES[token] || TOKEN_REVIEW_CANDIDATES[token]) continue;
      const current = tokenOccurrences.get(token) ?? { occurrences: 0, skuIds: new Set<string>() };
      current.occurrences += 1;
      current.skuIds.add(sku.skuId);
      tokenOccurrences.set(token, current);
    }
  }

  return {
    reportId: `token_governance_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`,
    modelVersion: MODEL_VERSION,
    structuralTokens: Object.entries(STRUCTURAL_TOKEN_RULES).map(([token, rule]) => ({ token, field: rule.field, action: "ignore", reason: rule.reason })),
    mappableTokenReviewQueue: Object.entries(TOKEN_REVIEW_CANDIDATES).map(([token, candidate]) => ({ token, proposedTagIds: candidate.proposedTagIds, reason: candidate.reason })),
    unknownBusinessTokens: [...tokenOccurrences.entries()]
      .map(([token, value]) => ({ token, occurrences: value.occurrences, exampleSkuIds: [...value.skuIds].sort().slice(0, 3) }))
      .sort((left, right) => right.occurrences - left.occurrences || left.token.localeCompare(right.token)),
    taxonomyChangeRequired: false,
    notes: [
      "Structural tokens are ignored before unmappedInputTokens are emitted; they are not mapped to audience taxonomy tags.",
      "No taxonomy expansion is required for the current demo token set; premium needs D/X keyword-mapping review only.",
      "Future high-frequency unknown business tokens should be reviewed by D/X before any taxonomy change.",
    ],
  };
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

function buildRuleTags(input: ProductDNA, allowedTagIds: Set<string>): { ruleTags: ProfileTagScore[]; unmappedInputTokens: string[] } {
  const tags = new Map<string, ProfileTagScore>();
  const unmappedInputTokens: string[] = [];
  for (const tag of input.mappedProductTags) {
    if (allowedTagIds.has(tag.tagId)) upsertTag(tags, tag.tagId, tag.score, tag.confidence);
  }

  for (const token of [...input.styleKeywords, ...input.titleTokens]) {
    const mappedTags = KEYWORD_TAGS[token];
    if (!mappedTags && STRUCTURAL_TOKEN_RULES[token]) {
      continue;
    }
    if (!mappedTags) {
      unmappedInputTokens.push(token);
      continue;
    }
    for (const tagId of mappedTags) upsertTag(tags, tagId, 0.6, 0.6);
  }

  const priceTag = PRICE_TAGS[input.priceBand];
  if (priceTag) upsertTag(tags, priceTag, 0.72, 0.9);
  if (input.launchType === "new_arrival") {
    upsertTag(tags, "intent.try_new", 0.62, 0.7);
    upsertTag(tags, "price.new_arrival_sensitive", 0.62, 0.7);
  }
  if (input.season === "fall_winter" || input.season === "spring_summer") {
    upsertTag(tags, "occasion.seasonal", 0.45, 0.55);
  }

  return { ruleTags: [...tags.values()], unmappedInputTokens: [...new Set(unmappedInputTokens)] };
}

function buildBacktestSlices(trainRows: WideTableRow[], testRows: WideTableRow[], skuResults: SkuBacktestResult[], matchResults: MatchBacktestResult[]): BacktestSlice[] {
  const slices: BacktestSlice[] = [];
  const trainByCategory = groupBy(trainRows, (row) => row.categoryLv2);
  const testByCategory = groupBy(testRows, (row) => row.categoryLv2);
  const skuByCategory = groupBy(skuResults, (row) => row.categoryLv2);

  for (const [categoryLv2, results] of [...skuByCategory.entries()].sort()) {
    slices.push({
      dimension: "categoryLv2",
      value: categoryLv2,
      trainSize: trainByCategory.get(categoryLv2)?.length ?? 0,
      testSize: testByCategory.get(categoryLv2)?.length ?? 0,
      metrics: {
        "topKTagHit@5": round(mean(results.map((item) => item.topKTagHitAt5))),
        segmentTop1Hit: round(mean(results.map((item) => item.segmentTop1Hit))),
        driverPrecision: round(mean(results.map((item) => item.driverPrecision))),
      },
      qualityFlags: categoryQualityFlags(testByCategory.get(categoryLv2) ?? []),
    });
  }

  const trainByChannelType = groupBy(trainRows, (row) => row.channelType);
  const testByChannelType = groupBy(testRows, (row) => row.channelType);
  const matchByChannelType = groupBy(matchResults, (row) => row.channelType);
  for (const [channelType, results] of [...matchByChannelType.entries()].sort()) {
    slices.push({
      dimension: "channelType",
      value: channelType,
      trainSize: trainByChannelType.get(channelType)?.length ?? 0,
      testSize: testByChannelType.get(channelType)?.length ?? 0,
      metrics: {
        "matchNDCG@3": round(mean(groupValuesBy(results, (item) => item.skuId).map((items) => ndcgAt3(items.map((item) => item.rankedRelevance))))),
        positiveMatchRate: round(mean(results.map((item) => item.relevance))),
      },
      qualityFlags: categoryQualityFlags(testByChannelType.get(channelType) ?? []),
    });
  }

  const trainBySampleBucket = groupBy(trainRows, (row) => sampleSizeBucket(row.sampleSize));
  const testBySampleBucket = groupBy(testRows, (row) => sampleSizeBucket(row.sampleSize));
  const matchBySampleBucket = groupBy(matchResults, (row) => row.sampleSizeBucket);
  for (const [bucket, results] of [...matchBySampleBucket.entries()].sort()) {
    slices.push({
      dimension: "sampleSizeBucket",
      value: bucket,
      trainSize: trainBySampleBucket.get(bucket)?.length ?? 0,
      testSize: testBySampleBucket.get(bucket)?.length ?? 0,
      metrics: {
        "matchNDCG@3": round(mean(groupValuesBy(results, (item) => item.skuId).map((items) => ndcgAt3(items.map((item) => item.rankedRelevance))))),
        positiveMatchRate: round(mean(results.map((item) => item.relevance))),
      },
      qualityFlags: bucket === "lt_500" ? ["low_sample_bucket"] : [],
    });
  }

  return slices;
}

function categoryQualityFlags(rows: WideTableRow[]): string[] {
  const flags = new Set<string>();
  if (rows.some((row) => row.sampleSize < 500)) flags.add("low_sample_rows_present");
  if (rows.some((row) => row.profileCoverageRate < 0.7)) flags.add("low_coverage_rows_present");
  if (rows.some((row) => row.lowConfidenceTagCount > 0)) flags.add("low_confidence_tags_present");
  return [...flags].sort();
}

function sampleSizeBucket(sampleSize: number): string {
  if (sampleSize < 500) return "lt_500";
  if (sampleSize < 1000) return "500_999";
  return "gte_1000";
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) grouped.set(key(item), [...(grouped.get(key(item)) ?? []), item]);
  return grouped;
}

function groupValuesBy<T>(items: T[], key: (item: T) => string): T[][] {
  return [...groupBy(items, key).values()];
}

function knnPredict(input: ProductDNA, trainRows: WideTableRow[]): ProfileTagScore[] {
  const inputVector = toScoreMap(input.mappedProductTags);
  const neighbors = trainRows
    .map((row) => ({ row, similarity: rowSimilarity(input, inputVector, row) }))
    .filter((item) => item.similarity > 0)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 20);

  const totals = new Map<string, { weightedScore: number; weightedConfidence: number; totalWeight: number }>();
  for (const neighbor of neighbors) {
    const weight = neighbor.similarity * Math.max(0.1, neighbor.row.profileCoverageRate) * Math.min(1, neighbor.row.sampleSize / 1000);
    for (const tag of neighbor.row.buyerProfileTags) {
      const current = totals.get(tag.tagId) ?? { weightedScore: 0, weightedConfidence: 0, totalWeight: 0 };
      current.weightedScore += tag.score * weight;
      current.weightedConfidence += tag.confidence * weight;
      current.totalWeight += weight;
      totals.set(tag.tagId, current);
    }
  }

  return [...totals.entries()].map(([tagId, value]) => ({
    tagId,
    score: value.totalWeight === 0 ? 0 : value.weightedScore / value.totalWeight,
    confidence: clamp(value.totalWeight === 0 ? 0.5 : value.weightedConfidence / value.totalWeight, 0, 0.9),
    source: MODEL_VERSION,
    sampleSize: null,
    timeWindow: null,
  }));
}

function rowSimilarity(input: ProductDNA, inputVector: Map<string, number>, row: WideTableRow): number {
  const tagSimilarity = cosine(inputVector, toScoreMap(row.mappedProductTags));
  const categoryBoost = input.categoryLv2 === row.categoryLv2 ? 0.15 : input.categoryLv1 === row.categoryLv1 ? 0.08 : 0;
  const priceBoost = input.priceBand === row.priceBand ? 0.08 : 0;
  const seasonBoost = input.season === row.season ? 0.05 : 0;
  return clamp(tagSimilarity + categoryBoost + priceBoost + seasonBoost, 0, 1);
}

function blendTagScores(primary: ProfileTagScore[], fallback: ProfileTagScore[], primaryWeight: number, fallbackWeight: number): ProfileTagScore[] {
  const tagIds = new Set([...primary.map((tag) => tag.tagId), ...fallback.map((tag) => tag.tagId)]);
  const primaryMap = new Map(primary.map((tag) => [tag.tagId, tag]));
  const fallbackMap = new Map(fallback.map((tag) => [tag.tagId, tag]));
  return [...tagIds].map((tagId) => {
    const primaryTag = primaryMap.get(tagId);
    const fallbackTag = fallbackMap.get(tagId);
    const score = (primaryTag?.score ?? 0) * primaryWeight + (fallbackTag?.score ?? 0) * fallbackWeight;
    const confidence = Math.max(primaryTag?.confidence ?? 0, fallbackTag?.confidence ?? 0.5) * 0.95;
    return { tagId, score, confidence, source: MODEL_VERSION, sampleSize: null, timeWindow: null };
  });
}

function buildTopSegments(tags: ProfileTagScore[]): SegmentDraft[] {
  const scoreMap = toScoreMap(tags);
  const confidenceMap = new Map(tags.map((tag) => [tag.tagId, tag.confidence]));
  return SEGMENT_TEMPLATES.map((template) => {
    const contributions = Object.entries(template.templateTags).map(([tagId, weight]) => ({
      tagId,
      score: (scoreMap.get(tagId) ?? 0) * weight,
      tagScore: scoreMap.get(tagId) ?? 0,
    }));
    const denominator = Object.values(template.templateTags).reduce((sum, weight) => sum + weight, 0);
    const segmentScore = denominator === 0 ? 0 : contributions.reduce((sum, item) => sum + item.score, 0) / denominator;
    const drivers = contributions
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map((item) => item.tagId);
    return {
      segmentId: template.segmentId,
      name: template.name,
      rank: 0,
      confidence: round(clamp(mean(drivers.map((tagId) => confidenceMap.get(tagId) ?? 0.5)), 0, 0.95)),
      tags: Object.keys(template.templateTags).map((tagId) => ({ tagId, score: round(scoreMap.get(tagId) ?? 0) })),
      drivers,
      segmentScore,
    };
  })
    .sort((left, right) => right.segmentScore - left.segmentScore)
    .slice(0, 3)
    .map((segment, index) => ({
      segmentId: segment.segmentId,
      name: segment.name,
      rank: index + 1,
      confidence: segment.confidence,
      tags: segment.tags,
      drivers: segment.drivers,
    }));
}

function weightedJaccard(product: Map<string, number>, channel: Map<string, number>): number {
  const tagIds = new Set([...product.keys(), ...channel.keys()]);
  let numerator = 0;
  let denominator = 0;
  for (const tagId of tagIds) {
    const weight = dimensionWeight(tagId);
    numerator += Math.min(product.get(tagId) ?? 0, channel.get(tagId) ?? 0) * weight;
    denominator += Math.max(product.get(tagId) ?? 0, channel.get(tagId) ?? 0) * weight;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

function segmentMatch(segment: SegmentDraft, channel: Map<string, number>): number {
  let numerator = 0;
  let denominator = 0;
  for (const tag of segment.tags) {
    const weight = dimensionWeight(tag.tagId);
    numerator += tag.score * (channel.get(tag.tagId) ?? 0) * weight;
    denominator += tag.score * weight;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

function buildPositiveDrivers(product: Map<string, number>, channel: Map<string, number>): DriverDraft[] {
  return [...product.keys()]
    .map((tagId) => ({
      tagId,
      productScore: product.get(tagId) ?? 0,
      channelScore: channel.get(tagId) ?? 0,
      contribution: Math.min(product.get(tagId) ?? 0, channel.get(tagId) ?? 0) * dimensionWeight(tagId),
    }))
    .filter((item) => item.contribution > 0)
    .sort((left, right) => right.contribution - left.contribution)
    .slice(0, 3)
    .map(({ tagId, productScore, channelScore }) => ({ tagId, productScore: round(productScore), channelScore: round(channelScore) }));
}

function buildNegativeDrivers(product: Map<string, number>, channel: Map<string, number>): DriverDraft[] {
  return [...product.keys()]
    .map((tagId) => ({
      tagId,
      productScore: product.get(tagId) ?? 0,
      channelScore: channel.get(tagId) ?? 0,
      gap: Math.abs((product.get(tagId) ?? 0) - (channel.get(tagId) ?? 0)) * dimensionWeight(tagId),
    }))
    .filter((item) => item.channelScore < 0.2 && item.gap > 0)
    .sort((left, right) => right.gap - left.gap)
    .slice(0, 3)
    .map(({ tagId, productScore, channelScore }) => ({ tagId, productScore: round(productScore), channelScore: round(channelScore) }));
}

function channelAlignmentBonus(channelType: string, product: Map<string, number>, channel: Map<string, number>): number {
  const tagId = `channel.${channelType}`;
  const productScore = product.get(tagId) ?? 0;
  const channelScore = channel.get(tagId) ?? 0;
  return productScore >= 0.4 && channelScore >= 0.4 ? 0.05 : 0;
}

function aggregateTruthTags(rows: WideTableRow[]): ProfileTagScore[] {
  const totals = new Map<string, { score: number; confidence: number; sampleSize: number }>();
  for (const row of rows) {
    const rowWeight = row.sampleSize || 1;
    for (const tag of row.buyerProfileTags) {
      const current = totals.get(tag.tagId) ?? { score: 0, confidence: 0, sampleSize: 0 };
      current.score += tag.score * rowWeight;
      current.confidence += tag.confidence * rowWeight;
      current.sampleSize += rowWeight;
      totals.set(tag.tagId, current);
    }
  }
  return [...totals.entries()]
    .map(([tagId, value]) => ({
      tagId,
      score: value.score / value.sampleSize,
      confidence: value.confidence / value.sampleSize,
      source: "demo_backtest_truth",
      sampleSize: value.sampleSize,
      timeWindow: null,
    }))
    .sort((left, right) => right.score - left.score);
}

function buildChannelProfilesFromRows(rows: WideTableRow[]): ChannelProfile[] {
  const byChannel = new Map<string, WideTableRow[]>();
  for (const row of rows) {
    byChannel.set(row.channelId, [...(byChannel.get(row.channelId) ?? []), row]);
  }

  return [...byChannel.entries()].map(([channelId, channelRows]) => {
    const first = channelRows[0];
    const sampleSize = channelRows.reduce((sum, row) => sum + (row.sampleSize || 0), 0);
    const tags = aggregateTruthTags(channelRows).map((tag) => ({ ...tag, source: "cutoff_train_channel_profile" }));
    const qualityFlags: string[] = [];
    if (sampleSize < 500) qualityFlags.push("low_channel_sample");
    if (mean(channelRows.map((row) => row.profileCoverageRate)) < 0.7) qualityFlags.push("low_profile_coverage");
    if (channelRows.some((row) => row.lowConfidenceTagCount > 0)) qualityFlags.push("low_confidence_tags_present");

    return {
      channelId,
      channelType: first?.channelType ?? "unknown",
      sampleSize,
      tags,
      qualityFlags,
    };
  });
}

function collectCutoffQualityFlags(allRows: WideTableRow[], trainRows: WideTableRow[], testRows: WideTableRow[], timeWindows: string[]): string[] {
  const flags = new Set<string>();
  if (timeWindows.length < 3) flags.add("low_timewindow_count");
  if (new Set(allRows.map((row) => row.skuId)).size < 30) flags.add("low_sku_count");
  if (new Set(allRows.map((row) => row.channelId)).size < 4) flags.add("low_channel_count");
  if (trainRows.length === 0) flags.add("empty_train_split");
  if (testRows.length === 0) flags.add("empty_validation_split");
  if (allRows.some((row) => row.sourceType === "mock")) flags.add("mock_aggregate_input");
  if (allRows.some((row) => row.sampleSize < 500)) flags.add("low_sample_rows_present");
  if (allRows.some((row) => row.profileCoverageRate < 0.7)) flags.add("low_coverage_rows_present");
  if (allRows.some((row) => row.buyerProfileTags.length === 0)) flags.add("missing_label_rows_present");
  if (allRows.some((row) => row.lowConfidenceTagCount > 0)) flags.add("low_confidence_tags_present");
  return [...flags].sort();
}

function buildCutoffNotes(timeWindows: string[], trainRows: WideTableRow[], testRows: WideTableRow[]): string[] {
  const notes = [
    "Cutoff split trains only on windows earlier than cutoffTimeWindow and validates on cutoffTimeWindow.",
    "Input is D-P1-A2 mock aggregate smoke data; do not claim real-sample generalization from this report.",
    "No raw order, member, customer, DMP member, device, account, or ID package data is read.",
  ];
  if (timeWindows.length < 6) notes.push("Formal explainable production backtest still needs at least 6 windows, 30 SKUs, and 4 channels.");
  if (trainRows.length === 0 || testRows.length === 0) notes.push("Split is not usable because train or validation rows are empty.");
  return notes;
}

function isPositiveMatch(row: WideTableRow): boolean {
  return (row.sellThroughRate ?? 0) >= 0.6 && (row.returnRate ?? 1) <= 0.12;
}

function ndcgAt3(relevances: number[]): number {
  const top3 = relevances.slice(0, 3);
  const dcg = top3.reduce((sum, relevance, index) => sum + (Math.pow(2, relevance) - 1) / Math.log2(index + 2), 0);
  const ideal = [...relevances]
    .sort((left, right) => right - left)
    .slice(0, 3)
    .reduce((sum, relevance, index) => sum + (Math.pow(2, relevance) - 1) / Math.log2(index + 2), 0);
  return ideal === 0 ? 0 : dcg / ideal;
}

function toScoreMap(tags: Array<{ tagId: string; score: number }>): Map<string, number> {
  return new Map(tags.map((tag) => [tag.tagId, tag.score]));
}

function cosine(left: Map<string, number>, right: Map<string, number>): number {
  const tagIds = new Set([...left.keys(), ...right.keys()]);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const tagId of tagIds) {
    const leftScore = left.get(tagId) ?? 0;
    const rightScore = right.get(tagId) ?? 0;
    dot += leftScore * rightScore;
    leftNorm += leftScore * leftScore;
    rightNorm += rightScore * rightScore;
  }
  return leftNorm === 0 || rightNorm === 0 ? 0 : dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function upsertTag(tags: Map<string, ProfileTagScore>, tagId: string, score: number, confidence: number): void {
  const current = tags.get(tagId);
  if (!current || score > current.score) {
    tags.set(tagId, { tagId, score: clamp(score, 0, 1), confidence: clamp(confidence, 0, 1), source: MODEL_VERSION, sampleSize: null, timeWindow: null });
  }
}

function collectTags(tags: ProfileTagScore[], found: Set<string>): void {
  for (const tag of tags) found.add(tag.tagId);
}

function dimensionWeight(tagId: string): number {
  const dimension = tagId.split(".")[0] ?? "";
  return DIMENSION_WEIGHTS[dimension] ?? 0;
}

function dnaHash(input: ProductDNA): string {
  const stable = [input.categoryLv1, input.categoryLv2, input.season, input.fitType ?? "", input.fabricType ?? "", input.priceBand, input.styleKeywords.join(",")].join("|");
  return createHash("sha1").update(stable).digest("hex").slice(0, 8);
}

function intersectionSize(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
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

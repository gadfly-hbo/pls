export interface ProductAttributes {
  styleKeywords: string[];
  colorFamily?: string;
  fitType?: string;
  fabricType?: string;
  patternType?: string;
  sleeveType?: string;
  lengthType?: string;
  priceBand?: string;
  launchType?: string;
  imageFeatureSummary?: { hasModel: boolean };
}

export interface ProductAsset {
  type: string;
  source: string;
  description?: string;
}

export interface MappedTag {
  tagId: string;
  score: number;
  confidence: number;
  source: string;
}

export interface SKU {
  skuId: string;
  workspaceId: string;
  spuId: string;
  categoryLv1: string;
  categoryLv2: string;
  season: string;
  title: string;
  attributes: ProductAttributes;
  assets: ProductAsset[];
  mappedProductTags: MappedTag[];
  createdAt: string;
  updatedAt: string;
}

export interface PredictionTag {
  tagId: string;
  score: number;
  confidence: number;
  source: string;
  sampleSize?: number | null;
  timeWindow?: string | null;
}

export interface Segment {
  segmentId: string;
  name: string;
  rank: number;
  confidence: number;
  tags: { tagId: string; score: number }[];
  drivers: string[];
}

export interface ProductProfile {
  predictionId: string;
  workspaceId: string;
  skuId: string;
  taskId: string;
  modelVersion: string;
  modelPath: string;
  source: string;
  sourceType: string;
  generatedAt: string;
  inputSnapshot: Record<string, unknown>;
  predictedProfileTags: PredictionTag[];
  topSegments: Segment[];
  qualityFlags: string[];
  unmappedInputTokens: string[];
}

export interface ChannelProfile {
  channelId: string;
  channelName: string;
  channelType: string;
  platformType: string;
  sampleSize?: number | null;
  timeWindow?: string | null;
  qualityFlags?: string[];
}

export interface MatchDriver {
  tagId: string;
  productScore: number;
  channelScore: number;
}

export interface MatchResult {
  matchId: string;
  workspaceId: string;
  taskId: string;
  predictionId: string;
  skuId: string;
  channelId: string;
  channelType: string;
  modelVersion: string;
  source: string;
  sourceType: string;
  generatedAt: string;
  matchScore: number;
  matchConfidence: number;
  rank: number;
  overlap: number;
  bestSegmentId: string;
  bestSegmentMatch: number;
  positiveDrivers: MatchDriver[];
  negativeDrivers: MatchDriver[];
  recommendation: 'priority_launch' | 'test_launch' | 'observe' | 'avoid';
  risks: string[];
  qualityFlags: string[];
}

export interface HeatmapCell {
  channelId: string;
  matchScore: number;
  matchConfidence: number;
  recommendation: 'priority_launch' | 'test_launch' | 'observe' | 'avoid';
}

export interface HeatmapRow {
  skuId: string;
  cells: HeatmapCell[];
}

export interface HeatmapData {
  modelVersion: string;
  generatedAt: string;
  rows: HeatmapRow[];
}

export interface AccountBaselineDimension {
  dimension: string;
  value: string;
}

export interface AccountComparisonDimension {
  dimension: string;
  accountTop1: { label: string; value: string };
  skuTop1: { label: string; value: string };
  isAligned: boolean;
}

export interface AdjustmentAdvice {
  id: number;
  item: string;
  suggestion: string;
  status: string;
}

export interface AccountMatchResult {
  accountId: string;
  skuId: string;
  fitScore: number;
  fitConfidence: number;
  baseline: AccountBaselineDimension[];
  comparison: AccountComparisonDimension[];
  mismatchedDimensions: string[];
  adjustmentAdvice: AdjustmentAdvice[];
  qualityFlags: string[];
}

export interface AccountFitDriver {
  dimension?: string;
  tagId: string;
  productScore: number;
  accountScore: number;
  contribution?: number;
}

export interface AccountFitAdjustmentAdvice {
  adviceId: string | number;
  priority: string;
  dimension: string;
  actionType: string;
  direction?: string;
  rationale?: string;
  evidence?: string;
}

export interface AccountMatchApiItem {
  accountId: string;
  skuId: string;
  fitScore: number;
  fitConfidence: number;
  mismatchedDimensions: string[];
  adjustmentAdvice: AccountFitAdjustmentAdvice[];
  qualityFlags: string[];
  positiveDrivers?: AccountFitDriver[];
  negativeDrivers?: AccountFitDriver[];
}

export interface AccountMatchApiResponse {
  items: AccountMatchApiItem[];
  page: {
    cursor: string | null;
    nextCursor: string | null;
    pageSize: number;
    hasMore: boolean;
  };
}

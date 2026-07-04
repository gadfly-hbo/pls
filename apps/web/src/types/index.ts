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

export interface AccountProfile {
  accountId: string;
  sourceEntityKey?: string;
  sourceId?: string;
  accountName: string;
  accountType: string;
  sampleSize: number;
  timeWindow: string;
  coreTags: { tagId: string; score: number }[];
  interactionPreference: string[];
  performanceIndex: {
    followerCount: number;
    engagementRate: number;
    conversionRate: number;
  };
  platformType?: string;
  qualityFlags?: string[];
}

export interface ProductCompass {
  skuId: string;
  dna: string[];
  audienceDistribution: { tagId: string; score: number }[];
  salesMetrics: {
    salesVolume: number;
    conversionRate: number;
    avgOrderValue: number;
  };
  qualityFlags: string[];
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

export interface ActionRecord {
  actionId: string;
  type: string;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  executedAt?: string;
}

export interface FeedbackRecord {
  summary: string;
  effectJudgment: 'positive' | 'neutral' | 'negative' | 'unknown';
  audienceDeviation: string;
  adjustments: string[];
  submittedAt: string;
}

export interface DecisionRecord {
  decisionId: string;
  matchId?: string;
  skuId: string;
  entityId: string; 
  entityType: 'channel' | 'account';
  status: 'pending_execution' | 'in_progress' | 'pending_review' | 'verified' | 'needs_adjustment';
  owner: string;
  createdAt: string;
  updatedAt: string;
  actions: ActionRecord[];
  feedback?: FeedbackRecord;
}

export interface DbMigrationStatus {
  total: number;
  applied: number;
  pending: number;
  failed: number;
}

export interface DbOverview {
  workspaceId: string;
  databaseStatus: string;
  schemaVersion: string;
  migrationStatus: DbMigrationStatus;
  tableCount: number;
  viewCount: number;
  totalRows: number;
  lastImportTime: string | null;
  hasMockData: boolean;
  hasSmokeData: boolean;
  hasE2eData: boolean;
  hasUserAuthorizedData: boolean;
}

export interface DbTableInfo {
  name: string;
  type: 'table' | 'view';
  rowCount: number;
  domain: string;
  isSystem: boolean;
  isClearable: boolean;
  isDeletable: boolean;
}

export interface DbSchemaInfo {
  sql: string;
}

export interface DbSampleInfo {
  columns: string[];
  rows: any[][];
}

export interface DbMigration {
  version: string;
  name: string;
  appliedAt: string;
  status: string;
  checksum: string;
}

export interface DbDataVersion {
  dataVersion: string;
  source: string;
  sourceType: string;
  rowCount: number;
  createdAt: string;
}

export interface DbImportJob {
  jobId: string;
  sourceType: string;
  status: string;
  rowCount: number;
  successCount: number;
  errorCount: number;
  startedAt: string;
  completedAt: string | null;
}

export interface DbAuditEvent {
  eventId: string;
  operation: string;
  target: string;
  status: string;
  error: string | null;
  createdAt: string;
  snapshot?: any;
}

export interface DbOperationDryRunResult {
  affectedTables: string[];
  affectedRows: number;
  hasUserAuthorized: boolean;
  hasAuditHistory: boolean;
  qualityReport?: any;
  warnings: string[];
  requiredConfirmText: string;
}

export interface DbOperationExecuteResult {
  success: boolean;
  operation?: string;
  auditId?: string;
  beforeSnapshot?: any;
  afterSnapshot?: any;
  warnings?: string[];
  status?: string;
}

export interface ToolDefinition {
  toolId: string;
  name: string;
  category: 'profile_extract' | 'business_aggregate' | 'format_convert';
  version: string;
  riskLevel: 'L1' | 'L2' | 'L3';
  inputFormats: string[];
  outputFormats: string[];
  parameterSchema: Record<string, any>;
  packageType?: string;
  description?: string;
}

export interface ToolArtifact {
  artifactId: string;
  name: string;
  type: string;
  path: string;
}

export interface ToolRun {
  runId: string;
  toolId: string;
  workspaceId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  startedAt: string;
  finishedAt?: string | null;
  inputPath: string;
  outputDir: string;
  parameters: Record<string, any>;
  artifacts: ToolArtifact[];
  warnings: string[];
  errors: string[];
  qualityReport?: any;
}

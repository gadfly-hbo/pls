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

export interface PortraitEvidence {
  sourceField: string;
  sourceValue: string;
  ruleId: string;
  targetLabelType: string;
  targetLabel: string;
  effect: "increase" | "decrease" | "set_prior";
  weight: number;
  rationale: string;
}

export interface PlatformPortraitRow {
  labelType: string;
  label: string;
  share: number | null;
  tgi: number | null;
  source: string;
  confidence: number;
  evidence: PortraitEvidence[];
  qualityFlags: string[];
}

export interface ProfileTagScore {
  tagId: string;
  score: number;
  confidence: number;
  source: string;
}

export interface SingleProductPortraitPrediction {
  skuId: string;
  generatedAt: string;
  modelVersion: string;
  modelPath: string;
  sourceType: string;
  anchorSkuId: string;
  inputCoverage: {
    requiredFieldCoverage: number;
    optionalSignalCoverage: number;
    usedFields: string[];
    missingFields: string[];
  };
  platformPortraitRows: PlatformPortraitRow[];
  dimensionSummaries: Array<{
    labelType: string;
    topLabels: Array<{ label: string; share: number | null; tgi: number | null; confidence: number }>;
    qualityFlags: string[];
  }>;
  plsBridge?: {
    predictedProfileTags: ProfileTagScore[];
    unmappedPlatformLabels: Array<{ labelType: string; label: string; reason: string }>;
    bridgeCoverageRate: number;
  };
  riskFlags: string[];
  explanationSources: PortraitEvidence[];
}

export interface SingleProductPortraitInput {
  skuId: string;
  fitType: string;
  fabric: string;
  fab: string;
}

export interface SingleProductPortraitMetricsSummary {
  labelType: string;
  top1Overlap: number;
  top3Overlap: number;
}

export interface SingleProductPortraitMetadataAvailable {
  modelAvailable: true;
  fitTypes: string[];
  requiredColumns: string[];
  maxBatchRows: number;
  maxFileBytes: number;
  modelVersion: string;
  trainedAt: string;
  sampleCount: number;
  riskFlags: string[];
  metricsSummary: SingleProductPortraitMetricsSummary[];
}

export interface SingleProductPortraitMetadataUnavailable {
  modelAvailable: false;
  requiredColumns: string[];
  maxBatchRows: number;
  maxFileBytes: number;
  error: {
    code: 'model_not_available';
    message: string;
  };
}

export type SingleProductPortraitMetadata = SingleProductPortraitMetadataAvailable | SingleProductPortraitMetadataUnavailable;

export interface PortraitInputIssue {
  code: string;
  message: string;
  field?: 'skuId' | 'fitType' | 'fabric' | 'fab' | 'file';
  rawValue?: string;
  rowNumber?: number;
  skuId?: string;
}

export interface SingleProductPortraitBatchPreview {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  fileErrors: PortraitInputIssue[];
  rowErrors: PortraitInputIssue[];
  warnings: PortraitInputIssue[];
  extraColumns: string[];
  requiredColumns: string[];
}

export interface SingleProductPortraitBatchResultRow {
  rowNumber: number;
  skuId: string;
  prediction: SingleProductPortraitPrediction;
}

export interface SingleProductPortraitBatchExecute {
  totalRows: number;
  successCount: number;
  failureCount: number;
  warningCount: number;
  results: SingleProductPortraitBatchResultRow[];
  fileErrors: PortraitInputIssue[];
  rowErrors: PortraitInputIssue[];
  warnings: PortraitInputIssue[];
  metadata: SingleProductPortraitMetadata;
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
  riskFlags?: string[];
  evidence?: PortraitEvidence[];
  dimensionSummaries?: Array<{
    labelType: string;
    topLabels: Array<{ label: string; share: number | null; tgi: number | null; confidence: number }>;
    qualityFlags: string[];
  }>;
  bridgeCoverageRate?: number;
  unmappedPlatformLabels?: string[];
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
  entityType: 'channel' | 'account' | 'sku';
  recommendation?: string;
  rationale?: string;
  status: 'pending_execution' | 'in_progress' | 'pending_review' | 'verified' | 'needs_adjustment';
  owner: string;
  createdAt: string;
  updatedAt: string;
  actions: ActionRecord[];
  feedback?: FeedbackRecord;
  simulationRunId?: string;
  sourceType?: SimulatedMarketSourceType;
  sourceRef?: { id: string; type: string };
  simulationSummary?: SimulatedMarketOverall;
}

export interface CreateDecisionInput {
  skuId: string;
  channelId?: string;
  entityId?: string;
  entityType?: 'channel' | 'account' | 'sku';
  recommendation: string;
  rationale?: string;
  matchId?: string;
  simulationRunId?: string;
  sourceType?: SimulatedMarketSourceType;
  sourceRef?: { id: string; type: string };
  simulationSummary?: SimulatedMarketOverall;
  owner?: string;
}


export interface ChannelObject {
  workspaceId: string;
  objectType: 'platform' | 'trade_area' | 'store' | 'account' | 'marketing_event' | 'business_scenario';
  sourceStableKey: string;
  keySource: 'provided' | 'source_system_id' | 'generated_from_name';
  canonicalObjectKey: string;
  objectVersionId: string;
  dataVersion: string;
  sourceBatchId: string;
  generatedAt: string;
  timeWindow: string;
  displayName: string;
  platformName?: string | null;
  platformType?: string | null;
  entityStatus: string;
  targetObject: string;
  entityAttributes: Record<string, unknown>;
  possibleDuplicate: boolean;
  duplicateCandidateKeys: string[];
  manualReviewStatus: 'unreviewed' | 'confirmed_duplicate' | 'confirmed_distinct' | 'needs_more_data';
  qualityFlags: string[];
  source: string;
  sourceType: string;
}

export interface AudienceProfile {
  profileId: string;
  canonicalObjectKey: string;
  profileStage: string;
  source: string;
  sourceBatchId: string;
  dataVersion: string;
  generatedAt: string;
  timeWindow: string | null;
  sampleSize: number | null;
  confidence: number;
  tags: Array<{ tagId: string; score: number; confidence?: number; source?: string }>;
  unmappedFields: string[];
  qualityFlags: string[];
  benchmarkTags?: Array<{ dimension: string; optionLabel: string; sharePercent: number }>;
  performanceMetrics?: {
    followerCount?: number;
    engagementRate?: number;
    conversionRate?: number;
    trafficIndex?: number;
    conversionIndex?: number;
  };
  interactionPreference?: string[];
}

export interface ProductFitProfile {
  profileId: string;
  canonicalObjectKey: string;
  source: string;
  sourceBatchId: string;
  dataVersion: string;
  generatedAt: string;
  timeWindow: string | null;
  sampleSize: number | null;
  confidence: number;
  fitCategories: string[];
  fitPriceBands: string[];
  fitStyles: string[];
  fitOccasions: string[];
  fitLaunchTypes: string[];
  evidence: Array<{ field: string; value: string; rationale: string }>;
  qualityFlags: string[];
}

export interface ChannelObjectBinding {
  bindingId: string;
  bindingType: string;
  fromCanonicalObjectKey: string;
  toCanonicalObjectKey: string;
  sourceBatchId: string;
  dataVersion: string;
  generatedAt: string;
  qualityFlags: string[];
}

export interface ChannelObjectAnalysisView {
  selectedChannelEntityIds: string[];
  selectedMarketingEventId?: string;
  selectedBusinessScenarioId?: string;
  skuIds: string[];
  generatedMatchResults: MatchResult[];
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

export interface CsvQualityReport {
  rowCount: number;
  validRows: number;
  errorRows: number;
  missingColumns: string[];
  extraColumns: string[];
  typeErrors: number;
  sampleErrors: Array<{ rowNumber: number; column: string; rule: string; message: string; rawValue: string }>;
  warnings: Array<{ rowNumber: number | null; column: string; message: string }>;
  blockingErrors: number;
  requiredConfirmText: string;
}

export interface CsvIngestionDryRunResponse {
  operation: string;
  targetType: string;
  targetName: string;
  affectedTables: string[];
  affectedRows: number;
  sourceType: string;
  dataVersion: string | null;
  containsUserAuthorized: boolean;
  containsSystemHistory: boolean;
  warnings: string[];
  requiredConfirmText: string;
  stagedFileId: string;
  qualityReport: CsvQualityReport;
}

export interface CsvIngestionExecuteRequest {
  stagedFileId: string;
  targetTable: string;
  confirmText: string;
}

export interface CsvIngestionExecuteResponse {
  operation: string;
  status: string;
  auditId: string;
  jobId?: string;
  beforeSnapshot: any;
  afterSnapshot: any;
  warnings: string[];
}

export interface DbOperationDryRunResult {
  affectedTables: string[];
  affectedRows: number;
  hasUserAuthorized: boolean;
  hasAuditHistory: boolean;
  qualityReport?: any;
  warnings: string[];
  requiredConfirmText: string;
  stagedFileId?: string;
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

export type SimulatedMarketSourceType =
  | 'manual_strategy'
  | 'single_product_portrait'
  | 'product_channel_match'
  | 'campaign_product_strategy';

export type TargetAgentSourceType = 'three_audience_segment' | 'manual_persona';

export interface TargetUserAgentSourceRef {
  segmentCode?: 'A' | 'B' | 'C';
  segmentName?: '质感流行派' | '都市体面家' | '百搭优选客';
  profileVersion?: string;
}

export interface TargetUserAgentProfile {
  demographics?: string[];
  preferences?: string[];
  concerns?: string[];
  decisionFactors?: string[];
}

export interface TargetUserAgent {
  agentId: string;
  name: string;
  sourceType: TargetAgentSourceType;
  sourceRef?: TargetUserAgentSourceRef;
  profile: TargetUserAgentProfile;
  weight?: number;
}

export interface SimulatedMarketMarketContext {
  channelEntityId?: string;
  marketingEventId?: string;
  businessScenarioId?: string;
  contextText?: string;
}

export interface SimulatedMarketInput {
  sourceType: SimulatedMarketSourceType;
  sourceRef?: { id: string; type: string };
  strategyText: string;
  marketContext: SimulatedMarketMarketContext;
  targetAgentSet: TargetUserAgent[];
}

export interface SimulatedMarketPrefill {
  sourceType: SimulatedMarketSourceType;
  sourceRef?: { id: string; type: string };
  strategyText: string;
  marketContext?: SimulatedMarketMarketContext;
}

export interface SimulatedMarketAgentFeedback {
  agentId: string;
  acceptanceScore: number;
  purchaseIntentScore: number;
  positiveDrivers: string[];
  objections: string[];
  quoteSummary: string;
  suggestedAdjustment: string;
}

export interface SimulatedMarketOverall {
  acceptanceScore: number;
  purchaseIntentScore: number;
  confidence: number;
  opportunitySummary: string[];
  riskSummary: string[];
  recommendedAdjustments: string[];
}

export interface SimulatedMarketResult {
  overall: SimulatedMarketOverall;
  agentFeedback: SimulatedMarketAgentFeedback[];
}

export interface SimulationRun {
  runId: string;
  workspaceId: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  inputSnapshot: SimulatedMarketInput;
  result?: SimulatedMarketResult;
  provider: string;
  modelVersion: string;
  generatedAt: string;
  qualityFlags: string[];
}

export interface SimulatedMarketRunListResponse {
  items: SimulationRun[];
  page: {
    cursor: string | null;
    nextCursor: string | null;
    pageSize: number;
    hasMore: boolean;
  };
}

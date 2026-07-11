import type { SKU, ProductProfile, MatchResult, HeatmapData, ChannelProfile, AccountMatchResult, AccountProfile, ProductCompass, DecisionRecord, ActionRecord, FeedbackRecord, DbOverview, DbTableInfo, DbSchemaInfo, DbSampleInfo, DbMigration, DbDataVersion, DbImportJob, DbAuditEvent, DbOperationDryRunResult, DbOperationExecuteResult, CsvQualityReport, CsvIngestionExecuteResponse, ToolRun, SingleProductPortraitPrediction, SingleProductPortraitInput, SingleProductPortraitMetadata, SingleProductPortraitBatchPreview, SingleProductPortraitBatchExecute, ChannelObject, AudienceProfile, ProductFitProfile, ChannelObjectBinding, TargetUserAgent, SimulatedMarketInput, SimulatedMarketResult, SimulatedMarketRunListResponse, SimulationRun, SimulatedMarketSourceType, CreateDecisionInput, SimulatedMarketSubagent, CreateSimulatedMarketSubagentInput, UpdateSimulatedMarketSubagentInput, CreateSubagentFromChannelObjectInput } from '../types';

// Feature flag for local mock vs real backend
const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer pls-p0-demo-token',
  'X-PLS-Workspace': 'ws_demo'
};

async function fetchApi<T>(path: string, options?: RequestInit): Promise<{ code: string; data: T }> {
  const res = await fetch(`/api/v0${path}`, { ...options, headers: { ...headers, ...options?.headers } });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody?.error?.message || `API Error: ${res.status}`);
  }
  return res.json();
}

// ----------------------------------------------------
// Mock DB & Logic (Fallback)
// ----------------------------------------------------
const db = {
  products: [] as SKU[],
  predictions: [] as ProductProfile[],
  matches: [] as MatchResult[],
  decisions: [] as any[],
  toolRuns: [] as ToolRun[],
  channelObjects: [] as ChannelObject[],
  audienceProfiles: [] as AudienceProfile[],
  productFitProfiles: [] as ProductFitProfile[],
  channelObjectBindings: [] as ChannelObjectBinding[],
  simulatedMarketRuns: [] as SimulationRun[],
  simulatedMarketSubagents: [] as SimulatedMarketSubagent[],
};

const mockSimulatedMarketAgentTemplates: TargetUserAgent[] = [
  {
    agentId: 'agent-template-a',
    name: 'A / 质感流行派',
    sourceType: 'three_audience_segment',
    sourceRef: { segmentCode: 'A', segmentName: '质感流行派', profileVersion: 'v1' },
    profile: {
      demographics: ['京东平台目标人群'],
      preferences: ['设计感', '质感', '细节工艺', '潮流趋势', '小众风格'],
      concerns: ['撞款', '廉价感', '跟风'],
      decisionFactors: ['面料质感', '剪裁细节', '品牌调性', '潮流度'],
    },
    weight: 1,
  },
  {
    agentId: 'agent-template-b',
    name: 'B / 都市体面家',
    sourceType: 'three_audience_segment',
    sourceRef: { segmentCode: 'B', segmentName: '都市体面家', profileVersion: 'v1' },
    profile: {
      demographics: ['京东平台目标人群'],
      preferences: ['通勤', '商务休闲', '简约', '得体', '多场合适用'],
      concerns: ['不够正式', '难打理', '不适合上班'],
      decisionFactors: ['版型合体', '色彩稳重', '品牌信赖', '性价比'],
    },
    weight: 1,
  },
  {
    agentId: 'agent-template-c',
    name: 'C / 百搭优选客',
    sourceType: 'three_audience_segment',
    sourceRef: { segmentCode: 'C', segmentName: '百搭优选客', profileVersion: 'v1' },
    profile: {
      demographics: ['京东平台目标人群'],
      preferences: ['基础款', '百搭', '舒适', '性价比', '耐穿'],
      concerns: ['难搭配', '易过时', '价格高'],
      decisionFactors: ['价格', '搭配率', '舒适度', '口碑'],
    },
    weight: 1,
  },
];

function toAgentCandidateFromSubagent(subagent: SimulatedMarketSubagent): TargetUserAgent {
  return {
    agentId: subagent.agentId,
    name: subagent.name,
    sourceType: subagent.sourceType,
    sourceRef: subagent.sourceRef,
    profile: subagent.profile,
    weight: subagent.weight,
  };
}

function buildMockSubagent(input: CreateSimulatedMarketSubagentInput): SimulatedMarketSubagent {
  const now = new Date().toISOString();
  const agentId = `subagent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    agentId,
    name: input.name,
    enabled: input.enabled ?? true,
    persona: input.persona ?? null,
    profile: input.profile,
    sourceType: input.sourceType ?? 'saved_subagent',
    sourceRef: input.sourceRef ?? { subagentId: agentId },
    weight: input.weight ?? 1,
    createdAt: now,
    updatedAt: now,
  };
}

function buildMockSimulatedMarketResult(input: SimulatedMarketInput, useLlm = false): SimulatedMarketResult {
  const agentFeedback = input.targetAgentSet.map((agent) => {
    const preferences = agent.profile?.preferences ?? [];
    const concerns = agent.profile?.concerns ?? [];
    const score = Math.min(100, Math.max(0, 50 + Math.round(preferences.length * 3) - Math.round(concerns.length * 2)));
    return {
      agentId: agent.agentId,
      acceptanceScore: score,
      purchaseIntentScore: Math.min(100, Math.max(0, score - 8)),
      positiveDrivers: preferences.length > 0 ? [`策略契合 ${preferences[0]} 偏好`] : ['策略定位可接受'],
      objections: concerns.length > 0 ? [`可能触发 ${concerns[0]} 顾虑`] : ['未识别明显顾虑'],
      quoteSummary: `${agent.name} 对策略接受度为 ${score}，购买意向为 ${Math.min(100, Math.max(0, score - 8))}。`,
      suggestedAdjustment: score >= 60
        ? `维持当前对 ${preferences[0] || '核心偏好'} 的表述。`
        : `建议补充 ${preferences[0] || '偏好关键词'} 相关描述。`,
    };
  });

  const avgAcceptance = Math.round(agentFeedback.reduce((sum, a) => sum + a.acceptanceScore, 0) / agentFeedback.length);
  const avgPurchase = Math.round(agentFeedback.reduce((sum, a) => sum + a.purchaseIntentScore, 0) / agentFeedback.length);
  const confidence = useLlm ? 0.78 : 0.62;

  return {
    overall: {
      acceptanceScore: avgAcceptance,
      purchaseIntentScore: avgPurchase,
      confidence,
      opportunitySummary: useLlm
        ? ['目标人群整体接受度处于可推进区间，LLM agent 对策略语义理解较好。']
        : ['目标人群整体接受度处于可推进区间，可作为策略压力测试基础。'],
      riskSummary: ['策略为模拟预测，不代表真实市场反馈。'],
      recommendedAdjustments: useLlm
        ? ['结合 LLM 反馈中的核心顾虑，优化卖点与定价表述。', '在市场场景中补充渠道、活动类型和预算/库存约束。']
        : ['补充策略文本中的商品、价格、渠道、活动卖点细节。', '在市场场景中补充渠道、活动类型和预算/库存约束。'],
    },
    agentFeedback,
  };
}

function isMockChannelEntity(canonicalObjectKey: string | undefined): boolean {
  if (!canonicalObjectKey) return false;
  seedMockChannelObjects();
  return db.channelObjects.some(
    (o) => o.canonicalObjectKey === canonicalObjectKey && o.targetObject === 'ChannelEntity'
  );
}

function buildMockSimulatedMarketRun(input: SimulatedMarketInput): SimulationRun {
  const runId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const useLlm = isMockChannelEntity(input.marketContext?.channelEntityId);
  const run: SimulationRun = {
    runId,
    workspaceId: 'ws_demo',
    status: 'succeeded',
    inputSnapshot: input,
    result: buildMockSimulatedMarketResult(input, useLlm),
    provider: useLlm ? 'minimax' : 'deterministic_fallback',
    modelVersion: useLlm ? 'minimax-m3' : 'deterministic-fallback-0.1',
    generatedAt: new Date().toISOString(),
    qualityFlags: useLlm ? [] : ['llm_unavailable_fallback_used'],
  };
  db.simulatedMarketRuns.push(run);
  return run;
}

const mockSinglePortraitMetadata: SingleProductPortraitMetadata = {
  modelAvailable: true,
  fitTypes: ['X型', 'H型', '宽松型'],
  requiredColumns: ['款号', '版型', '面料', 'FAB'],
  maxBatchRows: 100,
  maxFileBytes: 2097152,
  modelVersion: 'single-product-portrait-supervised-ridge-0.1',
  trainedAt: '2026-07-09T09:49:25.064Z',
  sampleCount: 73,
  riskFlags: ['baseline_not_trained_model', 'small_sample_supervised_model', 'no_temporal_validation'],
  metricsSummary: [
    { labelType: '预测性别', top1Overlap: 0.959, top3Overlap: 1 },
    { labelType: '预测人生阶段', top1Overlap: 0.836, top3Overlap: 1 },
    { labelType: '预测年龄段', top1Overlap: 0.726, top3Overlap: 0.776 },
    { labelType: '预测消费能力', top1Overlap: 0.63, top3Overlap: 1 },
    { labelType: '城市等级', top1Overlap: 0.342, top3Overlap: 0.749 },
    { labelType: '八大消费群体', top1Overlap: 0.342, top3Overlap: 0.808 },
  ],
};

function buildMockSinglePortraitPrediction(input: SingleProductPortraitInput, rowShift = 0): SingleProductPortraitPrediction {
  const generatedAt = new Date().toISOString();
  const ageShare = Math.max(0.2, 0.68 - rowShift * 0.03);
  return {
    skuId: input.skuId,
    generatedAt,
    modelVersion: mockSinglePortraitMetadata.modelAvailable ? mockSinglePortraitMetadata.modelVersion : 'model_unavailable',
    modelPath: 'supervised_ridge',
    sourceType: 'derived',
    anchorSkuId: '10A326100109',
    inputCoverage: {
      requiredFieldCoverage: 1,
      optionalSignalCoverage: 0,
      usedFields: ['fitType', 'fabric', 'fab'],
      missingFields: [],
    },
    platformPortraitRows: [],
    dimensionSummaries: [
      {
        labelType: '预测性别',
        topLabels: [
          { label: '女', share: 0.88, tgi: null, confidence: 0.76 },
          { label: '男', share: 0.12, tgi: null, confidence: 0.55 },
        ],
        qualityFlags: [],
      },
      {
        labelType: '预测年龄段',
        topLabels: [
          { label: '24-30', share: ageShare, tgi: null, confidence: 0.72 },
          { label: '31-35', share: 0.2, tgi: null, confidence: 0.61 },
          { label: '20-23', share: 0.12, tgi: null, confidence: 0.58 },
        ],
        qualityFlags: [],
      },
      {
        labelType: '预测消费能力',
        topLabels: [
          { label: '中消费', share: 0.62, tgi: null, confidence: 0.68 },
          { label: '高消费', share: 0.25, tgi: null, confidence: 0.6 },
          { label: '低消费', share: 0.13, tgi: null, confidence: 0.55 },
        ],
        qualityFlags: [],
      },
      {
        labelType: '城市等级',
        topLabels: [
          { label: '新一线', share: 0.36, tgi: null, confidence: 0.52 },
          { label: '二线', share: 0.31, tgi: null, confidence: 0.5 },
          { label: '一线', share: 0.21, tgi: null, confidence: 0.48 },
        ],
        qualityFlags: ['low_stability_dimension'],
      },
      {
        labelType: '八大消费群体',
        topLabels: [
          { label: '精致妈妈', share: 0.33, tgi: null, confidence: 0.51 },
          { label: '新锐白领', share: 0.3, tgi: null, confidence: 0.5 },
          { label: '资深中产', share: 0.18, tgi: null, confidence: 0.47 },
        ],
        qualityFlags: ['low_stability_dimension'],
      },
      {
        labelType: '预测人生阶段',
        topLabels: [
          { label: '职场发展期', share: 0.58, tgi: null, confidence: 0.69 },
          { label: '家庭成长期', share: 0.28, tgi: null, confidence: 0.62 },
          { label: '校园到职场过渡', share: 0.14, tgi: null, confidence: 0.56 },
        ],
        qualityFlags: [],
      },
    ],
    riskFlags: ['baseline_not_trained_model', 'small_sample_supervised_model', 'no_temporal_validation'],
    explanationSources: [
      {
        sourceField: '版型/面料/FAB',
        sourceValue: `${input.fitType},${input.fabric},style_commute,fabric_cotton`,
        ruleId: 'supervised-ridge-预测年龄段',
        targetLabelType: '预测年龄段',
        targetLabel: '24-30',
        effect: 'increase',
        weight: 0.42,
        rationale: 'Ridge model top positive drivers: style_commute, fabric_cotton, scene_work.',
      },
    ],
  };
}

async function uploadSinglePortraitBatch<T>(path: string, file: File): Promise<{ code: string; data: T }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`/api/v0${path}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer pls-p0-demo-token',
      'X-PLS-Workspace': 'ws_demo',
    },
    body: formData,
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody?.error?.message || `API Error: ${res.status}`);
  }
  return res.json();
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item)) : [];
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

const CSV_ALLOWED_TABLES = ['sku', 'channel_profile', 'wide_table_row', 'batch', 'prediction', 'match_result'];

const CSV_REQUIRED_COLUMNS: Record<string, string[]> = {
  sku: ['sku_id'],
  channel_profile: ['channel_id'],
  wide_table_row: ['sku_id', 'channel_id'],
  batch: ['batch_id'],
  prediction: ['prediction_id'],
  match_result: ['match_id']
};

function normalizeCsvHeader(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s\-.]+/g, '_')
    .replace(/_+/g, '_');
}

function toDecisionStatus(row: Record<string, unknown>, actions: ActionRecord[], reviews: Record<string, unknown>[]): DecisionRecord['status'] {
  const latestReview = reviews.at(-1);
  const reviewStatus = typeof latestReview?.reviewStatus === 'string' ? latestReview.reviewStatus : '';
  const status = typeof row.status === 'string' ? row.status : '';
  if (status === 'verified' || reviewStatus === 'verified') return 'verified';
  if (status === 'needs_adjustment' || reviewStatus === 'needs_adjustment') return 'needs_adjustment';
  if (reviewStatus === 'pending_review') return 'pending_review';
  if (actions.length > 0) return 'in_progress';
  return 'pending_execution';
}

function normalizeOperationDecision(row: Record<string, unknown>): DecisionRecord {
  const actions = asArray(row.actions).map((action): ActionRecord => {
    const detail = asRecord(action.actionDetail);
    return {
      actionId: String(action.actionId ?? ''),
      type: String(action.actionType ?? 'other'),
      description: String(detail.description ?? ''),
      status: action.status === 'completed' || action.status === 'failed' ? action.status : 'pending',
      executedAt: typeof action.executedAt === 'string' ? action.executedAt : undefined,
    };
  }).filter((action) => action.actionId);
  const feedbacks = asArray(row.feedbacks);
  const reviews = asArray(row.reviews);
  const latestFeedback = feedbacks.at(-1);
  const latestReview = reviews.at(-1);
  const rawMetrics = asRecord(latestFeedback?.rawMetrics);
  const feedback: FeedbackRecord | undefined = latestFeedback ? {
    summary: String(rawMetrics.summary ?? latestFeedback.metricName ?? ''),
    effectJudgment: latestReview?.reviewStatus === 'needs_adjustment' ? 'negative' : latestReview?.reviewStatus === 'verified' ? 'positive' : 'neutral',
    audienceDeviation: String(rawMetrics.audienceDeviation ?? ''),
    adjustments: Array.isArray(rawMetrics.adjustments) ? rawMetrics.adjustments.filter((item): item is string => typeof item === 'string') : [],
    submittedAt: String(latestFeedback.createdAt ?? new Date().toISOString()),
  } : undefined;

  return {
    decisionId: String(row.decisionId ?? ''),
    matchId: typeof row.matchId === 'string' && row.matchId ? row.matchId : undefined,
    skuId: String(row.skuId ?? ''),
    entityId: String(row.channelId ?? ''),
    entityType: (typeof row.entityType === 'string' && ['channel', 'account', 'sku'].includes(row.entityType)) ? row.entityType as 'channel' | 'account' | 'sku' : 'channel',
    recommendation: typeof row.recommendation === 'string' ? row.recommendation : undefined,
    rationale: typeof row.rationale === 'string' ? row.rationale : undefined,
    status: toDecisionStatus(row, actions, reviews),
    owner: String(row.createdBy ?? '运营专员'),
    createdAt: String(row.createdAt ?? new Date().toISOString()),
    updatedAt: String(row.updatedAt ?? row.createdAt ?? new Date().toISOString()),
    actions,
    feedback,
    simulationRunId: typeof row.simulationRunId === 'string' && row.simulationRunId ? row.simulationRunId : undefined,
    sourceType: typeof row.sourceType === 'string' ? row.sourceType as SimulatedMarketSourceType : undefined,
    sourceRef: typeof row.sourceRef === 'object' && row.sourceRef !== null && !Array.isArray(row.sourceRef) ? row.sourceRef as { id: string; type: string } : undefined,
    simulationSummary: typeof row.simulationSummary === 'object' && row.simulationSummary !== null && !Array.isArray(row.simulationSummary) ? row.simulationSummary as SimulatedMarketResult['overall'] : undefined,
  };
}

const mockChannels: ChannelProfile[] = [
  { channelId: 'mock_douyin_live_001', channelName: 'Mock Douyin Live', channelType: 'live_stream', platformType: 'content_ecommerce' },
  { channelId: 'mock_tmall_store', channelName: 'Mock Tmall Store', channelType: 'shelf_ecommerce', platformType: 'traditional_ecommerce' },
  { channelId: 'mock_red_store', channelName: 'Mock RED Store', channelType: 'content_seeding', platformType: 'content_ecommerce' },
  { channelId: 'mock_wechat_miniprogram', channelName: 'Mock WeChat Mini Program', channelType: 'private_domain', platformType: 'social_ecommerce' },
];

const mockChannelObjects: ChannelObject[] = [
  {
    workspaceId: 'ws_demo',
    objectType: 'platform',
    sourceStableKey: 'douyin',
    keySource: 'provided',
    canonicalObjectKey: 'platform:douyin',
    objectVersionId: 'ws_demo:platform:douyin:v1',
    dataVersion: 'v1',
    sourceBatchId: 'batch_channel_objects_v1',
    generatedAt: '2026-07-01T00:00:00Z',
    timeWindow: '2026-05-01/2026-06-30',
    displayName: '抖音',
    platformName: '抖音',
    platformType: 'content_ecommerce',
    entityStatus: 'active',
    targetObject: 'ChannelEntity',
    entityAttributes: {},
    possibleDuplicate: false,
    duplicateCandidateKeys: [],
    manualReviewStatus: 'confirmed_distinct',
    qualityFlags: [],
    source: 'mock_channel_object_library',
    sourceType: 'mock',
  },
  {
    workspaceId: 'ws_demo',
    objectType: 'trade_area',
    sourceStableKey: 'wanda_beijing_chaoyang',
    keySource: 'provided',
    canonicalObjectKey: 'trade_area:wanda_beijing_chaoyang',
    objectVersionId: 'ws_demo:trade_area:wanda_beijing_chaoyang:v1',
    dataVersion: 'v1',
    sourceBatchId: 'batch_channel_objects_v1',
    generatedAt: '2026-07-01T00:00:00Z',
    timeWindow: '2026-05-01/2026-06-30',
    displayName: '北京朝阳万达商圈',
    platformName: null,
    platformType: null,
    entityStatus: 'active',
    targetObject: 'ChannelEntity',
    entityAttributes: { radiusKm: 3, radiusSource: 'default' },
    possibleDuplicate: false,
    duplicateCandidateKeys: [],
    manualReviewStatus: 'confirmed_distinct',
    qualityFlags: [],
    source: 'mock_channel_object_library',
    sourceType: 'mock',
  },
  {
    workspaceId: 'ws_demo',
    objectType: 'store',
    sourceStableKey: 'douyin_semira_official',
    keySource: 'source_system_id',
    canonicalObjectKey: 'store:douyin_semira_official',
    objectVersionId: 'ws_demo:store:douyin_semira_official:v1',
    dataVersion: 'v1',
    sourceBatchId: 'batch_channel_objects_v1',
    generatedAt: '2026-07-01T00:00:00Z',
    timeWindow: '2026-05-01/2026-06-30',
    displayName: '森马抖音官方旗舰店',
    platformName: '抖音',
    platformType: 'content_ecommerce',
    entityStatus: 'active',
    targetObject: 'ChannelEntity',
    entityAttributes: { storeType: 'online_shop', parentPlatformKey: 'platform:douyin' },
    possibleDuplicate: false,
    duplicateCandidateKeys: [],
    manualReviewStatus: 'confirmed_distinct',
    qualityFlags: [],
    source: 'mock_channel_object_library',
    sourceType: 'mock',
  },
  {
    workspaceId: 'ws_demo',
    objectType: 'account',
    sourceStableKey: 'douyin_semira_official_live',
    keySource: 'generated_from_name',
    canonicalObjectKey: 'account:douyin_semira_official_live',
    objectVersionId: 'ws_demo:account:douyin_semira_official_live:v1',
    dataVersion: 'v1',
    sourceBatchId: 'batch_channel_objects_v1',
    generatedAt: '2026-07-01T00:00:00Z',
    timeWindow: '2026-05-01/2026-06-30',
    displayName: '森马官方直播间',
    platformName: '抖音',
    platformType: 'content_ecommerce',
    entityStatus: 'active',
    targetObject: 'ChannelEntity',
    entityAttributes: { platformId: 'platform:douyin', parentStoreId: 'store:douyin_semira_official', bindingStatus: 'bound_to_store', contentFormats: ['live', 'short_video'] },
    possibleDuplicate: true,
    duplicateCandidateKeys: ['account:douyin_semira_official_short'],
    manualReviewStatus: 'unreviewed',
    qualityFlags: ['generated_key_needs_review', 'manual_entity_without_profile', 'possible_duplicate'],
    source: 'mock_channel_object_library',
    sourceType: 'mock',
  },
  {
    workspaceId: 'ws_demo',
    objectType: 'store',
    sourceStableKey: 'mock_city_walk_store',
    keySource: 'source_system_id',
    canonicalObjectKey: 'store:mock_city_walk_store',
    objectVersionId: 'ws_demo:store:mock_city_walk_store:v1',
    dataVersion: 'v1',
    sourceBatchId: 'batch_channel_objects_v1',
    generatedAt: '2026-07-01T00:00:00Z',
    timeWindow: '2026-05-01/2026-06-30',
    displayName: 'Mock City Walk Store',
    platformName: '抖音',
    platformType: 'content_ecommerce',
    entityStatus: 'active',
    targetObject: 'ChannelEntity',
    entityAttributes: { storeType: 'offline_store', parentTradeAreaKey: 'trade_area:wanda_beijing_chaoyang' },
    possibleDuplicate: false,
    duplicateCandidateKeys: [],
    manualReviewStatus: 'confirmed_distinct',
    qualityFlags: [],
    source: 'mock_channel_object_library',
    sourceType: 'mock',
  },
  {
    workspaceId: 'ws_demo',
    objectType: 'marketing_event',
    sourceStableKey: '618_2026',
    keySource: 'provided',
    canonicalObjectKey: 'marketing_event:618_2026',
    objectVersionId: 'ws_demo:marketing_event:618_2026:v1',
    dataVersion: 'v1',
    sourceBatchId: 'batch_channel_objects_v1',
    generatedAt: '2026-07-01T00:00:00Z',
    timeWindow: '2026-06-01/2026-06-20',
    displayName: '2026 年 618 大促',
    platformName: null,
    platformType: null,
    entityStatus: 'active',
    targetObject: 'MarketingEvent',
    entityAttributes: { eventType: 'platform_promotion', customTags: ['全品类', '满减'] },
    possibleDuplicate: false,
    duplicateCandidateKeys: [],
    manualReviewStatus: 'confirmed_distinct',
    qualityFlags: [],
    source: 'mock_channel_object_library',
    sourceType: 'mock',
  },
  {
    workspaceId: 'ws_demo',
    objectType: 'business_scenario',
    sourceStableKey: 'new_product_launch_q3',
    keySource: 'generated_from_name',
    canonicalObjectKey: 'business_scenario:new_product_launch_q3',
    objectVersionId: 'ws_demo:business_scenario:new_product_launch_q3:v1',
    dataVersion: 'v1',
    sourceBatchId: 'batch_channel_objects_v1',
    generatedAt: '2026-07-01T00:00:00Z',
    timeWindow: '2026-07-01/2026-09-30',
    displayName: 'Q3 新品首发',
    platformName: null,
    platformType: null,
    entityStatus: 'active',
    targetObject: 'BusinessScenario',
    entityAttributes: { scenarioType: 'new_product_launch', description: '第三季度新品集中上新场景' },
    possibleDuplicate: false,
    duplicateCandidateKeys: [],
    manualReviewStatus: 'unreviewed',
    qualityFlags: ['generated_key_needs_review'],
    source: 'mock_channel_object_library',
    sourceType: 'mock',
  },
  {
    workspaceId: 'ws_demo',
    objectType: 'account',
    sourceStableKey: 'mock_account_douyin_style',
    keySource: 'provided',
    canonicalObjectKey: 'account:mock_account_douyin_style',
    objectVersionId: 'ws_demo:account:mock_account_douyin_style:v1',
    dataVersion: 'v1',
    sourceBatchId: 'batch_channel_objects_v1',
    generatedAt: '2026-07-01T00:00:00Z',
    timeWindow: '2026-05-01/2026-06-30',
    displayName: 'Mock Douyin 风格账号',
    platformName: '抖音',
    platformType: 'content_ecommerce',
    entityStatus: 'active',
    targetObject: 'ChannelEntity',
    entityAttributes: { platformId: 'platform:douyin', contentFormats: ['live', 'short_video'] },
    possibleDuplicate: false,
    duplicateCandidateKeys: [],
    manualReviewStatus: 'confirmed_distinct',
    qualityFlags: [],
    source: 'mock_channel_object_library',
    sourceType: 'mock',
  },
  {
    workspaceId: 'ws_demo',
    objectType: 'marketing_event',
    sourceStableKey: 'mock_event_618',
    keySource: 'provided',
    canonicalObjectKey: 'marketing_event:mock_event_618',
    objectVersionId: 'ws_demo:marketing_event:mock_event_618:v1',
    dataVersion: 'v1',
    sourceBatchId: 'batch_channel_objects_v1',
    generatedAt: '2026-07-01T00:00:00Z',
    timeWindow: '2026-06-01/2026-06-20',
    displayName: 'Mock 618 大促',
    platformName: null,
    platformType: null,
    entityStatus: 'active',
    targetObject: 'MarketingEvent',
    entityAttributes: { eventType: 'platform_promotion', customTags: ['大促', '满减'] },
    possibleDuplicate: false,
    duplicateCandidateKeys: [],
    manualReviewStatus: 'confirmed_distinct',
    qualityFlags: [],
    source: 'mock_channel_object_library',
    sourceType: 'mock',
  },
  {
    workspaceId: 'ws_demo',
    objectType: 'business_scenario',
    sourceStableKey: 'new_product_launch_mock_style',
    keySource: 'generated_from_name',
    canonicalObjectKey: 'business_scenario:new_product_launch:mock_style',
    objectVersionId: 'ws_demo:business_scenario:new_product_launch:mock_style:v1',
    dataVersion: 'v1',
    sourceBatchId: 'batch_channel_objects_v1',
    generatedAt: '2026-07-01T00:00:00Z',
    timeWindow: '2026-07-01/2026-09-30',
    displayName: 'Mock 新品风格首发',
    platformName: null,
    platformType: null,
    entityStatus: 'active',
    targetObject: 'BusinessScenario',
    entityAttributes: { scenarioType: 'new_product_launch', description: '新品风格首发场景' },
    possibleDuplicate: false,
    duplicateCandidateKeys: [],
    manualReviewStatus: 'confirmed_distinct',
    qualityFlags: [],
    source: 'mock_channel_object_library',
    sourceType: 'mock',
  },
];

const mockAudienceProfiles: AudienceProfile[] = [
  {
    profileId: 'aud_profile_001',
    canonicalObjectKey: 'account:douyin_semira_official_live',
    profileStage: 'latest',
    source: 'mock_channel_object_library',
    sourceBatchId: 'batch_channel_objects_v1',
    dataVersion: 'v1',
    generatedAt: '2026-07-01T00:00:00Z',
    timeWindow: '2026-05-01/2026-06-30',
    sampleSize: 5000,
    confidence: 0.72,
    tags: [
      { tagId: 'demo.age_25_34', score: 0.45 },
      { tagId: 'demo.age_18_24', score: 0.30 },
      { tagId: 'price.mid', score: 0.60 },
      { tagId: 'city.tier_1_2', score: 0.55 },
    ],
    unmappedFields: [],
    qualityFlags: [],
    benchmarkTags: [
      { dimension: 'age', optionLabel: '24-30', sharePercent: 34.83 },
      { dimension: 'gender', optionLabel: 'female', sharePercent: 65.5 },
    ],
    performanceMetrics: {
      followerCount: 1250000,
      engagementRate: 0.085,
      conversionRate: 0.032,
    },
    interactionPreference: ['短视频观看', '直播互动', '分享转发'],
  },
];

const mockProductFitProfiles: ProductFitProfile[] = [
  {
    profileId: 'pf_profile_001',
    canonicalObjectKey: 'account:douyin_semira_official_live',
    source: 'mock_channel_object_library',
    sourceBatchId: 'batch_channel_objects_v1',
    dataVersion: 'v1',
    generatedAt: '2026-07-01T00:00:00Z',
    timeWindow: '2026-05-01/2026-06-30',
    sampleSize: 5000,
    confidence: 0.68,
    fitCategories: ['女装', 'T恤', '连衣裙'],
    fitPriceBands: ['中端'],
    fitStyles: ['简约', '通勤'],
    fitOccasions: ['日常', '职场'],
    fitLaunchTypes: ['新品首发', '日常补货'],
    evidence: [{ field: '品类销售分布', value: '女装占比 65%', rationale: '历史成交品类分布' }],
    qualityFlags: [],
  },
  {
    profileId: 'pf_profile_002',
    canonicalObjectKey: 'store:mock_city_walk_store',
    source: 'manual_config',
    sourceBatchId: 'batch_channel_objects_v1',
    dataVersion: 'v1',
    generatedAt: '2026-07-01T00:00:00Z',
    timeWindow: null,
    sampleSize: null,
    confidence: 0.55,
    fitCategories: ['女装', '鞋包'],
    fitPriceBands: ['中端'],
    fitStyles: ['潮流', '休闲'],
    fitOccasions: ['逛街', '约会'],
    fitLaunchTypes: ['新品首发'],
    evidence: [{ field: '商圈定位', value: '年轻潮流商圈', rationale: '运营人工配置' }],
    qualityFlags: ['manual_config'],
  },
];

const mockChannelObjectBindings: ChannelObjectBinding[] = [
  {
    bindingId: 'binding_001',
    bindingType: 'event_channel',
    fromCanonicalObjectKey: 'marketing_event:618_2026',
    toCanonicalObjectKey: 'store:douyin_semira_official',
    sourceBatchId: 'batch_channel_objects_v1',
    dataVersion: 'v1',
    generatedAt: '2026-07-01T00:00:00Z',
    qualityFlags: [],
  },
  {
    bindingId: 'binding_002',
    bindingType: 'scenario_channel',
    fromCanonicalObjectKey: 'business_scenario:new_product_launch_q3',
    toCanonicalObjectKey: 'account:douyin_semira_official_live',
    sourceBatchId: 'batch_channel_objects_v1',
    dataVersion: 'v1',
    generatedAt: '2026-07-01T00:00:00Z',
    qualityFlags: [],
  },
];

interface ChannelObjectListParams {
  objectType?: string;
  platformType?: string;
  sourceBatchId?: string;
  dataVersion?: string;
  cursor?: string;
  pageSize?: number;
}

interface ChannelObjectListResponse {
  items: ChannelObject[];
  page: {
    cursor: string | null;
    nextCursor: string | null;
    pageSize: number;
    hasMore: boolean;
  };
}

function seedMockChannelObjects() {
  if (db.channelObjects.length === 0) {
    db.channelObjects = [...mockChannelObjects];
    db.audienceProfiles = [...mockAudienceProfiles];
    db.productFitProfiles = [...mockProductFitProfiles];
    db.channelObjectBindings = [...mockChannelObjectBindings];
  }
}


interface ChannelEntityApiItem {
  channelEntityId: string;
  entityType: string;
  sourceEntityKey: string;
  displayName?: string | null;
  platformType?: string | null;
  platformName?: string | null;
  accountKind?: string | null;
  profileTags?: Array<{ tagId?: string; score?: number }>;
  benchmarkTags?: Array<{
    mappedTagId?: string | null;
    optionLabel?: string | null;
    dimension?: string | null;
    sharePercent?: number | null;
  }>;
  performanceMetrics?: {
    followerCount?: number;
    engagementRate?: number;
    conversionRate?: number;
    trafficIndex?: number;
    conversionIndex?: number;
    sampleSize?: number;
  };
  sourceId?: string;
  timeWindow?: string | null;
  qualityFlags?: string[];
}

function normalizeScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? n / 100 : n;
}

function mapChannelEntityToAccountProfile(entity: ChannelEntityApiItem): AccountProfile {
  const benchmarkTags = entity.benchmarkTags ?? [];
  const profileTags = entity.profileTags ?? [];
  const coreTags = profileTags.length > 0
    ? profileTags.map((tag) => ({
        tagId: tag.tagId ?? 'unknown',
        score: normalizeScore(tag.score),
      }))
    : benchmarkTags.map((tag) => ({
        tagId: tag.mappedTagId ?? tag.optionLabel ?? tag.dimension ?? 'unknown',
        score: normalizeScore(tag.sharePercent),
      }));

  const metrics = entity.performanceMetrics ?? {};
  const sampleSize = Number(metrics.sampleSize) || 0;

  return {
    accountId: entity.channelEntityId,
    sourceEntityKey: entity.sourceEntityKey,
    sourceId: entity.sourceId,
    accountName: entity.displayName || entity.sourceEntityKey || entity.channelEntityId,
    accountType: entity.entityType || entity.accountKind || 'unknown',
    platformType: entity.platformType || 'unknown',
    qualityFlags: entity.qualityFlags || [],
    sampleSize,
    timeWindow: entity.timeWindow || '',
    coreTags,
    interactionPreference: [],
    performanceIndex: {
      followerCount: Number(metrics.followerCount) || Number(metrics.trafficIndex) || 0,
      engagementRate: normalizeScore(metrics.engagementRate),
      conversionRate: normalizeScore(metrics.conversionRate ?? metrics.conversionIndex),
    },
  };
}

export const api = {
  getSingleProductPortraitMetadata: async (): Promise<{ code: string; data: SingleProductPortraitMetadata }> => {
    if (!USE_MOCK) return fetchApi<SingleProductPortraitMetadata>('/single-product-portrait/metadata');
    return { code: 'ok', data: mockSinglePortraitMetadata };
  },

  predictSingleProductPortrait: async (input: SingleProductPortraitInput): Promise<{ code: string; data: { prediction: SingleProductPortraitPrediction } }> => {
    if (!USE_MOCK) {
      return fetchApi<{ prediction: SingleProductPortraitPrediction }>('/single-product-portrait/predict', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    }
    if (!mockSinglePortraitMetadata.fitTypes.includes(input.fitType)) {
      throw new Error('版型不在当前模型支持列表中');
    }
    return { code: 'ok', data: { prediction: buildMockSinglePortraitPrediction(input) } };
  },

  previewSingleProductPortraitBatch: async (file: File): Promise<{ code: string; data: SingleProductPortraitBatchPreview }> => {
    if (!USE_MOCK) return uploadSinglePortraitBatch<SingleProductPortraitBatchPreview>('/single-product-portrait/predict/batch/preview', file);
    const lowerName = file.name.toLowerCase();
    if (lowerName.includes('missing')) {
      return {
        code: 'ok',
        data: {
          totalRows: 0,
          validRows: 0,
          invalidRows: 0,
          fileErrors: [{ code: 'missing_required_columns', message: '缺少必需列: FAB', field: 'file', rawValue: '款号,版型,面料' }],
          rowErrors: [],
          warnings: [],
          extraColumns: [],
          requiredColumns: mockSinglePortraitMetadata.requiredColumns,
        },
      };
    }
    const hasPartialErrors = lowerName.includes('partial') || lowerName.includes('mixed');
    return {
      code: 'ok',
      data: {
        totalRows: hasPartialErrors ? 4 : 2,
        validRows: hasPartialErrors ? 2 : 2,
        invalidRows: hasPartialErrors ? 2 : 0,
        fileErrors: [],
        rowErrors: hasPartialErrors
          ? [
              { code: 'unknown_fit_type', message: '版型不在当前模型支持列表中', field: 'fitType', rawValue: '未知版型', rowNumber: 3, skuId: 'MOCK_BAD_FIT' },
              { code: 'required_field_empty', message: 'FAB 不能为空', field: 'fab', rawValue: '', rowNumber: 5, skuId: 'MOCK_EMPTY_FAB' },
            ]
          : [],
        warnings: [
          { code: 'extra_columns_ignored', message: '忽略额外列: 颜色', field: 'file' },
          ...(hasPartialErrors ? [{ code: 'duplicate_sku_id_in_file', message: '款号重复，首次出现在第 2 行', field: 'skuId' as const, rawValue: 'MOCK_DUP', rowNumber: 4, skuId: 'MOCK_DUP' }] : []),
        ],
        extraColumns: ['颜色'],
        requiredColumns: mockSinglePortraitMetadata.requiredColumns,
      },
    };
  },

  executeSingleProductPortraitBatch: async (file: File): Promise<{ code: string; data: SingleProductPortraitBatchExecute }> => {
    if (!USE_MOCK) return uploadSinglePortraitBatch<SingleProductPortraitBatchExecute>('/single-product-portrait/predict/batch', file);
    const preview = (await api.previewSingleProductPortraitBatch(file)).data;
    if (preview.fileErrors.length > 0) {
      return {
        code: 'ok',
        data: {
          totalRows: preview.totalRows,
          successCount: 0,
          failureCount: preview.totalRows,
          warningCount: preview.warnings.length,
          results: [],
          fileErrors: preview.fileErrors,
          rowErrors: preview.rowErrors,
          warnings: preview.warnings,
          metadata: mockSinglePortraitMetadata,
        },
      };
    }
    const fitType = mockSinglePortraitMetadata.modelAvailable ? mockSinglePortraitMetadata.fitTypes[0] ?? 'X型' : 'X型';
    const rows = [
      { rowNumber: 2, skuId: 'MOCK_BATCH_001' },
      { rowNumber: 4, skuId: 'MOCK_DUP' },
    ].slice(0, preview.validRows);
    return {
      code: 'ok',
      data: {
        totalRows: preview.totalRows,
        successCount: rows.length,
        failureCount: preview.rowErrors.length,
        warningCount: preview.warnings.length,
        results: rows.map((row, index) => ({
          ...row,
          prediction: buildMockSinglePortraitPrediction({ skuId: row.skuId, fitType, fabric: '全棉针织', fab: '通勤基础款，舒适亲肤，适合日常上班' }, index),
        })),
        fileErrors: preview.fileErrors,
        rowErrors: preview.rowErrors,
        warnings: preview.warnings,
        metadata: mockSinglePortraitMetadata,
      },
    };
  },

  getTaxonomy: async () => {
    if (!USE_MOCK) return fetchApi<Record<string, string>>('/taxonomy').then(r => r.data);
    return {
      'style.minimal': '简约通勤',
      'price.mid': '中端价格',
      'price.premium': '高端价格',
      'occasion.work': '职场工作',
      'demo.age_25_34': '25-34岁',
      'demo.age_18_24': '18-24岁'
    };
  },
  
  getChannels: async () => {
    if (!USE_MOCK) return fetchApi<{items: ChannelProfile[]}>('/channels');
    return { data: { items: mockChannels } };
  },

  getMatchEntities: async (): Promise<{ code: string; data: { items: ChannelProfile[] } }> => {
    if (!USE_MOCK) {
      const res = await fetchApi<{ items: ChannelEntityApiItem[] }>('/channels/entities');
      const items = res.data.items.map((entity) => ({
        channelId: entity.sourceEntityKey || entity.channelEntityId,
        channelName: entity.displayName || entity.sourceEntityKey || entity.channelEntityId,
        channelType: entity.entityType || entity.accountKind || 'unknown',
        platformType: entity.platformType || 'unknown',
        sampleSize: Number(entity.performanceMetrics?.sampleSize) || null,
        timeWindow: entity.timeWindow || null,
        qualityFlags: entity.qualityFlags || [],
      }));
      return { code: 'ok', data: { items } };
    }
    return { code: 'ok', data: { items: mockChannels } };
  },

  getAccountProfiles: async (): Promise<{ code: string; data: AccountProfile[] }> => {
    if (!USE_MOCK) {
      const res = await fetchApi<{ items: ChannelEntityApiItem[] }>('/channels/entities');
      const items = res.data.items.map(mapChannelEntityToAccountProfile);
      return { code: 'ok', data: items };
    }
    
    // Mock Account Profiles
    return {
      code: 'ok',
      data: mockChannels.map(c => ({
        accountId: c.channelId,
        sourceEntityKey: c.channelId,
        sourceId: 'mock',
        accountName: c.channelName,
        accountType: c.channelType,
        platformType: c.platformType || 'unknown',
        qualityFlags: c.qualityFlags || ['数据充足'],
        sampleSize: 15000 + Math.floor(Math.random() * 50000),
        timeWindow: '近30天',
        coreTags: [],
        interactionPreference: [],
        performanceIndex: {
          followerCount: 0,
          engagementRate: 0,
          conversionRate: 0
        }
      }))
    };
  },

  getAccountProfileDetail: async (accountId: string): Promise<{ code: string; data: AccountProfile }> => {
    if (!USE_MOCK) {
      const res = await fetchApi<ChannelEntityApiItem>(`/channels/entities/${accountId}`);
      return { code: 'ok', data: mapChannelEntityToAccountProfile(res.data) };
    }

    const mock = mockChannels.find(c => c.channelId === accountId) || mockChannels[0];
    return {
      code: 'ok',
      data: {
        accountId: mock.channelId,
        sourceEntityKey: mock.channelId,
        sourceId: 'mock',
        accountName: mock.channelName,
        accountType: mock.channelType,
        platformType: mock.platformType || 'unknown',
        qualityFlags: mock.qualityFlags || ['数据充足', '置信度高'],
        sampleSize: 15000 + Math.floor(Math.random() * 50000),
        timeWindow: '近30天',
        coreTags: [
          { tagId: 'demo.age_18_24', score: Math.random() },
          { tagId: 'style.minimal', score: Math.random() },
          { tagId: 'price.mid', score: Math.random() }
        ],
        interactionPreference: ['短视频观看', '直播互动', '分享转发'],
        performanceIndex: {
          followerCount: 500000 + Math.floor(Math.random() * 1000000),
          engagementRate: 0.05 + Math.random() * 0.1,
          conversionRate: 0.01 + Math.random() * 0.05
        }
      }
    };
  },

  getProductCompass: async (skuId: string): Promise<{ code: string; data: ProductCompass }> => {
    if (!USE_MOCK) {
      try {
        const res = await fetchApi<any>(`/bi/douyin/products/${skuId}`);
        const p = res.data;
        const dna = p.productAttributes?.styleKeywords || [];
        
        let audienceDistribution: { tagId: string; score: number }[] = [];
        if (Array.isArray(p.mappedProfileTags) && p.mappedProfileTags.length > 0) {
          audienceDistribution = p.mappedProfileTags.map((t: any) => ({
            tagId: t.tagId || t.tagName || t.dimension || 'unknown',
            score: Number(t.score || t.weight || t.share || 0)
          }));
        } else if (p.profileDistribution && typeof p.profileDistribution === 'object') {
          Object.entries(p.profileDistribution).forEach(([dim, buckets]: [string, any]) => {
             if (Array.isArray(buckets)) {
               buckets.forEach(b => {
                 audienceDistribution.push({
                   tagId: b.label || b.bucket || b.name || String(dim),
                   score: Number(b.share || b.weight || b.score || b.percent || 0)
                 });
               });
             }
          });
        }

        const metrics = p.performanceMetrics || {};
        const index = p.performanceIndex || {};
        const rawSalesVolume = index.salesVolume ?? metrics['2026合计净销量'] ?? metrics['商品链接数量'] ?? 0;
        const salesVolume = Number(rawSalesVolume) || 0;
        const salesAmount = Number(metrics['2026合计零售额']) || 0;
        const avgOrderValue = salesVolume > 0 ? salesAmount / salesVolume : 0;
        const conversionRate = 0; // Defensive fallback
        
        const salesMetrics = { salesVolume, conversionRate, avgOrderValue };
        return {
          code: 'ok',
          data: {
            skuId: p.skuId,
            dna,
            audienceDistribution,
            salesMetrics,
            qualityFlags: p.qualityFlags || []
          }
        };
      } catch {
        throw new Error('Failed to fetch product compass');
      }
    }

    return {
      code: 'ok',
      data: {
        skuId,
        dna: ['简约', '通勤', '连衣裙', '无袖'],
        audienceDistribution: [
          { tagId: 'demo.age_25_34', score: 0.45 },
          { tagId: 'demo.age_18_24', score: 0.35 },
          { tagId: 'price.mid', score: 0.60 }
        ],
        salesMetrics: {
          salesVolume: 1250,
          conversionRate: 0.035,
          avgOrderValue: 299
        },
        qualityFlags: ['数据充足', '置信度高']
      }
    };
  },

  getProducts: async () => {
    if (!USE_MOCK) {
      const res = await fetchApi<{items: any[]}>('/bi/douyin/products?pageSize=1');
      return { code: 'ok', data: res.data.items };
    }
    return { code: 'ok', data: [{ skuId: 'mock_sku_101' }] };
  },

  createProduct: async (productData: Partial<SKU>) => {
    if (!USE_MOCK) {
      // Backend expects specific POST /products payload
      return fetchApi<SKU>('/products', {
        method: 'POST',
        body: JSON.stringify(productData)
      });
    }

    const newSku: SKU = {
      skuId: productData.skuId || `mock_sku_${Date.now()}`,
      workspaceId: 'ws_demo',
      spuId: productData.spuId || `mock_spu_${Date.now()}`,
      categoryLv1: productData.categoryLv1 || 'apparel',
      categoryLv2: productData.categoryLv2 || 'dress',
      season: productData.season || 'spring_summer',
      title: productData.title || 'Untitled Product',
      attributes: productData.attributes || { styleKeywords: [] },
      assets: [],
      mappedProductTags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.products.push(newSku);
    return { code: 'ok', data: newSku };
  },

  createPrediction: async (skuId: string) => {
    if (!USE_MOCK) {
      return fetchApi<ProductProfile>('/predictions', {
        method: 'POST',
        body: JSON.stringify({ skuId, mode: 'sync' })
      });
    }

    const product = db.products.find(p => p.skuId === skuId);
    if (!product) throw new Error('Product not found');

    const newPrediction: ProductProfile = {
      predictionId: `pred_${Date.now()}`,
      workspaceId: 'ws_demo',
      skuId,
      taskId: `task_pred_${Date.now()}`,
      modelVersion: 'm-p0-baseline-0.1',
      modelPath: 'gbdt',
      source: 'm-p0-baseline-0.1',
      sourceType: 'derived',
      generatedAt: new Date().toISOString(),
      inputSnapshot: {},
      predictedProfileTags: [
        { tagId: 'demo.age_25_34', score: 0.79, confidence: 0.72, source: 'm-p0-baseline-0.1' },
        { tagId: 'style.minimal', score: 0.74, confidence: 0.8, source: 'm-p0-baseline-0.1' },
        { tagId: 'price.mid', score: 0.65, confidence: 0.6, source: 'm-p0-baseline-0.1' },
      ],
      topSegments: [
        {
          segmentId: 'seg_work_minimal_25_34',
          name: '25-34 岁简约通勤女性',
          rank: 1,
          confidence: 0.68,
          tags: [
            { tagId: 'demo.age_25_34', score: 0.79 },
            { tagId: 'style.minimal', score: 0.74 }
          ],
          drivers: ['style.minimal', 'occasion.work', 'price.mid']
        },
        {
          segmentId: 'seg_trendy_young_18_24',
          name: '18-24 岁潮流人群',
          rank: 2,
          confidence: 0.52,
          tags: [
            { tagId: 'demo.age_18_24', score: 0.65 },
            { tagId: 'style.basic', score: 0.60 }
          ],
          drivers: ['price.value', 'style.basic']
        },
        {
          segmentId: 'seg_elegant_35_44_premium',
          name: '高消费力优雅熟龄',
          rank: 3,
          confidence: 0.45,
          tags: [
            { tagId: 'price.premium', score: 0.55 },
            { tagId: 'demo.age_35_44', score: 0.50 }
          ],
          drivers: ['price.premium', 'occasion.party']
        }
      ],
      qualityFlags: [],
      unmappedInputTokens: [],
      riskFlags: ['baseline_not_trained_model', 'single_anchor_only', 'manual_rule_weight'],
      bridgeCoverageRate: 0.85,
      unmappedPlatformLabels: ['某些长尾品牌偏好', '长尾品类偏好'],
      evidence: [
        {
          sourceField: 'styleKeywords',
          sourceValue: 'minimal',
          ruleId: 'rule_style_minimal',
          targetLabelType: 'style',
          targetLabel: 'style.minimal',
          effect: 'increase',
          weight: 0.8,
          rationale: '基于款式特征 "minimal" 匹配核心风格'
        },
        {
          sourceField: 'priceBand',
          sourceValue: 'mid',
          ruleId: 'rule_price_mid',
          targetLabelType: '消费能力',
          targetLabel: 'price.mid',
          effect: 'increase',
          weight: 0.6,
          rationale: '基于价格带映射中端消费能力'
        }
      ],
      dimensionSummaries: [
        {
          labelType: '预测性别',
          topLabels: [{ label: 'gender.female', share: 0.95, tgi: null, confidence: 0.9 }],
          qualityFlags: []
        },
        {
          labelType: '预测年龄段',
          topLabels: [{ label: 'demo.age_25_34', share: 0.79, tgi: null, confidence: 0.8 }, { label: 'demo.age_18_24', share: 0.15, tgi: null, confidence: 0.3 }],
          qualityFlags: []
        },
        {
          labelType: '八大消费群体',
          topLabels: [{ label: 'group.white_collar', share: 0.65, tgi: null, confidence: 0.7 }],
          qualityFlags: []
        },
        {
          labelType: '预测消费能力',
          topLabels: [{ label: 'price.mid', share: 0.65, tgi: null, confidence: 0.6 }],
          qualityFlags: []
        },
        {
          labelType: '城市等级',
          topLabels: [{ label: 'city.tier_1_2', share: 0.55, tgi: null, confidence: 0.5 }],
          qualityFlags: []
        },
        {
          labelType: '抖音视频观看兴趣分类',
          topLabels: [{ label: 'interest.fashion', share: 0.8, tgi: null, confidence: 0.8 }, { label: 'interest.lifestyle', share: 0.6, tgi: null, confidence: 0.6 }],
          qualityFlags: []
        },
        {
          labelType: '地域',
          topLabels: [{ label: 'region.east', share: 0.5, tgi: null, confidence: 0.4 }],
          qualityFlags: []
        },
        {
          labelType: '品牌偏好',
          topLabels: [{ label: 'brand.fast_fashion', share: 0.4, tgi: null, confidence: 0.4 }],
          qualityFlags: []
        }
      ]
    };
    db.predictions.push(newPrediction);
    return { code: 'ok', data: newPrediction };
  },

  createMatches: async (predictionId: string) => {
    if (!USE_MOCK) {
      return fetchApi<{taskId: string; channelMatches: MatchResult[]}>('/matches', {
        method: 'POST',
        body: JSON.stringify({ predictionId, mode: 'sync' })
      });
    }

    const prediction = db.predictions.find(p => p.predictionId === predictionId);
    if (!prediction) throw new Error('Prediction not found');

    const matches: MatchResult[] = mockChannels.map((channel, idx) => {
      const score = 0.8 - (idx * 0.2); 
      let recommendation: 'priority_launch' | 'test_launch' | 'observe' | 'avoid' = 'priority_launch';
      if (score < 0.35) recommendation = 'avoid';
      else if (score < 0.5) recommendation = 'observe';
      else if (score < 0.7) recommendation = 'test_launch';

      return {
        matchId: `match_${Date.now()}_${idx}`,
        workspaceId: 'ws_demo',
        taskId: `task_match_${Date.now()}`,
        predictionId,
        skuId: prediction.skuId,
        channelId: channel.channelId,
        channelType: channel.channelType,
        modelVersion: 'm-p0-baseline-0.1',
        source: 'm-p0-baseline-0.1',
        sourceType: 'derived',
        generatedAt: new Date().toISOString(),
        matchScore: score,
        matchConfidence: 0.66 + (idx * 0.05),
        rank: idx + 1,
        overlap: score,
        bestSegmentId: 'seg_work_minimal_25_34',
        bestSegmentMatch: score,
        positiveDrivers: [
          { tagId: 'style.minimal', productScore: 0.74, channelScore: 0.70 }
        ],
        negativeDrivers: score < 0.5 ? [
          { tagId: 'price.premium', productScore: 0.12, channelScore: 0.05 }
        ] : [],
        recommendation,
        risks: score < 0.5 ? ['channel_price_sensitivity_gap'] : [],
        qualityFlags: []
      };
    });

    db.matches.push(...matches);
    return { code: 'ok', data: { taskId: `task_match_${Date.now()}`, channelMatches: matches } };
  },

  getHeatmap: async (): Promise<{ code: string; data: HeatmapData }> => {
    if (!USE_MOCK) return fetchApi<HeatmapData>('/matches/heatmap');

    const rows = db.products.map(p => {
      const productMatches = db.matches.filter(m => m.skuId === p.skuId);
      const cells = mockChannels.map(c => {
        const match = productMatches.find(m => m.channelId === c.channelId);
        return {
          channelId: c.channelId,
          matchScore: match?.matchScore || 0,
          matchConfidence: match?.matchConfidence || 0,
          recommendation: match?.recommendation || 'observe'
        };
      });
      return { skuId: p.skuId, cells: cells.filter(c => c.matchScore > 0) };
    }).filter(r => r.cells.length > 0);

    return {
      code: 'ok',
      data: {
        modelVersion: 'm-p0-baseline-0.1',
        generatedAt: new Date().toISOString(),
        rows
      }
    };
  },

  getMatchDetails: async (matchId: string) => {
    if (!USE_MOCK) return fetchApi<MatchResult>(`/matches/${matchId}`);

    const match = db.matches.find(m => m.matchId === matchId);
    if (!match) throw new Error('Match not found');
    return { code: 'ok', data: match };
  },

  getMatchDetailBySkuAndChannel: async (skuId: string, channelId: string) => {
    if (!USE_MOCK) {
      // Real backend might not have this exact endpoint, we fetch list with skuId and filter
      // Add pageSize=100 to increase the chance of getting the latest match if there are multiple pages
      const res = await fetchApi<{items: MatchResult[]}>(`/matches?skuId=${skuId}&pageSize=100`);
      const matches = res.data.items.filter(m => m.skuId === skuId && m.channelId === channelId);
      if (matches.length === 0) throw new Error('Match not found');
      // Sort to get the latest
      matches.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
      return { code: 'ok', data: matches[0] };
    }

    const matches = db.matches.filter(m => m.skuId === skuId && m.channelId === channelId);
    if (matches.length === 0) throw new Error('Match not found');
    matches.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
    return { code: 'ok', data: matches[0] };
  },

  getAccountMatch: async (skuId: string, accountId: string): Promise<{ code: string; data: AccountMatchResult }> => {
    if (!USE_MOCK) {
      const fitsRes = await fetchApi<{items: any[]}>(`/bi/douyin/fits?skuId=${skuId}&accountChannelId=${accountId}`);
      const fit = fitsRes.data.items?.[0];
      if (!fit) {
        throw new Error('Account fit not found');
      }

      const fitDetailRes = await fetchApi<any>(`/bi/douyin/fits/${fit.fitId}`);
      const fitDetail = fitDetailRes.data;

      const adviceRes = await fetchApi<{items: any[]}>(`/bi/douyin/advice?skuId=${skuId}&accountChannelId=${accountId}`);
      const advices = adviceRes.data.items || [];

      // Generate View Model for baseline/comparison from the API fields
      const baseline = [
        { dimension: '账号标识', value: accountId },
        { dimension: '预测契合度', value: `Fit Score: ${fit.legacyFitScore || 0}` }
      ];

      const comparison: AccountMatchResult['comparison'] = (fitDetail.dimensions || []).map((d: any) => ({
        dimension: d.dimension,
        accountTop1: { label: d.accountTop1Label || '-', value: '' },
        skuTop1: { label: d.productTop1Label || '-', value: '' },
        isAligned: d.isMatchLabel === 'Y' || d.isMatchLabel === 1 || d.isMatchLabel === true
      }));

      const adjustmentAdvice = advices.map((adv, idx) => ({
        id: adv.adviceId || Date.now() + idx,
        item: `[${adv.priority}] ${adv.actionType} - ${adv.dimension}`,
        suggestion: adv.direction || '建议调整',
        status: 'pending'
      }));

      return { 
        code: 'ok', 
        data: {
          accountId,
          skuId,
          fitScore: (fit.legacyFitScore || 0) / 100,
          fitConfidence: 0.85,
          baseline,
          comparison,
          mismatchedDimensions: [],
          adjustmentAdvice,
          qualityFlags: fit.qualityFlags || []
        }
      };
    }
    
    // Return synthetic desensitized data
    const mockMatch: AccountMatchResult = {
      accountId,
      skuId,
      fitScore: 0.85,
      fitConfidence: 0.92,
      baseline: [
        { dimension: '核心受众性别', value: '女性主导 (90%+)' },
        { dimension: '核心年龄层', value: '青年人群 (主力)' },
        { dimension: '消费特征', value: '中高消费偏好' },
        { dimension: '品类偏好', value: '服饰、美妆' },
        { dimension: '互动偏好', value: '泛娱乐、生活记录' },
      ],
      comparison: [
        { dimension: '预测性别', accountTop1: { label: '女', value: 'mock_90%' }, skuTop1: { label: '女', value: 'mock_85%' }, isAligned: true },
        { dimension: '预测年龄段', accountTop1: { label: '青年群', value: 'mock_40%' }, skuTop1: { label: '青年群', value: 'mock_45%' }, isAligned: true },
        { dimension: '地域分布', accountTop1: { label: '一线及新一线', value: 'mock_30%' }, skuTop1: { label: '二三线', value: 'mock_25%' }, isAligned: false },
        { dimension: '消费群体', accountTop1: { label: '白领/学生', value: 'mock_50%' }, skuTop1: { label: '白领/学生', value: 'mock_45%' }, isAligned: true },
        { dimension: '消费能力', accountTop1: { label: '高消费', value: 'mock_60%' }, skuTop1: { label: '高消费', value: 'mock_55%' }, isAligned: true },
      ],
      mismatchedDimensions: ['地域分布'],
      adjustmentAdvice: [
        { id: 1, item: '地域人群破圈', suggestion: '商品潜在受众在二三线较多，建议增加相应地域定向投流素材', status: 'pending' },
        { id: 2, item: '互动形式优化', suggestion: '针对受众特点，可适当增加自然生活场景演绎比例', status: 'pending' },
      ],
      qualityFlags: ['数据充足_置信度高']
    };
    return { code: 'ok', data: mockMatch };
  },

  getChannelObjects: async (params: ChannelObjectListParams = {}): Promise<{ code: string; data: ChannelObjectListResponse }> => {
    if (!USE_MOCK) {
      const qs = new URLSearchParams();
      if (params.objectType) qs.append('objectType', params.objectType);
      if (params.platformType) qs.append('platformType', params.platformType);
      if (params.sourceBatchId) qs.append('sourceBatchId', params.sourceBatchId);
      if (params.dataVersion) qs.append('dataVersion', params.dataVersion);
      if (params.cursor) qs.append('cursor', params.cursor);
      if (params.pageSize) qs.append('pageSize', String(params.pageSize));
      const res = await fetchApi<ChannelObjectListResponse>(`/channel-objects?${qs.toString()}`);
      return res;
    }
    seedMockChannelObjects();
    let items = [...db.channelObjects];
    if (params.objectType) {
      items = items.filter(i => i.objectType === params.objectType);
    }
    if (params.platformType) {
      items = items.filter(i => i.platformType === params.platformType);
    }
    if (params.sourceBatchId) {
      items = items.filter(i => i.sourceBatchId === params.sourceBatchId);
    }
    if (params.dataVersion) {
      items = items.filter(i => i.dataVersion === params.dataVersion);
    }
    const pageSize = params.pageSize || 20;
    const offset = params.cursor ? Number(params.cursor.replace('offset:', '')) || 0 : 0;
    const pageItems = items.slice(offset, offset + pageSize);
    const hasMore = items.length > offset + pageSize;
    return {
      code: 'ok',
      data: {
        items: pageItems,
        page: {
          cursor: params.cursor ?? null,
          nextCursor: hasMore ? `offset:${offset + pageSize}` : null,
          pageSize,
          hasMore,
        }
      }
    };
  },

  getChannelObject: async (canonicalObjectKey: string, dataVersion?: string): Promise<{ code: string; data: ChannelObject }> => {
    if (!USE_MOCK) {
      const qs = dataVersion ? `?dataVersion=${encodeURIComponent(dataVersion)}` : '';
      const res = await fetchApi<ChannelObject>(`/channel-objects/${canonicalObjectKey}${qs}`);
      return res;
    }
    seedMockChannelObjects();
    const obj = db.channelObjects.find(o => o.canonicalObjectKey === canonicalObjectKey);
    if (!obj) throw new Error(`Channel object ${canonicalObjectKey} not found`);
    return { code: 'ok', data: obj };
  },

  getChannelObjectAudienceProfiles: async (canonicalObjectKey: string, dataVersion?: string): Promise<{ code: string; data: { items: AudienceProfile[] } }> => {
    if (!USE_MOCK) {
      const qs = dataVersion ? `?dataVersion=${encodeURIComponent(dataVersion)}` : '';
      const res = await fetchApi<{ items: AudienceProfile[] }>(`/channel-objects/${canonicalObjectKey}/audience-profiles${qs}`);
      return res;
    }
    seedMockChannelObjects();
    const items = db.audienceProfiles.filter(p => p.canonicalObjectKey === canonicalObjectKey);
    return { code: 'ok', data: { items } };
  },

  getChannelObjectProductFitProfiles: async (canonicalObjectKey: string, dataVersion?: string): Promise<{ code: string; data: { items: ProductFitProfile[] } }> => {
    if (!USE_MOCK) {
      const qs = dataVersion ? `?dataVersion=${encodeURIComponent(dataVersion)}` : '';
      const res = await fetchApi<{ items: ProductFitProfile[] }>(`/channel-objects/${canonicalObjectKey}/product-fit-profiles${qs}`);
      return res;
    }
    seedMockChannelObjects();
    const items = db.productFitProfiles.filter(p => p.canonicalObjectKey === canonicalObjectKey);
    return { code: 'ok', data: { items } };
  },

  getChannelObjectBindings: async (canonicalObjectKey: string, bindingType?: string, dataVersion?: string): Promise<{ code: string; data: { items: ChannelObjectBinding[] } }> => {
    if (!USE_MOCK) {
      const qs = new URLSearchParams();
      if (bindingType) qs.append('bindingType', bindingType);
      if (dataVersion) qs.append('dataVersion', dataVersion);
      const query = qs.toString() ? `?${qs.toString()}` : '';
      const res = await fetchApi<{ items: ChannelObjectBinding[] }>(`/channel-objects/${canonicalObjectKey}/bindings${query}`);
      return res;
    }
    seedMockChannelObjects();
    const items = db.channelObjectBindings.filter(b =>
      b.fromCanonicalObjectKey === canonicalObjectKey || b.toCanonicalObjectKey === canonicalObjectKey
    );
    return { code: 'ok', data: { items } };
  },

  getChannelEntityProfile: async (canonicalObjectKey: string): Promise<{ code: string; data: AccountProfile | null }> => {
    if (!USE_MOCK) {
      try {
        const res = await fetchApi<ChannelEntityApiItem>(`/channels/entities/${canonicalObjectKey}`);
        return { code: 'ok', data: mapChannelEntityToAccountProfile(res.data) };
      } catch {
        return { code: 'ok', data: null };
      }
    }
    seedMockChannelObjects();
    const obj = db.channelObjects.find(o => o.canonicalObjectKey === canonicalObjectKey);
    if (!obj || obj.targetObject !== 'ChannelEntity') return { code: 'ok', data: null };
    return {
      code: 'ok',
      data: {
        accountId: obj.canonicalObjectKey,
        sourceEntityKey: obj.sourceStableKey,
        sourceId: obj.sourceBatchId,
        accountName: obj.displayName,
        accountType: obj.objectType,
        platformType: obj.platformType || 'unknown',
        qualityFlags: obj.qualityFlags,
        sampleSize: 15000,
        timeWindow: obj.timeWindow,
        coreTags: [
          { tagId: 'demo.age_25_34', score: 0.45 },
          { tagId: 'demo.age_18_24', score: 0.30 },
        ],
        interactionPreference: ['短视频观看', '直播互动'],
        performanceIndex: {
          followerCount: 500000,
          engagementRate: 0.08,
          conversionRate: 0.025,
        },
      }
    };
  },

  updateChannelObject: async (canonicalObjectKey: string, updates: Partial<ChannelObject>): Promise<{ code: string; data: ChannelObject }> => {
    if (!USE_MOCK) {
      throw new Error('Channel object light edit is not yet supported by the backend API.');
    }
    seedMockChannelObjects();
    const idx = db.channelObjects.findIndex(o => o.canonicalObjectKey === canonicalObjectKey);
    if (idx === -1) throw new Error(`Channel object ${canonicalObjectKey} not found`);
    db.channelObjects[idx] = { ...db.channelObjects[idx], ...updates };
    return { code: 'ok', data: db.channelObjects[idx] };
  },

  analyzeChannelObjects: async (params: {
    channelEntityIds: string[];
    marketingEventId?: string;
    businessScenarioId?: string;
    skuIds: string[];
  }): Promise<{ code: string; data: { matchResults: MatchResult[] } }> => {
    if (!USE_MOCK) {
      throw new Error('Channel object analysis view is not yet supported by the backend API.');
    }
    seedMockChannelObjects();
    const matches: MatchResult[] = [];
    params.channelEntityIds.forEach((channelId, cidx) => {
      params.skuIds.forEach((skuId, sidx) => {
        const score = Math.max(0.2, 0.8 - (cidx * 0.15) - (sidx * 0.05));
        let recommendation: 'priority_launch' | 'test_launch' | 'observe' | 'avoid' = 'priority_launch';
        if (score < 0.35) recommendation = 'avoid';
        else if (score < 0.5) recommendation = 'observe';
        else if (score < 0.7) recommendation = 'test_launch';
        matches.push({
          matchId: `match_analyze_${Date.now()}_${cidx}_${sidx}`,
          workspaceId: 'ws_demo',
          taskId: `task_analyze_${Date.now()}`,
          predictionId: `pred_analyze_${Date.now()}`,
          skuId,
          channelId,
          channelType: 'account',
          modelVersion: 'm-p0-baseline-0.1',
          source: 'channel_object_analysis_view',
          sourceType: 'derived',
          generatedAt: new Date().toISOString(),
          matchScore: score,
          matchConfidence: 0.6,
          rank: 1,
          overlap: score,
          bestSegmentId: 'seg_work_minimal_25_34',
          bestSegmentMatch: score,
          positiveDrivers: [{ tagId: 'style.minimal', productScore: 0.74, channelScore: 0.70 }],
          negativeDrivers: score < 0.5 ? [{ tagId: 'price.premium', productScore: 0.12, channelScore: 0.05 }] : [],
          recommendation,
          risks: score < 0.5 ? ['channel_price_sensitivity_gap'] : [],
          qualityFlags: []
        });
      });
    });
    return { code: 'ok', data: { matchResults: matches } };
  },

  createDecision: async (data: CreateDecisionInput) => {
    const channelId = data.channelId ?? data.entityId;
    if (!channelId) {
      throw new Error('channelId 或 entityId 必填');
    }
    if (!USE_MOCK) {
      return fetchApi<{ decisionId: string; status: string }>('/operations/decisions', {
        method: 'POST',
        body: JSON.stringify({
          skuId: data.skuId,
          channelId,
          recommendation: data.recommendation,
          rationale: data.rationale,
          matchId: data.matchId,
          simulationRunId: data.simulationRunId,
          sourceType: data.sourceType,
          sourceRef: data.sourceRef,
          simulationSummary: data.simulationSummary,
          decisionType: 'launch',
          createdBy: data.owner ?? '运营专员',
        })
      });
    }
    const newDecision: DecisionRecord = {
      decisionId: `dec_${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending_execution',
      owner: data.owner || 'System',
      actions: [],
      skuId: data.skuId,
      entityId: channelId,
      entityType: data.entityType ?? 'channel',
      recommendation: data.recommendation,
      rationale: data.rationale,
      matchId: data.matchId,
      simulationRunId: data.simulationRunId,
      sourceType: data.sourceType,
      sourceRef: data.sourceRef,
      simulationSummary: data.simulationSummary,
    };
    db.decisions.push(newDecision);
    return { code: 'ok', data: newDecision };
  },

  getDecisions: async (skuId?: string, entityId?: string) => {
    if (!USE_MOCK) {
      const qs = new URLSearchParams();
      if (skuId) qs.append('skuId', skuId);
      const list = await fetchApi<{ items: Record<string, unknown>[] }>(`/operations/decisions?${qs.toString()}`);
      const details = await Promise.all(
        list.data.items.map((item) => fetchApi<Record<string, unknown>>(`/operations/decisions/${String(item.decisionId)}`).then((res) => normalizeOperationDecision(res.data)))
      );
      const items = entityId ? details.filter((item) => item.entityId === entityId) : details;
      return { code: 'ok', data: { items } };
    }
    let res = [...db.decisions];
    if (skuId) res = res.filter(d => d.skuId === skuId);
    if (entityId) res = res.filter(d => d.entityId === entityId);
    // Sort descending by created time
    res.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { code: 'ok', data: { items: res } };
  },

  updateDecision: async (decisionId: string, updates: any) => {
    if (!USE_MOCK) {
      if (Array.isArray(updates.actions) && updates.actions.length > 0) {
        const nextAction = updates.actions[updates.actions.length - 1] as ActionRecord;
        await fetchApi<{ actionId: string }>(`/operations/decisions/${decisionId}/actions`, {
          method: 'POST',
          body: JSON.stringify({
            actionType: nextAction.type,
            detail: { description: nextAction.description },
            status: nextAction.status,
          }),
        });
      }
      if (updates.status === 'pending_review') {
        await fetchApi<{ reviewId: string }>(`/operations/decisions/${decisionId}/review`, {
          method: 'POST',
          body: JSON.stringify({ reviewStatus: 'pending_review', rationale: 'pending business review' }),
        });
      }
      if (updates.status === 'needs_adjustment') {
        await fetchApi<{ reviewId: string }>(`/operations/decisions/${decisionId}/review`, {
          method: 'POST',
          body: JSON.stringify({ reviewStatus: 'needs_adjustment', rationale: 'marked for adjustment from flywheel workbench' }),
        });
      }
      if (updates.feedback) {
        const feedback = updates.feedback as FeedbackRecord;
        await fetchApi<{ feedbackId: string }>(`/operations/decisions/${decisionId}/feedback`, {
          method: 'POST',
          body: JSON.stringify({
            feedbackType: 'business_review',
            metricName: 'review_summary',
            source: 'flywheel_workbench',
            sourceType: 'user_input',
            qualityFlags: [],
            rawMetrics: {
              summary: feedback.summary,
              effectJudgment: feedback.effectJudgment,
              audienceDeviation: feedback.audienceDeviation,
              adjustments: feedback.adjustments,
            },
          }),
        });
        await fetchApi<{ reviewId: string }>(`/operations/decisions/${decisionId}/review`, {
          method: 'POST',
          body: JSON.stringify({
            reviewStatus: updates.status === 'needs_adjustment' ? 'needs_adjustment' : 'verified',
            rationale: feedback.summary,
            adjustmentDetail: { adjustments: feedback.adjustments },
          }),
        });
      }
      const detail = await fetchApi<Record<string, unknown>>(`/operations/decisions/${decisionId}`);
      return { code: 'ok', data: normalizeOperationDecision(detail.data) };
    }
    const idx = db.decisions.findIndex(d => d.decisionId === decisionId);
    if (idx === -1) throw new Error('Decision not found');
    db.decisions[idx] = { ...db.decisions[idx], ...updates, updatedAt: new Date().toISOString() };
    return { code: 'ok', data: db.decisions[idx] };
  },

  getDbOverview: async () => {
    if (!USE_MOCK) {
      const res = await fetchApi<any>('/admin/database/overview');
      const d = res.data;
      return {
        code: 'ok',
        data: {
          workspaceId: String(d.workspaceId || d.workspace || 'ws_demo'),
          databaseStatus: String(d.databaseStatus || 'online'),
          schemaVersion: String(d.schemaVersion || ''),
          migrationStatus: typeof d.migrationStatus === 'object' && d.migrationStatus ? d.migrationStatus : { total: 0, applied: 0, pending: 0, failed: 0 },
          tableCount: Number(d.tableCount || 0),
          viewCount: Number(d.viewCount || 0),
          totalRows: Number(d.totalRows || 0),
          lastImportTime: d.lastImportTime ? String(d.lastImportTime) : null,
          hasMockData: Boolean(d.hasMockData),
          hasSmokeData: Boolean(d.hasSmokeData),
          hasE2eData: Boolean(d.hasE2eData),
          hasUserAuthorizedData: Boolean(d.hasUserAuthorizedData),
        } as DbOverview
      };
    }
    return {
      code: 'ok',
      data: {
        workspaceId: 'ws_demo',
        databaseStatus: 'online',
        schemaVersion: '20260703_01_init',
        migrationStatus: { total: 5, applied: 5, pending: 0, failed: 0 },
        tableCount: 12,
        viewCount: 2,
        totalRows: 1420,
        lastImportTime: new Date().toISOString(),
        hasMockData: true,
        hasSmokeData: true,
        hasE2eData: false,
        hasUserAuthorizedData: false,
      } as DbOverview
    };
  },

  getDbTables: async () => {
    if (!USE_MOCK) {
      const res = await fetchApi<{ tables: any[] }>('/admin/database/tables');
      return {
        code: 'ok',
        data: {
          items: (res.data.tables || []).map(t => ({
            name: String(t.name),
            type: t.type === 'view' ? 'view' : 'table',
            rowCount: Number(t.rowCount ?? t.row_count ?? 0),
            domain: String(t.domain || ''),
            isSystem: Boolean(t.isSystem ?? t.is_system),
            isClearable: Boolean(t.truncatable ?? t.isClearable ?? t.is_clearable),
            isDeletable: Boolean(t.droppable ?? t.isDeletable ?? t.is_deletable)
          })) as DbTableInfo[]
        }
      };
    }
    return {
      code: 'ok',
      data: {
        items: [
          { name: 'sku', type: 'table', rowCount: 150, domain: 'D', isSystem: false, isClearable: true, isDeletable: true },
          { name: 'channel_profile', type: 'table', rowCount: 80, domain: 'D', isSystem: false, isClearable: true, isDeletable: true },
          { name: 'match_result', type: 'table', rowCount: 320, domain: 'A', isSystem: false, isClearable: true, isDeletable: true },
          { name: 'schema_migration', type: 'table', rowCount: 5, domain: 'X', isSystem: true, isClearable: false, isDeletable: false },
          { name: 'db_admin_audit', type: 'table', rowCount: 45, domain: 'X', isSystem: true, isClearable: false, isDeletable: false },
        ] as DbTableInfo[]
      }
    };
  },

  getDbSchema: async (tableName: string) => {
    if (!USE_MOCK) return fetchApi<DbSchemaInfo>(`/admin/database/tables/${tableName}/schema`);
    return { code: 'ok', data: { sql: `CREATE TABLE ${tableName} (\n  id TEXT PRIMARY KEY,\n  created_at TEXT\n);` } as DbSchemaInfo };
  },

  getDbSample: async (tableName: string) => {
    if (!USE_MOCK) {
      const res = await fetchApi<any>(`/admin/database/tables/${tableName}/sample?limit=50`);
      const rawRows = res.data.rows || [];
      let columns: string[] = [];
      let rows: any[][] = [];
      if (rawRows.length > 0) {
        columns = Object.keys(rawRows[0]);
        rows = rawRows.map((r: any) => columns.map(c => r[c]));
      }
      return {
        code: 'ok',
        data: {
          columns,
          rows
        } as DbSampleInfo
      };
    }
    return {
      code: 'ok',
      data: {
        columns: ['id', 'created_at', 'status'],
        rows: [
          ['1', '2026-07-01T10:00:00Z', 'active'],
          ['2', '2026-07-02T11:30:00Z', 'inactive']
        ]
      } as DbSampleInfo
    };
  },

  getDbMigrations: async () => {
    if (!USE_MOCK) {
      const res = await fetchApi<{ migrations: any[] }>('/admin/database/migrations');
      return {
        code: 'ok',
        data: {
          items: (res.data.migrations || []).map(m => ({
            version: String(m.version),
            name: String(m.name),
            appliedAt: String(m.appliedAt ?? m.applied_at),
            status: String(m.status),
            checksum: String(m.checksum)
          })) as DbMigration[]
        }
      };
    }
    return {
      code: 'ok',
      data: {
        items: [
          { version: '20260703_01_init', name: 'init_schema', appliedAt: '2026-07-03T10:00:00Z', status: 'applied', checksum: 'abcd123' },
          { version: '20260703_02_seed', name: 'seed_demo_data', appliedAt: '2026-07-03T10:05:00Z', status: 'applied', checksum: 'efgh456' }
        ] as DbMigration[]
      }
    };
  },

  getDbVersions: async () => {
    if (!USE_MOCK) {
      const res = await fetchApi<{ versions: any[] }>('/admin/database/versions');
      return {
        code: 'ok',
        data: {
          items: (res.data.versions || []).map(v => ({
            dataVersion: String(v.dataVersion ?? v.data_version),
            source: String(v.source),
            sourceType: String(v.sourceType ?? v.source_type),
            rowCount: Number(v.rowCount ?? v.row_count ?? 0),
            createdAt: String(v.createdAt ?? v.created_at)
          })) as DbDataVersion[]
        }
      };
    }
    return {
      code: 'ok',
      data: {
        items: [
          { dataVersion: 'v1.0.0', source: 'demo_data.csv', sourceType: 'system_init', rowCount: 1500, createdAt: '2026-07-03T10:10:00Z' }
        ] as DbDataVersion[]
      }
    };
  },

  getDbImportJobs: async () => {
    if (!USE_MOCK) {
      const res = await fetchApi<{ jobs: any[] }>('/admin/database/import-jobs');
      return {
        code: 'ok',
        data: {
          items: (res.data.jobs || []).map(j => ({
            jobId: String(j.jobId ?? j.job_id),
            sourceType: String(j.sourceType ?? j.source_type),
            status: String(j.status),
            rowCount: Number(j.rowCount ?? j.row_count ?? 0),
            successCount: Number(j.successCount ?? j.success_count ?? 0),
            errorCount: Number(j.errorCount ?? j.error_count ?? 0),
            startedAt: String(j.startedAt ?? j.started_at),
            completedAt: j.completedAt || j.completed_at ? String(j.completedAt ?? j.completed_at) : null
          })) as DbImportJob[]
        }
      };
    }
    return {
      code: 'ok',
      data: {
        items: [
          { jobId: 'job_123', sourceType: 'demo', status: 'succeeded', rowCount: 1500, successCount: 1500, errorCount: 0, startedAt: '2026-07-03T10:05:00Z', completedAt: '2026-07-03T10:06:00Z' }
        ] as DbImportJob[]
      }
    };
  },

  getDbAuditEvents: async () => {
    if (!USE_MOCK) {
      const res = await fetchApi<{ events: any[] }>('/admin/database/audit-events');
      return {
        code: 'ok',
        data: {
          items: (res.data.events || []).map(e => ({
            eventId: String(e.eventId ?? e.audit_id),
            operation: String(e.operation),
            target: String(e.target ?? e.target_name),
            status: String(e.status),
            error: e.error ? String(e.error) : null,
            createdAt: String(e.createdAt ?? e.created_at),
            snapshot: e.snapshot
          })) as DbAuditEvent[]
        }
      };
    }
    return {
      code: 'ok',
      data: {
        items: [
          { eventId: 'evt_1', operation: 'init_workspace', target: 'ws_demo', status: 'success', error: null, createdAt: '2026-07-03T10:00:00Z', snapshot: { schemaVersion: '20260703_01_init' } }
        ] as DbAuditEvent[]
      }
    };
  },

  dryRunDbOperation: async (operation: string, target: string, adminToken: string = 'pls-admin-token') => {
    if (!USE_MOCK) {
      const { path, method } = getDbOpRoute(operation, target);
      const isImport = operation === 'IMPORT';
      const bodyPayload = isImport ? { packageType: target } : { dryRun: true };
      const dryRunPath = isImport ? `${path}/dry-run` : path;

      const res = await fetchApi<any>(dryRunPath, {
        method,
        headers: {
          'X-PLS-Admin-Token': adminToken,
          'Idempotency-Key': `dry_run_${operation}_${target}_${Date.now()}`
        },
        body: JSON.stringify(bodyPayload)
      });
      const impact = res.data || {};
      const warnings: string[] = impact.warnings || [];
      const hasAuditHistory = warnings.some(w => w.includes('protected system tables') || w.includes('audit/task') || w.includes('audit'));
      
      return {
        code: 'ok',
        data: {
          affectedTables: impact.affectedTables || [target],
          affectedRows: impact.affectedRows || 0,
          hasUserAuthorized: !!impact.containsUserAuthorized || !!impact.isUserAuthorized,
          hasAuditHistory: hasAuditHistory,
          qualityReport: impact.qualityReport,
          warnings: impact.warnings || [],
          requiredConfirmText: impact.requiredConfirmText || ''
        } as DbOperationDryRunResult
      };
    }
    return {
      code: 'ok',
      data: {
        affectedTables: target === 'ws_demo' ? ['sku', 'match_result'] : [target],
        affectedRows: target === 'ws_demo' ? 1420 : 150,
        hasUserAuthorized: true,
        hasAuditHistory: true,
        warnings: ['Mock warning: This is a high-risk operation'],
        requiredConfirmText: operation === 'CLEAR_TABLE' ? `TRUNCATE ${target}` : operation === 'DROP_TABLE' ? `DROP ${target}` : operation === 'DELETE_VERSION' ? `DELETE VERSION ${target}` : operation === 'APPLY_MIGRATIONS' ? 'APPLY MIGRATIONS' : operation === 'IMPORT' ? `IMPORT ${target}` : `${operation} ${target}`
      } as DbOperationDryRunResult
    };
  },

  executeDbOperation: async (operation: string, target: string, confirmText: string, adminToken: string = 'pls-admin-token') => {
    if (!USE_MOCK) {
      const { path, method } = getDbOpRoute(operation, target);
      const bodyPayload = operation === 'IMPORT' ? { packageType: target, confirmText } : { confirmText };
      const res = await fetchApi<any>(path, {
        method,
        headers: { 
          'X-PLS-Admin-Token': adminToken,
          'Idempotency-Key': `${operation}_${target}_${Date.now()}` 
        },
        body: JSON.stringify(bodyPayload)
      });
      return { code: 'ok', data: { success: true, ...res.data } as DbOperationExecuteResult };
    }
    
    let expected = operation === 'CLEAR_TABLE' ? `TRUNCATE ${target}` : operation === 'DROP_TABLE' ? `DROP ${target}` : operation === 'DELETE_VERSION' ? `DELETE VERSION ${target}` : operation === 'APPLY_MIGRATIONS' ? 'APPLY MIGRATIONS' : operation === 'IMPORT' ? `IMPORT ${target}` : `${operation} ${target}`;

    if (confirmText !== expected) {
      return Promise.reject(new Error('Confirmation text does not match.'));
    }
    return { code: 'ok', data: { success: true, status: 'success', auditId: 'mock_audit_123', afterSnapshot: { mock: 'snapshot' } } as DbOperationExecuteResult };
  },

  dryRunCsvIngestion: async (file: File, targetTable: string) => {
    if (!CSV_ALLOWED_TABLES.includes(targetTable)) {
      throw new Error(`Target table "${targetTable}" is not supported for CSV import.`);
    }

    if (!USE_MOCK) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('targetTable', targetTable);

      const res = await fetch('/api/v0/admin/data-ingestion/csv/dry-run', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer pls-p0-demo-token',
          'X-PLS-Workspace': 'ws_demo'
        },
        body: formData
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody?.error?.message || `API Error: ${res.status}`);
      }

      const result = await res.json();
      const impact = result.data || {};
      const warnings: string[] = impact.warnings || [];
      const hasAuditHistory = warnings.some(w => w.includes('protected system tables') || w.includes('audit/task') || w.includes('audit'));

      return {
        code: 'ok',
        data: {
          affectedTables: impact.affectedTables || [targetTable],
          affectedRows: impact.affectedRows || 0,
          hasUserAuthorized: !!impact.containsUserAuthorized || !!impact.isUserAuthorized,
          hasAuditHistory,
          qualityReport: impact.qualityReport,
          warnings,
          requiredConfirmText: impact.requiredConfirmText || '',
          stagedFileId: impact.stagedFileId || ''
        } as DbOperationDryRunResult
      };
    }

    const content = await readFileText(file);
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    const rawHeaders = lines.length > 0 ? parseCsvLine(lines[0]) : [];
    const normalizedHeaders = rawHeaders.map(normalizeCsvHeader);
    const headerSet = new Set(normalizedHeaders.filter(h => h !== ''));

    const requiredColumns = CSV_REQUIRED_COLUMNS[targetTable] || [];
    const missingColumns = requiredColumns.filter(req => !headerSet.has(req));
    const extraColumns = rawHeaders
      .map((h, i) => ({ raw: h, norm: normalizedHeaders[i] }))
      .filter(({ norm }) => norm !== '' && !requiredColumns.includes(norm))
      .map(({ raw }) => raw);

    const sampleErrors: CsvQualityReport['sampleErrors'] = [];
    const warnings: CsvQualityReport['warnings'] = [];

    for (const col of missingColumns) {
      sampleErrors.push({ rowNumber: 1, column: col, rule: 'missing_required_column', message: `Required column "${col}" is missing from CSV header`, rawValue: '' });
    }

    for (const col of extraColumns) {
      warnings.push({ rowNumber: null, column: col, message: `CSV column "${col}" is not in target table "${targetTable}" and will be ignored` });
    }

    if (file.name.toLowerCase().includes('blocking')) {
      sampleErrors.push({ rowNumber: 1, column: '', rule: 'mock_blocking_error', message: 'Simulated blocking error', rawValue: '' });
    }

    if (file.name.toLowerCase().includes('type_error')) {
      sampleErrors.push({ rowNumber: 2, column: 'sample_size', rule: 'type_conversion_failed', message: "Expected INTEGER, got 'N/A'", rawValue: 'N/A' });
    }

    const rowCount = Math.max(0, lines.length - 1);
    const blockingErrors = sampleErrors.length;
    const errorRows = blockingErrors > 0 ? rowCount : 0;
    const validRows = blockingErrors > 0 ? 0 : rowCount;
    const typeErrors = file.name.toLowerCase().includes('type_error') ? 1 : 0;

    const stagedFileId = `csv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const requiredConfirmText = `IMPORT CSV ${targetTable}`;

    const qualityReport: CsvQualityReport = {
      rowCount,
      validRows,
      errorRows,
      missingColumns,
      extraColumns,
      typeErrors,
      sampleErrors,
      warnings,
      blockingErrors,
      requiredConfirmText
    };

    return {
      code: 'ok',
      data: {
        affectedTables: [targetTable],
        affectedRows: validRows,
        hasUserAuthorized: true,
        hasAuditHistory: false,
        qualityReport,
        warnings: warnings.map(w => w.message),
        requiredConfirmText,
        stagedFileId
      } as DbOperationDryRunResult
    };
  },

  executeCsvIngestion: async (stagedFileId: string, targetTable: string, confirmText: string) => {
    if (!USE_MOCK) {
      const res = await fetchApi<CsvIngestionExecuteResponse>('/admin/data-ingestion/csv/import', {
        method: 'POST',
        headers: {
          'X-PLS-Admin-Token': 'pls-admin-token',
          'Idempotency-Key': `csv_import_${stagedFileId}_${Date.now()}`
        },
        body: JSON.stringify({ stagedFileId, targetTable, confirmText })
      });
      return { code: 'ok', data: { success: true, ...res.data } as DbOperationExecuteResult };
    }

    const expected = `IMPORT CSV ${targetTable}`;
    if (confirmText !== expected) {
      throw new Error('Confirmation text does not match.');
    }
    return {
      code: 'ok',
      data: {
        success: true,
        status: 'success',
        auditId: `audit_${Date.now()}`,
        beforeSnapshot: { tableRowCounts: { [targetTable]: 0 } },
        afterSnapshot: { tableRowCounts: { [targetTable]: 1 } },
        warnings: []
      } as DbOperationExecuteResult
    };
  },

  // ----------------------------------------------------
  // Tools Module API
  // ----------------------------------------------------
  getTools: async () => {
    if (!USE_MOCK) {
      const res = await fetchApi<{ tools: import('../types').ToolDefinition[] }>('/tools');
      return { code: 'ok', data: { items: res.data.tools } };
    }
    return {
      code: 'ok',
      data: {
        items: [
          {
            toolId: 'extract-sycm-member',
            name: '生意参谋人群提取',
            category: 'profile_extract',
            version: '1.0.0',
            riskLevel: 'L2',
            inputFormats: ['.csv', '.xlsx'],
            outputFormats: ['package'],
            parameterSchema: { type: 'object', properties: { platform: { type: 'string' } } },
            packageType: 'profile-extract',
            description: '从生意参谋导出的交易人群报表中提取核心画像和标签'
          } as import('../types').ToolDefinition,
          {
            toolId: 'aggregate-order-detail',
            name: '订单明细聚合',
            category: 'business_aggregate',
            version: '1.0.0',
            riskLevel: 'L2',
            inputFormats: ['.csv'],
            outputFormats: ['package'],
            parameterSchema: { type: 'object', properties: {} },
            packageType: 'business-aggregate',
            description: '将原始订单明细数据聚合为 sku/channel 粒度的表现指标'
          } as import('../types').ToolDefinition
        ]
      }
    };
  },

  getToolRuns: async () => {
    if (!USE_MOCK) {
      const res = await fetchApi<{ runs: import('../types').ToolRun[] }>('/tools/runs');
      return { code: 'ok', data: { items: res.data.runs } };
    }
    return {
      code: 'ok',
      data: {
        items: []
      }
    };
  },

  getToolRun: async (runId: string) => {
    if (!USE_MOCK) {
      const res = await fetchApi<{ run: import('../types').ToolRun }>(`/tools/runs/${runId}`);
      return { code: 'ok', data: res.data.run };
    }
    const run = db.toolRuns.find(r => r.runId === runId);
    if (run) {
      return { code: 'ok', data: run };
    }
    return {
      code: 'ok',
      data: {
        runId,
        toolId: 'extract-sycm-member',
        workspaceId: 'ws_demo',
        status: 'succeeded',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        inputPath: '/mock/path/input.csv',
        outputDir: '/mock/path/output',
        parameters: {},
        artifacts: [
          { artifactId: 'a1', name: 'report.md', type: 'markdown', path: '/mock/path/output/report.md' },
          { artifactId: 'a2', name: 'quality_report.json', type: 'json', path: '/mock/path/output/quality_report.json' }
        ],
        warnings: [],
        errors: [],
        qualityReport: { generatedAt: new Date().toISOString(), records: 100 }
      } as import('../types').ToolRun
    };
  },

  getToolArtifactContent: async (runId: string, artifactId: string) => {
    if (!USE_MOCK) {
      const res = await fetch(`/api/v0/tools/runs/${runId}/artifacts/${artifactId}`, {
        headers: { 
          'X-PLS-Workspace': 'ws_demo',
          'Authorization': 'Bearer pls-p0-demo-token'
        }
      });
      if (!res.ok) throw new Error('Failed to fetch artifact');
      return res.text();
    }
    return Promise.resolve("Mock artifact content for " + artifactId);
  },

  executeToolRunDryRun: async (toolId: string, payload: any) => {
    if (!USE_MOCK) {
      const res = await fetchApi<any>('/tools/runs/dry-run', {
        method: 'POST',
        body: JSON.stringify({ toolId, ...payload })
      });
      return {
        code: 'ok',
        data: {
          isValid: res.data.status === 'planned' && (!res.data.errors || res.data.errors.length === 0),
          warnings: res.data.warnings || [],
          errors: res.data.errors || []
        }
      };
    }
    return {
      code: 'ok',
      data: {
        isValid: true,
        warnings: ['Mock: File path will be resolved locally'],
        errors: []
      }
    };
  },

  runSingleProductPortrait: async (params: { skuId: string; packageId: string }) => {
    if (!USE_MOCK) {
      const res = await fetchApi<{ run: ToolRun }>('/tools/runs', {
        method: 'POST',
        body: JSON.stringify({ toolId: 'single-product-portrait', parameters: params })
      });
      return { code: 'ok', data: res.data.run };
    }
    const runId = `run_${Date.now()}`;
    const newRun: ToolRun = {
      runId,
      toolId: 'single-product-portrait',
      workspaceId: 'ws_demo',
      status: 'succeeded',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      inputPath: '',
      outputDir: '',
      parameters: params,
      artifacts: [
        { artifactId: 'prediction.json', name: 'prediction.json', type: 'application/json', path: 'artifacts/prediction.json' }
      ],
      warnings: [],
      errors: []
    };
    db.toolRuns.push(newRun);
    
    // Auto-populate mock DB so Heatmap works in E2E tests
    if (!db.products.find(p => p.skuId === params.skuId)) {
      db.products.push({ skuId: params.skuId, productName: `E2E Product ${params.skuId}`, productKey: params.skuId, brand: 'Mock', gender: '女', category: 'T恤', season: 'Q3', year: 2026, status: 'draft', tags: [] } as any);
    }
    const fakePredId = `pred_${Date.now()}`;
    db.predictions.push({ predictionId: fakePredId, skuId: params.skuId, generatedAt: new Date().toISOString() } as any);
    api.createMatches(fakePredId).catch(() => {});
    
    return { code: 'ok', data: newRun };
  },



  getToolArtifact: async (runId: string, artifactPath: string) => {
    if (!USE_MOCK) {
      const res = await fetch(`/api/v0/tools/runs/${runId}/artifacts/${artifactPath}`, {
        headers: { 
          'X-PLS-Workspace': 'ws_demo',
          'Authorization': 'Bearer pls-p0-demo-token'
        }
      });
      if (!res.ok) throw new Error('Failed to fetch artifact');
      const data = await res.json() as SingleProductPortraitPrediction;
      return { code: 'ok', data };
    }
    
    // Return mock artifact
    const mockPrediction: SingleProductPortraitPrediction = {
      skuId: "mock_sku_101",
      generatedAt: new Date().toISOString(),
      modelVersion: "single-product-portrait-rule-baseline-0.1",
      modelPath: "rule_baseline",
      sourceType: "derived",
      anchorSkuId: "10A326100109",
      inputCoverage: {
        requiredFieldCoverage: 1,
        optionalSignalCoverage: 0.5,
        usedFields: ["gender", "category"],
        missingFields: []
      },
      platformPortraitRows: [],
      dimensionSummaries: [
        {
          labelType: '预测性别',
          topLabels: [{ label: 'gender.female', share: 0.95, tgi: null, confidence: 0.9 }],
          qualityFlags: []
        },
        {
          labelType: '预测年龄段',
          topLabels: [{ label: 'demo.age_25_34', share: 0.79, tgi: 120, confidence: 0.8 }, { label: 'demo.age_18_24', share: 0.15, tgi: 100, confidence: 0.5 }],
          qualityFlags: []
        },
        {
          labelType: '八大消费群体',
          topLabels: [{ label: 'group.white_collar', share: 0.65, tgi: null, confidence: 0.7 }],
          qualityFlags: []
        },
        {
          labelType: '预测消费能力',
          topLabels: [{ label: 'price.mid', share: 0.65, tgi: null, confidence: 0.6 }],
          qualityFlags: []
        },
        {
          labelType: '城市等级',
          topLabels: [{ label: 'city.tier_1_2', share: 0.55, tgi: null, confidence: 0.5 }],
          qualityFlags: []
        },
        {
          labelType: '抖音视频观看兴趣分类',
          topLabels: [{ label: 'interest.fashion', share: 0.8, tgi: null, confidence: 0.8 }],
          qualityFlags: []
        },
        {
          labelType: '地域',
          topLabels: [{ label: 'region.east', share: 0.5, tgi: null, confidence: 0.4 }],
          qualityFlags: []
        },
        {
          labelType: '品牌偏好',
          topLabels: [{ label: 'brand.fast_fashion', share: 0.4, tgi: null, confidence: 0.4 }],
          qualityFlags: []
        }
      ],
      plsBridge: {
        predictedProfileTags: [
          { tagId: 'gender.female', score: 0.95, confidence: 0.9, source: '' }
        ],
        unmappedPlatformLabels: [
          { labelType: '品牌偏好', label: '某些长尾品牌偏好', reason: 'unmapped' }
        ],
        bridgeCoverageRate: 0.85
      },
      riskFlags: ['baseline_not_trained_model', 'single_anchor_only', 'manual_rule_weight'],
      explanationSources: [
        {
          sourceField: 'styleKeywords',
          sourceValue: 'minimal',
          ruleId: 'rule_style_minimal',
          targetLabelType: 'style',
          targetLabel: 'style.minimal',
          effect: 'increase',
          weight: 0.8,
          rationale: '基于款式特征 "minimal" 匹配核心风格'
        }
      ]
    };
    return { code: 'ok', data: mockPrediction };
  },

  executeToolRun: async (toolId: string, payload: any) => {
    if (!USE_MOCK) {
      const res = await fetchApi<{ run: import('../types').ToolRun }>('/tools/runs', {
        method: 'POST',
        body: JSON.stringify({ toolId, ...payload })
      });
      return { code: 'ok', data: res.data.run };
    }
    return {
      code: 'ok',
      data: {
        runId: `run_${Date.now()}`,
        toolId,
        workspaceId: 'ws_demo',
        status: 'succeeded',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        inputPath: payload.inputPath,
        outputDir: payload.outputDir,
        parameters: payload.parameters,
        artifacts: [
          { artifactId: 'a1', name: 'report.md', type: 'markdown', path: 'report.md' },
          { artifactId: 'a2', name: 'extracted_profiles.jsonl', type: 'jsonl', path: 'extracted_profiles.jsonl' }
        ],
        warnings: [],
        errors: [],
        qualityReport: { generatedAt: new Date().toISOString(), records: 1500 }
      } as import('../types').ToolRun
    };
  },

  importToolRunDryRun: async (runId: string) => {
    if (!USE_MOCK) return fetchApi<DbOperationDryRunResult>(`/tools/runs/${runId}/import-dry-run`, { method: 'POST' });
    return {
      code: 'ok',
      data: {
        affectedTables: ['channel_profile'],
        affectedRows: 1500,
        hasUserAuthorized: true,
        hasAuditHistory: true,
        warnings: ['This will overwrite existing data for the same time window.'],
        requiredConfirmText: `IMPORT TOOL RUN ${runId}`,
        qualityReport: { source: 'extract-sycm-member', validRows: 1500 }
      } as DbOperationDryRunResult
    };
  },

  importToolRun: async (runId: string, confirmText: string) => {
    if (!USE_MOCK) return fetchApi<DbOperationExecuteResult>(`/tools/runs/${runId}/import`, {
      method: 'POST',
      headers: { 
        'X-PLS-Admin-Token': 'pls-admin-token',
        'Idempotency-Key': `import_tool_${runId}_${Date.now()}`
      },
      body: JSON.stringify({ confirmText })
    });
    
    if (confirmText !== `IMPORT TOOL RUN ${runId}`) {
      throw new Error('Confirmation text does not match.');
    }
    
    return {
      code: 'ok',
      data: {
        success: true,
        auditId: `audit_${Date.now()}`,
        status: 'success'
      } as DbOperationExecuteResult
    };
  },

  // ----------------------------------------------------
  // Simulated Market API
  // ----------------------------------------------------
  getSimulatedMarketAgentTemplates: async (): Promise<{ code: string; data: { agents: TargetUserAgent[]; subagents: TargetUserAgent[] } }> => {
    if (!USE_MOCK) return fetchApi<{ agents: TargetUserAgent[]; subagents: TargetUserAgent[] }>('/simulated-market/agent-templates');
    return {
      code: 'ok',
      data: {
        agents: mockSimulatedMarketAgentTemplates,
        subagents: db.simulatedMarketSubagents.filter((agent) => agent.enabled).map(toAgentCandidateFromSubagent),
      },
    };
  },

  getSimulatedMarketSubagents: async (enabled?: boolean): Promise<{ code: string; data: { items: SimulatedMarketSubagent[] } }> => {
    if (!USE_MOCK) {
      const qs = enabled === undefined ? '' : `?enabled=${String(enabled)}`;
      return fetchApi<{ items: SimulatedMarketSubagent[] }>(`/simulated-market/subagents${qs}`);
    }
    let items = [...db.simulatedMarketSubagents];
    if (enabled !== undefined) items = items.filter((agent) => agent.enabled === enabled);
    return { code: 'ok', data: { items } };
  },

  createSimulatedMarketSubagent: async (input: CreateSimulatedMarketSubagentInput): Promise<{ code: string; data: SimulatedMarketSubagent }> => {
    if (!USE_MOCK) {
      return fetchApi<SimulatedMarketSubagent>('/simulated-market/subagents', {
        method: 'POST',
        body: JSON.stringify(input),
        headers: { 'Idempotency-Key': `subagent_${Date.now()}` },
      });
    }
    const subagent = buildMockSubagent(input);
    db.simulatedMarketSubagents.push(subagent);
    return { code: 'ok', data: subagent };
  },

  updateSimulatedMarketSubagent: async (agentId: string, input: UpdateSimulatedMarketSubagentInput): Promise<{ code: string; data: SimulatedMarketSubagent }> => {
    if (!USE_MOCK) {
      return fetchApi<SimulatedMarketSubagent>(`/simulated-market/subagents/${agentId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
        headers: { 'Idempotency-Key': `subagent_update_${Date.now()}` },
      });
    }
    const idx = db.simulatedMarketSubagents.findIndex((agent) => agent.agentId === agentId);
    if (idx === -1) throw new Error(`Subagent ${agentId} not found`);
    const existing = db.simulatedMarketSubagents[idx];
    const updated: SimulatedMarketSubagent = {
      ...existing,
      ...input,
      persona: input.persona ?? existing.persona,
      profile: input.profile ?? existing.profile,
      updatedAt: new Date().toISOString(),
    };
    db.simulatedMarketSubagents[idx] = updated;
    return { code: 'ok', data: updated };
  },

  deleteSimulatedMarketSubagent: async (agentId: string): Promise<{ code: string; data: { agentId: string; deleted: boolean } }> => {
    if (!USE_MOCK) {
      return fetchApi<{ agentId: string; deleted: boolean }>(`/simulated-market/subagents/${agentId}`, {
        method: 'DELETE',
        headers: { 'Idempotency-Key': `subagent_delete_${Date.now()}` },
      });
    }
    const before = db.simulatedMarketSubagents.length;
    db.simulatedMarketSubagents = db.simulatedMarketSubagents.filter((agent) => agent.agentId !== agentId);
    return { code: 'ok', data: { agentId, deleted: db.simulatedMarketSubagents.length < before } };
  },

  createSubagentFromChannelObject: async (input: CreateSubagentFromChannelObjectInput): Promise<{ code: string; data: SimulatedMarketSubagent }> => {
    if (!USE_MOCK) {
      return fetchApi<SimulatedMarketSubagent>('/simulated-market/subagents/from-channel-object', {
        method: 'POST',
        body: JSON.stringify(input),
        headers: { 'Idempotency-Key': `subagent_channel_${Date.now()}` },
      });
    }
    seedMockChannelObjects();
    const channelObject = db.channelObjects.find((item) => item.canonicalObjectKey === input.canonicalObjectKey);
    const profile = db.audienceProfiles.find((item) => (
      item.canonicalObjectKey === input.canonicalObjectKey && (!input.profileId || item.profileId === input.profileId)
    ));
    if (!channelObject || !profile) {
      throw new Error(`No audience profile available for channel object ${input.canonicalObjectKey}`);
    }
    const subagent = buildMockSubagent({
      name: input.name?.trim() || `${channelObject.displayName} subagent`,
      enabled: input.enabled ?? true,
      persona: `${channelObject.displayName} 渠道画像派生 subagent`,
      sourceType: 'channel_audience_profile',
      sourceRef: {
        canonicalObjectKey: input.canonicalObjectKey,
        profileId: profile.profileId,
        dataVersion: profile.dataVersion,
      },
      profile: {
        demographics: profile.benchmarkTags?.map((tag) => `${tag.dimension}:${tag.optionLabel}`) ?? [],
        preferences: profile.tags.slice(0, 4).map((tag) => tag.tagId),
        concerns: profile.qualityFlags,
        decisionFactors: profile.interactionPreference ?? [],
      },
      weight: 1,
    });
    db.simulatedMarketSubagents.push(subagent);
    return { code: 'ok', data: subagent };
  },

  createSimulatedMarketRun: async (input: SimulatedMarketInput): Promise<{ code: string; data: SimulationRun }> => {
    if (!USE_MOCK) {
      return fetchApi<SimulationRun>('/simulated-market/runs', {
        method: 'POST',
        body: JSON.stringify(input),
        headers: { 'Idempotency-Key': `sim_${Date.now()}` },
      });
    }
    return { code: 'ok', data: buildMockSimulatedMarketRun(input) };
  },

  getSimulatedMarketRuns: async (cursor?: string, pageSize = 20): Promise<{ code: string; data: SimulatedMarketRunListResponse }> => {
    if (!USE_MOCK) {
      const qs = new URLSearchParams();
      if (cursor) qs.append('cursor', cursor);
      if (pageSize) qs.append('pageSize', String(pageSize));
      return fetchApi<SimulatedMarketRunListResponse>(`/simulated-market/runs?${qs.toString()}`);
    }
    const all = [...db.simulatedMarketRuns].sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
    const size = Math.min(pageSize, 100);
    const startIdx = cursor ? all.findIndex(r => r.generatedAt < cursor) : 0;
    const slice = all.slice(Math.max(0, startIdx), Math.max(0, startIdx) + size + 1);
    const hasMore = slice.length > size;
    const items = slice.slice(0, size);
    return {
      code: 'ok',
      data: {
        items,
        page: {
          cursor: cursor ?? null,
          nextCursor: hasMore ? (items[items.length - 1]?.generatedAt) ?? null : null,
          pageSize: size,
          hasMore,
        },
      },
    };
  },

  getSimulatedMarketRun: async (runId: string): Promise<{ code: string; data: SimulationRun }> => {
    if (!USE_MOCK) return fetchApi<SimulationRun>(`/simulated-market/runs/${runId}`);
    const run = db.simulatedMarketRuns.find(r => r.runId === runId);
    if (!run) throw new Error(`Simulation run ${runId} not found`);
    return { code: 'ok', data: run };
  },
};

function getDbOpRoute(operation: string, target: string): { path: string; method: string } {
  switch (operation) {
    case 'CLEAR_TABLE': return { path: `/admin/database/tables/${target}/truncate`, method: 'POST' };
    case 'DROP_TABLE': return { path: `/admin/database/tables/${target}`, method: 'DELETE' };
    case 'DELETE_VERSION': return { path: `/admin/database/versions/${target}`, method: 'DELETE' };
    case 'RESET': return { path: `/admin/database/rebuild`, method: 'POST' };
    case 'APPLY_MIGRATIONS': return { path: `/admin/database/migrations/apply`, method: 'POST' };
    case 'IMPORT': return { path: `/admin/database/import-jobs`, method: 'POST' };
    default: throw new Error(`Unknown operation: ${operation}`);
  }
}

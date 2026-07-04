import type { SKU, ProductProfile, MatchResult, HeatmapData, ChannelProfile, AccountMatchResult, AccountProfile, ProductCompass, DecisionRecord, ActionRecord, FeedbackRecord, DbOverview, DbTableInfo, DbSchemaInfo, DbSampleInfo, DbMigration, DbDataVersion, DbImportJob, DbAuditEvent, DbOperationDryRunResult, DbOperationExecuteResult } from '../types';

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
  decisions: [] as any[], // DecisionRecord not directly imported here to avoid cycle or just any
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item)) : [];
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
    entityType: 'channel',
    status: toDecisionStatus(row, actions, reviews),
    owner: String(row.createdBy ?? '运营专员'),
    createdAt: String(row.createdAt ?? new Date().toISOString()),
    updatedAt: String(row.updatedAt ?? row.createdAt ?? new Date().toISOString()),
    actions,
    feedback,
  };
}

const mockChannels: ChannelProfile[] = [
  { channelId: 'mock_douyin_live_001', channelName: 'Mock Douyin Live', channelType: 'live_stream', platformType: 'content_ecommerce' },
  { channelId: 'mock_tmall_store', channelName: 'Mock Tmall Store', channelType: 'shelf_ecommerce', platformType: 'traditional_ecommerce' },
  { channelId: 'mock_red_store', channelName: 'Mock RED Store', channelType: 'content_seeding', platformType: 'content_ecommerce' },
  { channelId: 'mock_wechat_miniprogram', channelName: 'Mock WeChat Mini Program', channelType: 'private_domain', platformType: 'social_ecommerce' },
];

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
      unmappedInputTokens: []
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

  createDecision: async (data: any) => {
    if (!USE_MOCK) {
      return fetchApi<{ decisionId: string; status: string }>('/operations/decisions', {
        method: 'POST',
        body: JSON.stringify({
          skuId: data.skuId,
          channelId: data.entityId,
          recommendation: data.recommendation,
          rationale: data.rationale,
          matchId: data.matchId,
          decisionType: 'launch',
          createdBy: data.owner ?? '运营专员',
        })
      });
    }
    const newDecision = {
      decisionId: `dec_${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending_execution',
      owner: data.owner || 'System',
      actions: [],
      ...data
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
  }
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

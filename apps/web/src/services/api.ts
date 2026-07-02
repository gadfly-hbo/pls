import type { SKU, ProductProfile, MatchResult, HeatmapData, ChannelProfile, AccountMatchResult, AccountMatchApiResponse } from '../types';

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
};

const mockChannels: ChannelProfile[] = [
  { channelId: 'mock_douyin_live_001', channelName: 'Mock Douyin Live', channelType: 'live_stream', platformType: 'content_ecommerce' },
  { channelId: 'mock_tmall_store', channelName: 'Mock Tmall Store', channelType: 'shelf_ecommerce', platformType: 'traditional_ecommerce' },
  { channelId: 'mock_red_store', channelName: 'Mock RED Store', channelType: 'content_seeding', platformType: 'content_ecommerce' },
  { channelId: 'mock_wechat_miniprogram', channelName: 'Mock WeChat Mini Program', channelType: 'private_domain', platformType: 'social_ecommerce' },
];

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
      const res = await fetchApi<AccountMatchApiResponse>(`/account-matches?skuId=${skuId}&accountId=${accountId}&pageSize=1`);
      const item = res.data.items?.[0];
      if (!item) {
        throw new Error('Account match not found');
      }

      // Generate View Model for baseline/comparison from the API fields
      const baseline = [
        { dimension: '账号标识', value: item.accountId },
        { dimension: '预测契合度', value: `Fit Score: ${(item.fitScore * 100).toFixed(0)}` }
      ];

      const comparison: AccountMatchResult['comparison'] = [];
      const misSet = new Set(item.mismatchedDimensions || []);
      const posSet = new Set(item.positiveDrivers?.map(d => d.tagId) || []);
      const negSet = new Set(item.negativeDrivers?.map(d => d.tagId) || []);

      const allTags = new Set([...misSet, ...posSet, ...negSet]);
      if (allTags.size === 0) allTags.add('综合标签匹配');

      allTags.forEach(tag => {
        const isAligned = !misSet.has(tag) && !negSet.has(tag);
        comparison.push({
          dimension: tag,
          accountTop1: { label: '账号特征', value: '提取结果' },
          skuTop1: { label: '商品特征', value: isAligned ? '高度吻合' : '存在偏离' },
          isAligned
        });
      });

      const adjustmentAdvice = (item.adjustmentAdvice || []).map((adv, idx) => ({
        id: typeof adv.adviceId === 'number' ? adv.adviceId : (Number(adv.adviceId) || Date.now() + idx),
        item: `[${adv.priority}] ${adv.actionType} - ${adv.dimension}`,
        suggestion: adv.rationale || adv.direction || '建议调整',
        status: 'pending'
      }));

      return { 
        code: 'ok', 
        data: {
          accountId: item.accountId,
          skuId: item.skuId,
          fitScore: item.fitScore,
          fitConfidence: item.fitConfidence,
          baseline,
          comparison,
          mismatchedDimensions: item.mismatchedDimensions || [],
          adjustmentAdvice,
          qualityFlags: item.qualityFlags || []
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
  }
};

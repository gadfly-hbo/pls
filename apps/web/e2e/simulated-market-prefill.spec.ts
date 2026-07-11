import { test, expect, type Route } from '@playwright/test';

function setupSimulatedMarketRouteFallbacks(route: Route) {
  const url = new URL(route.request().url());
  const path = url.pathname;
  const method = route.request().method();

  if (path === '/api/v0/simulated-market/agent-templates' && method === 'GET') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'ok',
        requestId: 'r-test-agent-templates',
        generatedAt: new Date().toISOString(),
        data: {
          agents: [
            {
              agentId: 'agent-template-a',
              name: 'A / 质感流行派',
              sourceType: 'three_audience_segment',
              sourceRef: { segmentCode: 'A', segmentName: '质感流行派', profileVersion: 'v1' },
              profile: {
                demographics: ['京东平台目标人群'],
                preferences: ['设计感', '质感', '细节工艺'],
                concerns: ['撞款', '廉价感'],
                decisionFactors: ['面料质感', '剪裁细节'],
              },
              weight: 1,
            },
          ],
        },
      }),
    });
  }

  if (path === '/api/v0/simulated-market/runs' && method === 'POST') {
    const body = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'ok',
        requestId: 'r-test-create-run',
        generatedAt: new Date().toISOString(),
        data: {
          runId: 'sim_20260701_0001',
          workspaceId: 'ws_demo',
          status: 'succeeded',
          inputSnapshot: body,
          result: {
            overall: {
              acceptanceScore: 62,
              purchaseIntentScore: 55,
              confidence: 0.65,
              opportunitySummary: ['机会点'],
              riskSummary: ['风险点'],
              recommendedAdjustments: ['建议'],
            },
            agentFeedback: [
              {
                agentId: 'agent-template-a',
                acceptanceScore: 65,
                purchaseIntentScore: 58,
                positiveDrivers: ['驱动'],
                objections: ['顾虑'],
                quoteSummary: '反馈摘要',
                suggestedAdjustment: '建议调整',
              },
            ],
          },
          provider: 'deterministic_fallback',
          modelVersion: 'deterministic-fallback-0.1',
          generatedAt: new Date().toISOString(),
            qualityFlags: ['llm_unavailable_fallback_used'],
        },
      }),
    });
  }

  if (path === '/api/v0/simulated-market/runs' && method === 'GET') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'ok',
        requestId: 'r-test-list-runs',
        generatedAt: new Date().toISOString(),
        data: {
          items: [],
          page: { cursor: null, nextCursor: null, pageSize: 20, hasMore: false },
        },
      }),
    });
  }

  return null;
}

function setupPortraitRouteFallbacks(route: Route) {
  const url = new URL(route.request().url());
  const path = url.pathname;
  const method = route.request().method();

  if (path === '/api/v0/single-product-portrait/metadata' && method === 'GET') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'ok',
        requestId: 'r-test-portrait-metadata',
        generatedAt: new Date().toISOString(),
        data: {
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
          ],
        },
      }),
    });
  }

  if (path === '/api/v0/single-product-portrait/predict' && method === 'POST') {
    const body = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'ok',
        requestId: 'r-test-portrait-predict',
        generatedAt: new Date().toISOString(),
        data: {
          prediction: {
            skuId: body.skuId,
            generatedAt: new Date().toISOString(),
            modelVersion: 'single-product-portrait-supervised-ridge-0.1',
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
                topLabels: [{ label: '女', share: 0.88, tgi: null, confidence: 0.76 }],
                qualityFlags: [],
              },
              {
                labelType: '预测年龄段',
                topLabels: [{ label: '24-30', share: 0.68, tgi: null, confidence: 0.72 }],
                qualityFlags: [],
              },
              {
                labelType: '预测消费能力',
                topLabels: [{ label: '中消费', share: 0.62, tgi: null, confidence: 0.68 }],
                qualityFlags: [],
              },
              {
                labelType: '城市等级',
                topLabels: [{ label: '新一线', share: 0.36, tgi: null, confidence: 0.52 }],
                qualityFlags: ['low_stability_dimension'],
              },
              {
                labelType: '八大消费群体',
                topLabels: [{ label: '精致妈妈', share: 0.33, tgi: null, confidence: 0.51 }],
                qualityFlags: ['low_stability_dimension'],
              },
              {
                labelType: '预测人生阶段',
                topLabels: [{ label: '职场发展期', share: 0.58, tgi: null, confidence: 0.69 }],
                qualityFlags: [],
              },
            ],
            riskFlags: ['baseline_not_trained_model', 'small_sample_supervised_model', 'no_temporal_validation'],
            explanationSources: [
              {
                sourceField: '版型/面料/FAB',
                sourceValue: `${body.fitType},${body.fabric},style_commute,fabric_cotton`,
                ruleId: 'supervised-ridge-预测年龄段',
                targetLabelType: '预测年龄段',
                targetLabel: '24-30',
                effect: 'increase',
                weight: 0.42,
                rationale: 'Ridge model top positive drivers: style_commute, fabric_cotton, scene_work.',
              },
            ],
          },
        },
      }),
    });
  }

  return null;
}

function setupMatchRouteFallbacks(route: Route) {
  const url = new URL(route.request().url());
  const path = url.pathname;
  const method = route.request().method();

  if (path === '/api/v0/channels/entities' && method === 'GET') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'ok',
        requestId: 'r-test-channels-entities',
        generatedAt: new Date().toISOString(),
        data: {
          items: [
            {
              channelEntityId: 'mock_douyin_live_001',
              entityType: 'account',
              sourceEntityKey: 'mock_douyin_live_001',
              displayName: 'Mock Douyin Live',
              platformType: 'content_ecommerce',
              platformName: '抖音',
              accountKind: 'account',
              performanceMetrics: { sampleSize: 15000 },
              qualityFlags: [],
            },
          ],
        },
      }),
    });
  }

  if (path === '/api/v0/matches/heatmap' && method === 'GET') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'ok',
        requestId: 'r-test-heatmap',
        generatedAt: new Date().toISOString(),
        data: {
          modelVersion: 'm-p0-baseline-0.1',
          generatedAt: new Date().toISOString(),
          rows: [
            {
              skuId: 'MOCK_SKU_001',
              cells: [
                {
                  channelId: 'mock_douyin_live_001',
                  matchScore: 0.85,
                  matchConfidence: 0.72,
                  recommendation: 'priority_launch',
                },
              ],
            },
          ],
        },
      }),
    });
  }

  if (path === '/api/v0/matches' && method === 'GET') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'ok',
        requestId: 'r-test-match-list',
        generatedAt: new Date().toISOString(),
        data: {
          items: [
            {
              matchId: 'match_test_001',
              workspaceId: 'ws_demo',
              taskId: 'task_test_001',
              predictionId: 'pred_test_001',
              skuId: 'MOCK_SKU_001',
              channelId: 'mock_douyin_live_001',
              channelType: 'account',
              modelVersion: 'm-p0-baseline-0.1',
              source: 'm-p0-baseline-0.1',
              sourceType: 'derived',
              generatedAt: new Date().toISOString(),
              matchScore: 0.85,
              matchConfidence: 0.72,
              rank: 1,
              overlap: 0.85,
              bestSegmentId: 'seg_test_001',
              bestSegmentMatch: 0.85,
              positiveDrivers: [{ tagId: 'style.minimal', productScore: 0.74, channelScore: 0.7 }],
              negativeDrivers: [],
              recommendation: 'priority_launch',
              risks: [],
              qualityFlags: [],
            },
          ],
          page: { cursor: null, nextCursor: null, pageSize: 20, hasMore: false },
        },
      }),
    });
  }

  return null;
}

test.describe('Simulated Market Prefill from Upstream Workbenches', () => {
  test('prefills simulated market from single product portrait result and does not auto-run', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK === 'false', 'This test is intended for mock mode only');

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) errors.push(msg.text());
    });

    await page.route('/api/v0/**', async (route) => {
      const matched =
        setupPortraitRouteFallbacks(route) ??
        setupSimulatedMarketRouteFallbacks(route);
      if (matched) return matched;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'ok', requestId: 'r-fallback', generatedAt: new Date().toISOString(), data: {} }),
      });
    });

    await page.goto('/');
    await page.locator('button.app-nav__item', { hasText: '新品预测' }).click();
    await expect(page.getByRole('heading', { name: '单品画像预测' })).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: '填入示例' }).click();
    await page.getByRole('button', { name: '预测单款画像' }).click();

    const singleResult = page.locator('.single-portrait-result').filter({ hasText: '单款画像结果' });
    await expect(singleResult.getByRole('heading', { name: '单款画像结果' })).toBeVisible({ timeout: 15000 });

    const skuInput = page.locator('input#single-sku-id');
    const skuId = await skuInput.inputValue();
    expect(skuId).toBeTruthy();

    await singleResult.getByRole('button', { name: '送入模拟市场' }).click();

    await expect(page.getByText('模拟市场工作台')).toBeVisible({ timeout: 10000 });

    // Prefill applied
    await expect(page.locator('select').first()).toHaveValue('single_product_portrait');
    await expect(page.locator('input[placeholder="例如 pred_20260701_0001"]')).toHaveValue(skuId);
    await expect(page.locator('textarea').first()).toContainText(`SKU: ${skuId}`);
    await expect(page.locator('textarea').first()).toContainText('画像摘要');

    // No auto-run: report area should still show empty state
    await expect(page.getByText('策略压力测试报告')).toBeVisible();
    await expect(page.getByRole('button', { name: '运行模拟' })).toBeVisible();
    await expect(page.locator('.sim-report').first()).not.toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('prefills simulated market from product-channel match detail and does not auto-run (real API contract)', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK !== 'false', 'This test requires VITE_USE_MOCK=false');

    const requests: { url: string; method: string; path: string }[] = [];
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) errors.push(msg.text());
    });

    await page.route('/api/v0/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();
      requests.push({ url: route.request().url(), method, path });

      const matched =
        setupMatchRouteFallbacks(route) ??
        setupSimulatedMarketRouteFallbacks(route);
      if (matched) return matched;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'ok', requestId: 'r-fallback', generatedAt: new Date().toISOString(), data: {} }),
      });
    });

    await page.goto('/');
    await page.locator('button.app-nav__item', { hasText: '货渠匹配' }).click();
    await expect(page.getByRole('heading', { name: '货渠匹配决策工作台' })).toBeVisible({ timeout: 10000 });

    await page.locator('.match-entity-item').first().click();

    const detail = page.locator('.match-workbench__right-content');
    await expect(detail).toBeVisible({ timeout: 10000 });
    await expect(detail.getByRole('button', { name: '模拟目标用户反馈' })).toBeVisible();

    await detail.getByRole('button', { name: '模拟目标用户反馈' }).click();

    await expect(page.getByText('模拟市场工作台')).toBeVisible({ timeout: 10000 });

    // Prefill applied
    await expect(page.locator('select').first()).toHaveValue('product_channel_match');
    await expect(page.locator('input[placeholder="例如 pred_20260701_0001"]')).toHaveValue('match_test_001');
    await expect(page.locator('textarea').first()).toContainText('SKU: MOCK_SKU_001');
    await expect(page.locator('textarea').first()).toContainText('渠道: mock_douyin_live_001');
    await expect(page.locator('input[placeholder="account:mock_account_douyin_style"]')).toHaveValue('mock_douyin_live_001');

    // No auto-run
    await expect(page.getByRole('button', { name: '运行模拟' })).toBeVisible();
    await expect(page.locator('.sim-report').first()).not.toBeVisible();

    // Real routes were hit
    expect(requests.some((r) => r.path === '/api/v0/matches/heatmap' && r.method === 'GET')).toBe(true);
    expect(requests.some((r) => r.path === '/api/v0/channels/entities' && r.method === 'GET')).toBe(true);
    expect(requests.some((r) => r.path === '/api/v0/matches' && r.method === 'GET')).toBe(true);

    expect(errors).toHaveLength(0);
  });
});

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
              opportunitySummary: ['机会点1'],
              riskSummary: ['风险点1'],
              recommendedAdjustments: ['建议1'],
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
          qualityFlags: ['deterministic_fallback_used'],
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

test.describe('Simulated Market to Flywheel Decision Flow', () => {
  test('creates a flywheel decision from simulated market report and shows source summary in mock mode', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK === 'false', 'This test is intended for mock mode only');

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) errors.push(msg.text());
    });

    await page.route('/api/v0/**', async (route) => {
      const matched = setupSimulatedMarketRouteFallbacks(route);
      if (matched) return matched;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'ok', requestId: 'r-fallback', generatedAt: new Date().toISOString(), data: {} }),
      });
    });

    await page.goto('/');
    await page.locator('button[title="模拟市场"]').first().click();
    await expect(page.getByText('模拟市场工作台')).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder('粘贴商品、渠道、活动、价格、卖点、分货或投放建议等策略文本').fill(
      '本季主打修身显瘦通勤连衣裙，采用高支棉面料，主打简约通勤与多场景穿搭。'
    );

    await page.getByRole('button', { name: '运行模拟' }).click();
    await expect(page.getByText('策略压力测试报告')).toBeVisible({ timeout: 15000 });

    const runIdMeta = page.locator('.sim-report__meta-item').nth(1);
    const runId = await runIdMeta.textContent();
    expect(runId).toBeTruthy();

    await page.getByRole('button', { name: '创建经营决策' }).click();

    await expect(page.getByText('创建经营决策')).toBeVisible();
    await page.locator('.sim-decision-form input').first().fill('MOCK_SKU_001');
    await page.locator('.sim-decision-form input').nth(1).fill('mock_douyin_live_001');
    await page.getByRole('button', { name: '确认创建' }).click();

    await expect(page.getByText('经营飞轮与策略闭环')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('模拟市场来源摘要')).toBeVisible();
    const sourcePanel = page.locator('.flywheel-simulation-source');
    await expect(sourcePanel.getByText(runId!)).toBeVisible();
    await expect(sourcePanel.getByText('Derived Result / 非真实市场反馈')).toBeVisible();
    await expect(page.locator('.flywheel-workbench__detail').getByText('MOCK_SKU_001')).toBeVisible();
    await expect(page.locator('.flywheel-workbench__detail').getByText('抖音直播测试渠道')).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('POST /operations/decisions receives simulationRunId and summary in real API contract', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK !== 'false', 'This test requires VITE_USE_MOCK=false');

    const requests: { url: string; method: string; path: string; body?: unknown }[] = [];
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) errors.push(msg.text());
    });

    await page.route('/api/v0/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();

      const matched = setupSimulatedMarketRouteFallbacks(route);
      if (matched) return matched;

      if (path === '/api/v0/operations/decisions' && method === 'POST') {
        const body = route.request().postDataJSON();
        requests.push({ url: route.request().url(), method, path, body });
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'ok',
            requestId: 'r-test-create-decision',
            generatedAt: new Date().toISOString(),
            data: { decisionId: 'dec_20260701_0001', status: 'pending' },
          }),
        });
      }

      if (path === '/api/v0/operations/decisions' && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'ok',
            requestId: 'r-test-list-decisions',
            generatedAt: new Date().toISOString(),
            data: {
              items: [{
                decisionId: 'dec_20260701_0001',
                skuId: 'MOCK_SKU_001',
                channelId: 'mock_douyin_live_001',
                recommendation: 'test_launch',
                status: 'pending_execution',
                createdBy: '运营专员',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                actions: [],
                feedbacks: [],
                reviews: [],
                simulationRunId: 'sim_20260701_0001',
                sourceType: 'manual_strategy',
                sourceRef: { id: 'manual', type: 'manual_strategy' },
                simulationSummary: {
                  acceptanceScore: 62,
                  purchaseIntentScore: 55,
                  confidence: 0.65,
                  opportunitySummary: ['机会点1'],
                  riskSummary: ['风险点1'],
                  recommendedAdjustments: ['建议1'],
                },
              }],
              page: { cursor: null, nextCursor: null, pageSize: 20, hasMore: false },
            },
          }),
        });
      }

      if (path === '/api/v0/operations/decisions/dec_20260701_0001' && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'ok',
            requestId: 'r-test-get-decision',
            generatedAt: new Date().toISOString(),
            data: {
              decisionId: 'dec_20260701_0001',
              skuId: 'MOCK_SKU_001',
              channelId: 'mock_douyin_live_001',
              recommendation: 'test_launch',
              status: 'pending_execution',
              createdBy: '运营专员',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              actions: [],
              feedbacks: [],
              reviews: [],
              simulationRunId: 'sim_20260701_0001',
              sourceType: 'manual_strategy',
              sourceRef: { id: 'manual', type: 'manual_strategy' },
              simulationSummary: {
                acceptanceScore: 62,
                purchaseIntentScore: 55,
                confidence: 0.65,
                opportunitySummary: ['机会点1'],
                riskSummary: ['风险点1'],
                recommendedAdjustments: ['建议1'],
              },
            },
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'ok', requestId: 'r-fallback', generatedAt: new Date().toISOString(), data: {} }),
      });
    });

    await page.goto('/');
    await page.locator('button[title="模拟市场"]').first().click();
    await expect(page.getByText('模拟市场工作台')).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder('粘贴商品、渠道、活动、价格、卖点、分货或投放建议等策略文本').fill(
      '本季主打修身显瘦通勤连衣裙，采用高支棉面料，主打简约通勤与多场景穿搭。'
    );

    await page.getByRole('button', { name: '运行模拟' }).click();
    await expect(page.getByText('策略压力测试报告')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: '创建经营决策' }).click();
    await page.locator('.sim-decision-form input').first().fill('MOCK_SKU_001');
    await page.locator('.sim-decision-form input').nth(1).fill('mock_douyin_live_001');
    await page.getByRole('button', { name: '确认创建' }).click();

    await expect(page.getByText('经营飞轮与策略闭环')).toBeVisible({ timeout: 10000 });

    const decisionRequest = requests.find((r) => r.path === '/api/v0/operations/decisions' && r.method === 'POST');
    expect(decisionRequest).toBeTruthy();
    const body = decisionRequest?.body as Record<string, unknown>;
    expect(body.simulationRunId).toBe('sim_20260701_0001');
    expect(body.skuId).toBe('MOCK_SKU_001');
    expect(body.channelId).toBe('mock_douyin_live_001');
    expect(body.simulationSummary).toBeTruthy();
    expect((body.simulationSummary as Record<string, unknown>).acceptanceScore).toBe(62);

    expect(errors).toHaveLength(0);
  });
});

import { test, expect, type Page, type Route } from '@playwright/test';

const PLACEHOLDER_CHANNEL_ENTITY = 'account:mock_account_douyin_style';
const PLACEHOLDER_MARKETING_EVENT = 'marketing_event:mock_event_618';
const PLACEHOLDER_BUSINESS_SCENARIO = 'business_scenario:new_product_launch:mock_style';

function setupApiRouteFallbacks(page: Page) {
  return page.route('/api/v0/**', async (route: Route) => {
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
      const useLlm = body.marketContext?.channelEntityId === PLACEHOLDER_CHANNEL_ENTITY;
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
                confidence: useLlm ? 0.78 : 0.65,
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
            provider: useLlm ? 'minimax' : 'deterministic_fallback',
            modelVersion: useLlm ? 'minimax-m3' : 'deterministic-fallback-0.1',
            generatedAt: new Date().toISOString(),
            qualityFlags: useLlm ? [] : ['llm_unavailable_fallback_used'],
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

    if (path === '/api/v0/channel-objects' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'ok',
          requestId: 'r-test-channel-objects',
          generatedAt: new Date().toISOString(),
          data: {
            items: [],
            page: { cursor: null, nextCursor: null, pageSize: 20, hasMore: false },
          },
        }),
      });
    }

    // Fallback for all other endpoints to avoid 502 when backend is unavailable
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'ok',
        requestId: 'r-fallback',
        generatedAt: new Date().toISOString(),
        data: {},
      }),
    });
  });
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => {
    console.error('PAGE ERROR:', err.message);
    errors.push(err.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      if (!msg.text().includes('favicon.ico')) {
        console.error('CONSOLE ERROR:', msg.text());
        errors.push(msg.text());
      }
    }
  });
  return errors;
}

test.describe('Simulated Market Workbench', () => {
  test('shows LLM agent label when a real channel object is selected in mock mode', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK === 'false', 'This test is intended for mock mode only');

    const errors = collectErrors(page);

    await page.goto('/');
    await expect(page.getByText('PLS 工作台')).toBeVisible();

    await page.locator('button[title="模拟市场"]').first().click();
    await expect(page.getByText('模拟市场工作台')).toBeVisible();
    await expect(page.getByText('策略输入')).toBeVisible();
    await expect(page.getByText('目标用户 Agent')).toBeVisible();
    await expect(page.getByText('市场场景')).toBeVisible();

    await page.getByPlaceholder('粘贴商品、渠道、活动、价格、卖点、分货或投放建议等策略文本').fill(
      '本季主打修身显瘦通勤连衣裙，采用高支棉面料，主打简约通勤与多场景穿搭，定价中档，计划通过抖音直播间与天猫旗舰店同步首发。'
    );

    await expect(page.locator('label:has-text("A / 质感流行派") input[type="checkbox"]')).toBeChecked();
    await expect(page.locator('label:has-text("B / 都市体面家") input[type="checkbox"]')).toBeChecked();
    await expect(page.locator('label:has-text("C / 百搭优选客") input[type="checkbox"]')).toBeChecked();

    await page.getByTestId('market-context-select-channelEntityId').selectOption(PLACEHOLDER_CHANNEL_ENTITY);
    await page.getByTestId('market-context-select-marketingEventId').selectOption(PLACEHOLDER_MARKETING_EVENT);
    await page.getByTestId('market-context-select-businessScenarioId').selectOption(PLACEHOLDER_BUSINESS_SCENARIO);
    await page.getByPlaceholder('描述本次模拟的渠道、活动、预算或库存约束等业务重点').fill('抖音直播首发 + 天猫旗舰店');

    await page.getByRole('button', { name: '运行模拟' }).click();

    await expect(page.getByText('策略压力测试报告')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('整体接受度', { exact: true })).toBeVisible();
    await expect(page.getByText('购买/互动意向', { exact: true })).toBeVisible();
    await expect(page.getByText('置信度', { exact: true })).toBeVisible();
    await expect(page.getByText('分 Agent 反馈')).toBeVisible();
    await expect(page.getByText('agent-template-a')).toBeVisible();
    await expect(page.locator('.sim-report__quality-value').filter({ hasText: 'minimax / minimax-m3' })).toBeVisible();
    await expect(page.locator('.sim-provider-badge--llm')).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('shows fallback warning when a manual channel ID is used in mock mode', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK === 'false', 'This test is intended for mock mode only');

    const errors = collectErrors(page);

    await page.goto('/');
    await page.locator('button[title="模拟市场"]').first().click();
    await expect(page.getByText('模拟市场工作台')).toBeVisible();

    await page.getByPlaceholder('粘贴商品、渠道、活动、价格、卖点、分货或投放建议等策略文本').fill(
      '本季主打修身显瘦通勤连衣裙，采用高支棉面料，主打简约通勤与多场景穿搭。'
    );

    await page.getByTestId('market-context-input-channelEntityId').fill('manual_unverified_channel_id');
    await page.getByRole('button', { name: '运行模拟' }).click();

    await expect(page.getByText('策略压力测试报告')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.sim-provider-badge--fallback')).toBeVisible();
    await expect(page.locator('.alert-banner--warning').filter({ hasText: 'deterministic fallback' })).toBeVisible();
    await expect(page.locator('.sim-report__quality-value').filter({ hasText: 'deterministic_fallback' })).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('no horizontal overflow on 390px mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupApiRouteFallbacks(page);

    await page.goto('/');
    await page.click('button[aria-label="打开导航"]');
    await page.click('button[title="模拟市场"]');

    await page.waitForTimeout(300);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth);
  });

  test('real API contract requests hit /api/v0/simulated-market/* and are not short-circuited by USE_MOCK', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK !== 'false', 'This test requires VITE_USE_MOCK=false');

    const requests: { url: string; method: string }[] = [];

    await page.route('/api/v0/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();
      requests.push({ url: route.request().url(), method });

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

      if (path === '/api/v0/channel-objects' && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'ok',
            requestId: 'r-test-channel-objects',
            generatedAt: new Date().toISOString(),
            data: {
              items: [],
              page: { cursor: null, nextCursor: null, pageSize: 20, hasMore: false },
            },
          }),
        });
      }

      // Fallback for all other endpoints
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'ok',
          requestId: 'r-fallback',
          generatedAt: new Date().toISOString(),
          data: {},
        }),
      });
    });

    await page.goto('/');
    await page.locator('button[title="模拟市场"]').first().click();

    await expect(page.getByText('A / 质感流行派')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('策略压力测试报告')).toBeVisible();

    await page.getByPlaceholder('粘贴商品、渠道、活动、价格、卖点、分货或投放建议等策略文本').fill(
      '本季主打修身显瘦通勤连衣裙，采用高支棉面料，主打简约通勤与多场景穿搭。'
    );
    await page.getByPlaceholder('描述本次模拟的渠道、活动、预算或库存约束等业务重点').fill('抖音直播');
    await page.getByRole('button', { name: '运行模拟' }).click();

    await expect(page.getByText('sim_20260701_0001')).toBeVisible({ timeout: 15000 });

    // Assert real requests were issued (not short-circuited by USE_MOCK)
    expect(requests.some((r) => r.url.includes('/api/v0/simulated-market/agent-templates') && r.method === 'GET')).toBe(true);
    expect(requests.some((r) => r.url.includes('/api/v0/simulated-market/runs') && r.method === 'POST')).toBe(true);
  });
});

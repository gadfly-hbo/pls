import { test, expect } from '@playwright/test';

const isRealApiMode = process.env.VITE_USE_MOCK === 'false';
const realApiWorkspace = process.env.VITE_PLS_WORKSPACE || '';

test.describe('Channel Object Library', () => {
  test('handles manual_config product fit profile with null sampleSize and timeWindow', async ({ page }) => {
    test.skip(isRealApiMode, 'Mock-mode fixture smoke; real API contract is covered separately.');

    await page.goto('/');
    await page.locator('button[title="渠道画像"]').first().click();

    // Select Mock City Walk Store
    await page.locator('.entity-list-item__name', { hasText: 'Mock City Walk Store' }).first().click();
    await expect(page.locator('.page-header__title').first()).toHaveText('Mock City Walk Store');

    // Navigate to product fit tab
    await page.locator('.segmented-control button:has-text("商品适配")').first().click();

    // Verify null handling UI
    await expect(page.locator('text=无统计样本').first()).toBeVisible();
    await expect(page.locator('text=manual_config').first()).toBeVisible();
  });

  test('loads object list, detail, profiles, bindings and edit form', async ({ page }) => {
    test.skip(isRealApiMode, 'Mock-mode fixture smoke; real API contract is covered separately.');

    await page.goto('/');

    // Navigate to Channel Object Library (desktop nav first match)
    await page.locator('button[title="渠道画像"]').first().click();

    // List renders grouped by type
    await expect(page.locator('text=渠道画像').first()).toBeVisible();
    await expect(page.locator('text=抖音').first()).toBeVisible();

    // Select an account object
    await page.locator('.entity-list-item__name', { hasText: '森马官方直播间' }).first().click();

    // Detail header
    await expect(page.locator('.page-header__title').first()).toHaveText('森马官方直播间');
    await expect(page.locator('text=对象标识').first()).toBeVisible();
    await expect(page.locator('text=account:douyin_semira_official_live').first()).toBeVisible();

    // Quality flags visible
    await expect(page.locator('text=生成 key 待复核').first()).toBeVisible();

    // Audience profile tab
    await page.click('button:has-text("人群画像")');
    await expect(page.locator('text=人群画像标签').first()).toBeVisible();
    await expect(page.locator('text=25-34岁').first()).toBeVisible();

    // Product fit tab
    await page.click('button:has-text("商品适配")');
    await expect(page.locator('text=适合品类').first()).toBeVisible();
    await expect(page.locator('text=女装').first()).toBeVisible();

    // Bindings tab
    await page.click('button:has-text("绑定关系")');
    await expect(page.locator('text=绑定类型').first()).toBeVisible();

    // Edit tab
    await page.click('button:has-text("编辑")');
    await expect(page.locator('text=轻量编辑').first()).toBeVisible();
    await page.fill('[data-testid="channel-object-edit-name"]', '森马官方直播间-已编辑');
    await page.click('button:has-text("保存")');

    // Back to overview and verify edited name
    await page.locator('.segmented-control button:has-text("总览")').first().click();
    await expect(page.locator('.page-header__title').first()).toHaveText('森马官方直播间-已编辑');
  });

  test('object type filter works', async ({ page }) => {
    test.skip(isRealApiMode, 'Mock-mode fixture smoke; real API contract is covered separately.');

    await page.goto('/');
    await page.locator('button[title="渠道画像"]').first().click();

    // Filter to account only
    await page.locator('select').first().selectOption('account');
    await expect(page.locator('.entity-list-item__name', { hasText: '森马官方直播间' }).first()).toBeVisible();
    await expect(page.locator('.entity-list-item__name', { hasText: '抖音' }).first()).not.toBeVisible();
  });

  test('marketing events and scenarios have standalone contextual detail', async ({ page }) => {
    test.skip(isRealApiMode, 'Mock-mode fixture smoke; real API contract is covered separately.');

    await page.goto('/');
    await page.locator('button[title="渠道画像"]').first().click();

    await page.locator('.workbench-sidebar .segmented-control button:has-text("活动")').click();
    await expect(page.locator('.entity-list-item__name', { hasText: '2026 年 618 大促' }).first()).toBeVisible();
    await page.locator('.entity-list-item__name', { hasText: '2026 年 618 大促' }).first().click();
    await expect(page.locator('.page-header__title').first()).toHaveText('2026 年 618 大促');
    await expect(page.locator('text=活动类型').first()).toBeVisible();
    await expect(page.locator('text=活动标签').first()).toBeVisible();
    await expect(page.locator('text=匹配上下文').first()).toBeVisible();

    await page.locator('.segmented-control button:has-text("关联渠道")').first().click();
    await expect(page.locator('text=森马抖音官方旗舰店').first()).toBeVisible();
    await expect(page.locator('text=活动关联渠道').first()).toBeVisible();

    await page.locator('.workbench-sidebar .segmented-control button:has-text("场景")').click();
    await expect(page.locator('.entity-list-item__name', { hasText: 'Q3 新品首发' }).first()).toBeVisible();
    await page.locator('.entity-list-item__name', { hasText: 'Q3 新品首发' }).first().click();
    await expect(page.locator('.page-header__title').first()).toHaveText('Q3 新品首发');
    await expect(page.locator('text=场景类型').first()).toBeVisible();
    await expect(page.locator('text=场景说明').first()).toBeVisible();
    await expect(page.locator('text=业务目标').first()).toBeVisible();

    await page.locator('.segmented-control button:has-text("适用渠道")').first().click();
    await expect(page.locator('text=森马官方直播间').first()).toBeVisible();
    await expect(page.locator('text=场景适用渠道').first()).toBeVisible();
  });

  test('import dry-run modal opens and shows result', async ({ page }) => {
    test.skip(isRealApiMode, 'Mock-mode Admin Import fixture smoke; real API contract is covered separately.');

    await page.goto('/');
    await page.locator('button[title="渠道画像"]').first().click();

    await page.click('button:has-text("导入")');
    await expect(page.locator('h3:has-text("导入渠道对象")').first()).toBeVisible();
    await expect(page.locator('text=1. 选择导入目标').first()).toBeVisible();
    await expect(page.locator('text=3. 导入前检查').first()).toBeVisible();

    const packageInput = page.locator('label:has-text("数据包路径 / 模板") + input').first();
    await expect(packageInput).toHaveValue('channel-profile-object-library');
    await packageInput.fill('channel-profile-object-library-custom');
    await expect(packageInput).toHaveValue('channel-profile-object-library-custom');
    await packageInput.fill('channel-profile-object-library');

    await page.click('button:has-text("执行导入前检查")');
    await expect(page.locator('h3:has-text("3. 导入前检查")').first()).toBeVisible();
    await expect(page.locator('text=影响表').first()).toBeVisible();
    await expect(page.locator('text=必须输入完全一致的确认文本').first()).toBeVisible();

    await page.click('button[aria-label="关闭"]');
  });

  test('analysis view opens and generates results', async ({ page }) => {
    test.skip(isRealApiMode, 'Mock-mode analysis fixture smoke; real API contract is covered separately.');

    await page.goto('/');
    await page.locator('button[title="渠道画像"]').first().click();

    await page.click('button:has-text("分析")');
    await expect(page.locator('h3:has-text("批量货渠匹配分析")').first()).toBeVisible();
    await expect(page.locator('text=1. 选择渠道实体').first()).toBeVisible();
    await expect(page.locator('text=2. 选择活动/场景上下文').first()).toBeVisible();

    // Select a channel entity
    await page.locator('label', { hasText: '森马抖音官方旗舰店' }).first().check();
    await page.locator('label:has-text("活动") + select').selectOption('marketing_event:618_2026');
    await page.locator('label:has-text("场景") + select').selectOption('business_scenario:new_product_launch_q3');
    await page.fill('input[value*="mock_sku_101"]', 'mock_sku_101');

    await page.click('button:has-text("生成匹配分析")');
    await expect(page.locator('text=4. 分析结果').first()).toBeVisible();
    await expect(page.locator('text=mock_sku_101').first()).toBeVisible();
    await expect(page.locator('.tag', { hasText: '2026 年 618 大促' }).first()).toBeVisible();
    await expect(page.locator('.tag', { hasText: 'Q3 新品首发' }).first()).toBeVisible();
    await expect(page.locator('button:has-text("去货渠匹配模块查看")').first()).toBeVisible();

    await page.click('button[aria-label="关闭"]');
  });

  test('match analysis tab renders fit diagnosis in mock mode', async ({ page }) => {
    test.skip(isRealApiMode, 'Mock-mode fit diagnosis fixture smoke; real API contract is covered separately.');

    await page.goto('/');
    await page.locator('button[title="渠道画像"]').first().click();

    // Select an account object
    await page.locator('.entity-list-item__name', { hasText: '森马官方直播间' }).first().click();

    // Navigate to match analysis tab
    await page.locator('.segmented-control button:has-text("匹配分析")').first().click();

    // Trigger analysis
    await page.fill('input[placeholder="输入 SKU ID"]', 'mock_sku_101');
    await page.click('button:has-text("分析匹配度")');

    // Verify results
    await expect(page.locator('text=号货匹配综合得分').first()).toBeVisible();
    await expect(page.locator('text=匹配维度对比').first()).toBeVisible();
  });

  test('real API contract handles null sampleSize and timeWindow without crashing', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK !== 'false', 'This test requires VITE_USE_MOCK=false');

    const contractKey = 'store:contract_manual_store';
    const contractStore = {
      workspaceId: 'ws_demo',
      objectType: 'store' as const,
      sourceStableKey: 'contract_manual_store',
      keySource: 'source_system_id' as const,
      canonicalObjectKey: contractKey,
      objectVersionId: 'ws_demo:store:contract_manual_store:v1',
      dataVersion: 'v1',
      sourceBatchId: 'batch_contract_channel_objects_v1',
      generatedAt: '2026-07-01T00:00:00Z',
      timeWindow: '2026-05-01/2026-06-30',
      displayName: '合同测试手工店',
      platformName: '抖音',
      platformType: 'content_ecommerce',
      entityStatus: 'active',
      targetObject: 'ChannelEntity',
      entityAttributes: { storeType: 'offline_store' },
      possibleDuplicate: false,
      duplicateCandidateKeys: [],
      manualReviewStatus: 'confirmed_distinct' as const,
      qualityFlags: [],
      source: 'manual_config',
      sourceType: 'manual',
    };
    const routeHits = {
      list: false,
      detail: false,
      audienceProfiles: false,
      productFitProfiles: false,
      bindings: false,
      channelEntityProfile: false,
    };

    const expectIsolatedWorkspace = (workspaceHeader: string | null) => {
      expect(workspaceHeader).toBe(realApiWorkspace);
      expect(workspaceHeader).not.toBe('ws_demo');
    };

    await page.route('**/api/v0/channel-objects**', async (route) => {
      expectIsolatedWorkspace(route.request().headers()['x-pls-workspace'] ?? null);
      const url = new URL(route.request().url());
      const path = url.pathname;
      const bodyBase = { code: 'ok', requestId: 'r-test', generatedAt: new Date().toISOString() };

      if (path === '/api/v0/channel-objects') {
        routeHits.list = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...bodyBase,
            data: { items: [contractStore], page: { cursor: null, nextCursor: null, pageSize: 100, hasMore: false } },
          }),
        });
        return;
      }

      if (path === `/api/v0/channel-objects/${contractKey}/audience-profiles`) {
        routeHits.audienceProfiles = true;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...bodyBase, data: { items: [] } }) });
        return;
      }

      if (path === `/api/v0/channel-objects/${contractKey}/product-fit-profiles`) {
        routeHits.productFitProfiles = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...bodyBase,
            data: {
              items: [
                {
                  profileId: 'pf_contract_manual_001',
                  canonicalObjectKey: contractKey,
                  source: 'manual_config',
                  sourceBatchId: 'batch_contract_manual',
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
              ],
            },
          }),
        });
        return;
      }

      if (path === `/api/v0/channel-objects/${contractKey}/bindings`) {
        routeHits.bindings = true;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...bodyBase, data: { items: [] } }) });
        return;
      }

      if (path === `/api/v0/channel-objects/${contractKey}`) {
        routeHits.detail = true;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...bodyBase, data: contractStore }) });
        return;
      }

      await route.fallback();
    });

    await page.route(`**/api/v0/channels/entities/${contractKey}`, async (route) => {
      expectIsolatedWorkspace(route.request().headers()['x-pls-workspace'] ?? null);
      routeHits.channelEntityProfile = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'ok',
          requestId: 'r-test',
          generatedAt: new Date().toISOString(),
          data: {
            channelEntityId: contractKey,
            entityType: 'store',
            sourceEntityKey: 'contract_manual_store',
            displayName: '合同测试手工店',
            platformType: 'content_ecommerce',
            platformName: '抖音',
            profileTags: [],
            benchmarkTags: [],
            performanceMetrics: { sampleSize: 0 },
            sourceId: 'batch_contract_channel_objects_v1',
            timeWindow: '2026-05-01/2026-06-30',
            qualityFlags: [],
          },
        }),
      });
    });

    await page.goto('/');
    await page.locator('button[title="渠道画像"]').first().click();

    // Select contract-backed store from intercepted real API shape.
    await page.locator('.entity-list-item__name', { hasText: '合同测试手工店' }).first().click();
    await expect(page.locator('.page-header__title').first()).toHaveText('合同测试手工店');

    // Navigate to product fit tab - this previously crashed with null sampleSize/timeWindow
    await page.locator('.segmented-control button:has-text("商品适配")').first().click();

    // Verify page did not crash and null values are rendered gracefully
    await expect(page.locator('text=无统计样本').first()).toBeVisible();
    await expect(page.locator('text=manual_config').first()).toBeVisible();
    await expect(page.locator('text=适合品类').first()).toBeVisible();
    expect(routeHits).toEqual({
      list: true,
      detail: true,
      audienceProfiles: true,
      productFitProfiles: true,
      bindings: true,
      channelEntityProfile: true,
    });
  });

  test('no horizontal overflow on mobile', async ({ page }) => {
    test.skip(isRealApiMode, 'Mock-mode visual smoke; real API contract is covered separately.');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.click('button[aria-label="打开导航"]');
    await page.click('button[title="渠道画像"]');

    await page.waitForTimeout(300);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth);
  });

  test('desktop import and analysis flows have no page-level overflow', async ({ page }) => {
    test.skip(isRealApiMode, 'Mock-mode visual smoke; real API contract is covered separately.');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.locator('button[title="渠道画像"]').first().click();

    await page.click('button:has-text("导入")');
    await expect(page.locator('h3:has-text("导入渠道对象")').first()).toBeVisible();
    await expect(page.locator('text=执行导入前检查').first()).toBeVisible();
    let bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    let windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth);
    await page.click('button[aria-label="关闭"]');

    await page.click('button:has-text("分析")');
    await expect(page.locator('h3:has-text("批量货渠匹配分析")').first()).toBeVisible();
    await expect(page.locator('text=活动用于限定促销窗口和主题').first()).toBeVisible();
    bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth);
    await page.click('button[aria-label="关闭"]');
  });

  test('mobile import and analysis flows have no page-level overflow', async ({ page }) => {
    test.skip(isRealApiMode, 'Mock-mode visual smoke; real API contract is covered separately.');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.click('button[aria-label="打开导航"]');
    await page.click('button[title="渠道画像"]');

    await page.click('button:has-text("导入")');
    await expect(page.locator('h3:has-text("导入渠道对象")').first()).toBeVisible();
    let bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    let windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth);
    await page.click('button[aria-label="关闭"]');

    await page.click('button:has-text("分析")');
    await expect(page.locator('h3:has-text("批量货渠匹配分析")').first()).toBeVisible();
    bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth);
    await page.click('button[aria-label="关闭"]');
  });
});

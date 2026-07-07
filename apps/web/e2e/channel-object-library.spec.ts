import { test, expect } from '@playwright/test';

test.describe('Channel Object Library', () => {
  test('handles manual_config product fit profile with null sampleSize and timeWindow', async ({ page }) => {
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
    await expect(page.locator('text=canonicalObjectKey').first()).toBeVisible();
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
    await page.goto('/');
    await page.locator('button[title="渠道画像"]').first().click();

    // Filter to account only
    await page.locator('select').first().selectOption('account');
    await expect(page.locator('.entity-list-item__name', { hasText: '森马官方直播间' }).first()).toBeVisible();
    await expect(page.locator('.entity-list-item__name', { hasText: '抖音' }).first()).not.toBeVisible();
  });

  test('import dry-run modal opens and shows result', async ({ page }) => {
    await page.goto('/');
    await page.locator('button[title="渠道画像"]').first().click();

    await page.click('button:has-text("导入")');
    await expect(page.locator('h3:has-text("导入渠道对象")').first()).toBeVisible();

    const packageInput = page.locator('label:has-text("数据包路径 / 模板") + input').first();
    await expect(packageInput).toHaveValue('channel-profile-object-library');
    await packageInput.fill('channel-profile-object-library-custom');
    await expect(packageInput).toHaveValue('channel-profile-object-library-custom');
    await packageInput.fill('channel-profile-object-library');

    await page.click('button:has-text("Dry-run 预览")');
    await expect(page.locator('text=Dry-run 结果').first()).toBeVisible();
    await expect(page.locator('text=影响表').first()).toBeVisible();

    await page.click('button[aria-label="关闭"]');
  });

  test('analysis view opens and generates results', async ({ page }) => {
    await page.goto('/');
    await page.locator('button[title="渠道画像"]').first().click();

    await page.click('button:has-text("分析")');
    await expect(page.locator('h3:has-text("渠道对象分析视图")').first()).toBeVisible();

    // Select a channel entity
    await page.locator('label', { hasText: '森马抖音官方旗舰店' }).first().check();
    await page.fill('input[value*="mock_sku_101"]', 'mock_sku_101');

    await page.click('button:has-text("生成匹配分析")');
    await expect(page.locator('text=分析结果').first()).toBeVisible();
    await expect(page.locator('text=mock_sku_101').first()).toBeVisible();

    await page.click('button[aria-label="关闭"]');
  });

  test('match analysis tab renders fit diagnosis in mock mode', async ({ page }) => {
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

    // Intercept real A-P6 channel-objects list to include a store with manual_config product fit
    await page.route('**/api/v0/channel-objects*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'ok',
          requestId: 'r-test',
          generatedAt: new Date().toISOString(),
          data: {
            items: [
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
                entityAttributes: { storeType: 'offline_store' },
                possibleDuplicate: false,
                duplicateCandidateKeys: [],
                manualReviewStatus: 'confirmed_distinct',
                qualityFlags: [],
                source: 'manual_config',
                sourceType: 'manual',
              }
            ],
            page: { cursor: null, nextCursor: null, pageSize: 20, hasMore: false }
          }
        })
      });
    });

    await page.route('**/api/v0/channel-objects/store:mock_city_walk_store/product-fit-profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'ok',
          requestId: 'r-test',
          generatedAt: new Date().toISOString(),
          data: {
            items: [
              {
                profileId: 'pf_manual_001',
                canonicalObjectKey: 'store:mock_city_walk_store',
                source: 'manual_config',
                sourceBatchId: 'batch_manual',
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
              }
            ]
          }
        })
      });
    });

    await page.route('**/api/v0/channel-objects/store:mock_city_walk_store', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'ok',
          requestId: 'r-test',
          generatedAt: new Date().toISOString(),
          data: {
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
            entityAttributes: { storeType: 'offline_store' },
            possibleDuplicate: false,
            duplicateCandidateKeys: [],
            manualReviewStatus: 'confirmed_distinct',
            qualityFlags: [],
            source: 'manual_config',
            sourceType: 'manual',
          }
        })
      });
    });

    await page.goto('/');
    await page.locator('button[title="渠道画像"]').first().click();

    // Select Mock City Walk Store
    await page.locator('.entity-list-item__name', { hasText: 'Mock City Walk Store' }).first().click();
    await expect(page.locator('.page-header__title').first()).toHaveText('Mock City Walk Store');

    // Navigate to product fit tab - this previously crashed with null sampleSize/timeWindow
    await page.locator('.segmented-control button:has-text("商品适配")').first().click();

    // Verify page did not crash and null values are rendered gracefully
    await expect(page.locator('text=无统计样本').first()).toBeVisible();
    await expect(page.locator('text=manual_config').first()).toBeVisible();
    await expect(page.locator('text=适合品类').first()).toBeVisible();
  });

  test('no horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.click('button[aria-label="打开导航"]');
    await page.click('button[title="渠道画像"]');

    await page.waitForTimeout(300);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth);
  });
});

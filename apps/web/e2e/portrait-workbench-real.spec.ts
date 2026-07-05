import { test, expect } from '@playwright/test';

test.describe('Portrait Workbench Real API Contract Test', () => {
  test.skip(process.env.VITE_USE_MOCK !== 'false', 'This test requires VITE_USE_MOCK=false');

  test('Should call /tools/runs and fetch artifact with USE_MOCK=false', async ({ page }) => {
    // 1. Intercept /api/v0/tools/runs to return a mock run
    let toolRunRequested = false;
    await page.route('**/api/v0/tools/runs', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const postData = JSON.parse(request.postData() || '{}');
        expect(postData.toolId).toBe('single-product-portrait');
        expect(postData.parameters.skuId).toBe('mock_sku_portrait_001');
        
        toolRunRequested = true;
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'ok',
            data: {
              run: {
                runId: 'mock_run_123',
                toolId: 'single-product-portrait',
                status: 'succeeded',
                artifacts: [
                  { artifactId: 'prediction.json', path: 'prediction.json' }
                ],
                warnings: [],
                errors: []
              }
            }
          })
        });
      } else {
        await route.continue();
      }
    });

    // 2. Intercept artifact fetch
    let artifactRequested = false;
    await page.route('**/api/v0/tools/runs/mock_run_123/artifacts/prediction.json', async (route) => {
      artifactRequested = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          skuId: "mock_sku_portrait_001",
          generatedAt: new Date().toISOString(),
          modelVersion: "rule-baseline",
          modelPath: "baseline",
          sourceType: "derived",
          anchorSkuId: "123",
          inputCoverage: {
            requiredFieldCoverage: 1,
            optionalSignalCoverage: 1,
            usedFields: [],
            missingFields: []
          },
          platformPortraitRows: [],
          dimensionSummaries: [
            {
              labelType: '预测性别',
              topLabels: [{ label: 'gender.female', share: 0.9, tgi: null, confidence: 0.9 }],
              qualityFlags: []
            }
          ],
          plsBridge: {
            predictedProfileTags: [],
            unmappedPlatformLabels: [],
            bridgeCoverageRate: 0.8
          },
          riskFlags: ['baseline_not_trained_model'],
          explanationSources: []
        })
      });
    });

    // 3. Navigate and run
    await page.goto('/');
    
    await page.locator('button.app-nav__item', { hasText: '新品预测' }).click();
    await expect(page.getByRole('heading', { name: '单品画像预测' })).toBeVisible({ timeout: 10000 });

    await page.getByLabel('商品 ID').fill('mock_sku_portrait_001');
    await page.getByLabel('受控样本包 ID').fill('sample');
    await page.getByRole('button', { name: '开始预测画像' }).click();

    // Verify it completes
    await expect(page.getByRole('heading', { name: /预测画像结果/ })).toBeVisible({ timeout: 15000 });
    
    // Assert interceptors were hit
    expect(toolRunRequested).toBe(true);
    expect(artifactRequested).toBe(true);
  });
});

import { test, expect } from '@playwright/test';

test.describe('Product channel fit real UI smoke', () => {
  test.skip(process.env.VITE_USE_MOCK !== 'false', 'Requires VITE_USE_MOCK=false');

  test('calls real single-product-portrait metadata and predict APIs', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/v0/single-product-portrait/')) {
        apiCalls.push(`${request.method()} ${url}`);
      }
    });

    await page.goto('/');
    await page.locator('button.app-nav__item', { hasText: '新品预测' }).click();
    await expect(page.getByRole('heading', { name: '单品画像预测' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('single-product-portrait-supervised-ridge-0.1')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('sampleCount')).toBeVisible();
    await expect(page.getByText('LOO Top1')).toBeVisible();
    await expect(page.getByText('LOO Top3')).toBeVisible();

    const modelInfo = page.locator('.single-portrait-model-info');
    await expect(modelInfo.getByRole('button', { name: '收起模型说明' })).toBeVisible();
    await modelInfo.getByRole('button', { name: '收起模型说明' }).click();
    await expect(modelInfo.getByRole('button', { name: '展开模型说明' })).toBeVisible();
    await modelInfo.getByRole('button', { name: '展开模型说明' }).click();
    await expect(page.getByText('LOO Top1')).toBeVisible();

    await page.getByLabel('款号').fill('REAL_UI_001');
    await page.getByLabel('版型').selectOption('X型');
    await page.getByLabel('面料').fill('全棉针织');
    await page.getByLabel('FAB').fill('通勤基础款，舒适亲肤');
    await page.getByRole('button', { name: '预测单款画像' }).click();

    const result = page.locator('.single-portrait-result').filter({ hasText: '单款画像结果' });
    await expect(result.getByRole('heading', { name: '单款画像结果' })).toBeVisible({ timeout: 20000 });
    await expect(result.getByText('baseline_not_trained_model')).toBeVisible();
    await expect(result.getByText('small_sample_supervised_model')).toBeVisible();

    expect(apiCalls.some((call) => call.includes('/metadata'))).toBe(true);
    expect(apiCalls.some((call) => call.includes('/predict'))).toBe(true);
  });
});

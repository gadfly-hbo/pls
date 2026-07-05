import { test, expect } from '@playwright/test';

test.describe('Portrait Workbench Baseline Test', () => {
  test.skip(process.env.VITE_USE_MOCK === 'false', 'This test requires VITE_USE_MOCK=true');

  test('Should render core dimensions, risk flags, fold long tail, show evidence and work on narrow screen', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => {
      console.error('PAGE ERROR:', err.message);
      errors.push(err.message);
    });
    page.on('console', msg => {
      if (msg.type() === 'error') {
        if (!msg.text().includes('favicon.ico') && !msg.text().includes('Duplicate key')) {
          console.error('CONSOLE ERROR:', msg.text());
          errors.push(msg.text());
        }
      }
    });

    // 1. Navigate to '新品预测工作台'
    await page.goto('/');
    await page.locator('button.app-nav__item', { hasText: '新品预测工作台' }).click();
    await expect(page.getByRole('heading', { name: '新品预测工作台' })).toBeVisible({ timeout: 10000 });

    // 2. Fill required form fields and submit
    await page.getByLabel('商品 ID').fill('mock_sku_portrait_001');
    await page.getByLabel('受控样本包 ID').fill('sample');
    await page.getByRole('button', { name: '开始预测画像' }).click();

    // Wait for prediction result
    await expect(page.getByRole('heading', { name: /预测画像结果/ })).toBeVisible({ timeout: 15000 });

    // 3. Verify Risk Flags
    await expect(page.getByText('该结果为基于规则的预测 baseline，非已训练模型')).toBeVisible();
    await expect(page.getByText('baseline_not_trained_model')).toBeVisible();
    
    // 4. Verify PLS Bridge Coverage Rate
    await expect(page.getByText('PLS Bridge 覆盖率')).toBeVisible();
    await expect(page.getByText('未映射长尾')).toBeVisible();

    // 5. Verify Core Dimensions
    const dimensionList = page.locator('.dimension-list');
    await expect(page.getByText('画像维度分布')).toBeVisible();
    await expect(dimensionList.getByText('预测性别', { exact: true })).toBeVisible();
    await expect(dimensionList.getByText('预测年龄段', { exact: true })).toBeVisible();
    
    // Non-core dimensions should be hidden initially
    await expect(dimensionList.getByText('品牌偏好', { exact: true })).not.toBeVisible();

    // 6. Unfold Long Tail
    const unfoldBtn = page.getByRole('button', { name: '展开长尾画像' });
    await expect(unfoldBtn).toBeVisible();
    await unfoldBtn.click();
    await expect(page.getByRole('button', { name: '收起长尾画像' })).toBeVisible();
    await expect(page.getByText('注：以下长尾维度为锚点弱先验或平台原始长尾，仅供参考。')).toBeVisible();
    await expect(dimensionList.getByText('品牌偏好', { exact: true })).toBeVisible();

    // 7. Verify Evidence Display
    await expect(page.getByText('预测证据 (Evidence)')).toBeVisible();
    await expect(page.getByText('基于款式特征 "minimal" 匹配核心风格')).toBeVisible();

    // 8. Test narrow screen layout
    await page.setViewportSize({ width: 375, height: 812 });
    // In narrow screen, evidence table should be scrollable horizontally, but shouldn't overflow the page
    const evidenceTableContainer = page.locator('.panel').filter({ hasText: '预测证据 (Evidence)' }).locator('> div');
    const box = await evidenceTableContainer.boundingBox();
    const viewportSize = page.viewportSize();
    expect(box?.width).toBeLessThanOrEqual(viewportSize?.width || 375);

    expect(errors).toHaveLength(0);
  });
});

import { test, expect } from '@playwright/test';
import fs from 'fs';

test('End-to-End Smoke Test for PLS', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => {
    console.error('PAGE ERROR:', err.message);
    errors.push(err.message);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      if (!msg.text().includes('favicon.ico')) {
        console.error('CONSOLE ERROR:', msg.text());
        errors.push(msg.text());
      }
    }
  });

  // 1. Dashboard
  await page.goto('/');
  await expect(page.getByText('PLS 工作台')).toBeVisible();

  // 2. Prediction -> Matches
  // In Dashboard, fill a unique SKU ID and Title to avoid duplicate key API error and form validation failure
  const uniqueSku = `e2e_sku_${Date.now()}`;
  await page.locator('input[name="skuId"]').fill(uniqueSku);
  await page.locator('input[name="title"]').fill(`E2E 测试款 ${uniqueSku}`);

  // there should be a button to generate prediction and matches
  const startBtn = page.getByText('开始预测画像', { exact: true });
  await startBtn.click();
  
  // Wait for some prediction results to show up
  await expect(page.locator('h2', { hasText: '预测画像结果' })).toBeVisible({ timeout: 15000 });

  // 3. Go to Heatmap
  const heatmapNav = page.getByText('去匹配渠道', { exact: true });
  await heatmapNav.click();
  await expect(page.getByText('人货匹配热力图')).toBeVisible({ timeout: 10000 });

  // 4. Click a cell to open Drawer
  const cell = page.locator('.heatmap-cell').first();
  await cell.waitFor({ state: 'visible' });
  await cell.click();

  // 5. Drawer Verification
  await expect(page.getByText('渠道推荐详情')).toBeVisible();
  await expect(page.getByText('渠道画像摘要')).toBeVisible();

  const closeBtn = page.locator('.close-btn');
  await closeBtn.click();

  // 6. CSV Export
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByText('导出匹配报告 (CSV)').click()
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();

  // Validate CSV structure
  const csvContent = fs.readFileSync(path, 'utf-8');
  const lines = csvContent.trim().split('\n');
  expect(lines.length).toBeGreaterThan(1);
  const header = lines[0];
  expect(header).toContain('SKU');
  expect(header).toContain('Channel');
  expect(header).toContain('Match Score');
  expect(header).toContain('Confidence');
  expect(header).toContain('Recommendation');
  expect(header).toContain('Positive Drivers');
  expect(header).toContain('Negative Drivers');
  expect(header).toContain('Risks');

  // 7. Go to Account Comparison
  const accountComparisonNav = page.getByText('账号画像与对比', { exact: true });
  await accountComparisonNav.click();
  await expect(page.getByText('账号画像与匹配对比')).toBeVisible({ timeout: 10000 });

  // Verify the original Douyin BI dashboard is embedded and interactive.
  const dashboardFrame = page.frameLocator('iframe[title="抖音商品全景分析"]');
  await expect(dashboardFrame.getByText('商品人群洞察罗盘')).toBeVisible({ timeout: 10000 });
  await expect(dashboardFrame.getByText('商品人群数据宽表').first()).toBeVisible();
  await dashboardFrame.getByText('账号画像基准', { exact: true }).click();
  await expect(dashboardFrame.locator('#pageTitleText')).toContainText('账号画像基准');
  await dashboardFrame.getByText('款vs账号对比', { exact: true }).click();
  await expect(dashboardFrame.locator('#pageTitleText')).toContainText('款vs账号TOP1对比');
  await dashboardFrame.getByText('优化调整清单', { exact: true }).click();
  await expect(dashboardFrame.locator('#pageTitleText')).toContainText('优化调整清单');

  // Verify that there are no console/runtime errors captured
  expect(errors).toHaveLength(0);
});

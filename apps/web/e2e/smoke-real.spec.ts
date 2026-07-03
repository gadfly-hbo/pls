import { test, expect } from '@playwright/test';
import fs from 'fs';

test('End-to-End Real Backend Smoke Test', async ({ page }) => {
  // Only runs if VITE_USE_MOCK is false
  test.skip(process.env.VITE_USE_MOCK !== 'false', 'Skipping real backend test because VITE_USE_MOCK is not false');

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

  await page.goto('/');
  await expect(page.getByText('PLS 工作台')).toBeVisible();

  // Go to Account Comparison
  const accountComparisonNav = page.getByText('账号画像与对比', { exact: true });
  await accountComparisonNav.click();
  await expect(page.getByText('账号画像与匹配诊断')).toBeVisible({ timeout: 10000 });

  // Select the specific real account
  await page.locator('select').selectOption('douyin_account_semir_official_flagship_baseline');
  
  // Wait for loading to finish
  await expect(page.getByText('加载中...')).not.toBeVisible();

  // Verify native React dashboard F4
  await expect(page.getByText('账号画像基准').first()).toBeVisible();
  await expect(page.getByText('商品人群罗盘').first()).toBeVisible();

  // Go to F5 tab
  const comparisonTab = page.getByText('款账号对比与优化建议');
  await comparisonTab.click();

  await expect(page.getByText('号货匹配诊断')).toBeVisible();
  await expect(page.getByText('维度 TOP1 对比')).toBeVisible();
  await expect(page.getByText('优化调整清单')).toBeVisible();

  // Test CSV export from Account Comparison
  const [acDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByText('导出 CSV').click()
  ]);
  const acPath = await acDownload.path();
  expect(acPath).toBeTruthy();

  // Validate CSV structure
  const acCsvContent = fs.readFileSync(acPath, 'utf-8');
  expect(acCsvContent).toContain('skuId,accountId,fitScore,fitConfidence,qualityFlags,generatedAt,advice');

  // Verify that there are no console/runtime errors captured
  expect(errors).toHaveLength(0);
});

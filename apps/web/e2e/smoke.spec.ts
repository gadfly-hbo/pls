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

  // 1. Landing page is now Account Workbench (first module)
  await page.goto('/');
  await expect(page.getByText('PLS 工作台')).toBeVisible();
  // Default view: PLS总览
  await expect(page.getByText('快速查看数据可用性', { exact: false })).toBeVisible({ timeout: 10000 });
  
  // Navigate to 渠道画像 (Channel Object Library, migrated from AccountProfileWorkbench)
  await page.locator('button.app-nav__item', { hasText: '渠道画像' }).click();
  await expect(page.locator('h2.workbench-sidebar__title').first()).toHaveText('渠道画像');

  // Select an account object and verify audience profile tab
  await page.locator('.entity-list-item__name', { hasText: '森马官方直播间' }).first().click();
  await page.locator('.segmented-control button:has-text("人群画像")').first().click();
  await expect(page.getByText('人群画像标签')).toBeVisible();
  await expect(page.getByText('样本量')).toBeVisible();

  // Go to 匹配分析 tab
  const comparisonTab = page.getByText('匹配分析');
  await comparisonTab.click();

  const analyzeBtn = page.getByText('分析匹配度');
  await analyzeBtn.click();

  await expect(page.getByText('号货匹配综合得分')).toBeVisible();
  await expect(page.getByText('匹配维度对比')).toBeVisible();
  await expect(page.getByText('策略调整与优化建议')).toBeVisible();

  // Test CSV export from Account Comparison
  const [acDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByText('导出报告').click()
  ]);
  const acPath = await acDownload.path();
  expect(acPath).toBeTruthy();

  // Validate CSV structure
  const acCsvContent = fs.readFileSync(acPath, 'utf-8');
  expect(acCsvContent).toContain('skuId,accountId,fitScore,fitConfidence,qualityFlags,generatedAt,advice');

  // 2. Navigate to 新品预测 for single-product portrait prediction
  await page.getByText('新品预测', { exact: true }).click();
  const uniqueSku = `e2e_sku_${Date.now()}`;
  await expect(page.getByRole('heading', { name: '单品画像预测' })).toBeVisible({ timeout: 10000 });
  await page.getByLabel('款号').fill(uniqueSku);
  await page.getByLabel('面料').fill('全棉针织');
  await page.getByLabel('FAB').fill('通勤基础款，舒适亲肤，适合日常上班');
  await page.getByRole('button', { name: '预测单款画像' }).click();
  const singleResult = page.locator('.single-portrait-result').filter({ hasText: '单款画像结果' });
  await expect(singleResult.getByRole('heading', { name: '单款画像结果' })).toBeVisible({ timeout: 15000 });
  await expect(singleResult.getByText('baseline_not_trained_model')).toBeVisible();

  await page.getByRole('button', { name: '批量预测' }).click();
  await page.setInputFiles('input[type="file"]', {
    name: 'partial-batch.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('款号,版型,面料,FAB,颜色\nA,X型,全棉,通勤基础款,黑色\nB,未知版型,全棉,通勤基础款,白色\n'),
  });
  await page.getByRole('button', { name: '校验批量文件' }).click();
  await expect(page.getByText('unknown_fit_type')).toBeVisible();
  await page.getByRole('button', { name: '预测有效行' }).click();
  await expect(page.getByRole('heading', { name: '批量画像结果' })).toBeVisible({ timeout: 15000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '预测结果 CSV' }).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  const csvContent = fs.readFileSync(path, 'utf-8');
  expect(csvContent.split('\n')[0]).toContain('rowNumber,skuId,dimension,rank,label,share,confidence,sourceFields,evidenceKeywords,riskFlags');
  // Verify that there are no console/runtime errors captured
  expect(errors).toHaveLength(0);
});

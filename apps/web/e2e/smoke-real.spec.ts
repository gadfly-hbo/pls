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
      const text = msg.text();
      if (!text.includes('favicon.ico')) {
        console.error('CONSOLE ERROR:', text);
        errors.push(text);
      }
    }
  });

  await page.goto('/');
  await expect(page.getByText('PLS 工作台')).toBeVisible();

  // Go to Account Workbench
  const accountComparisonNav = page.locator('button.app-nav__item', { hasText: '实体与账号画像' });
  await accountComparisonNav.click();
  await expect(page.getByText('实体列表', { exact: true })).toBeVisible({ timeout: 10000 });

  // Select the specific real account
  await page.locator('input[placeholder="搜索店铺 / 账号 / 门店..."]').fill('douyin_account_semir_official_flagship_baseline');
  await page.getByText('douyin_account_semir_official_flagship_baseline', { exact: false }).first().click();
  
  // Wait for loading to finish
  await expect(page.getByText('加载详情中...')).not.toBeVisible();

  // Verify native React dashboard F4
  await expect(page.getByText('有效数据样本量')).toBeVisible();

  // Go to F5 tab
  const comparisonTab = page.getByText('号货匹配决策');
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

  // 2. Go to Match Core Workbench
  const matchCoreNav = page.locator('button.app-nav__item', { hasText: '人货匹配核心工作台' });
  await matchCoreNav.click();
  await expect(page.getByText('人货匹配决策工作台')).toBeVisible({ timeout: 10000 });

  // Mode: SKU to Channel
  await expect(page.getByText('匹配的实体列表')).toBeVisible();
  const firstChannelMatch = page.locator('.match-entity-item').first();
  await firstChannelMatch.waitFor({ state: 'visible' });
  await firstChannelMatch.click();
  await expect(page.getByText('匹配决策解释报告')).toBeVisible({ timeout: 10000 });

  // Mode: Channel to SKU
  const modeChannelToSku = page.getByText('按实体找商品', { exact: true });
  await modeChannelToSku.click();
  await expect(page.getByText('匹配的商品列表')).toBeVisible();
  const firstSkuMatch = page.locator('.match-entity-item').first();
  await firstSkuMatch.waitFor({ state: 'visible' });
  await firstSkuMatch.click();
  await expect(page.getByText('匹配决策解释报告')).toBeVisible({ timeout: 10000 });

  // Verify that there are no console/runtime errors captured
  expect(errors).toHaveLength(0);
});

test('Data Management Workbench - Real Backend Smoke Test', async ({ page }) => {
  test.skip(process.env.VITE_USE_MOCK !== 'false', 'Skipping real backend test because VITE_USE_MOCK is not false');

  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) {
      errors.push(msg.text());
    }
  });

  await page.goto('/');
  await expect(page.getByText('PLS 工作台')).toBeVisible();

  // Go to Data Management
  await page.locator('button.app-nav__item', { hasText: '数据管理' }).click();
  await expect(page.getByText('数据库总览')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('main').getByText('ws_demo', { exact: false })).toBeVisible();

  await page.getByText('库表', { exact: true }).click();
  await expect(page.getByText('库表明细')).toBeVisible();

  // Test Table Details
  await page.getByText('详情', { exact: true }).first().click();
  await expect(page.getByText('表详情:')).toBeVisible();

  // Ensure there are no runtime or page errors from malformed responses
  await page.waitForTimeout(500);
  expect(errors).toHaveLength(0);
});

test('Tools Workbench - Real Backend Smoke Test', async ({ page }) => {
  test.skip(process.env.VITE_USE_MOCK !== 'false', 'Skipping real backend test because VITE_USE_MOCK is not false');

  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) {
      errors.push(msg.text());
    }
  });

  await page.goto('/');
  await expect(page.getByText('PLS 工作台')).toBeVisible();

  // Navigate to Tools Workbench
  await page.click('button[title="工具工作台"]');
  await expect(page.locator('.page-header__title').first()).toHaveText('本地工具工作台', { timeout: 10000 });

  // Wait a bit to ensure API calls complete and no errors are thrown
  await page.waitForTimeout(1000);
  
  // Verify real tool list is loaded
  await expect(page.locator('text=Sample Profile Extract').first()).toBeVisible();

  // Select tool
  await page.locator('.entity-list-item__name', { hasText: 'Sample Profile Extract' }).first().click();

  // Provide input path for dry run
  await page.fill('input[placeholder="输入本地文件或目录绝对路径"]', '/tmp/mock-input.csv');

  // Dry run
  await page.click('button:has-text("校验配置 (Dry Run)")');
  await expect(page.locator('text=配置校验通过')).toBeVisible({ timeout: 10000 });

  // Verify that there are no console/runtime errors captured
  expect(errors).toHaveLength(0);
});

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

  // 3. Go to Match Core Workbench
  const heatmapNav = page.getByText('进行核心人货匹配', { exact: true });
  await heatmapNav.click();
  await expect(page.getByText('人货匹配决策工作台')).toBeVisible({ timeout: 10000 });

  // 4. Click an entity in the list (sku-to-channel)
  await expect(page.getByText('匹配的实体列表')).toBeVisible();
  const firstEntity = page.locator('.match-entity-item').first();
  await firstEntity.waitFor({ state: 'visible' });
  await firstEntity.click();

  // 5. Workbench Detail Verification
  await expect(page.getByText('匹配决策解释报告')).toBeVisible();
  await expect(page.getByText('决策建议 (解释型)')).toBeVisible();

  // 6. CSV Export
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByText('导出明细 (CSV)').click()
  ]);

  // 7. Create Decision & Flywheel
  await page.getByText('创建经营决策').click();
  await expect(page.getByText('经营飞轮与策略闭环')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('决策执行与追踪看板')).toBeVisible();
  
  // Add an action
  await page.getByPlaceholder('描述具体的行动策略，例如：在核心时段追加预算').fill('自动测试添加行动');
  await page.getByText('添加行动', { exact: true }).click();
  await expect(page.getByText('自动测试添加行动')).toBeVisible();

  // Update status & Feedback
  await page.getByText('提交流盘').click();
  await page.getByPlaceholder('复盘数据摘要').fill('测试复盘数据');
  await page.getByText('提交复盘记录').click();
  await expect(page.getByText('效果一般')).toBeVisible();
  const path = await download.path();
  expect(path).toBeTruthy();

  // Validate CSV structure
  const csvContent = fs.readFileSync(path, 'utf-8');
  const lines = csvContent.trim().split('\n');
  expect(lines.length).toBeGreaterThan(1);
  const header = lines[0];
  expect(header).toContain('SKU ID');
  expect(header).toContain('实体 ID');
  expect(header).toContain('匹配分');
  expect(header).toContain('置信度');
  expect(header).toContain('推荐策略');
  expect(header).toContain('相似标签');
  expect(header).toContain('冲突标签');
  expect(header).toContain('风险提示');

  // 7. Go to Account Workbench
  const accountComparisonNav = page.getByText('实体与账号画像', { exact: true });
  await accountComparisonNav.click();
  await expect(page.getByText('实体列表', { exact: true })).toBeVisible({ timeout: 10000 });

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

  // Verify that there are no console/runtime errors captured
  expect(errors).toHaveLength(0);
});

import { test, expect } from '@playwright/test';
import fs from 'fs';

test.describe('Single Product Portrait Workbench Mock Test', () => {
  test.skip(process.env.VITE_USE_MOCK === 'false', 'This test requires VITE_USE_MOCK=true');

  test('covers single prediction, batch success, partial failure, downloads and narrow screen', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) errors.push(msg.text());
    });

    await page.goto('/');
    await page.locator('button.app-nav__item', { hasText: '新品预测' }).click();
    await expect(page.getByRole('heading', { name: '单品画像预测' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('single-product-portrait-supervised-ridge-0.1')).toBeVisible();
    await expect(page.getByText('支持版型')).toBeVisible();

    await page.getByRole('button', { name: '填入示例' }).click();
    await page.getByRole('button', { name: '预测单款画像' }).click();
    const singleResult = page.locator('.single-portrait-result').filter({ hasText: '单款画像结果' });
    await expect(singleResult.getByRole('heading', { name: '单款画像结果' })).toBeVisible({ timeout: 15000 });
    await expect(singleResult.getByText('预测性别')).toBeVisible();
    await expect(singleResult.getByText('预测人生阶段')).toBeVisible();
    await expect(singleResult.getByText('Ridge model top positive drivers')).toBeVisible();
    await expect(singleResult.getByText('baseline_not_trained_model')).toBeVisible();
    await singleResult.getByRole('button', { name: '清空结果' }).click();
    await expect(page.getByText('暂无单款画像结果')).toBeVisible();

    await page.getByRole('button', { name: '批量预测' }).click();
    await page.setInputFiles('input[type="file"]', {
      name: 'success-batch.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('款号,版型,面料,FAB\nA,X型,全棉,通勤基础款\nB,X型,莱赛尔,舒适通勤\n'),
    });
    await page.getByRole('button', { name: '校验批量文件' }).click();
    await expect(page.getByText('总行数')).toBeVisible();
    await page.getByRole('button', { name: '执行批量预测' }).click();
    await expect(page.getByRole('heading', { name: '批量画像结果' })).toBeVisible({ timeout: 15000 });

    const [resultDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '预测结果 CSV' }).click(),
    ]);
    const resultPath = await resultDownload.path();
    expect(resultPath).toBeTruthy();
    expect(fs.readFileSync(resultPath, 'utf-8')).toContain('rowNumber,skuId,dimension,rank,label,share,confidence,sourceFields,evidenceKeywords,riskFlags');

    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '完整 JSON' }).click(),
    ]);
    expect(await jsonDownload.path()).toBeTruthy();

    await page.setInputFiles('input[type="file"]', {
      name: 'partial-batch.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('款号,版型,面料,FAB,颜色\nA,X型,全棉,通勤基础款,黑色\nB,未知版型,全棉,通勤基础款,白色\n'),
    });
    await page.getByRole('button', { name: '校验批量文件' }).click();
    await expect(page.getByText('unknown_fit_type')).toBeVisible();
    await expect(page.getByText('duplicate_sku_id_in_file')).toBeVisible();
    await expect(page.getByRole('button', { name: '预测有效行' })).toBeEnabled();
    await page.getByRole('button', { name: '预测有效行' }).click();
    await expect(page.getByRole('heading', { name: '批量画像结果' })).toBeVisible({ timeout: 15000 });

    const [errorDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '错误报告 CSV' }).click(),
    ]);
    const errorPath = await errorDownload.path();
    expect(errorPath).toBeTruthy();
    expect(fs.readFileSync(errorPath, 'utf-8')).toContain('rowNumber,skuId,field,code,message,rawValue');
    await page.locator('.single-portrait-result').filter({ hasText: '批量画像结果' }).getByRole('button', { name: '清空结果' }).click();
    await expect(page.getByRole('heading', { name: '批量画像结果' })).not.toBeVisible();

    await page.setViewportSize({ width: 390, height: 812 });
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth).toBeLessThanOrEqual(390);
    await expect(page.getByRole('button', { name: '校验批量文件' })).toBeVisible();
    expect(errors).toHaveLength(0);
  });
});

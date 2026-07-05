import { test, expect } from '@playwright/test';

test.describe('Tools Workbench', () => {
  test('loads tools catalog, performs dry run and execute', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to Tools Workbench
    await page.click('button[title="工具管理"]');
    await expect(page.locator('.page-header__title').first()).toHaveText('本地工具管理');
    
    // Check tool catalog
    await expect(page.locator('text=画像提取').first()).toBeVisible();
    await expect(page.locator('text=生意参谋人群提取').first()).toBeVisible();
    
    // Select tool
    await page.locator('.entity-list-item__name', { hasText: '生意参谋人群提取' }).first().click();
    
    // Fill execution config
    await page.fill('input[placeholder="输入本地文件或目录绝对路径"]', '/mock/test/path.csv');
    
    // Dry Run
    await page.click('button:has-text("校验配置 (Dry Run)")');
    await expect(page.locator('text=校验通过')).toBeVisible();
    
    // Execute
    await page.click('button:has-text("开始执行")');
    
    // Should switch to recent runs tab and show details
    await expect(page.locator('text=运行详情')).toBeVisible();
    await expect(page.locator('text=succeeded').first()).toBeVisible();
    
    // Check artifacts
    await expect(page.locator('text=report.md').first()).toBeVisible();
    await expect(page.locator('text=extracted_profiles.jsonl').first()).toBeVisible();
    
    // Import Dry Run
    await page.click('button:has-text("评估影响 (Dry Run)")');
    await expect(page.locator('text=Import Dry Run 分析')).toBeVisible();
    await expect(page.locator('text=channel_profile')).toBeVisible();
    
    // Preview Artifact
    await page.locator('button:has-text("预览")').first().click();
    await expect(page.locator('text=产物预览')).toBeVisible();
    await expect(page.locator('text=Mock artifact content')).toBeVisible();
    await page.click('button:has-text("关闭")');
    
    // Formal Import
    await page.click('button:has-text("正式导入")');
    await expect(page.locator('h3:has-text("确认导入")')).toBeVisible();
    
    // Actually we are in MOCK mode so the requiredConfirmText is "IMPORT TOOL RUN run_XXX"
    // So we just close it for now
    await page.click('button:has-text("取消")');
  });

  test('no horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.click('button[aria-label="打开导航"]');
    await page.click('button[title="工具管理"]');
    
    // Wait for animation
    await page.waitForTimeout(300);
    
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth);
  });
});

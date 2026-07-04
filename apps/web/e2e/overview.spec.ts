import { test, expect } from '@playwright/test';

const widths = [1440, 1024, 768, 390];

test.describe('Overview Workbench', () => {
  for (const width of widths) {
    test(`loads without page overflow at ${width}px`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', err => errors.push(err.message));
      page.on('console', msg => {
        if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) {
          errors.push(msg.text());
        }
      });

      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');

      await expect(page.getByRole('heading', { name: 'PLS 业务总览' })).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('heading', { name: '系统与数据状态' })).toBeVisible();
      await expect(page.getByRole('heading', { name: '关键指标' })).toBeVisible();
      await expect(page.getByRole('heading', { name: '模块状态' })).toBeVisible();
      await expect(page.getByRole('heading', { name: '最近动态' })).toBeVisible();

      const hasPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasPageOverflow).toBe(false);
      expect(errors).toHaveLength(0);
    });
  }
});

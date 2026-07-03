import { test, expect } from '@playwright/test';

test('Data Management Workbench - Real API Smoke', async ({ page }) => {
  // We don't want to use the mock for this specific check if we want to ensure 
  // real API format doesn't crash the page. The test suite runner sets VITE_USE_MOCK.
  
  const logs: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) {
      logs.push(msg.text());
    }
  });
  page.on('pageerror', err => logs.push(err.message));

  await page.goto('/');

  // Click on '数据管理'
  await page.getByText('数据管理', { exact: true }).click();

  // Overview tab asserts
  await expect(page.getByText('数据库总览')).toBeVisible();
  await expect(page.getByText('ws_demo')).toBeVisible();

  // Tables tab asserts
  await page.getByText('库表', { exact: true }).click();
  await expect(page.getByText('库表明细')).toBeVisible();
  await expect(page.getByText('表/视图名')).toBeVisible();

  // Test Table Details
  await page.getByText('详情', { exact: true }).first().click();
  await expect(page.getByText('表详情:')).toBeVisible();
  await page.getByText('关闭').click();

  // Setup interception to prevent actual destructive actions on the real database
  await page.route('**/admin/database/rebuild', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const postData = request.postDataJSON() || {};
      if (postData.dryRun) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'ok',
            data: { dryRun: true, impact: { affectedTables: ['sku'], affectedRows: 100, isUserAuthorized: false, warnings: ['audit/task'] } }
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'ok', data: { success: true } })
        });
      }
    } else {
      await route.continue();
    }
  });

  await page.route('**/admin/database/tables/*/truncate', async route => {
    const request = route.request();
    const headers = request.headers();
    
    // Assert headers are present
    expect(headers['x-pls-admin-token']).toBe('pls-admin-token');
    expect(headers['idempotency-key']).toBeTruthy();

    if (request.method() === 'POST') {
      const postData = request.postDataJSON() || {};
      if (postData.dryRun) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'ok',
            data: { dryRun: true, impact: { affectedTables: ['mock_table'], affectedRows: 10, isUserAuthorized: false, warnings: [] } }
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'ok', data: { success: true } })
        });
      }
    } else {
      await route.continue();
    }
  });

  // Test Dangerous Operations Flow
  await page.getByText('危险操作', { exact: true }).click();
  await page.getByText('重建整个数据库 (Rebuild)').click();

  // Modal checks for rebuild
  await expect(page.getByText('加载影响分析中')).not.toBeVisible();
  await expect(page.getByText('影响表:')).toBeVisible();
  await expect(page.getByText('影响行数:')).toBeVisible();

  // Confirmation input test
  const executeBtn = page.getByRole('button', { name: '确认执行' });
  await expect(executeBtn).toBeDisabled();

  const confirmInput = page.locator('input[type="text"]');
  await confirmInput.fill('wrong text');
  await expect(executeBtn).toBeDisabled();

  await confirmInput.fill('RESET ws_demo');
  await expect(executeBtn).toBeEnabled();

  await executeBtn.click();
  await expect(page.getByText('危险操作: RESET')).not.toBeVisible();

  // Test Non-rebuild Dangerous Operation Flow (Clear table)
  await page.getByText('库表', { exact: true }).click();
  
  // Assert "重建" button does not exist in the tables list
  await expect(page.locator('table').getByRole('button', { name: '重建' })).toHaveCount(0);

  // Find the first "清空" button and click it
  await page.getByText('清空', { exact: true }).first().click();

  await expect(page.getByText('加载影响分析中')).not.toBeVisible();
  await expect(page.getByText('影响表:')).toBeVisible();

  // Confirmation input test for truncate
  const executeTruncateBtn = page.getByRole('button', { name: '确认执行' });
  await expect(executeTruncateBtn).toBeDisabled();

  // Determine the target table name from the modal title
  const tableName = await page.locator('p:has-text("目标:")').textContent();
  const targetName = tableName?.replace('目标: ', '').trim() || '';

  const truncateInput = page.locator('input[type="text"]');
  await truncateInput.fill(`TRUNCATE ${targetName}`);
  await expect(executeTruncateBtn).toBeEnabled();

  await executeTruncateBtn.click();
  await expect(page.getByText('危险操作: CLEAR_TABLE')).not.toBeVisible();

  // Check audits tab snapshot
  await page.getByText('操作日志', { exact: true }).click();
  await expect(page.getByText('快照')).toBeVisible();

  // Wait a bit to ensure no errors are thrown asynchronously
  await page.waitForTimeout(500);
  
  expect(logs).toHaveLength(0);
});

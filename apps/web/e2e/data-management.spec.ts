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
  await expect(page.locator('.metric-card__value').filter({ hasText: 'ws_demo' }).first()).toBeVisible();

  const routeHandler = (operationName: string) => async (route: any) => {
    const request = route.request();
    const url = request.url();
    const isDryRun = (request.method() === 'POST' || request.method() === 'DELETE') 
      ? (request.postDataJSON()?.dryRun || url.includes('dry-run')) 
      : url.includes('dry-run');

    let opConfirmText = '';
    if (operationName === 'rebuild') opConfirmText = 'RESET ws_demo';
    if (operationName === 'truncate') {
      const parts = url.split('/');
      const table = parts[parts.indexOf('tables') + 1];
      opConfirmText = `TRUNCATE ${table}`;
    }
    if (operationName === 'delete_version') {
      const parts = url.split('/');
      const version = parts[parts.indexOf('versions') + 1];
      opConfirmText = `DELETE VERSION ${version}`;
    }
    if (operationName === 'apply_migrations') opConfirmText = 'APPLY MIGRATIONS';
    if (operationName === 'import') {
      const postData = request.postDataJSON() || {};
      opConfirmText = `IMPORT ${postData.packageType || 'douyin-bi'}`;
    }

    if (isDryRun) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'ok',
          data: {
            affectedTables: ['mock_table'],
            affectedRows: 10,
            isUserAuthorized: false,
            warnings: ['Mock warning: This is a high-risk operation'],
            requiredConfirmText: opConfirmText
          }
        })
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'ok',
          data: {
            success: true,
            status: 'success',
            auditId: 'mock_audit_123',
            afterSnapshot: { mocked: 'snapshot' }
          }
        })
      });
    }
  };

  await page.route('**/admin/database/rebuild', routeHandler('rebuild'));
  await page.route('**/admin/database/tables/*/truncate*', routeHandler('truncate'));
  await page.route('**/admin/database/versions/*', routeHandler('delete_version'));
  await page.route('**/admin/database/migrations/apply*', routeHandler('apply_migrations'));
  await page.route('**/admin/database/import-jobs/dry-run', routeHandler('import'));
  await page.route('**/admin/database/import-jobs', routeHandler('import'));

  // Test Dangerous Operations Flow (Rebuild)
  await page.getByText('危险操作', { exact: true }).click();
  await page.getByText('重建整个数据库 (Rebuild)').click();
  await expect(page.getByText('加载影响分析中')).not.toBeVisible();
  await expect(page.getByText('影响表:')).toBeVisible();
  await expect(page.getByText('Mock warning: This is a high-risk operation')).toBeVisible();

  const confirmInput = page.locator('input[type="text"]');
  const executeBtn = page.getByRole('button', { name: '确认执行' });
  await confirmInput.fill('wrong text');
  await expect(executeBtn).toBeDisabled();
  await confirmInput.fill('RESET ws_demo');
  await expect(executeBtn).toBeEnabled();
  await executeBtn.click();
  
  // Assert execution result screen
  await expect(page.getByText('执行结果: success')).toBeVisible();
  await expect(page.getByText('Audit ID: mock_audit_123')).toBeVisible();
  await page.getByRole('button', { name: '完成 / 关闭' }).click();
  await expect(page.getByText('危险操作: RESET')).not.toBeVisible();

  // Test Import Flow
  await page.getByText('导入', { exact: true }).click();
  await page.locator('#importPackage').selectOption('douyin-bi');
  await page.getByRole('button', { name: '导入数据包' }).click();
  await expect(page.getByText('危险操作: IMPORT')).toBeVisible();
  await expect(page.getByText('Mock warning: This is a high-risk operation')).toBeVisible();
  await confirmInput.fill('IMPORT douyin-bi');
  await executeBtn.click();
  await expect(page.getByText('执行结果: success')).toBeVisible();
  await expect(page.getByText('Audit ID: mock_audit_123')).toBeVisible();
  await page.getByRole('button', { name: '完成 / 关闭' }).click();

  // Test Versions Flow (Delete Version)
  await page.getByText('版本', { exact: true }).click();
  // Assume there is at least one delete button
  const deleteBtn = page.getByText('删除', { exact: true }).first();
  await deleteBtn.click();
  
  // Determine target version from modal
  const targetVersionText = await page.locator('p:has-text("目标:")').textContent();
  const targetVersion = targetVersionText?.replace('目标: ', '').trim() || '';
  
  await expect(page.getByText('危险操作: DELETE_VERSION')).toBeVisible();
  await confirmInput.fill(`DELETE VERSION ${targetVersion}`);
  await executeBtn.click();
  await expect(page.getByText('执行结果: success')).toBeVisible();
  await expect(page.getByText('Audit ID: mock_audit_123')).toBeVisible();
  await page.getByRole('button', { name: '完成 / 关闭' }).click();

  // Test Schema Flow (Apply Migrations)
  await page.getByText('Schema', { exact: true }).click();
  await page.getByText('Apply Migrations').click();
  await expect(page.getByText('危险操作: APPLY_MIGRATIONS')).toBeVisible();
  await confirmInput.fill('APPLY MIGRATIONS');
  await executeBtn.click();
  await expect(page.getByText('执行结果: success')).toBeVisible();
  await expect(page.getByText('Audit ID: mock_audit_123')).toBeVisible();
  await page.getByRole('button', { name: '完成 / 关闭' }).click();

  // Check audits tab snapshot
  await page.getByText('操作日志', { exact: true }).click();
  await expect(page.getByText('快照')).toBeVisible();

  await page.waitForTimeout(500);
  expect(logs).toHaveLength(0);
});

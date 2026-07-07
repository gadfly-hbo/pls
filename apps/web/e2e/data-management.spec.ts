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
  await page.locator('button.app-nav__item', { hasText: '数据管理' }).click();

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
  await expect(page.getByRole('heading', { name: '重建数据库' })).not.toBeVisible();

  // Test Import Flow
  await page.getByText('导入', { exact: true }).click();
  await page.locator('#importPackage').selectOption('douyin-bi');
  await page.getByRole('button', { name: '导入数据包' }).click();
  await expect(page.getByRole('heading', { name: '导入数据包' })).toBeVisible();
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
  const targetVersionText = await page.locator('div.operation-modal__target').textContent();
  const targetVersion = targetVersionText?.replace('目标: ', '').trim() || '';
  
  await expect(page.getByRole('heading', { name: '删除数据版本' })).toBeVisible();
  await confirmInput.fill(`DELETE VERSION ${targetVersion}`);
  await executeBtn.click();
  await expect(page.getByText('执行结果: success')).toBeVisible();
  await expect(page.getByText('Audit ID: mock_audit_123')).toBeVisible();
  await page.getByRole('button', { name: '完成 / 关闭' }).click();

  // Test Schema Flow (Apply Migrations)
  await page.getByText('Schema', { exact: true }).click();
  await page.getByText('Apply Migrations').click();
  await expect(page.getByRole('heading', { name: '应用迁移' })).toBeVisible();
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

test('CSV Ingestion Flow', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) {
      logs.push(msg.text());
    }
  });
  page.on('pageerror', err => logs.push(err.message));

  await page.goto('/');
  await page.locator('button.app-nav__item', { hasText: '数据管理' }).click();
  await page.getByText('导入', { exact: true }).click();

  let csvDryRunCall = 0;
  await page.route('**/admin/data-ingestion/csv/dry-run', async (route) => {
    csvDryRunCall++;
    const isBlocking = csvDryRunCall === 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'ok',
        data: {
          operation: 'import',
          targetType: 'csv_upload',
          targetName: 'sku',
          affectedTables: ['sku'],
          affectedRows: isBlocking ? 0 : 1,
          sourceType: 'user_authorized',
          dataVersion: null,
          containsUserAuthorized: true,
          containsSystemHistory: false,
          warnings: [],
          requiredConfirmText: 'IMPORT CSV sku',
          stagedFileId: `csv_${Date.now()}_test`,
          qualityReport: {
            rowCount: 1,
            validRows: isBlocking ? 0 : 1,
            errorRows: isBlocking ? 1 : 0,
            missingColumns: isBlocking ? ['sku_id'] : [],
            extraColumns: [],
            typeErrors: 0,
            sampleErrors: isBlocking ? [{ rowNumber: 1, column: 'sku_id', rule: 'missing_required_column', message: 'Required column "sku_id" is missing from CSV header', rawValue: '' }] : [],
            warnings: [],
            blockingErrors: isBlocking ? 1 : 0,
            requiredConfirmText: 'IMPORT CSV sku'
          }
        }
      })
    });
  });
  await page.route('**/admin/data-ingestion/csv/import', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'ok',
        data: {
          operation: 'import',
          status: 'success',
          auditId: 'mock_csv_audit_123',
          jobId: 'job_csv_123',
          beforeSnapshot: { tableRowCounts: { sku: 0 } },
          afterSnapshot: { tableRowCounts: { sku: 1 } },
          warnings: []
        }
      })
    });
  });

  // Switch to CSV import path
  await page.getByText('CSV 导入').click();

  // Select target table
  const targetTableSelect = page.locator('select').first();
  await targetTableSelect.selectOption('sku');

  // Upload blocking CSV and run dry-run
  await page.setInputFiles('input[type="file"]', {
    name: 'blocking.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('col1,col2\nx,y')
  });

  await page.getByRole('button', { name: 'Dry Run 校验' }).click();
  await expect(page.getByText('检测到')).toBeVisible();
  await expect(page.getByText('missing_required_column')).toBeVisible();

  // Upload valid CSV and run dry-run
  await page.setInputFiles('input[type="file"]', {
    name: 'valid.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('sku_id,title\nsku001,Test Product')
  });

  await page.getByRole('button', { name: 'Dry Run 校验' }).click();
  await expect(page.getByText('有效行')).toBeVisible();
  await expect(page.getByText('错误行')).toBeVisible();
  await expect(page.getByText('类型错误')).toBeVisible();
  await expect(page.locator('.metric-card').filter({ hasText: '有效行' }).locator('.metric-card__value')).toHaveText('1');
  await expect(page.getByRole('button', { name: '确认导入' })).toBeEnabled();

  // Wrong confirm text disables import
  const confirmInput = page.locator('input[type="text"]').first();
  await confirmInput.fill('wrong text');
  await expect(page.getByRole('button', { name: '确认导入' })).toBeDisabled();

  // Correct confirm text and execute
  await confirmInput.fill('IMPORT CSV sku');
  await expect(page.getByRole('button', { name: '确认导入' })).toBeEnabled();
  await page.getByRole('button', { name: '确认导入' }).click();
  await expect(page.getByText('执行结果: success')).toBeVisible();
  await expect(page.getByText('Audit ID:')).toBeVisible();

  await page.waitForTimeout(500);
  expect(logs).toHaveLength(0);
});

test('CSV Ingestion Flow - Mobile 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const logs: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) {
      logs.push(msg.text());
    }
  });
  page.on('pageerror', err => logs.push(err.message));

  await page.goto('/');
  await page.locator('button[aria-label="打开导航"]').first().click();
  await page.locator('button.app-nav__item', { hasText: '数据管理' }).click();
  await page.getByText('导入', { exact: true }).click();
  await page.getByText('CSV 导入').click();

  await page.setInputFiles('input[type="file"]', {
    name: 'valid.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('sku_id,title\nsku001,Test Product')
  });
  await page.getByRole('button', { name: 'Dry Run 校验' }).click();

  await expect(page.getByText('总行数')).toBeVisible();
  await expect(page.getByText('有效行')).toBeVisible();
  await expect(page.getByText('阻塞错误（禁止导入）')).not.toBeVisible();

  // Check no horizontal overflow
  const bodyBox = await page.locator('body').boundingBox();
  const viewport = page.viewportSize();
  if (bodyBox && viewport) {
    expect(bodyBox.width).toBeLessThanOrEqual(viewport.width);
  }

  await page.waitForTimeout(500);
  expect(logs).toHaveLength(0);
});

test('CSV Ingestion Contract - Real API shape with USE_MOCK=false', async ({ page }) => {
  test.skip(process.env.VITE_USE_MOCK !== 'false', 'Skipping real API contract test because VITE_USE_MOCK is not false');

  await page.route('/api/v0/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path === '/api/v0/admin/data-ingestion/csv/dry-run' && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'ok',
          requestId: 'req_contract',
          generatedAt: new Date().toISOString(),
          data: {
            operation: 'import',
            targetType: 'csv_upload',
            targetName: 'sku',
            affectedTables: ['sku'],
            affectedRows: 1,
            sourceType: 'user_authorized',
            dataVersion: null,
            containsUserAuthorized: true,
            containsSystemHistory: false,
            warnings: [],
            requiredConfirmText: 'IMPORT CSV sku',
            stagedFileId: 'csv_contract_test',
            qualityReport: {
              rowCount: 1,
              validRows: 1,
              errorRows: 0,
              missingColumns: [],
              extraColumns: [],
              typeErrors: 0,
              sampleErrors: [],
              warnings: [],
              blockingErrors: 0,
              requiredConfirmText: 'IMPORT CSV sku'
            }
          }
        })
      });
    }

    if (path === '/api/v0/admin/data-ingestion/csv/import' && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'ok',
          requestId: 'req_contract',
          generatedAt: new Date().toISOString(),
          data: {
            operation: 'import',
            status: 'success',
            auditId: 'audit_contract_test',
            jobId: 'job_contract_test',
            beforeSnapshot: { tableRowCounts: { sku: 0 }, totalRows: 0 },
            afterSnapshot: { tableRowCounts: { sku: 1 }, totalRows: 1 },
            warnings: []
          }
        })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'ok',
        requestId: 'req_fallback',
        generatedAt: new Date().toISOString(),
        data: {
          items: [],
          rows: [],
          tables: [],
          versions: [],
          jobs: [],
          events: [],
          migrations: [],
          overview: {
            workspaceId: 'ws_demo',
            databaseStatus: 'online',
            schemaVersion: '',
            migrationStatus: { total: 0, applied: 0, pending: 0, failed: 0 },
            tableCount: 0,
            viewCount: 0,
            totalRows: 0,
            lastImportTime: null,
            hasMockData: false,
            hasSmokeData: false,
            hasE2eData: false,
            hasUserAuthorizedData: false
          }
        }
      })
    });
  });

  const logs: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) {
      logs.push(msg.text());
    }
  });
  page.on('pageerror', err => logs.push(err.message));

  await page.goto('/');
  await page.locator('button.app-nav__item', { hasText: '数据管理' }).click();
  await page.getByText('导入', { exact: true }).click();
  await page.getByText('CSV 导入').click();

  await page.setInputFiles('input[type="file"]', {
    name: 'contract.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('sku_id,title\nsku_contract,Contract Product')
  });

  await page.getByRole('button', { name: 'Dry Run 校验' }).click();
  await expect(page.getByText('总行数')).toBeVisible();
  await expect(page.getByText('有效行')).toBeVisible();
  await expect(page.getByText('检测到')).not.toBeVisible();

  const confirmInput = page.locator('input[type="text"]').first();
  await confirmInput.fill('IMPORT CSV sku');
  await page.getByRole('button', { name: '确认导入' }).click();
  await expect(page.getByText('执行结果: success')).toBeVisible();
  await expect(page.getByText('Audit ID:')).toBeVisible();

  await page.waitForTimeout(500);
  expect(logs).toHaveLength(0);
});
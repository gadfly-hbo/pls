import { test, expect } from '@playwright/test';

const metadataResponse = {
  code: 'ok',
  data: {
    modelAvailable: true,
    fitTypes: ['X型', 'H型'],
    requiredColumns: ['款号', '版型', '面料', 'FAB'],
    maxBatchRows: 100,
    maxFileBytes: 2097152,
    modelVersion: 'single-product-portrait-supervised-ridge-0.1',
    trainedAt: '2026-07-01T00:00:00Z',
    sampleCount: 73,
    riskFlags: ['baseline_not_trained_model', 'small_sample_supervised_model', 'no_temporal_validation'],
    metricsSummary: [
      { labelType: '预测性别', top1Overlap: 0.877, top3Overlap: 1 },
      { labelType: '城市等级', top1Overlap: 0.397, top3Overlap: 0.776 },
    ],
  },
};

function prediction(skuId: string) {
  return {
    skuId,
    generatedAt: '2026-07-01T00:00:00Z',
    modelVersion: 'single-product-portrait-supervised-ridge-0.1',
    modelPath: 'supervised_ridge',
    sourceType: 'derived',
    anchorSkuId: '10A326100109',
    inputCoverage: { requiredFieldCoverage: 1, optionalSignalCoverage: 0, usedFields: ['fitType', 'fabric', 'fab'], missingFields: [] },
    platformPortraitRows: [],
    dimensionSummaries: [
      { labelType: '预测性别', topLabels: [{ label: '女', share: 0.9, tgi: null, confidence: 0.8 }], qualityFlags: [] },
      { labelType: '预测年龄段', topLabels: [{ label: '24-30', share: 0.7, tgi: null, confidence: 0.7 }], qualityFlags: [] },
      { labelType: '预测消费能力', topLabels: [{ label: '中消费', share: 0.6, tgi: null, confidence: 0.7 }], qualityFlags: [] },
      { labelType: '城市等级', topLabels: [{ label: '新一线', share: 0.38, tgi: null, confidence: 0.52 }], qualityFlags: ['low_stability_dimension'] },
      { labelType: '八大消费群体', topLabels: [{ label: '新锐白领', share: 0.31, tgi: null, confidence: 0.5 }], qualityFlags: ['low_stability_dimension'] },
      { labelType: '预测人生阶段', topLabels: [{ label: '职场发展期', share: 0.58, tgi: null, confidence: 0.68 }], qualityFlags: [] },
    ],
    riskFlags: ['baseline_not_trained_model', 'small_sample_supervised_model', 'no_temporal_validation'],
    explanationSources: [{ sourceField: '版型/面料/FAB', sourceValue: 'style_commute,fabric_cotton', ruleId: 'supervised-ridge-预测性别', targetLabelType: '预测性别', targetLabel: '女', effect: 'increase', weight: 0.42, rationale: 'Ridge model top positive drivers: style_commute, fabric_cotton.' }],
  };
}

test.describe('Single Product Portrait Real API Contract Test', () => {
  test.skip(process.env.VITE_USE_MOCK !== 'false', 'This test requires VITE_USE_MOCK=false');

  test('calls dedicated metadata, single predict, batch preview and batch execute endpoints', async ({ page }) => {
    let metadataRequested = false;
    let predictRequested = false;
    let previewRequested = false;
    let executeRequested = false;

    await page.route('**/api/v0/single-product-portrait/metadata', async (route) => {
      metadataRequested = true;
      expect(route.request().method()).toBe('GET');
      expect(route.request().headers()['x-pls-workspace']).toBe('ws_demo');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(metadataResponse) });
    });

    await page.route('**/api/v0/single-product-portrait/predict', async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.continue();
      predictRequested = true;
      expect(request.headers()['authorization']).toBe('Bearer pls-p0-demo-token');
      expect(request.headers()['x-pls-workspace']).toBe('ws_demo');
      const body = JSON.parse(request.postData() || '{}');
      expect(body).toEqual({ skuId: 'REAL_SINGLE_001', fitType: 'X型', fabric: '全棉针织', fab: '通勤基础款，舒适亲肤' });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'ok', data: { prediction: prediction(body.skuId) } }) });
    });

    await page.route('**/api/v0/single-product-portrait/predict/batch/preview', async (route) => {
      previewRequested = true;
      expect(route.request().method()).toBe('POST');
      expect(route.request().headers()['content-type']).toContain('multipart/form-data');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'ok',
          data: {
            totalRows: 4,
            validRows: 2,
            invalidRows: 2,
            fileErrors: [],
            rowErrors: [{ code: 'unknown_fit_type', message: '版型不在当前模型支持列表中', field: 'fitType', rawValue: '未知版型', rowNumber: 3, skuId: 'REAL_BAD_FIT' }],
            warnings: [
              { code: 'extra_columns_ignored', message: '忽略额外列: 颜色', field: 'file' },
              { code: 'duplicate_sku_id_in_file', message: '款号重复，首次出现在第 2 行', field: 'skuId', rawValue: 'REAL_DUP', rowNumber: 4, skuId: 'REAL_DUP' },
            ],
            extraColumns: ['颜色'],
            requiredColumns: ['款号', '版型', '面料', 'FAB'],
          },
        }),
      });
    });

    await page.route('**/api/v0/single-product-portrait/predict/batch', async (route) => {
      executeRequested = true;
      expect(route.request().method()).toBe('POST');
      expect(route.request().headers()['content-type']).toContain('multipart/form-data');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'ok',
          data: {
            totalRows: 4,
            successCount: 2,
            failureCount: 1,
            warningCount: 2,
            results: [
              { rowNumber: 2, skuId: 'REAL_BATCH_001', prediction: prediction('REAL_BATCH_001') },
              { rowNumber: 4, skuId: 'REAL_DUP', prediction: prediction('REAL_DUP') },
            ],
            fileErrors: [],
            rowErrors: [{ code: 'unknown_fit_type', message: '版型不在当前模型支持列表中', field: 'fitType', rawValue: '未知版型', rowNumber: 3, skuId: 'REAL_BAD_FIT' }],
            warnings: [{ code: 'duplicate_sku_id_in_file', message: '款号重复，首次出现在第 2 行', field: 'skuId', rawValue: 'REAL_DUP', rowNumber: 4, skuId: 'REAL_DUP' }],
            metadata: metadataResponse.data,
          },
        }),
      });
    });

    await page.goto('/');
    await page.locator('button.app-nav__item', { hasText: '新品预测' }).click();
    await expect(page.getByRole('heading', { name: '单品画像预测' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('sampleCount')).toBeVisible();

    await page.getByLabel('款号').fill('REAL_SINGLE_001');
    await page.getByLabel('版型').selectOption('X型');
    await page.getByLabel('面料').fill('全棉针织');
    await page.getByLabel('FAB').fill('通勤基础款，舒适亲肤');
    await page.getByRole('button', { name: '预测单款画像' }).click();
    const singleResult = page.locator('.single-portrait-result').filter({ hasText: '单款画像结果' });
    await expect(singleResult.getByRole('heading', { name: '单款画像结果' })).toBeVisible({ timeout: 15000 });
    await expect(singleResult.getByText('baseline_not_trained_model')).toBeVisible();

    await page.getByRole('button', { name: '批量预测' }).click();
    await page.setInputFiles('input[type="file"]', {
      name: 'real-contract.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('款号,版型,面料,FAB,颜色\nREAL_BATCH_001,X型,全棉,通勤基础款,黑色\nREAL_BAD_FIT,未知版型,全棉,通勤基础款,白色\nREAL_DUP,X型,莱赛尔,舒适通勤,蓝色\nREAL_DUP,X型,莱赛尔,舒适通勤,蓝色\n'),
    });
    await page.getByRole('button', { name: '校验批量文件' }).click();
    await expect(page.getByText('extra_columns_ignored')).toBeVisible();
    await page.getByRole('button', { name: '预测有效行' }).click();
    await expect(page.getByRole('heading', { name: '批量画像结果' })).toBeVisible({ timeout: 15000 });

    expect(metadataRequested).toBe(true);
    expect(predictRequested).toBe(true);
    expect(previewRequested).toBe(true);
    expect(executeRequested).toBe(true);
  });
});

import { test, expect, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => {
    console.error('PAGE ERROR:', err.message);
    errors.push(err.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      if (!msg.text().includes('favicon.ico')) {
        console.error('CONSOLE ERROR:', msg.text());
        errors.push(msg.text());
      }
    }
  });
  return errors;
}

const MOCK_NOW = '2026-07-19T12:00:00.000Z';

function makeReadinessResponse() {
  return {
    code: 'ok',
    requestId: 'r-test-readiness',
    generatedAt: MOCK_NOW,
    data: {
      status: 'not_released',
      contractVersion: '1',
      productionPolicyStatus: 'not_released',
      capabilities: { create: false, list: true, detail: true, archive: true, explanation: true },
      blockers: ['Portrait comparison quality policy is not yet released.'],
    },
  };
}

function makeListResponse() {
  return {
    code: 'ok',
    requestId: 'r-test-list',
    generatedAt: MOCK_NOW,
    data: {
      items: [
        {
          id: 'run_mock_001',
          mode: 'peer_same_period',
          similarityScore: 0.85,
          coverage: 100,
          qualityStatus: 'passed',
          createdAt: MOCK_NOW,
          baselineDisplayName: 'Platform A',
          comparisonDisplayName: 'Platform B',
        },
      ],
      page: { cursor: null, nextCursor: null, pageSize: 1, hasMore: false },
    },
  };
}

function makeDetailResponse(id = 'run_mock_001') {
  return {
    code: 'ok',
    requestId: 'r-test-detail',
    generatedAt: MOCK_NOW,
    data: {
      id,
      mode: 'peer_same_period',
      similarityScore: 0.85,
      coverage: 100,
      qualityStatus: 'passed',
      qualityReasons: [],
      algorithmId: 'pls-portrait-comparison',
      algorithmVersion: 'pls-v1',
      algorithmConfigChecksum: 'a'.repeat(64),
      qualityPolicyId: 'pls-portrait-comparison-quality-policy',
      qualityPolicyVersion: 'not_released@1',
      qualityPolicyConfigChecksum: 'b'.repeat(64),
      comparisonContractId: 'pls-portrait-comparison-contract',
      comparisonContractVersion: '1',
      comparisonContractChecksum: 'c'.repeat(64),
      createdAt: MOCK_NOW,
      createdBy: 'http-api',
      createdByDisplayName: null,
      baseline: {
        objectId: 'obj_a',
        displayName: 'Platform A',
        family: 'channel',
        objectType: 'platform',
        source: {
          sourceSystem: 'pls_workspace',
          sourceContractVersion: '1',
          snapshotId: 'snap_a',
          dataVersion: 'v1',
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31',
          sourceGeneratedAt: MOCK_NOW,
          sourceBatchId: 'batch_1',
          sampleSize: 1000,
          confidence: 0.95,
          qualityStatus: 'passed',
          sourceFlags: [],
          policyReasons: [],
        },
      },
      comparison: {
        objectId: 'obj_b',
        displayName: 'Platform B',
        family: 'channel',
        objectType: 'platform',
        source: {
          sourceSystem: 'pls_workspace',
          sourceContractVersion: '1',
          snapshotId: 'snap_b',
          dataVersion: 'v2',
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31',
          sourceGeneratedAt: MOCK_NOW,
          sourceBatchId: 'batch_2',
          sampleSize: 1200,
          confidence: 0.92,
          qualityStatus: 'passed',
          sourceFlags: [],
          policyReasons: [],
        },
      },
      dimensionEvidence: [],
      dimensionAssessments: [
        {
          dimensionKey: 'audience_age_distribution',
          dimensionLabel: 'Audience Age Distribution',
          expectedUnit: 'percent',
          weight: 0.5,
          participation: 'included',
          exclusionReason: null,
          baselineEvidenceId: null,
          comparisonEvidenceId: null,
          baselineNormalizedValue: 30,
          comparisonNormalizedValue: 35,
          rawDelta: 5,
          normalizedDelta: 0.05,
          dimensionSimilarity: 0.9,
          weightedContribution: 0.45,
        },
      ],
      explanationAttempts: [],
      archiveState: 'active',
      archiveEvents: [],
    },
  };
}

function makeArchiveResponse(operation: string, expectedSequence: number) {
  return {
    code: 'ok',
    requestId: 'r-test-archive',
    generatedAt: MOCK_NOW,
    data: {
      eventId: 'evt_mock_001',
      eventSequence: expectedSequence + 1,
      replayed: false,
      newState: operation === 'archived' ? 'archived' : 'active',
    },
  };
}

test.describe('Portrait Comparison Workbench', () => {
  test('shows not_released readiness and disables create in mock mode', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK === 'false', 'This test is intended for mock mode only');
    const errors = collectErrors(page);

    await page.goto('/');
    await expect(page.getByText('PLS 工作台')).toBeVisible();

    await page.locator('button[title="画像对比"]').first().click();
    await expect(page.locator('.pc-workbench__title').getByText('Portrait Comparison')).toBeVisible();

    await expect(page.locator('[data-testid="portrait-comparison-readiness"]')).toBeVisible();
    await expect(page.getByText('not_released').first()).toBeVisible();
    await expect(page.locator('[data-testid="pc-create-disabled-notice"]')).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('history list shows run and clicking opens detail', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK === 'false', 'This test is intended for mock mode only');
    const errors = collectErrors(page);

    await page.goto('/');
    await page.locator('button[title="画像对比"]').first().click();
    await expect(page.locator('.pc-workbench__title').getByText('Portrait Comparison')).toBeVisible();

    await expect(page.locator('[data-testid="pc-run-list"]')).toBeVisible();
    await expect(page.getByText('run_mock_001')).toBeVisible();
    await expect(page.getByText('Platform A vs Platform B')).toBeVisible();

    await page.locator('[data-testid="pc-run-item-run_mock_001"]').click();
    await expect(page.locator('[data-testid="pc-detail-view"]')).toBeVisible();
    await expect(page.getByText('Audience Age Distribution').first()).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('detail shows participant cards, source info, and dimension table', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK === 'false', 'This test is intended for mock mode only');
    const errors = collectErrors(page);

    await page.goto('/');
    await page.locator('button[title="画像对比"]').first().click();
    await page.locator('[data-testid="pc-run-item-run_mock_001"]').click();

    await expect(page.getByText('Platform A').first()).toBeVisible();
    await expect(page.getByText('Platform B').first()).toBeVisible();
    await expect(page.getByText('pls_workspace').first()).toBeVisible();
    await expect(page.locator('[data-testid="pc-dimension-table"]')).toBeVisible();
    await expect(page.getByText('Audience Age Distribution')).toBeVisible();
    await expect(page.getByText('included').first()).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('archive filter switches between active/archived/all', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK === 'false', 'This test is intended for mock mode only');
    const errors = collectErrors(page);

    await page.goto('/');
    await page.locator('button[title="画像对比"]').first().click();
    await expect(page.locator('[data-testid="pc-history-view"]')).toBeVisible();

    await page.locator('[data-testid="pc-archive-filter"]').selectOption('archived');
    await expect(page.locator('[data-testid="pc-empty-list"]')).toBeVisible();

    await page.locator('[data-testid="pc-archive-filter"]').selectOption('all');
    await expect(page.locator('[data-testid="pc-run-list"]')).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('real API contract requests hit /api/v0/portrait-comparisons* with backend-shaped intercepts', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK !== 'false', 'This test requires VITE_USE_MOCK=false');

    const requests: { url: string; method: string }[] = [];

    await page.route('/api/v0/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();
      requests.push({ url: route.request().url(), method });

      if (path === '/api/v0/portrait-comparisons/readiness' && method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeReadinessResponse()) });
      }
      if (path === '/api/v0/portrait-comparisons' && method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeListResponse()) });
      }
      if (path.match(/^\/api\/v0\/portrait-comparisons\/[^/]+$/) && !path.endsWith('/archive') && method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeDetailResponse()) });
      }
      if (path.match(/^\/api\/v0\/portrait-comparisons\/[^/]+\/archive$/) && method === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeArchiveResponse(body.operation, body.expectedSequence)) });
      }
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ code: 'ok', requestId: 'r-fallback', generatedAt: MOCK_NOW, data: {} }),
      });
    });

    await page.goto('/');
    await page.locator('button[title="画像对比"]').first().click();

    await expect(page.locator('[data-testid="portrait-comparison-readiness"]')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('not_released').first()).toBeVisible();
    await expect(page.locator('[data-testid="pc-run-list"]')).toBeVisible();
    await expect(page.getByText('run_mock_001')).toBeVisible();

    await page.locator('[data-testid="pc-run-item-run_mock_001"]').click();
    await expect(page.locator('[data-testid="pc-detail-view"]')).toBeVisible();
    await expect(page.getByText('Audience Age Distribution').first()).toBeVisible();

    // Assert real requests were issued (not short-circuited by USE_MOCK)
    expect(requests.some((r) => r.url.includes('/api/v0/portrait-comparisons/readiness') && r.method === 'GET')).toBe(true);
    expect(requests.some((r) => {
      const u = new URL(r.url);
      return u.pathname === '/api/v0/portrait-comparisons' && r.method === 'GET';
    })).toBe(true);
    expect(requests.some((r) => r.url.includes('/api/v0/portrait-comparisons/run_mock_001') && r.method === 'GET')).toBe(true);
  });

  test('archive sends POST with Idempotency-Key and correct body (no runId)', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK !== 'false', 'This test requires VITE_USE_MOCK=false');
    const errors = collectErrors(page);

    let archiveRequest: { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> } | null = null;

    await page.route('/api/v0/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();

      if (path === '/api/v0/portrait-comparisons/readiness' && method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeReadinessResponse()) });
      }
      if (path === '/api/v0/portrait-comparisons' && method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeListResponse()) });
      }
      if (path.match(/^\/api\/v0\/portrait-comparisons\/[^/]+$/) && !path.endsWith('/archive') && method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeDetailResponse()) });
      }
      if (path.match(/^\/api\/v0\/portrait-comparisons\/[^/]+\/archive$/) && method === 'POST') {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        archiveRequest = {
          url: route.request().url(),
          method,
          headers: route.request().headers(),
          body,
        };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeArchiveResponse('archived', 1)) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'ok', requestId: 'r-fb', generatedAt: MOCK_NOW, data: {} }) });
    });

    await page.goto('/');
    await page.locator('button[title="画像对比"]').first().click();
    await page.locator('[data-testid="pc-run-item-run_mock_001"]').click();
    await expect(page.locator('[data-testid="pc-detail-view"]')).toBeVisible();

    await page.locator('[data-testid="pc-archive-btn"]').click();

    await page.waitForTimeout(500);

    expect(archiveRequest).not.toBeNull();
    expect(archiveRequest!.url).toContain('/api/v0/portrait-comparisons/run_mock_001/archive');
    expect(archiveRequest!.method).toBe('POST');
    expect(archiveRequest!.headers['idempotency-key']).toBeTruthy();
    expect(archiveRequest!.body.operation).toBe('archived');
    expect(archiveRequest!.body.expectedCurrentState).toBe('active');
    expect(archiveRequest!.body.expectedSequence).toBe(1);
    expect(archiveRequest!.body).not.toHaveProperty('runId');

    expect(errors).toHaveLength(0);
  });

  test('409 conflict shows error banner', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK !== 'false', 'This test requires VITE_USE_MOCK=false');

    await page.route('/api/v0/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();

      if (path === '/api/v0/portrait-comparisons/readiness' && method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeReadinessResponse()) });
      }
      if (path === '/api/v0/portrait-comparisons' && method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeListResponse()) });
      }
      if (path.match(/^\/api\/v0\/portrait-comparisons\/[^/]+$/) && !path.endsWith('/archive') && method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeDetailResponse()) });
      }
      if (path.match(/^\/api\/v0\/portrait-comparisons\/[^/]+\/archive$/) && method === 'POST') {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'conflict', requestId: 'r-409', generatedAt: MOCK_NOW, error: { message: 'stale expected state: run is already archived' } }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'ok', requestId: 'r-fb', generatedAt: MOCK_NOW, data: {} }) });
    });

    await page.goto('/');
    await page.locator('button[title="画像对比"]').first().click();
    await page.locator('[data-testid="pc-run-item-run_mock_001"]').click();
    await expect(page.locator('[data-testid="pc-detail-view"]')).toBeVisible();

    await page.locator('[data-testid="pc-archive-btn"]').click();

    await expect(page.locator('[data-testid="pc-error-banner"]')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Operation conflict')).toBeVisible();
  });

  test('404 detail shows error banner', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK !== 'false', 'This test requires VITE_USE_MOCK=false');

    await page.route('/api/v0/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();

      if (path === '/api/v0/portrait-comparisons/readiness' && method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeReadinessResponse()) });
      }
      if (path === '/api/v0/portrait-comparisons' && method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeListResponse()) });
      }
      if (path.match(/^\/api\/v0\/portrait-comparisons\/[^/]+$/) && !path.endsWith('/archive') && method === 'GET') {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'not_found', requestId: 'r-404', generatedAt: MOCK_NOW, error: { message: 'comparison run run_mock_001 not found' } }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'ok', requestId: 'r-fb', generatedAt: MOCK_NOW, data: {} }) });
    });

    await page.goto('/');
    await page.locator('button[title="画像对比"]').first().click();
    await page.locator('[data-testid="pc-run-item-run_mock_001"]').click();

    await expect(page.locator('[data-testid="pc-error-banner"]')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Failed to load run detail')).toBeVisible();
  });

  test('no horizontal overflow on 390px mobile — history and detail', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK !== 'false', 'This test requires VITE_USE_MOCK=false for controlled intercepts');
    await page.setViewportSize({ width: 390, height: 844 });

    // Use backend-shaped intercepts with long field values to stress-test overflow
    const longRunId = 'run_0123456789abcdef0123456789abcdef01234567_very_long_id_suffix';
    const longChecksum = 'a'.repeat(64);
    const longSourceBatchId = 'batch_source_with_a_very_long_name_that_could_overflow_on_mobile_viewports_v1';

    await page.route('/api/v0/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();

      if (path === '/api/v0/portrait-comparisons/readiness' && method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeReadinessResponse()) });
      }
      if (path === '/api/v0/portrait-comparisons' && method === 'GET') {
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({
            code: 'ok', requestId: 'r-responsive-list', generatedAt: MOCK_NOW,
            data: {
              items: [{
                id: longRunId,
                mode: 'peer_same_period',
                similarityScore: 0.85,
                coverage: 100,
                qualityStatus: 'passed',
                createdAt: MOCK_NOW,
                baselineDisplayName: 'Very Long Baseline Display Name For Overflow Testing',
                comparisonDisplayName: 'Very Long Comparison Display Name For Overflow Testing',
              }],
              page: { cursor: null, nextCursor: null, pageSize: 1, hasMore: false },
            },
          }),
        });
      }
      if (path.match(/^\/api\/v0\/portrait-comparisons\/[^/]+$/) && !path.endsWith('/archive') && method === 'GET') {
        const detail = makeDetailResponse(longRunId);
        // Inject long checksums and source batch IDs
        detail.data.algorithmConfigChecksum = longChecksum;
        detail.data.comparisonContractChecksum = longChecksum;
        detail.data.qualityPolicyConfigChecksum = longChecksum;
        detail.data.baseline.source.sourceBatchId = longSourceBatchId;
        detail.data.comparison.source.sourceBatchId = longSourceBatchId;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'ok', requestId: 'r-fb', generatedAt: MOCK_NOW, data: {} }) });
    });

    await page.goto('/');
    await page.click('button[aria-label="打开导航"]');
    await page.click('button[title="画像对比"]');

    await expect(page.locator('.pc-workbench__title').getByText('Portrait Comparison')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="pc-run-list"]')).toBeVisible();

    // Check history view overflow
    let bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    let docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    let windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth);
    expect(docWidth).toBeLessThanOrEqual(windowWidth);

    // Open detail with long fields
    await page.locator(`[data-testid="pc-run-item-${longRunId}"]`).click();
    await expect(page.locator('[data-testid="pc-detail-view"]')).toBeVisible();
    await expect(page.getByText(longRunId).first()).toBeVisible();

    // Check detail view overflow
    bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth);
    expect(docWidth).toBeLessThanOrEqual(windowWidth);
  });

  test('error envelopes do not leak SQL, stack, or DB path', async ({ page }) => {
    test.skip(process.env.VITE_USE_MOCK !== 'false', 'This test requires VITE_USE_MOCK=false');

    await page.route('/api/v0/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();

      if (path === '/api/v0/portrait-comparisons/readiness' && method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeReadinessResponse()) });
      }
      if (path === '/api/v0/portrait-comparisons' && method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeListResponse()) });
      }
      if (path.match(/^\/api\/v0\/portrait-comparisons\/[^/]+$/) && !path.endsWith('/archive') && method === 'GET') {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'not_found', requestId: 'r-404', generatedAt: MOCK_NOW, error: { message: 'comparison run run_mock_001 not found' } }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'ok', requestId: 'r-fb', generatedAt: MOCK_NOW, data: {} }) });
    });

    await page.goto('/');
    await page.locator('button[title="画像对比"]').first().click();
    await page.locator('[data-testid="pc-run-item-run_mock_001"]').click();

    await expect(page.locator('[data-testid="pc-error-banner"]')).toBeVisible({ timeout: 5000 });

    const bannerText = await page.locator('[data-testid="pc-error-banner"]').innerText();
    const lowerBanner = bannerText.toLowerCase();
    expect(lowerBanner).not.toContain('sqlite');
    expect(lowerBanner).not.toContain('.sqlite');
    expect(lowerBanner).not.toContain('select ');
    expect(lowerBanner).not.toContain('insert ');
    expect(lowerBanner).not.toContain('update ');
    expect(lowerBanner).not.toContain('delete ');
    expect(lowerBanner).not.toContain('stack:');
    expect(lowerBanner).not.toContain('at Object.');
    expect(lowerBanner).not.toContain('node_modules');
    expect(lowerBanner).not.toContain('data/workspaces');
  });
});

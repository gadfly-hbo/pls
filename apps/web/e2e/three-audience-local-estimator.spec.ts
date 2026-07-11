import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';

function buildTmallCsv(): string {
  return '人群标签,占比\n潮流人群,39.37%\n高阶时尚,7.37%\n品质生活,12.17%\n大众实用,20.35%\n低价实惠,4.37%\n低价有颜,6.42%\n';
}

function buildTmallMarkdown(): string {
  return `# 人群分布

| 人群标签 | 占比 |
| --- | --- |
| 潮流人群 | 39.37% |
| 高阶时尚 | 7.37% |
| 品质生活 | 12.17% |
| 大众实用 | 20.35% |
| 低价实惠 | 4.37% |
| 低价有颜 | 6.42% |

其他内容
`;
}

function buildTmallXlsxBuffer(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['人群标签', '占比'],
    ['潮流人群', '39.37%'],
    ['高阶时尚', '7.37%'],
    ['品质生活', '12.17%'],
    ['大众实用', '20.35%'],
    ['低价实惠', '4.37%'],
    ['低价有颜', '6.42%'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildInvalidCsv(): string {
  return '人群标签,占比\n潮流人群,150%\n潮流人群,10%\n,5%\n大众实用,abc\n';
}

function buildDouyinMixedCsv(): string {
  return '人群标签,占比\n新锐白领,10%\nZ世代,10%\n精致妈妈,10%\n资深中产,10%\n都市蓝领,10%\n小镇青年,10%\n都市银发,10%\n小镇中老年,10%\n运动兴趣,8%\n运动兴趣,9%\n华东,7%\niPhone,6%\n';
}

function buildDouyinTotalCsv(lastShare: string): string {
  return `人群标签,占比
新锐白领,12.50%
Z世代,12.50%
精致妈妈,12.50%
资深中产,12.50%
都市蓝领,12.50%
小镇青年,12.50%
都市银发,12.50%
小镇中老年,${lastShare}
`;
}

async function navigateToThreeAudienceTab(page: any) {
  await page.goto('/');
  await page.locator('button[title="渠道画像"]').first().click();
  await page.locator('.entity-list-item__name', { hasText: '森马官方直播间' }).first().click();
  await page.locator('.segmented-control button:has-text("三大人群")').first().click();
  await expect(page.locator('text=文件和结果仅在当前浏览器会话保留').first()).toBeVisible();
}

test.describe('Three Audience Local Estimator', () => {
  test('Tab is reachable from channel object detail', async ({ page }) => {
    await navigateToThreeAudienceTab(page);
    await expect(page.locator('button:has-text("选择文件")').first()).toBeVisible();
    await expect(page.locator('button:has-text("选择文件夹")').first()).toBeVisible();
  });

  test('CSV parse and tmall calculation shows shares and coverage', async ({ page }) => {
    await navigateToThreeAudienceTab(page);

    await page.setInputFiles('input[type="file"][accept*=".csv"]', {
      name: 'tmall-audience.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(buildTmallCsv()),
    });

    await expect(page.locator('text=已选文件：').first()).toBeVisible();
    await expect(page.locator('span.tag', { hasText: 'tmall-audience.csv' }).first()).toBeVisible();

    await expect(page.locator('[data-testid="three-audience-label-column"]').first()).toHaveValue('人群标签');
    await expect(page.locator('[data-testid="three-audience-share-column"]').first()).toHaveValue('占比');

    // Calculate button is not available before mapping is confirmed
    await expect(page.locator('[data-testid="three-audience-calculate"]').first()).toHaveCount(0);

    await page.locator('[data-testid="three-audience-channel"]').first().selectOption('tmall');
    await page.locator('[data-testid="three-audience-confirm-mapping"]').first().click();
    await expect(page.locator('text=列映射已确认').first()).toBeVisible();

    await expect(page.locator('text=行级输入').first()).toBeVisible();
    await expect(page.locator('td:has-text("潮流人群")').first()).toBeVisible();

    await page.locator('[data-testid="three-audience-calculate"]').first().click();

    await expect(page.locator('text=估算结果').first()).toBeVisible();
    await expect(page.locator('text=覆盖率 coverage').first()).toBeVisible();
    await expect(page.locator('text=90.05%').first()).toBeVisible();
  });

  test('Markdown table parse and channel selection works', async ({ page }) => {
    await navigateToThreeAudienceTab(page);

    await page.setInputFiles('input[type="file"][accept*=".md"]', {
      name: 'tmall-audience.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(buildTmallMarkdown()),
    });

    await expect(page.locator('[data-testid="three-audience-label-column"]').first()).toHaveValue('人群标签');
    await expect(page.locator('[data-testid="three-audience-share-column"]').first()).toHaveValue('占比');

    await page.locator('[data-testid="three-audience-channel"]').first().selectOption('tmall');
    await page.locator('[data-testid="three-audience-confirm-mapping"]').first().click();
    await expect(page.locator('text=行级输入').first()).toBeVisible();
    await expect(page.locator('td:has-text("39.37%")').first()).toBeVisible();
  });

  test('XLSX parse and channel selection works', async ({ page }) => {
    await navigateToThreeAudienceTab(page);

    await page.setInputFiles('input[type="file"][accept*=".xlsx"]', {
      name: 'tmall-audience.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: buildTmallXlsxBuffer(),
    });

    await expect(page.locator('[data-testid="three-audience-label-column"]').first()).toHaveValue('人群标签');
    await expect(page.locator('[data-testid="three-audience-share-column"]').first()).toHaveValue('占比');

    await page.locator('[data-testid="three-audience-channel"]').first().selectOption('tmall');
    await page.locator('[data-testid="three-audience-confirm-mapping"]').first().click();
    await expect(page.locator('text=行级输入').first()).toBeVisible();
    await expect(page.locator('td:has-text("39.37%")').first()).toBeVisible();
  });

  test('Invalid input prevents calculation and shows errors', async ({ page }) => {
    await navigateToThreeAudienceTab(page);

    await page.setInputFiles('input[type="file"][accept*=".csv"]', {
      name: 'invalid.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(buildInvalidCsv()),
    });

    // Before confirming mapping, the calculate button is not even rendered
    await expect(page.locator('[data-testid="three-audience-calculate"]').first()).toHaveCount(0);

    await page.locator('[data-testid="three-audience-channel"]').first().selectOption('tmall');
    await page.locator('[data-testid="three-audience-confirm-mapping"]').first().click();

    await expect(page.locator('text=占比不能大于 100%').first()).toBeVisible();
    await expect(page.locator('text=重复标签').first()).toBeVisible();
    await expect(page.locator('text=占比非数值').first()).toBeVisible();

    const calculateButton = page.locator('[data-testid="three-audience-calculate"]').first();
    await expect(calculateButton).toBeDisabled();
  });

  test('Douyin mixed generic profile ignores non-native rows before validation', async ({ page }) => {
    await navigateToThreeAudienceTab(page);

    await page.setInputFiles('input[type="file"][accept*=".csv"]', {
      name: 'douyin-mixed-profile.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(buildDouyinMixedCsv()),
    });

    await page.locator('[data-testid="three-audience-channel"]').first().selectOption('douyin');
    await page.locator('[data-testid="three-audience-confirm-mapping"]').first().click();

    await expect(page.locator('text=已忽略 4 行非该渠道原生人群标签').first()).toBeVisible();
    await expect(page.locator('text=重复标签').first()).toHaveCount(0);
    await expect(page.locator('text=输入占比合计').first()).toHaveCount(0);
    await expect(page.locator('td:has-text("新锐白领")').first()).toBeVisible();
    await expect(page.locator('td:has-text("小镇中老年")').first()).toBeVisible();
    await expect(page.locator('td:has-text("运动兴趣")').first()).toHaveCount(0);
    await expect(page.locator('td:has-text("华东")').first()).toHaveCount(0);
    await expect(page.locator('td:has-text("iPhone")').first()).toHaveCount(0);

    await page.locator('[data-testid="three-audience-calculate"]').first().click();
    await expect(page.locator('text=估算结果').first()).toBeVisible();
    await expect(page.locator('text=覆盖率 coverage').first()).toBeVisible();
    await expect(page.locator('text=80.00%').first()).toBeVisible();
  });

  test('Douyin 100.10 percent total is accepted as rounding tolerance', async ({ page }) => {
    await navigateToThreeAudienceTab(page);

    await page.setInputFiles('input[type="file"][accept*=".csv"]', {
      name: 'douyin-tolerance.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(buildDouyinTotalCsv('12.60%')),
    });

    await page.locator('[data-testid="three-audience-channel"]').first().selectOption('douyin');
    await page.locator('[data-testid="three-audience-confirm-mapping"]').first().click();

    await expect(page.locator('text=约 100.10% 以内按四舍五入误差处理').first()).toBeVisible();
    await expect(page.locator('text=输入占比合计').first()).toHaveCount(0);
    await page.locator('[data-testid="three-audience-calculate"]').first().click();
    await expect(page.locator('text=估算结果').first()).toBeVisible();
    await expect(page.locator('text=覆盖率 coverage').first()).toBeVisible();
  });

  test('Douyin total above rounding tolerance blocks calculation', async ({ page }) => {
    await navigateToThreeAudienceTab(page);

    await page.setInputFiles('input[type="file"][accept*=".csv"]', {
      name: 'douyin-over-tolerance.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(buildDouyinTotalCsv('12.61%')),
    });

    await page.locator('[data-testid="three-audience-channel"]').first().selectOption('douyin');
    await page.locator('[data-testid="three-audience-confirm-mapping"]').first().click();

    await expect(page.locator('text=输入占比合计 100.11% 超过渠道容差').first()).toBeVisible();
    await expect(page.locator('[data-testid="three-audience-calculate"]').first()).toBeDisabled();
  });

  test('No backend requests are made in mock mode', async ({ page }) => {
    let apiCalled = false;
    await page.route('**/api/v0/**', (route) => {
      apiCalled = true;
      route.continue();
    });

    await navigateToThreeAudienceTab(page);
    await page.setInputFiles('input[type="file"][accept*=".csv"]', {
      name: 'tmall-audience.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(buildTmallCsv()),
    });
    await page.locator('[data-testid="three-audience-channel"]').first().selectOption('tmall');
    await page.locator('[data-testid="three-audience-confirm-mapping"]').first().click();
    await page.locator('[data-testid="three-audience-calculate"]').first().click();
    await expect(page.locator('text=估算结果').first()).toBeVisible();

    expect(apiCalled).toBe(false);
  });

  test('No horizontal overflow on 390px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.click('button[aria-label="打开导航"]');
    await page.click('button[title="渠道画像"]');
    await page.locator('.entity-list-item__name', { hasText: '森马官方直播间' }).first().click();
    await page.locator('.segmented-control button:has-text("三大人群")').first().click();
    await expect(page.locator('text=文件和结果仅在当前浏览器会话保留').first()).toBeVisible();

    await page.setInputFiles('input[type="file"][accept*=".csv"]', {
      name: 'tmall-audience.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(buildTmallCsv()),
    });
    await page.locator('[data-testid="three-audience-channel"]').first().selectOption('tmall');
    await page.locator('[data-testid="three-audience-confirm-mapping"]').first().click();
    await page.locator('[data-testid="three-audience-calculate"]').first().click();
    await expect(page.locator('text=估算结果').first()).toBeVisible();

    await page.waitForTimeout(300);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth);
  });
});

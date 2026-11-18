import { expect, test, type Page } from '@playwright/test';

/** 跳过首次运行对话框，并关掉语音/参考音，让导览和表单测试稳定 */
async function openApp(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'hear-chart.settings.v1',
      JSON.stringify({ tts: false, speed: 0.2, asked: true, refTone: false, lastChartId: null }),
    );
  });
  await page.goto('/');
}

test('显式勾选“首行是表头”会跳过任意首行', async ({ page }) => {
  await openApp(page);
  await page.fill('#mData', '周一,坏行\n9月,86\n10月,92');
  await page.check('#mHasHeader');
  await page.click('form button[type=submit]');

  await expect(page.locator('.chart')).toHaveAttribute('aria-label', '我的数据，折线图');
  await expect(page.locator('.err p')).toHaveCount(0);
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('9月');
  await expect(rows.nth(0)).toContainText('86');
  await expect(rows.nth(1)).toContainText('10月');
});

test('不勾选时首行坏值照常报错，不生成图表', async ({ page }) => {
  await openApp(page);
  await page.fill('#mData', '周一,坏行\n9月,86\n10月,92');
  await page.click('form button[type=submit]');

  await expect(page.locator('.err p').first()).toContainText('第 1 行');
  await expect(page.locator('.err p').first()).toContainText('周一,坏行');
  await expect(page.locator('.chart')).toHaveAttribute('aria-label', '某城市月平均气温，折线图');
});

test('导览中再次点击按钮会从头重启，而不是停住', async ({ page }) => {
  await openApp(page);
  const tour = page.locator('.tour-btn');

  await tour.click();
  await expect(tour).toContainText('体验中');
  await page.waitForTimeout(1000);

  // 第二次点击：不应被“点任意位置中断”吞掉，而是重新开始导览
  await tour.click();
  await expect(tour).toContainText('体验中');

  // 第一次导览若未被重启，此时（约 3.3 秒）应已进入闭眼模式
  await page.waitForTimeout(2300);
  await expect(tour).toContainText('体验中');
  await expect(page.locator('.blind.on')).toHaveCount(0);

  // 重启后的新导览会走完开场并进入闭眼模式
  await expect(page.locator('.blind.on')).toHaveCount(1, { timeout: 4000 });

  // 旧实现的“点任意位置中断”监听是 once，第二次点击时已被消耗；
  // 重启后点击遮罩仍应能中断，否则说明监听没有恢复
  await page.locator('.blind-tip').click();
  await expect(tour).toContainText('30 秒体验');
  await expect(page.locator('.blind.on')).toHaveCount(0);
});
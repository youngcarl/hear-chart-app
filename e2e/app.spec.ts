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

test('不勾选时 2024,x 报第 1 行错误，不生成缺行图表', async ({ page }) => {
  await openApp(page);
  await page.fill('#mData', '2024,x\n2025,20\n2026,30');
  await expect(page.locator('#mHasHeader')).not.toBeChecked();
  await page.click('form button[type=submit]');

  await expect(page.locator('.err p').first()).toContainText('第 1 行');
  await expect(page.locator('.err p').first()).toContainText('2024,x');
  await expect(page.locator('.chart')).toHaveAttribute('aria-label', '某城市月平均气温，折线图');
});

for (const activation of ['鼠标点击', '仅 click'] as const) {
  for (const phase of ['开场', '播放'] as const) {
    if (phase === '播放' && activation === '鼠标点击') continue;
    test(`导览${phase}中${activation}停止后回到空闲且不再开场`, async ({ page }) => {
      await openApp(page);
      const tour = page.locator('.tour-btn');
      const live = page.locator('[aria-live="polite"]');
      await expect(tour).toHaveText('开始体验');
      await tour.click();
      await expect(tour).toHaveText('停止体验');
      await expect(live).toHaveText('接下来请闭上眼睛，用耳朵读一张图。');
      if (phase === '播放') {
        await expect(page.locator('.blind.on')).toHaveCount(1);
      }

      if (activation === '鼠标点击') {
        await tour.click();
      } else {
        await tour.evaluate((el) => (el as HTMLButtonElement).click());
      }

      await expect(tour).toHaveText('开始体验');
      await expect(page.locator('.blind.on')).toHaveCount(0);
      await expect(live).toHaveText('体验已结束，你可以按右方向键自己试。');
      const intros = await live.evaluate((el) => new Promise<number>((resolve) => {
        let count = 0;
        const observer = new MutationObserver(() => {
          if (el.textContent?.includes('接下来请闭上眼睛')) count++;
        });
        observer.observe(el, { childList: true, subtree: true, characterData: true });
        window.setTimeout(() => {
          observer.disconnect();
          resolve(count);
        }, 3500);
      }));
      expect(intros).toBe(0);
      await expect(tour).toHaveText('开始体验');
      await expect(page.locator('.blind.on')).toHaveCount(0);
      await expect(live).toHaveText('体验已结束，你可以按右方向键自己试。');
      await expect(page.getByRole('button', { name: '停止（Esc）', exact: false })).toBeDisabled();
    });
  }
}

test('图表聚焦时重复空格阻止默认行为且不切换播放，方向键仍可长按', async ({ page }) => {
  await openApp(page);
  const chart = page.locator('.chart');
  const playback = page.getByRole('button', { name: '播放整条（空格）', exact: false });
  await chart.scrollIntoViewIfNeeded();
  await chart.focus();
  const scrollY = await page.evaluate(() => window.scrollY);
  await page.keyboard.down('Space');
  await expect(playback).toHaveCount(0);
  const pause = page.getByRole('button', { name: '暂停（空格）', exact: false });
  await expect(pause).toBeVisible();
  await page.keyboard.down('Space');
  await page.keyboard.down('Space');
  await page.waitForTimeout(300);
  await expect(pause).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  await page.keyboard.up('Space');
  const prevented = await chart.evaluate((el) => {
    const event = new KeyboardEvent('keydown', {
      key: ' ', code: 'Space', repeat: true, bubbles: true, cancelable: true,
    });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(pause).toBeVisible();
  await chart.press('Escape');
  await expect(playback).toBeVisible();
  await chart.press('Home');
  const first = await page.locator('.now').textContent();
  await chart.evaluate((el) => el.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'ArrowRight', repeat: true, bubbles: true, cancelable: true,
  })));
  await expect(page.locator('.now')).not.toHaveText(first!);
});

test('闭眼模式中文本框聚焦后 Esc 仍退出并回到图表', async ({ page }) => {
  await openApp(page);
  const chart = page.locator('.chart');
  const input = page.locator('#mData');
  await input.fill('周一,12\n周二,18');
  await chart.focus();
  await page.keyboard.press('b');
  await expect(page.locator('.blind.on')).toHaveCount(1);
  await input.focus();
  await expect(input).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.blind.on')).toHaveCount(0);
  await expect(chart).toBeFocused();
  await expect(input).toHaveValue('周一,12\n周二,18');
  await expect(page.locator('[aria-live="polite"]')).toHaveText('已退出闭眼模式。');
});

test('未开启闭眼模式时文本框 Esc 不被应用拦截', async ({ page }) => {
  await openApp(page);
  const input = page.locator('#mData');
  await input.fill('周一,12\n周二,18');
  await expect(page.locator('.blind.on')).toHaveCount(0);
  await page.evaluate(() => {
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        document.body.dataset.escapePrevented = String(event.defaultPrevented);
      }
    });
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveAttribute('data-escape-prevented', 'false');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('周一,12\n周二,18');
  await expect(page.locator('.blind.on')).toHaveCount(0);
});

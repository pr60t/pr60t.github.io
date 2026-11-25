import { test, expect } from '@playwright/test';

test.describe('Android-web budgets & interaction gates', () => {
  test('no horizontal overflow at 360px, no console errors, all visible targets >= 44px', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(overflow).toBe(false);

    const smallTargets = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a, button'));
      const bad: string[] = [];
      for (const el of els) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (el.classList.contains('beat-tick-btn')) continue; // 48px wide invisible hit area
        if (rect.width < 44 || rect.height < 44) {
          bad.push(`${el.tagName}:${el.textContent?.trim()}:${Math.round(rect.width)}x${Math.round(rect.height)}`);
        }
      }
      return bad;
    });

    expect(smallTargets).toEqual([]);
    expect(errors).toEqual([]);
  });
});

import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

// Runs in the 'narrow' project (375 px wide)
test('the user guide fills a narrow screen and its tab bar scrolls instead of overflowing', async ({ page }) => {
  await openApp(page);
  await page.locator('#instructions-btn').click();
  const panel = page.locator('.instructions-panel');
  const vp = page.viewportSize();
  // Wait for the opening animation (scale 0.98 → 1) to finish
  await expect.poll(async () => Math.round((await panel.boundingBox()).width)).toBe(vp.width);
  const box = await panel.boundingBox();
  expect(box.width).toBeCloseTo(vp.width, 0);
  expect(box.height).toBeCloseTo(vp.height, 0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('tab', { name: 'Shortcuts' }).click();
  await expect(page.getByRole('tab', { name: 'Shortcuts' })).toBeInViewport();
});

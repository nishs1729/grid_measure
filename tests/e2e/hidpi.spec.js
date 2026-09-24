import { test, expect } from '@playwright/test';
import { openApp, loadImages, selected, calibrate, clickImage, gridToPixel, pixelToGrid, imageToClient, canvasPatch } from './helpers.js';

// Runs in the 'hidpi' project (devicePixelRatio 2) and in 'desktop' (ratio 1)
test('the canvas backing store matches the pixel ratio and clicks land on the right pixel', async ({ page }) => {
  await openApp(page);
  await loadImages(page, 'straight.png');
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const size = await page.evaluate(() => {
    const c = document.getElementById('main-canvas');
    const r = c.getBoundingClientRect();
    return { w: c.width, h: c.height, cssW: r.width, cssH: r.height };
  });
  expect(size.w).toBe(Math.round(size.cssW * dpr));
  expect(size.h).toBe(Math.round(size.cssH * dpr));

  await calibrate(page, 'straight.png');
  const target = gridToPixel('straight.png', 9.5, 3.5);
  await clickImage(page, target.x, target.y);
  const p5 = (await selected(page)).points[4];
  expect(Math.abs(p5.pixelX - target.x)).toBeLessThan(1);
  expect(Math.abs(p5.pixelY - target.y)).toBeLessThan(1);
  const truth = pixelToGrid('straight.png', p5.pixelX, p5.pixelY);
  expect(Math.abs(p5.gridX - truth.x)).toBeLessThan(0.02);

  // The overlay is drawn at the right place in the high-resolution backing store too
  const onLine = gridToPixel('straight.png', 10, 5.5);
  const c = await imageToClient(page, onLine.x, onLine.y);
  const patch = await canvasPatch(page, c.x, c.y, 2 * dpr);
  expect(patch.some(([r, g, b]) => b > r + 40 && g > r + 40)).toBe(true);
});

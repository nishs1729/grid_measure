import { test, expect } from '@playwright/test';
import { openApp, loadImages, selected, imageToClient } from './helpers.js';

/** Raw touch events through the Chrome DevTools Protocol (supports multi-touch) */
async function touch(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  return {
    async tap(x, y) {
      await send('touchStart', [[x, y]]);
      await send('touchEnd', []);
    },
    async drag(from, to, steps = 8) {
      await send('touchStart', [from]);
      for (let i = 1; i <= steps; i++) {
        await send('touchMove', [[from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]]);
      }
      await send('touchEnd', []);
    },
    async pinch(center, startGap, endGap, steps = 8) {
      const at = (gap) => [[center[0] - gap / 2, center[1]], [center[0] + gap / 2, center[1]]];
      await send('touchStart', at(startGap));
      for (let i = 1; i <= steps; i++) await send('touchMove', at(startGap + ((endGap - startGap) * i) / steps));
      await send('touchEnd', []);
    },
  };
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await loadImages(page, 'large.png');
});

test('a tap adds a point where the finger touched', async ({ page }) => {
  const t = await touch(page);
  const c = await imageToClient(page, 2000, 1500);
  await t.tap(c.x, c.y);
  const pts = (await selected(page)).points;
  expect(pts).toHaveLength(1);
  const scale = (await selected(page)).view.scale;
  expect(Math.abs(pts[0].pixelX - 2000)).toBeLessThan(1 / scale);
});

test('one-finger drag on an empty area pans instead of adding a point', async ({ page }) => {
  const t = await touch(page);
  // Zoom in first so there is room to pan
  const box = await page.locator('#main-canvas').boundingBox();
  const mid = [box.x + box.width / 2, box.y + box.height / 2];
  await t.pinch(mid, 100, 400);
  const v0 = (await selected(page)).view;
  await t.drag(mid, [mid[0] + 80, mid[1] + 50]);
  const v1 = (await selected(page)).view;
  expect(v1.offsetX - v0.offsetX).toBeCloseTo(80, 0);
  expect(v1.offsetY - v0.offsetY).toBeCloseTo(50, 0);
  expect((await selected(page)).points).toHaveLength(0);
});

test('pinch zooms around the fingers without adding points', async ({ page }) => {
  const t = await touch(page);
  const box = await page.locator('#main-canvas').boundingBox();
  const mid = [box.x + box.width / 2, box.y + box.height / 2];
  const v0 = (await selected(page)).view;
  const anchor = { x: (mid[0] - box.x - v0.offsetX) / v0.scale, y: (mid[1] - box.y - v0.offsetY) / v0.scale };
  await t.pinch(mid, 100, 300);
  const v1 = (await selected(page)).view;
  expect(v1.scale / v0.scale).toBeCloseTo(3, 1);
  const after = { x: (mid[0] - box.x - v1.offsetX) / v1.scale, y: (mid[1] - box.y - v1.offsetY) / v1.scale };
  expect(Math.abs(after.x - anchor.x)).toBeLessThan(2);
  expect(Math.abs(after.y - anchor.y)).toBeLessThan(2);
  expect((await selected(page)).points).toHaveLength(0);
});

test('press and drag on a point moves it', async ({ page }) => {
  const t = await touch(page);
  const a = await imageToClient(page, 2000, 1500);
  await t.tap(a.x, a.y);
  await t.drag([a.x, a.y], [a.x + 40, a.y + 30]);
  const pts = (await selected(page)).points;
  expect(pts).toHaveLength(1);
  const scale = (await selected(page)).view.scale;
  expect(pts[0].pixelX - 2000).toBeCloseTo(40 / scale, -1);
});

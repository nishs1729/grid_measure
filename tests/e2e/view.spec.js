import { test, expect } from '@playwright/test';
import { openApp, loadImages, selected, clickImage, imageToClient } from './helpers.js';

const EDGE_MARGIN = 48;

async function canvasBox(page) {
  return page.locator('#main-canvas').boundingBox();
}

/** Image pixel currently under a client point */
async function pixelAt(page, x, y) {
  return page.evaluate(([x, y]) => {
    const s = window.__gm.state;
    const img = s.images.find((i) => i.id === s.selectedImageId);
    const r = document.getElementById('main-canvas').getBoundingClientRect();
    return { x: (x - r.left - img.view.offsetX) / img.view.scale, y: (y - r.top - img.view.offsetY) / img.view.scale };
  }, [x, y]);
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await loadImages(page, 'large.png');
});

test('Ctrl + wheel zooms around the cursor; clicks still land on the right pixel', async ({ page }) => {
  // Wheel events carry whole-pixel coordinates, so hover a whole screen pixel
  const raw = await imageToClient(page, 1500, 1200);
  const c = { x: Math.round(raw.x), y: Math.round(raw.y) };
  const target = await pixelAt(page, c.x, c.y);
  await page.mouse.move(c.x, c.y);
  const scale0 = (await selected(page)).view.scale;
  await page.keyboard.down('Control');
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  const v = (await selected(page)).view;
  expect(v.scale).toBeGreaterThan(scale0 * 3);
  const under = await pixelAt(page, c.x, c.y);
  expect(Math.abs(under.x - target.x)).toBeLessThan(1e-6);
  expect(Math.abs(under.y - target.y)).toBeLessThan(1e-6);
  await expect(page.locator('#zoom-level')).toHaveText(`${Math.round(v.scale * 100)}%`);

  await page.mouse.click(c.x, c.y);
  const p1 = (await selected(page)).points[0];
  expect(Math.abs(p1.pixelX - target.x)).toBeLessThan(1 / v.scale);
  expect(Math.abs(p1.pixelY - target.y)).toBeLessThan(1 / v.scale);
});

test('zoom is limited to half the fit scale and 3200%', async ({ page }) => {
  const box = await canvasBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const fit = (await selected(page)).view.scale;
  await page.keyboard.down('Control');
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 500);
  expect((await selected(page)).view.scale).toBeCloseTo(fit / 2, 9);
  for (let i = 0; i < 60; i++) await page.mouse.wheel(0, -500);
  expect((await selected(page)).view.scale).toBe(32);
  await page.keyboard.up('Control');
});

test('wheel scrolls vertically, Shift + wheel horizontally, and both stop at the edges', async ({ page }) => {
  const box = await canvasBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  const v0 = (await selected(page)).view;

  await page.mouse.wheel(0, 100);
  const v1 = (await selected(page)).view;
  expect(v1.offsetY).toBeCloseTo(v0.offsetY - 100, 6);
  expect(v1.offsetX).toBeCloseTo(v0.offsetX, 6);

  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Shift');
  const v2 = (await selected(page)).view;
  expect(v2.offsetX).toBeCloseTo(v1.offsetX - 100, 6);

  // Far past the edges
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -5000);
  expect((await selected(page)).view.offsetY).toBeCloseTo(EDGE_MARGIN, 6);
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 5000);
  const v = (await selected(page)).view;
  expect(v.offsetY).toBeCloseTo(box.height - 3000 * v.scale - EDGE_MARGIN, 3);
});

test('at fit the image is centred and cannot be scrolled', async ({ page }) => {
  const box = await canvasBox(page);
  const v0 = (await selected(page)).view;
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.wheel(0, 300);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 300);
  await page.keyboard.up('Shift');
  expect((await selected(page)).view).toEqual(v0);
});

test('Space + drag and middle-drag pan without adding points', async ({ page }) => {
  const box = await canvasBox(page);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.keyboard.down('Control');
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');

  const v0 = (await selected(page)).view;
  await page.keyboard.down(' ');
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy + 40, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up(' ');
  const v1 = (await selected(page)).view;
  expect(v1.offsetX - v0.offsetX).toBeCloseTo(60, 3);
  expect(v1.offsetY - v0.offsetY).toBeCloseTo(40, 3);

  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(cx - 30, cy - 10, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  const v2 = (await selected(page)).view;
  expect(v2.offsetX - v1.offsetX).toBeCloseTo(-30, 3);
  expect((await selected(page)).points).toHaveLength(0);
});

test('0, F and the Fit button return to fit-to-window', async ({ page }) => {
  const fit = (await selected(page)).view;
  const box = await canvasBox(page);
  await page.mouse.move(box.x + 200, box.y + 200);
  for (const reset of [() => page.keyboard.press('0'), () => page.keyboard.press('f'), () => page.locator('#fit-view-btn').click()]) {
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -600);
    await page.keyboard.up('Control');
    expect((await selected(page)).view.scale).toBeGreaterThan(fit.scale);
    await reset();
    const v = (await selected(page)).view;
    expect(v.scale).toBeCloseTo(fit.scale, 9);
    expect(v.offsetX).toBeCloseTo(fit.offsetX, 6);
    expect(v.offsetY).toBeCloseTo(fit.offsetY, 6);
    await page.mouse.move(box.x + 200, box.y + 200);
  }
});

test('each image keeps its own zoom and position', async ({ page }) => {
  await loadImages(page, 'straight.png');
  const box = await canvasBox(page);
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -600);
  await page.keyboard.up('Control');
  const straightView = (await selected(page)).view;
  await page.keyboard.press('[');
  expect((await selected(page)).name).toBe('large.png');
  await page.keyboard.press(']');
  expect((await selected(page)).view).toEqual(straightView);
});

test('resizing the window keeps the centre pixel in place', async ({ page }) => {
  const box = await canvasBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  const before = await pixelAt(page, box.x + box.width / 2, box.y + box.height / 2);
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.waitForTimeout(100);
  const box2 = await canvasBox(page);
  const after = await pixelAt(page, box2.x + box2.width / 2, box2.y + box2.height / 2);
  expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
});

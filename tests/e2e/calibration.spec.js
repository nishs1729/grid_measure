import { test, expect } from '@playwright/test';
import {
  openApp,
  loadImages,
  selected,
  calibrate,
  clickImage,
  setCalibDst,
  gridToPixel,
  pixelToGrid,
  clickTolerance,
  UNIT,
} from './helpers.js';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('P1–P4 on the straight grid recover the true mapping', async ({ page }) => {
  await loadImages(page, 'straight.png');
  await calibrate(page, 'straight.png');

  // A measurement point anywhere must get its true grid coordinates
  const target = gridToPixel('straight.png', 4.5, 7.5);
  await clickImage(page, target.x, target.y);
  const img = await selected(page);
  const p5 = img.points[4];
  const truth = pixelToGrid('straight.png', p5.pixelX, p5.pixelY);
  const tol = clickTolerance(img.view, 50);
  expect(Math.abs(p5.gridX - truth.x)).toBeLessThan(tol);
  expect(Math.abs(p5.gridY - truth.y)).toBeLessThan(tol);
  expect(p5.label).toBe('P5');
});

test('strong perspective: 10×10 block calibration', async ({ page }) => {
  await loadImages(page, 'tilted.png');
  const dst = UNIT.map((p) => ({ x: p.x * 10, y: p.y * 10 }));
  await setCalibDst(page, dst);
  await calibrate(page, 'tilted.png', dst);

  for (const [gx, gy] of [[2, 3], [8, 8], [5, 1]]) {
    const p = gridToPixel('tilted.png', gx, gy);
    await clickImage(page, p.x, p.y);
  }
  const img = await selected(page);
  for (const p of img.points.slice(4)) {
    const truth = pixelToGrid('tilted.png', p.pixelX, p.pixelY);
    expect(Math.abs(p.gridX - truth.x)).toBeLessThan(0.05);
    expect(Math.abs(p.gridY - truth.y)).toBeLessThan(0.05);
  }
});

test('thumbnail status: yellow while calibrating, green with measurements, red when calibration fails', async ({ page }) => {
  await loadImages(page, 'straight.png');
  const thumb = page.locator('.thumb-item').first();
  await expect(thumb).not.toHaveClass(/border-/);

  await clickImage(page, 100, 500);
  await expect(thumb).toHaveClass(/border-yellow/);
  await clickImage(page, 150, 500);
  await clickImage(page, 150, 450);
  await clickImage(page, 100, 450);
  await expect(thumb).toHaveClass(/border-yellow/); // calibrated, no measurements yet
  await clickImage(page, 300, 300);
  await expect(thumb).toHaveClass(/border-green/);

  // Collinear P1–P3 → calibration fails
  page.once('dialog', (d) => d.accept());
  await page.locator('#reset-points-btn').click();
  for (const [x, y] of [[100, 100], [200, 100], [300, 100], [100, 300]]) await clickImage(page, x, y);
  await expect(thumb).toHaveClass(/border-red/);
  await expect(page.locator('#status-message')).toContainText('Calibration failed');
});

test('diagnostics for the straight-on grid: no rotation, square, orthogonal', async ({ page }) => {
  await loadImages(page, 'straight.png');
  await calibrate(page, 'straight.png');
  const cards = page.locator('#calibration-diagnostics');
  await expect(cards).toContainText('Rotation');
  await expect(cards.locator('.diag-card', { hasText: 'Rotation' })).toContainText(/[+-]0\.0°/);
  await expect(cards.locator('.diag-card', { hasText: 'Aspect Ratio' })).toContainText('Square ✓');
  await expect(cards.locator('.diag-card', { hasText: 'Corner Angle' })).toContainText('Orthogonal ✓');
  await expect(cards.locator('.diag-card', { hasText: 'Scale' })).toContainText('50.0 px/unit');
});

test('changing P1–P4 grid coordinates recalibrates the image', async ({ page }) => {
  await loadImages(page, 'straight.png');
  await calibrate(page, 'straight.png');
  const p = gridToPixel('straight.png', 2, 2);
  await clickImage(page, p.x, p.y);
  await setCalibDst(page, UNIT.map((q) => ({ x: q.x * 2, y: q.y * 2 })));
  const img = await selected(page);
  // The same pixels now mean twice the grid units
  expect(Math.abs(img.points[4].gridX - 4)).toBeLessThan(0.1);
  expect(Math.abs(img.points[4].gridY - 4)).toBeLessThan(0.1);
});

test('grid unit size and unit are remembered across a reload', async ({ page }) => {
  await page.fill('#grid-unit-size', '2.5');
  await page.selectOption('#grid-unit-label', 'µm');
  await page.reload();
  await page.waitForFunction(() => !!window.__gm);
  await expect(page.locator('#grid-unit-size')).toHaveValue('2.5');
  await expect(page.locator('#grid-unit-label')).toHaveValue('µm');
  expect(await page.evaluate(() => [window.__gm.state.gridUnitSize, window.__gm.state.gridUnitLabel])).toEqual([2.5, 'µm']);
});

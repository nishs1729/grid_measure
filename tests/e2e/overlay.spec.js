import { test, expect } from '@playwright/test';
import { openApp, loadImages, calibrate, imageToClient, canvasPatch, gridToPixel, appState, UNIT, setCalibDst } from './helpers.js';

const isCyanish = ([r, g, b]) => b > r + 40 && g > r + 40; // cyan over white/black
const isYellowish = ([r, g, b]) => r > b + 60 && g > b + 60;

/** Canvas pixels in a small patch around the true pixel of grid point (gx, gy) */
async function sampleGrid(page, fixture, gx, gy) {
  const p = gridToPixel(fixture, gx, gy);
  const c = await imageToClient(page, p.x, p.y);
  return canvasPatch(page, c.x, c.y, 2);
}
const anyCyan = (patch) => patch.some(isCyanish);
const anyYellow = (patch) => patch.some(isYellowish);

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('the fitted grid is drawn on the true grid lines; hidden with G', async ({ page }) => {
  await loadImages(page, 'straight.png');
  await calibrate(page, 'straight.png');
  // A point on a grid line far from the calibration square (x = 10, halfway between rows)
  expect(anyCyan(await sampleGrid(page, 'straight.png', 10, 5.5))).toBe(true);
  // Halfway between lines there is no overlay: the whole patch is white paper
  const between = await sampleGrid(page, 'straight.png', 10.5, 5.5);
  expect(between.every(([r, g, b]) => r > 240 && g > 240 && b > 240)).toBe(true);
  // Calibration square edge is yellow
  expect(anyYellow(await sampleGrid(page, 'straight.png', 0.5, 0))).toBe(true);

  await page.keyboard.press('g');
  expect((await appState(page)).showGrid).toBe(false);
  expect(anyCyan(await sampleGrid(page, 'straight.png', 10, 5.5))).toBe(false);
  await page.locator('#grid-toggle').click();
  expect(anyCyan(await sampleGrid(page, 'straight.png', 10, 5.5))).toBe(true);
  await expect(page.locator('#grid-toggle')).toHaveClass(/active/);
});

test('tilted grid: overlay follows the perspective', async ({ page }) => {
  await loadImages(page, 'tilted.png');
  const dst = UNIT.map((p) => ({ x: p.x * 10, y: p.y * 10 }));
  await setCalibDst(page, dst);
  await calibrate(page, 'tilted.png', dst);
  for (const [gx, gy] of [[3, 7.5], [12, 0.5], [-2, 5.5], [7.5, 11]]) {
    expect(anyCyan(await sampleGrid(page, 'tilted.png', gx, gy)), `grid (${gx}, ${gy})`).toBe(true);
  }
});

test('no overlay before calibration', async ({ page }) => {
  await loadImages(page, 'straight.png');
  expect(anyCyan(await sampleGrid(page, 'straight.png', 10, 5.5))).toBe(false);
});

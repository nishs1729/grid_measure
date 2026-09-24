import { test, expect } from '@playwright/test';
import { openApp, loadImages, selected, appState, calibrate, clickImage, dragImage, imageToClient, handleDialogs } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await loadImages(page, 'straight.png');
  await calibrate(page, 'straight.png');
  await clickImage(page, 300, 300); // P5
});

test('points are listed in the sidebar with pixel and grid coordinates', async ({ page }) => {
  const rows = page.locator('.point-row');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0)).toContainText('P1');
  await expect(rows.nth(0)).toContainText('CALIB');
  await expect(rows.nth(4)).toContainText('MEAS');
  // P5 at pixel (300, 300) on the straight grid is grid (4, 4)
  const text = await rows.nth(4).textContent();
  const [, gx, gy] = text.match(/grid: \(([-\d.]+), ([-\d.]+)\)/);
  expect(Math.abs(Number(gx) - 4)).toBeLessThan(0.05);
  expect(Math.abs(Number(gy) - 4)).toBeLessThan(0.05);
  expect(text).toMatch(/img: \(\d+\.\d, \d+\.\d\)/);
});

test('a click with a little jitter selects a point instead of moving it', async ({ page }) => {
  const before = (await selected(page)).points[4];
  const c = await imageToClient(page, 300, 300);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 2, c.y + 1);
  await page.mouse.up();
  const after = (await selected(page)).points[4];
  expect(after.pixelX).toBe(before.pixelX);
  expect((await appState(page)).selectedPointIndex).toBe(4);
  expect((await appState(page)).images[0].n).toBe(5);
  await expect(page.locator('#status-message')).toContainText('P5 selected');
  await expect(page.locator('.point-row').nth(4)).toHaveClass(/selected/);
});

test('dragging moves a point and selects it', async ({ page }) => {
  await dragImage(page, { x: 300, y: 300 }, { x: 350, y: 250 });
  const p5 = (await selected(page)).points[4];
  expect(Math.abs(p5.pixelX - 350)).toBeLessThan(1);
  expect(Math.abs(p5.pixelY - 250)).toBeLessThan(1);
  expect((await appState(page)).selectedPointIndex).toBe(4);
});

test('dragging a calibration point recalibrates the measurement points', async ({ page }) => {
  const before = (await selected(page)).points[4].gridX;
  await dragImage(page, { x: 150, y: 500 }, { x: 200, y: 500 }); // P2 one cell further
  const after = (await selected(page)).points[4].gridX;
  expect(after).not.toBeCloseTo(before, 2);
});

test('releasing the mouse outside the canvas ends the drag', async ({ page }) => {
  const c = await imageToClient(page, 300, 300);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 20, c.y, { steps: 3 });
  await page.mouse.move(5, 5, { steps: 5 }); // over the header, outside the canvas
  await page.mouse.up();
  expect(await page.evaluate(() => window.__gm.state.drag.active)).toBe(false);
  // Moving back over the canvas must not move the point any more
  const p = (await selected(page)).points[4];
  await page.mouse.move(c.x + 100, c.y + 100, { steps: 3 });
  expect((await selected(page)).points[4].pixelX).toBe(p.pixelX);
});

test('the dragged point stays inside the image', async ({ page }) => {
  await dragImage(page, { x: 300, y: 300 }, { x: -500, y: -500 });
  const p5 = (await selected(page)).points[4];
  expect(p5.pixelX).toBeGreaterThanOrEqual(0);
  expect(p5.pixelY).toBeGreaterThanOrEqual(0);
});

test('arrow keys nudge the selected point by 0.1 / 1 / 10 px', async ({ page }) => {
  await page.locator('.point-row').nth(4).click();
  const start = (await selected(page)).points[4];
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Alt+ArrowLeft');
  const p = (await selected(page)).points[4];
  expect(p.pixelX).toBeCloseTo(Math.round((start.pixelX + 0.2) * 100) / 100 - 10, 5);
  expect(p.pixelY).toBeCloseTo(Math.round((start.pixelY + 1) * 100) / 100, 5);
});

test('nudging stops at the image edge', async ({ page }) => {
  await page.locator('.point-row').nth(4).click();
  for (let i = 0; i < 40; i++) await page.keyboard.press('Alt+ArrowUp');
  expect((await selected(page)).points[4].pixelY).toBe(0);
});

test('arrow keys do nothing without a selection; Esc clears the selection', async ({ page }) => {
  const before = (await selected(page)).points[4];
  await page.keyboard.press('ArrowRight');
  expect((await selected(page)).points[4].pixelX).toBe(before.pixelX);
  await page.locator('.point-row').nth(4).click();
  await page.keyboard.press('Escape');
  expect((await appState(page)).selectedPointIndex).toBe(-1);
});

test('clicking empty image area clears the selection and adds a point', async ({ page }) => {
  await page.locator('.point-row').nth(2).click();
  await clickImage(page, 600, 100);
  expect((await appState(page)).selectedPointIndex).toBe(-1);
  expect((await selected(page)).points).toHaveLength(6);
});

test('Delete, Backspace, the × button and Delete Last remove the newest point', async ({ page }) => {
  await clickImage(page, 400, 300);
  await clickImage(page, 500, 300);
  await clickImage(page, 600, 300);
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  expect((await selected(page)).points).toHaveLength(6);
  await page.locator('.point-row').last().hover(); // the × only shows on hover
  await page.locator('.point-delete-btn').click();
  await page.locator('#delete-last-btn').click();
  expect((await selected(page)).points).toHaveLength(4);
  expect((await selected(page)).calibrated).toBe(true);
  await page.keyboard.press('Delete');
  expect((await selected(page)).calibrated).toBe(false);
});

test('R resets after confirmation; dismissing keeps the points', async ({ page }) => {
  const dialogs = handleDialogs(page, { accept: false });
  await page.keyboard.press('r');
  expect(dialogs[0].message).toContain('Remove all points');
  expect((await selected(page)).points).toHaveLength(5);
  page.removeAllListeners('dialog');
  handleDialogs(page, { accept: true });
  await page.keyboard.press('R');
  expect((await selected(page)).points).toHaveLength(0);
});

test('shortcuts are ignored while typing in a sidebar field', async ({ page }) => {
  await page.locator('#grid-unit-size').click();
  await page.keyboard.type('12');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('r');
  expect((await selected(page)).points).toHaveLength(5);
  await expect(page.locator('#grid-unit-size')).toHaveValue('1');
});

test('image navigation with ] [ PageDown PageUp keeps each image\'s points', async ({ page }) => {
  await loadImages(page, 'tilted.png'); // selects tilted
  await page.keyboard.press('[');
  expect((await selected(page)).name).toBe('straight.png');
  await page.keyboard.press('[');
  expect((await selected(page)).name).toBe('straight.png');
  await page.keyboard.press('PageDown');
  expect((await selected(page)).name).toBe('tilted.png');
  expect((await selected(page)).points).toHaveLength(0);
  await page.keyboard.press('PageUp');
  expect((await selected(page)).points).toHaveLength(5);
});

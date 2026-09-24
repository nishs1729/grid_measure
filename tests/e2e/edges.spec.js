import { test, expect } from '@playwright/test';
import { openApp, loadImages, selected, appState, calibrate, clickImage, dragImage, imageToClient } from './helpers.js';

// Straight grid calibration square: P1 (100,500) P2 (150,500) P3 (150,450) P4 (100,450)
test.beforeEach(async ({ page }) => {
  await openApp(page);
  await loadImages(page, 'straight.png');
  await calibrate(page, 'straight.png');
  await clickImage(page, 400, 200); // P5
});

const corners = async (page) => (await selected(page)).points.slice(0, 4).map((p) => ({ x: p.pixelX, y: p.pixelY }));

test('Ctrl + hover highlights an edge with a move cursor; releasing Ctrl clears it', async ({ page }) => {
  const mid = await imageToClient(page, 150, 475); // middle of edge P2–P3
  await page.mouse.move(mid.x, mid.y);
  await page.keyboard.down('Control');
  await expect.poll(async () => (await appState(page)).hoveredEdgeIndex).toBe(1);
  await expect(page.locator('#main-canvas')).toHaveCSS('cursor', 'move');
  await page.keyboard.up('Control');
  await expect.poll(async () => (await appState(page)).hoveredEdgeIndex).toBe(-1);
});

test('Ctrl + drag translates the edge; the other two points stay put', async ({ page }) => {
  const before = await corners(page);
  const p5Before = (await selected(page)).points[4].gridX;
  await dragImage(page, { x: 150, y: 475 }, { x: 180, y: 455 }, { modifiers: ['Control'] });
  const after = await corners(page);
  const d = { x: after[1].x - before[1].x, y: after[1].y - before[1].y };
  expect(Math.abs(d.x - 30)).toBeLessThan(1.5);
  expect(Math.abs(d.y + 20)).toBeLessThan(1.5);
  // Both ends moved by exactly the same amount → same length and direction
  expect(after[2].x - before[2].x).toBeCloseTo(d.x, 9);
  expect(after[2].y - before[2].y).toBeCloseTo(d.y, 9);
  expect(after[0]).toEqual(before[0]);
  expect(after[3]).toEqual(before[3]);
  // Calibration followed, and no point was added
  const img = await selected(page);
  expect(img.points).toHaveLength(5);
  expect(img.calibrated).toBe(true);
  expect(img.points[4].gridX).not.toBeCloseTo(p5Before, 3);
});

test('Cmd (Meta) works like Ctrl', async ({ page }) => {
  const before = await corners(page);
  await dragImage(page, { x: 125, y: 450 }, { x: 125, y: 420 }, { modifiers: ['Meta'] }); // top edge P3–P4
  const after = await corners(page);
  expect(Math.abs(after[2].y - before[2].y + 30)).toBeLessThan(1.5);
  expect(after[3].y - before[3].y).toBeCloseTo(after[2].y - before[2].y, 9);
});

test('the edge stops at the image border', async ({ page }) => {
  await dragImage(page, { x: 100, y: 475 }, { x: -400, y: 475 }, { modifiers: ['Control'], steps: 20 }); // left edge P4–P1
  const c = await corners(page);
  expect(Math.min(c[0].x, c[3].x)).toBe(0);
  expect(c[0].x).toBe(c[3].x);
});

test('Ctrl + press on empty space or a corner does nothing', async ({ page }) => {
  const before = await corners(page);
  await clickImage(page, 600, 100, { modifiers: ['Control'] });
  await dragImage(page, { x: 100, y: 500 }, { x: 140, y: 520 }, { modifiers: ['Control'] }); // on P1
  expect(await corners(page)).toEqual(before);
  expect((await selected(page)).points).toHaveLength(5);
});

test('edges cannot be grabbed while the grid overlay is hidden', async ({ page }) => {
  await page.keyboard.press('g');
  const before = await corners(page);
  await dragImage(page, { x: 150, y: 475 }, { x: 200, y: 475 }, { modifiers: ['Control'] });
  expect(await corners(page)).toEqual(before);
});

test('a plain click on an edge still adds a point', async ({ page }) => {
  await clickImage(page, 125, 500);
  expect((await selected(page)).points).toHaveLength(6);
});

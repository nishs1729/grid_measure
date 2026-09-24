import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { openApp, loadImages, calibrate, clickImage, gridToPixel, handleDialogs } from './helpers.js';
import { parseCsv } from '../../js/csvFormat.js';

/** Click an export button and return { name, text } of the downloaded file */
async function download(page, action) {
  const [dl] = await Promise.all([page.waitForEvent('download'), action()]);
  return { name: dl.suggestedFilename(), text: readFileSync(await dl.path(), 'utf8') };
}

function rowsByName(text) {
  const { header, rows } = parseCsv(text);
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

async function placeGridPoints(page, fixture, points) {
  for (const [gx, gy] of points) {
    const p = gridToPixel(fixture, gx, gy);
    await clickImage(page, p.x, p.y);
  }
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('export: file name, header, values, and a confirm listing skipped images', async ({ page }) => {
  await page.fill('#grid-unit-size', '5');
  await page.selectOption('#grid-unit-label', 'cm');
  await loadImages(page, 'straight.png', 'tilted.png', 'small.png');
  await calibrate(page, 'straight.png');
  await placeGridPoints(page, 'straight.png', [[4, 4], [8, 2]]);

  const dialogs = handleDialogs(page, { accept: true });
  const { name, text } = await download(page, () => page.locator('#export-new-csv').click());
  expect(name).toMatch(/^gridmeasure_\d{4}-\d{2}-\d{2}_\d{6}\.csv$/);
  expect(dialogs[0].message).toContain('2 image(s) will be skipped');
  expect(dialogs[0].message).toContain('tilted.png, small.png');

  const [row, ...rest] = rowsByName(text);
  expect(rest).toHaveLength(0);
  expect(row.image).toBe('straight.png');
  expect([row.image_width, row.image_height, row.grid_unit_size, row.grid_unit]).toEqual(['800', '600', '5', 'cm']);
  expect(row.P1_pixel_x).toMatch(/^\d+\.\d{2}$/);
  expect([row.P3_grid_x, row.P3_grid_y]).toEqual(['1', '1']);
  expect(Math.abs(Number(row.P5_grid_x) - 4)).toBeLessThan(0.05);
  expect(Math.abs(Number(row.P6_grid_y) - 2)).toBeLessThan(0.05);
  expect(row.P6_grid_x).toMatch(/^-?\d+\.\d{4}$/);
});

test('dismissing the skip confirm cancels the export', async ({ page }) => {
  await loadImages(page, 'straight.png', 'small.png');
  await calibrate(page, 'straight.png');
  handleDialogs(page, { accept: false });
  let downloaded = false;
  page.on('download', () => (downloaded = true));
  await page.locator('#export-new-csv').click();
  await page.waitForTimeout(300);
  expect(downloaded).toBe(false);
});

test('export with nothing calibrated shows an alert and downloads nothing', async ({ page }) => {
  await loadImages(page, 'straight.png');
  const dialogs = handleDialogs(page);
  await page.locator('#export-new-csv').click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toMatchObject({ type: 'alert' });
  expect(dialogs[0].message).toContain('No images have a successful calibration');
});

test('append to an old-format CSV: rows re-mapped by name, extra columns kept', async ({ page }) => {
  await loadImages(page, 'straight.png');
  await calibrate(page, 'straight.png');
  await placeGridPoints(page, 'straight.png', [[3, 3]]);

  const old = [
    'image,image_width,image_height,P1_pixel_x,P1_pixel_y,P2_pixel_x,P2_pixel_y,P3_pixel_x,P3_pixel_y,P4_pixel_x,P4_pixel_y,P1_grid_x,P1_grid_y,P2_grid_x,P2_grid_y,P3_grid_x,P3_grid_y,P4_grid_x,P4_grid_y,P5_grid_x,P5_grid_y,P6_grid_x,P6_grid_y,note',
    'old.jpg,10,20,1,2,3,4,5,6,7,8,0,0,1,0,1,1,0,1,0.5,0.5,0.6,0.6,"keep, me"',
  ].join('\n');
  const { name, text } = await download(page, () =>
    page.setInputFiles('#append-file-input', { name: 'data_updated_2026-01-01_000000.csv', mimeType: 'text/csv', buffer: Buffer.from(old) })
  );
  expect(name).toMatch(/^data_updated_\d{4}-\d{2}-\d{2}_\d{6}\.csv$/);
  const rows = rowsByName(text);
  expect(rows.map((r) => r.image)).toEqual(['old.jpg', 'straight.png']);
  expect(rows[0].note).toBe('keep, me');
  expect(rows[0].grid_unit).toBe('');
  expect(rows[0].P6_grid_y).toBe('0.6');
  expect(rows[1].grid_unit).toBe('mm');
  expect(rows[1].P6_grid_x).toBe('');
});

test('append rejects a CSV that is not from GridMeasure', async ({ page }) => {
  await loadImages(page, 'straight.png');
  await calibrate(page, 'straight.png');
  const dialogs = handleDialogs(page);
  await page.setInputFiles('#append-file-input', { name: 'other.csv', mimeType: 'text/csv', buffer: Buffer.from('foo,bar\n1,2') });
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0].message).toContain("doesn't look like a GridMeasure CSV");
});

test('analysis hand-off: ventrum.py computes the true distances from an export', async ({ page }) => {
  await loadImages(page, 'straight.png');
  await calibrate(page, 'straight.png');
  // Set 1: base P5 (2,2)–P6 (6,2), P7 (4,5) → base 4, perpendicular 3
  // Set 2: base P8 (8,1)–P9 (8,7), P10 (11,4) → base 6, perpendicular 3
  // (all well away from the calibration corners, so no click selects an existing point)
  await placeGridPoints(page, 'straight.png', [[2, 2], [6, 2], [4, 5], [8, 1], [8, 7], [11, 4]]);
  const { text } = await download(page, () => page.locator('#export-new-csv').click());

  const dir = mkdtempSync(path.join(os.tmpdir(), 'gridmeasure-'));
  const csvPath = path.join(dir, 'export.csv');
  writeFileSync(csvPath, text);
  execFileSync('python3', ['analysis/ventrum.py', '--csv', csvPath], { stdio: 'pipe' });
  const [calc] = rowsByName(readFileSync(path.join(dir, 'export_calc.csv'), 'utf8'));
  expect(Number(calc.P5_P6_distance)).toBeCloseTo(4, 1);
  expect(Number(calc.P7_perp_distance)).toBeCloseTo(3, 1);
  expect(Number(calc.P8_P9_distance)).toBeCloseTo(6, 1);
  expect(Number(calc.P10_perp_distance)).toBeCloseTo(3, 1);
});

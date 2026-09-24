import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp, loadImages, appState, selected, calibrate, fixturePath } from './helpers.js';

const png = (name) => readFileSync(fixturePath(name));

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('empty state: placeholder, no progress line, no point buttons', async ({ page }) => {
  await expect(page.locator('#status-message')).toHaveText('Load an image to begin');
  await expect(page.locator('#image-progress')).toBeHidden();
  await expect(page.locator('#delete-last-btn')).toBeHidden();
});

test('file picker: several images, first new one selected, progress shown', async ({ page }) => {
  await loadImages(page, 'straight.png', 'tilted.png');
  const s = await appState(page);
  expect(s.images.map((i) => i.name)).toEqual(['straight.png', 'tilted.png']);
  expect(s.selectedImageId).toBe(s.images[0].id);
  await expect(page.locator('.thumb-item')).toHaveCount(2);
  await expect(page.locator('#image-progress')).toHaveText('0/2 calibrated');

  await calibrate(page, 'straight.png');
  await expect(page.locator('#image-progress')).toHaveText('1/2 calibrated');

  // Adding more later selects the first of the new batch
  await loadImages(page, 'small.png');
  expect((await selected(page)).name).toBe('small.png');
});

test('odd file names are shown as plain text', async ({ page }) => {
  const name = '<b>x</b>&"t".png';
  await page.setInputFiles('#file-input', { name, mimeType: 'image/png', buffer: png('small.png') });
  const thumbName = page.locator('.thumb-name').first();
  await expect(thumbName).toHaveAttribute('title', name);
  await expect(page.locator('.thumb-item b')).toHaveCount(0);
  expect((await selected(page)).name).toBe(name);
});

test('undecodable and non-image files are reported in a notice', async ({ page }) => {
  await page.setInputFiles('#file-input', [
    { name: 'broken.tif', mimeType: 'image/tiff', buffer: Buffer.from('not really a tiff') },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
    { name: 'ok.png', mimeType: 'image/png', buffer: png('small.png') },
  ]);
  const notice = page.locator('#notice');
  await expect(notice).toHaveClass(/visible/);
  await expect(notice).toContainText('Could not decode broken.tif');
  await expect(notice).toContainText('Ignored non-image file: notes.txt');
  expect((await appState(page)).images.map((i) => i.name)).toEqual(['ok.png']);
});

test('drag and drop onto the canvas adds images', async ({ page }) => {
  const b64 = png('small.png').toString('base64');
  const dt = await page.evaluateHandle((data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const t = new DataTransfer();
    t.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
    return t;
  }, b64);
  await page.dispatchEvent('#canvas-wrapper', 'dragover', { dataTransfer: dt });
  await expect(page.locator('#canvas-wrapper')).toHaveClass(/drop-active/);
  await page.dispatchEvent('#canvas-wrapper', 'drop', { dataTransfer: dt });
  await expect(page.locator('#canvas-wrapper')).not.toHaveClass(/drop-active/);
  await expect.poll(async () => (await appState(page)).images.map((i) => i.name)).toEqual(['dropped.png']);
});

test('pasting an image adds it with a unique pasted_<timestamp> name', async ({ page }) => {
  const b64 = png('small.png').toString('base64');
  await page.evaluate((data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const t = new DataTransfer();
    t.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: t, bubbles: true }));
  }, b64);
  await expect.poll(async () => (await appState(page)).images.length).toBe(1);
  expect((await appState(page)).images[0].name).toMatch(/^pasted_\d{4}-\d{2}-\d{2}_\d{6}_1\.png$/);
});

test('removing an image asks first and keeps the rest', async ({ page }) => {
  await loadImages(page, 'straight.png', 'small.png');
  page.once('dialog', (d) => d.accept());
  await page.locator('.thumb-item').first().hover();
  await page.locator('.thumb-delete').first().click();
  expect((await appState(page)).images.map((i) => i.name)).toEqual(['small.png']);
});

test('large image loads and fits the canvas', async ({ page }) => {
  await loadImages(page, 'large.png');
  const img = await selected(page);
  expect([img.width, img.height]).toEqual([4200, 3000]);
  expect(img.view.scale).toBeLessThan(0.3);
  await expect(page.locator('#zoom-level')).toHaveText(`${Math.round(img.view.scale * 100)}%`);
});

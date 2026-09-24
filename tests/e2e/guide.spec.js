import { test, expect } from '@playwright/test';
import { openApp, loadImages, calibrate, selected } from './helpers.js';

const TABS = ['Getting Started', 'Calibrate', 'Measure', 'Check Accuracy', 'Export', 'Shortcuts'];

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const modal = (page) => page.locator('#instructions-modal');
const visiblePanel = (page) => page.locator('.instructions-tabpanel:not([hidden])');

test('opens as a centred dialog on Getting Started and closes with Esc, ×, backdrop and Done', async ({ page }) => {
  for (const close of [
    () => page.keyboard.press('Escape'),
    () => page.locator('#instructions-close-btn').click(),
    () => page.mouse.click(10, 10), // backdrop
    () => page.locator('#instructions-done-btn').click(),
  ]) {
    await page.locator('#instructions-btn').click();
    await expect(modal(page)).toHaveClass(/open/);
    await expect(page.locator('#instructions-btn')).toHaveAttribute('aria-expanded', 'true');
    await close();
    await expect(modal(page)).not.toHaveClass(/open/);
  }
  // Centred box, not a full-height drawer
  await page.locator('#instructions-btn').click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.instructions-panel')).transform === 'none');
  const box = await page.locator('.instructions-panel').boundingBox();
  const vp = page.viewportSize();
  expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThan(2);
  expect(box.height).toBeLessThan(vp.height);
});

test('all six tabs show their own panel', async ({ page }) => {
  await page.locator('#instructions-btn').click();
  await expect(page.getByRole('tab')).toHaveText(TABS);
  for (const name of TABS) {
    await page.getByRole('tab', { name }).click();
    await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
    await expect(visiblePanel(page)).toHaveCount(1);
    await expect(visiblePanel(page)).toHaveAttribute('aria-labelledby', await page.getByRole('tab', { name }).getAttribute('id'));
  }
});

test('arrow keys, Home and End move between tabs', async ({ page }) => {
  await page.locator('#instructions-btn').click();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Calibrate' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Shortcuts' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Getting Started' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Getting Started' })).toHaveAttribute('aria-selected', 'true');
});

test('in-text links jump to tabs; the last tab is remembered', async ({ page }) => {
  await page.locator('#instructions-btn').click();
  await page.locator('#panel-start .tab-link[data-goto="export"]').click();
  await expect(page.getByRole('tab', { name: 'Export' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.locator('#instructions-btn').click();
  await expect(page.getByRole('tab', { name: 'Export' })).toHaveAttribute('aria-selected', 'true');
});

test('the diagnostics note opens Check Accuracy', async ({ page }) => {
  await loadImages(page, 'straight.png');
  await calibrate(page, 'straight.png');
  await page.locator('.diag-note a').click();
  await expect(modal(page)).toHaveClass(/open/);
  await expect(page.getByRole('tab', { name: 'Check Accuracy' })).toHaveAttribute('aria-selected', 'true');
});

test('app shortcuts are ignored while the guide is open', async ({ page }) => {
  await loadImages(page, 'straight.png');
  await calibrate(page, 'straight.png');
  await page.locator('#instructions-btn').click();
  await page.keyboard.press('Delete');
  await page.keyboard.press('g');
  expect((await selected(page)).points).toHaveLength(4);
  expect(await page.evaluate(() => window.__gm.state.showGrid)).toBe(true);
});

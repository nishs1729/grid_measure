import { test, expect } from '@playwright/test';
import { openApp, loadImages, appState, imageToClient } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await loadImages(page, 'straight.png');
});

async function hover(page, px, py) {
  const c = await imageToClient(page, px, py);
  await page.mouse.move(c.x, c.y);
}

test('loupe is off by default; Z and the Zoom button toggle it', async ({ page }) => {
  await hover(page, 300, 300);
  await expect(page.locator('#magnifier')).toBeHidden();
  await expect(page.locator('#magnifier-toggle')).not.toHaveClass(/active/);

  await page.keyboard.press('z');
  await hover(page, 310, 300);
  await expect(page.locator('#magnifier')).toBeVisible();
  await expect(page.locator('#magnifier-toggle')).toHaveClass(/active/);

  await page.locator('#magnifier-toggle').click();
  await hover(page, 320, 300);
  await expect(page.locator('#magnifier')).toBeHidden();
});

test('the loupe follows the cursor and hides when leaving the image', async ({ page }) => {
  await page.keyboard.press('z');
  await hover(page, 400, 300);
  const b1 = await page.locator('#magnifier').boundingBox();
  await hover(page, 500, 350);
  const b2 = await page.locator('#magnifier').boundingBox();
  expect(b2.x).toBeGreaterThan(b1.x);
  await page.mouse.move(5, 5);
  await expect(page.locator('#magnifier')).toBeHidden();
});

test('+ / − and Alt + wheel step the magnification 2×–16×, remembered across reloads', async ({ page }) => {
  expect((await appState(page)).magnifierZoom).toBe(4);
  await page.keyboard.press('+');
  await page.keyboard.press('=');
  expect((await appState(page)).magnifierZoom).toBe(16);
  await page.keyboard.press('+');
  expect((await appState(page)).magnifierZoom).toBe(16); // stays at the top step
  for (let i = 0; i < 5; i++) await page.keyboard.press('-');
  expect((await appState(page)).magnifierZoom).toBe(2);

  await hover(page, 300, 300);
  await page.keyboard.down('Alt');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Alt');
  expect((await appState(page)).magnifierZoom).toBe(4);
  // Alt + wheel does not zoom or scroll the canvas
  await expect(page.locator('#zoom-level')).toHaveText(/%$/);

  await page.keyboard.press('+');
  await page.reload();
  await page.waitForFunction(() => !!window.__gm);
  expect((await appState(page)).magnifierZoom).toBe(8);
});

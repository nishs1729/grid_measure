/**
 * helpers.js — Shared end-to-end helpers
 *
 * The app is opened with ?test=1, which exposes its state as window.__gm (read-only use).
 * Positions are given in image pixels and converted to screen coordinates through the
 * app's current view, so tests work at any zoom, pan or window size.
 */

import { expect } from '@playwright/test';
import path from 'node:path';
import { FIXTURES, FIXTURE_DIR, apply } from '../helpers/geometry.js';
import { invertHomography } from '../../js/homography.js';

export { FIXTURES };

export const UNIT = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

export function fixturePath(name) {
  return path.join(FIXTURE_DIR, name);
}

/** True grid → pixel for a fixture */
export function gridToPixel(fixture, gx, gy) {
  return apply(FIXTURES[fixture].G, gx, gy);
}

/** True pixel → grid for a fixture */
export function pixelToGrid(fixture, px, py) {
  return apply(invertHomography(new Float64Array(FIXTURES[fixture].G)), px, py);
}

/** Open a fresh app (storage cleared unless keepStorage) */
export async function openApp(page, { keepStorage = false } = {}) {
  await page.goto('/index.html?test=1');
  if (!keepStorage) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  }
  await page.waitForFunction(() => !!window.__gm);
}

/** Load fixture images through the Add Images file input and wait until they appear */
export async function loadImages(page, ...names) {
  const before = await page.evaluate(() => window.__gm.state.images.length);
  await page.setInputFiles('#file-input', names.map(fixturePath));
  await page.waitForFunction((n) => window.__gm.state.images.length === n, before + names.length);
}

/** Selected image summary: size, view, points, calibration */
export async function selected(page) {
  return page.evaluate(() => {
    const s = window.__gm.state;
    const img = s.images.find((i) => i.id === s.selectedImageId);
    if (!img) return null;
    return {
      name: img.name,
      width: img.width,
      height: img.height,
      view: img.view && { ...img.view },
      points: img.points.map((p) => ({ ...p })),
      calibrated: img.calibration.homography != null,
      H: img.calibration.homography && Array.from(img.calibration.homography),
    };
  });
}

export async function appState(page) {
  return page.evaluate(() => {
    const s = window.__gm.state;
    return {
      selectedImageId: s.selectedImageId,
      selectedPointIndex: s.selectedPointIndex,
      hoveredEdgeIndex: s.hoveredEdgeIndex,
      showGrid: s.showGrid,
      magnifierZoom: s.magnifierZoom,
      gridUnitSize: s.gridUnitSize,
      gridUnitLabel: s.gridUnitLabel,
      images: s.images.map((i) => ({ id: i.id, name: i.name, n: i.points.length })),
    };
  });
}

/** Screen (client) coordinates of an image pixel in the selected image */
export async function imageToClient(page, px, py) {
  return page.evaluate(([px, py]) => {
    const s = window.__gm.state;
    const img = s.images.find((i) => i.id === s.selectedImageId);
    const rect = document.getElementById('main-canvas').getBoundingClientRect();
    return { x: rect.left + img.view.offsetX + px * img.view.scale, y: rect.top + img.view.offsetY + py * img.view.scale };
  }, [px, py]);
}

/** Click at an image pixel (optionally with modifiers) */
export async function clickImage(page, px, py, { modifiers = [] } = {}) {
  const c = await imageToClient(page, px, py);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.click(c.x, c.y);
  for (const m of modifiers) await page.keyboard.up(m);
}

/** Drag from one image pixel to another in small steps */
export async function dragImage(page, from, to, { modifiers = [], steps = 10, button = 'left' } = {}) {
  const a = await imageToClient(page, from.x, from.y);
  const b = await imageToClient(page, to.x, to.y);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button });
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up({ button });
  for (const m of modifiers) await page.keyboard.up(m);
}

/** Click P1–P4 at the true pixels of the calibration grid points (default unit square) */
export async function calibrate(page, fixture, dst = UNIT) {
  for (const g of dst) {
    const p = gridToPixel(fixture, g.x, g.y);
    await clickImage(page, p.x, p.y);
  }
  await expect.poll(async () => (await selected(page)).calibrated).toBe(true);
}

/** Set the P1–P4 grid-coordinate inputs in the sidebar */
export async function setCalibDst(page, dst) {
  for (let i = 0; i < 4; i++) {
    await page.fill(`#calib-dst-p${i + 1}-x`, String(dst[i].x));
    await page.fill(`#calib-dst-p${i + 1}-y`, String(dst[i].y));
  }
}

/** RGBA of a canvas pixel at client coordinates (reads the backing store, DPR-aware) */
export async function canvasPixel(page, clientX, clientY) {
  return page.evaluate(([x, y]) => {
    const canvas = document.getElementById('main-canvas');
    const rect = canvas.getBoundingClientRect();
    const k = canvas.width / rect.width;
    const d = canvas.getContext('2d').getImageData(Math.round((x - rect.left) * k), Math.round((y - rect.top) * k), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }, [clientX, clientY]);
}

/** RGBA values of a (2r+1)² patch of canvas pixels around client coordinates */
export async function canvasPatch(page, clientX, clientY, r = 2) {
  return page.evaluate(([x, y, r]) => {
    const canvas = document.getElementById('main-canvas');
    const rect = canvas.getBoundingClientRect();
    const k = canvas.width / rect.width;
    const cx = Math.round((x - rect.left) * k);
    const cy = Math.round((y - rect.top) * k);
    const d = canvas.getContext('2d').getImageData(cx - r, cy - r, 2 * r + 1, 2 * r + 1).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2], d[i + 3]]);
    return out;
  }, [clientX, clientY, r]);
}

/** Collect browser dialogs (alert / confirm) and answer them */
export function handleDialogs(page, { accept = true } = {}) {
  const messages = [];
  page.on('dialog', async (d) => {
    messages.push({ type: d.type(), message: d.message() });
    if (accept) await d.accept();
    else await d.dismiss();
  });
  return messages;
}

/** Tolerance in grid units for one screen-pixel of click error at the current zoom */
export function clickTolerance(view, pxPerUnit) {
  return 1.5 / (view.scale * pxPerUnit) + 1e-3;
}

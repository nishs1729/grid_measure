import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeImageFit, canvasToImage, canvasToImageRaw, imageToCanvas } from '../../js/coordinates.js';
import {
  MAX_SCALE,
  EDGE_MARGIN,
  clampScale,
  zoomAt,
  constrainView,
  recenterOnResize,
  clampSegmentOffset,
} from '../../js/view.js';
import { assertClose, assertPointClose } from '../helpers/geometry.js';

// ---- coordinates.js ----

test('fit: wide image fills the width and is centred vertically', () => {
  const v = computeImageFit(1000, 500, 2000, 500);
  assert.equal(v.scale, 0.5);
  assert.equal(v.offsetX, 0);
  assert.equal(v.offsetY, 125);
});

test('fit: tall image fills the height and is centred horizontally', () => {
  const v = computeImageFit(1000, 500, 500, 1000);
  assert.equal(v.scale, 0.5);
  assert.equal(v.offsetX, 375);
  assert.equal(v.offsetY, 0);
});

test('fit: small image is scaled up', () => {
  const v = computeImageFit(1000, 500, 100, 50);
  assert.equal(v.scale, 10);
});

test('canvas ↔ image round trip at many zooms and pans', () => {
  for (const scale of [0.1, 0.5, 1, 3.7, 32]) {
    for (const [ox, oy] of [[0, 0], [-1234.5, 77], [300, -40]]) {
      const view = { scale, offsetX: ox, offsetY: oy };
      for (const [px, py] of [[0, 0], [123.25, 456.75], [999, 1]]) {
        const { cx, cy } = imageToCanvas(px, py, view);
        const back = canvasToImageRaw(cx, cy, view);
        assertClose(back.px, px, 1e-9);
        assertClose(back.py, py, 1e-9);
      }
    }
  }
});

test('canvasToImage allows a 1 px margin and rejects points further outside', () => {
  const view = { scale: 1, offsetX: 0, offsetY: 0 };
  assert.ok(canvasToImage(-0.5, 10, view, 100, 100));
  assert.ok(canvasToImage(100.9, 100.9, view, 100, 100));
  assert.equal(canvasToImage(-1.5, 10, view, 100, 100), null);
  assert.equal(canvasToImage(10, 101.5, view, 100, 100), null);
});

// ---- view.js ----

test('clampScale limits to [fit / 2, MAX_SCALE]', () => {
  assert.equal(clampScale(0.01, 0.5), 0.25);
  assert.equal(clampScale(1000, 0.5), MAX_SCALE);
  assert.equal(clampScale(2, 0.5), 2);
  // A tiny image whose fit scale exceeds MAX_SCALE still gets a valid range
  assert.equal(clampScale(1, 100), MAX_SCALE);
});

test('zoomAt keeps the image pixel under the cursor fixed', () => {
  const view = { scale: 0.5, offsetX: 10, offsetY: 20 };
  const before = canvasToImageRaw(333, 222, view);
  for (const f of [1.3, 1.3, 0.2, 5]) {
    zoomAt(view, 333, 222, f, 0.5);
    const after = canvasToImageRaw(333, 222, view);
    assertClose(after.px, before.px, 1e-9);
    assertClose(after.py, before.py, 1e-9);
  }
});

test('zoomAt clamps at the limits', () => {
  const view = { scale: 1, offsetX: 0, offsetY: 0 };
  for (let i = 0; i < 100; i++) zoomAt(view, 0, 0, 2, 1);
  assert.equal(view.scale, MAX_SCALE);
  for (let i = 0; i < 100; i++) zoomAt(view, 0, 0, 0.5, 1);
  assert.equal(view.scale, 0.5);
});

test('constrainView centres an image that fits', () => {
  const view = { scale: 0.25, offsetX: -999, offsetY: 999 };
  constrainView(view, 2000, 2000, 1000, 800); // 500×500 on screen
  assert.equal(view.offsetX, 250);
  assert.equal(view.offsetY, 150);
});

test('constrainView stops EDGE_MARGIN past the edges of a larger image', () => {
  const view = { scale: 1, offsetX: 1e6, offsetY: -1e6 };
  constrainView(view, 2000, 3000, 1000, 800);
  assert.equal(view.offsetX, EDGE_MARGIN);
  assert.equal(view.offsetY, 800 - 3000 - EDGE_MARGIN);
  view.offsetX = -1e6;
  view.offsetY = 1e6;
  constrainView(view, 2000, 3000, 1000, 800);
  assert.equal(view.offsetX, 1000 - 2000 - EDGE_MARGIN);
  assert.equal(view.offsetY, EDGE_MARGIN);
});

test('constrainView leaves in-range offsets alone', () => {
  const view = { scale: 1, offsetX: -300, offsetY: -200 };
  constrainView(view, 2000, 3000, 1000, 800);
  assert.equal(view.offsetX, -300);
  assert.equal(view.offsetY, -200);
});

test('constrainView at fit: one axis exactly fills, no wobble', () => {
  const view = computeImageFit(1000, 500, 2000, 500);
  const copy = { ...view };
  view.offsetX += 30;
  constrainView(view, 2000, 500, 1000, 500);
  assert.deepEqual(view, copy);
});

test('recenterOnResize keeps the centre pixel', () => {
  const view = { scale: 2.5, offsetX: -700, offsetY: -300 };
  const before = canvasToImageRaw(500, 250, view);
  recenterOnResize(view, 1000, 500, 640, 900);
  const after = canvasToImageRaw(320, 450, view);
  assertClose(after.px, before.px, 1e-9);
  assertClose(after.py, before.py, 1e-9);
});

test('clampSegmentOffset keeps both ends inside the image', () => {
  const a = { x: 100, y: 50 };
  const b = { x: 400, y: 20 };
  assert.deepEqual(clampSegmentOffset(a, b, 10, 5, 1000, 800), { dx: 10, dy: 5 });
  assert.deepEqual(clampSegmentOffset(a, b, -500, -500, 1000, 800), { dx: -100, dy: -20 });
  assert.deepEqual(clampSegmentOffset(a, b, 5000, 5000, 1000, 800), { dx: 600, dy: 750 });
});

test('clampSegmentOffset preserves length and direction', () => {
  const a = { x: 650, y: 370 };
  const b = { x: 200, y: 400 };
  const { dx, dy } = clampSegmentOffset(a, b, 0, -5000, 1000, 1000);
  const a2 = { x: a.x + dx, y: a.y + dy };
  const b2 = { x: b.x + dx, y: b.y + dy };
  assertPointClose({ x: b2.x - a2.x, y: b2.y - a2.y }, { x: b.x - a.x, y: b.y - a.y }, 1e-12);
  assert.equal(Math.min(a2.y, b2.y), 0);
});

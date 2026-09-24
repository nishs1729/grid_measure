import { test } from 'node:test';
import assert from 'node:assert/strict';
import state from '../../js/state.js';
import { drawGridOverlay, mapSegment, clipToRect, chooseStep, gridBounds } from '../../js/gridOverlay.js';
import { computeCalibrationHomography, applyHomography, invertHomography } from '../../js/homography.js';
import { FIXTURES, apply } from '../helpers/geometry.js';

const UNIT = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

/** Minimal stand-ins for the canvas: record every segment drawn through Path2D */
let segments = [];
globalThis.Path2D = class {
  moveTo(x, y) { this.p = [x, y]; }
  lineTo(x, y) { (this.s ??= []).push([this.p, [x, y]]); }
};
const ctx = new Proxy({}, {
  get: (t, k) => (k === 'stroke' ? (p) => p?.s && segments.push(...p.s) : k in t ? t[k] : () => {}),
  set: (t, k, v) => ((t[k] = v), true),
});

/**
 * Calibrate on the given true mapping (image → grid) and draw the overlay at scale 1.
 * Returns the segments drawn and the calibrated H.
 */
function draw(trueH, width, height, dst) {
  segments = [];
  state.calibDst = dst;
  state.showGrid = true;
  const G = invertHomography(trueH);
  const points = dst.map((d) => { const p = applyHomography(G, d.x, d.y); return { pixelX: p.x, pixelY: p.y }; });
  const H = computeCalibrationHomography(points.map((p) => ({ x: p.pixelX, y: p.pixelY })), dst);
  const img = { width, height, points, calibration: { homography: H } };
  drawGridOverlay(ctx, img, { scale: 1, offsetX: 0, offsetY: 0 });
  return { H, img, drawn: segments };
}

/**
 * Every segment must lie on one integer grid line (checked at both ends and the
 * midpoint), inside the image, and in front of the horizon.
 */
function checkSegments({ H, img, drawn }) {
  const p1 = img.points[0];
  const refW = H[6] * p1.pixelX + H[7] * p1.pixelY + H[8];
  let vertical = 0;
  let horizontal = 0;
  const xs = new Set();
  const ys = new Set();
  for (const [a, b] of drawn) {
    const pts = [a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]];
    for (const [x, y] of pts) {
      assert.ok(x >= -1e-6 && x <= img.width + 1e-6 && y >= -1e-6 && y <= img.height + 1e-6, `outside image: ${x},${y}`);
      assert.ok((H[6] * x + H[7] * y + H[8]) * refW > 0, 'behind the horizon');
    }
    const g = pts.map(([x, y]) => applyHomography(H, x, y));
    const onX = g.every((p) => Math.abs(p.x - g[0].x) < 1e-3) && Math.abs(g[0].x - Math.round(g[0].x)) < 1e-3;
    const onY = g.every((p) => Math.abs(p.y - g[0].y) < 1e-3) && Math.abs(g[0].y - Math.round(g[0].y)) < 1e-3;
    assert.ok(onX || onY, `segment not on a grid line: ${JSON.stringify(g)}`);
    if (onX) {
      vertical++;
      xs.add(Math.round(g[0].x));
    } else {
      horizontal++;
      ys.add(Math.round(g[0].y));
    }
  }
  return { vertical, horizontal, xs, ys };
}

test('straight fixture: lines on every grid unit across the image', () => {
  const G = FIXTURES['straight.png'].G;
  const result = draw(invertHomography(new Float64Array(G)), 800, 600, UNIT);
  const { xs, ys } = checkSegments(result);
  // 50 px per unit, origin at pixel (100, 500): every interior line must be drawn.
  // Lines exactly on the image border (x = 0, 800; y = 0, 600) may be clipped by rounding.
  for (let k = -1; k <= 13; k++) assert.ok(xs.has(k), `vertical line x = ${k}`);
  for (let k = -1; k <= 9; k++) assert.ok(ys.has(k), `horizontal line y = ${k}`);
  assert.ok(xs.size <= 17 && ys.size <= 13);
});

test('tilted fixture: all segments on grid lines', () => {
  const { G, width, height } = FIXTURES['tilted.png'];
  const dst = UNIT.map((p) => ({ x: p.x * 10, y: p.y * 10 }));
  const counts = checkSegments(draw(invertHomography(new Float64Array(G)), width, height, dst));
  assert.ok(counts.vertical > 10 && counts.horizontal > 10);
});

test('horizon crossing the image: clipped, including the line on the horizon itself', () => {
  // image → grid with w = 0.005·y − 1, so the horizon is the image row y = 200
  const T = new Float64Array([0.05, 0, -25, 0, 0.3, -50, 0, 0.005, -1]);
  const dst = UNIT.map((p) => ({ x: p.x, y: p.y + 70 }));
  const result = draw(T, 1000, 800, dst);
  assert.ok(result.drawn.length > 100);
  assert.ok(result.drawn.every(([a, b]) => [...a, ...b].every(Number.isFinite)), 'no NaN / infinite segments');
  checkSegments(result);
});

test('overlay is not drawn when hidden, uncalibrated, or with fewer than 4 points', () => {
  const T = invertHomography(new Float64Array(FIXTURES['straight.png'].G));
  const { img } = draw(T, 800, 600, UNIT); // calibrated image; now redraw with the grid hidden
  state.showGrid = false;
  segments = [];
  drawGridOverlay(ctx, img, { scale: 1, offsetX: 0, offsetY: 0 });
  assert.equal(segments.length, 0);
  state.showGrid = true;
  drawGridOverlay(ctx, { ...img, calibration: { homography: null } }, { scale: 1, offsetX: 0, offsetY: 0 });
  drawGridOverlay(ctx, { ...img, points: img.points.slice(0, 3) }, { scale: 1, offsetX: 0, offsetY: 0 });
  assert.equal(segments.length, 0);
});

test('chooseStep thins lines closer than 6 screen px', () => {
  const Hinv = new Float64Array([5, 0, 0, 0, 5, 0, 0, 0, 1]); // 5 image px per unit
  assert.equal(chooseStep(Hinv, UNIT, 2), 1); // 10 px apart
  assert.equal(chooseStep(Hinv, UNIT, 1), 2); // 5 px → every 2nd
  assert.equal(chooseStep(Hinv, UNIT, 0.5), 5); // 2.5 px → every 5th
  assert.equal(chooseStep(Hinv, UNIT, 0.1), 20); // 0.5 px → every 20th
});

test('gridBounds limits to 500 units around the calibration square', () => {
  const img = { width: 1000, height: 1000, points: [{ pixelX: 0, pixelY: 0 }] };
  // image → grid ×100: the image spans grid 0…100000, limited to 1 + 500 on the high side
  const dense = new Float64Array([100, 0, 0, 0, 100, 0, 0, 0, 1]);
  assert.deepEqual(gridBounds(img, dense, UNIT), { xMin: 0, xMax: 501, yMin: 0, yMax: 501 });
  // image → grid ×0.001: the whole image is within one grid unit
  const coarse = new Float64Array([0.001, 0, 0, 0, 0.001, 0, 0, 0, 1]);
  assert.deepEqual(gridBounds(img, coarse, UNIT), { xMin: 0, xMax: 1, yMin: 0, yMax: 1 });
  // shifted so the image spans negative grid values too
  const shifted = new Float64Array([100, 0, -50000, 0, 100, -50000, 0, 0, 1]);
  assert.deepEqual(gridBounds(img, shifted, UNIT), { xMin: -500, xMax: 501, yMin: -500, yMax: 501 });
});

test('mapSegment returns null for a segment entirely behind the horizon', () => {
  const Hinv = new Float64Array([1, 0, 0, 0, 1, 0, 0, 1, -10]); // w = y − 10
  assert.equal(mapSegment(Hinv, 1, 1e-6, { x: 0, y: 0 }, { x: 5, y: 5 }, { width: 100, height: 100 }), null);
});

test('clipToRect: inside, crossing, outside and degenerate segments', () => {
  const W = 100;
  const H = 50;
  assert.deepEqual(clipToRect({ x: 10, y: 10 }, { x: 20, y: 20 }, W, H), [{ x: 10, y: 10 }, { x: 20, y: 20 }]);
  assert.deepEqual(clipToRect({ x: -50, y: 25 }, { x: 150, y: 25 }, W, H), [{ x: 0, y: 25 }, { x: 100, y: 25 }]);
  assert.equal(clipToRect({ x: -10, y: -10 }, { x: -5, y: 60 }, W, H), null);
  assert.equal(clipToRect({ x: 10, y: 60 }, { x: 90, y: 60 }, W, H), null);
  const clipped = clipToRect({ x: -100, y: -100 }, { x: 200, y: 200 }, W, H);
  assert.deepEqual(clipped, [{ x: 0, y: 0 }, { x: 50, y: 50 }]);
});

test('fixture ground truth is self-consistent', () => {
  // Sanity check on the helper used by the e2e tests
  const p = apply(FIXTURES['straight.png'].G, 2, 3);
  assert.deepEqual(p, { x: 200, y: 350 });
});

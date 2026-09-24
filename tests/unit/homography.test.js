import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeHomography,
  computeCalibrationHomography,
  applyHomography,
  invertHomography,
} from '../../js/homography.js';
import { FIXTURES, apply, assertClose, assertPointClose } from '../helpers/geometry.js';

const UNIT = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

/** Pixel positions of the given grid points under a fixture's true mapping */
function pixelsFor(fixture, grid) {
  return grid.map((g) => apply(FIXTURES[fixture].G, g.x, g.y));
}

test('identity: unit square to itself', () => {
  const H = computeHomography(UNIT, UNIT);
  for (const [i, v] of [1, 0, 0, 0, 1, 0, 0, 0, 1].entries()) assertClose(H[i], v, 1e-12, `H[${i}]`);
});

test('default destinations are the anticlockwise unit square', () => {
  const src = pixelsFor('straight.png', UNIT);
  const a = computeCalibrationHomography(src);
  const b = computeCalibrationHomography(src, UNIT);
  assert.deepEqual(Array.from(a), Array.from(b));
});

for (const fixture of Object.keys(FIXTURES)) {
  test(`recovers the true mapping for ${fixture}`, () => {
    const src = pixelsFor(fixture, UNIT);
    const H = computeCalibrationHomography(src, UNIT);
    // Any grid point, not only the four corners, must map back correctly
    for (const g of [{ x: 0.5, y: 0.5 }, { x: 3, y: -2 }, { x: 7.25, y: 4.75 }]) {
      const px = apply(FIXTURES[fixture].G, g.x, g.y);
      assertPointClose(applyHomography(H, px.x, px.y), g, 1e-6, `${fixture} ${JSON.stringify(g)}`);
    }
  });
}

test('custom P1–P4 grid coordinates (10×10 block)', () => {
  const dst = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const src = pixelsFor('tilted.png', dst);
  const H = computeCalibrationHomography(src, dst);
  const px = apply(FIXTURES['tilted.png'].G, 2.5, 8.5);
  assertPointClose(applyHomography(H, px.x, px.y), { x: 2.5, y: 8.5 }, 1e-6);
});

test('rotated square', () => {
  const t = Math.PI / 7;
  const src = UNIT.map((p) => ({ x: 300 + 80 * (p.x * Math.cos(t) - p.y * Math.sin(t)), y: 200 + 80 * (p.x * Math.sin(t) + p.y * Math.cos(t)) }));
  const H = computeCalibrationHomography(src, UNIT);
  src.forEach((s, i) => assertPointClose(applyHomography(H, s.x, s.y), UNIT[i], 1e-9));
});

test('H · H⁻¹ is the identity', () => {
  const H = computeCalibrationHomography(pixelsFor('tilted.png', UNIT), UNIT);
  const Hi = invertHomography(H);
  for (const p of [{ x: 10, y: 20 }, { x: 640, y: 480 }, { x: 999, y: 1 }]) {
    const g = applyHomography(H, p.x, p.y);
    assertPointClose(applyHomography(Hi, g.x, g.y), p, 1e-6);
  }
});

test('three calibration points in a line → error', () => {
  const src = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 100 }];
  assert.throws(() => computeCalibrationHomography(src, UNIT));
});

test('three points in a line → error at any coordinate scale', () => {
  for (const k of [0.001, 1, 100, 1e5]) {
    const src = [{ x: 1 * k, y: 1 * k }, { x: 2 * k, y: 1 * k }, { x: 3 * k, y: 1 * k }, { x: 1 * k, y: 3 * k }];
    assert.throws(() => computeCalibrationHomography(src, UNIT), `scale ${k}`);
  }
});

test('nearly-but-not-quite collinear points still calibrate', () => {
  const src = [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 300, y: 101 }, { x: 100, y: 300 }];
  assert.doesNotThrow(() => computeCalibrationHomography(src, UNIT));
});

test('collinear destination grid coordinates → error', () => {
  const src = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  const dst = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }];
  assert.throws(() => computeCalibrationHomography(src, dst));
});

test('all four points identical → error', () => {
  const src = UNIT.map(() => ({ x: 50, y: 50 }));
  assert.throws(() => computeCalibrationHomography(src, UNIT));
});

test('invertHomography rejects a singular matrix', () => {
  assert.throws(() => invertHomography(new Float64Array([1, 2, 3, 2, 4, 6, 0, 0, 1])));
});

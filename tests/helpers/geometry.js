/**
 * geometry.js — Shared test helpers: fixture ground truth and approximate comparisons
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));

/** fixtures.json: { name: { width, height, G } } with G = grid → pixel (row-major 3×3) */
export const FIXTURES = JSON.parse(readFileSync(new URL('../fixtures/fixtures.json', import.meta.url), 'utf8'));

/** Apply a row-major 3×3 homography to (x, y). */
export function apply(M, x, y) {
  const w = M[6] * x + M[7] * y + M[8];
  return { x: (M[0] * x + M[1] * y + M[2]) / w, y: (M[3] * x + M[4] * y + M[5]) / w };
}

/** Pixel position of grid point (gx, gy) in a fixture image. */
export function gridToPixel(fixture, gx, gy) {
  return apply(FIXTURES[fixture].G, gx, gy);
}

export function assertClose(actual, expected, tol, msg = '') {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg} expected ${expected} ± ${tol}, got ${actual}`.trim()
  );
}

export function assertPointClose(actual, expected, tol, msg = '') {
  assertClose(actual.x, expected.x, tol, `${msg} x:`);
  assertClose(actual.y, expected.y, tol, `${msg} y:`);
}

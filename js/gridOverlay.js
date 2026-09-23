/**
 * gridOverlay.js — Draws the fitted grid back onto the image
 *
 * Integer grid lines (x = k, y = k in grid units) are mapped through the inverse
 * homography onto the image. If calibration is good, they sit on the paper's grid
 * lines; where they drift, the image isn't a flat projective view of the grid
 * (lens distortion, a curved sheet, or badly placed P1–P4).
 *
 * A homography maps straight lines to straight lines, so each grid line only needs
 * its two endpoints mapped. Two things need care:
 *   - The horizon: grid points "behind the camera" (w ≤ 0 after mapping) have no
 *     real image position, so segments are clipped to the side of the horizon that
 *     the calibration square is on.
 *   - Clipping: mapped segments are clipped to the image rectangle, so lines near the
 *     horizon (huge coordinates) never reach the canvas.
 */

import state from './state.js';
import { invertHomography, applyHomography } from './homography.js';
import { imageToCanvas } from './coordinates.js';

/** Grid lines are drawn at most this many units beyond the calibration square */
const MAX_EXTENT = 500;

/** Grid points with w below this fraction of w at P1 are treated as on the horizon */
const HORIZON_CUTOFF = 1e-6;

/** Minimum screen spacing (CSS px) between drawn lines near the calibration square */
const MIN_SPACING = 6;

/** Candidate line steps (every n-th unit) when lines would be too dense */
const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500];

const STYLE = {
  line: 'rgba(0, 255, 255, 0.35)',
  major: 'rgba(0, 255, 255, 0.6)',
  square: 'rgba(255, 255, 0, 0.8)',
};

/**
 * Draw the grid overlay for a calibrated image.
 *
 * @param {CanvasRenderingContext2D} ctx — drawing in canvas CSS pixels
 * @param {import('./state.js').ImageState} img
 * @param {import('./coordinates.js').View} view
 */
export function drawGridOverlay(ctx, img, view) {
  const H = img.calibration.homography;
  if (!state.showGrid || !H || img.points.length < 4) return;

  let Hinv;
  try {
    Hinv = invertHomography(H);
  } catch {
    return; // degenerate calibration — nothing sensible to draw
  }

  const calibGrid = state.calibDst;
  const ref = calibGrid[0];
  // w at P1: its sign marks grid points in front of the camera. Points whose w is a
  // tiny fraction of it are effectively on the horizon (image coords → ∞), so cut there.
  const wRef = Hinv[6] * ref.x + Hinv[7] * ref.y + Hinv[8];
  const wSign = Math.sign(wRef) || 1;
  const wMin = HORIZON_CUTOFF * Math.abs(wRef);

  const bounds = gridBounds(img, H, calibGrid);
  const step = chooseStep(Hinv, calibGrid, view.scale);
  const majorEvery = step < 10 ? 10 : step * 10;

  ctx.save();
  ctx.lineWidth = 1;

  const drawFamily = (vertical) => {
    const [lo, hi] = vertical ? [bounds.xMin, bounds.xMax] : [bounds.yMin, bounds.yMax];
    const [aLo, aHi] = vertical ? [bounds.yMin, bounds.yMax] : [bounds.xMin, bounds.xMax];
    const minor = new Path2D();
    const major = new Path2D();

    for (let k = Math.ceil(lo / step) * step; k <= hi; k += step) {
      const g0 = vertical ? { x: k, y: aLo } : { x: aLo, y: k };
      const g1 = vertical ? { x: k, y: aHi } : { x: aHi, y: k };
      const seg = mapSegment(Hinv, wSign, wMin, g0, g1, img);
      if (!seg) continue;
      const a = imageToCanvas(seg[0].x, seg[0].y, view);
      const b = imageToCanvas(seg[1].x, seg[1].y, view);
      const path = k % majorEvery === 0 ? major : minor;
      path.moveTo(a.cx, a.cy);
      path.lineTo(b.cx, b.cy);
    }

    ctx.strokeStyle = STYLE.line;
    ctx.stroke(minor);
    ctx.strokeStyle = STYLE.major;
    ctx.stroke(major);
  };

  drawFamily(true);
  drawFamily(false);

  // Calibration square P1–P2–P3–P4 (straight from the placed pixels)
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const { cx, cy } = imageToCanvas(img.points[i].pixelX, img.points[i].pixelY, view);
    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  }
  ctx.closePath();
  ctx.strokeStyle = STYLE.square;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

/**
 * Integer grid range covering the image: the image corners mapped to grid space,
 * limited to MAX_EXTENT units around the calibration square. If a corner is beyond
 * the horizon (the grid plane extends to infinity there), the limit applies.
 */
function gridBounds(img, H, calibGrid) {
  const cxs = calibGrid.map((p) => p.x);
  const cys = calibGrid.map((p) => p.y);
  const lim = {
    xMin: Math.min(...cxs) - MAX_EXTENT,
    xMax: Math.max(...cxs) + MAX_EXTENT,
    yMin: Math.min(...cys) - MAX_EXTENT,
    yMax: Math.max(...cys) + MAX_EXTENT,
  };

  // Which side of the horizon real image points are on (same as P1)
  const p1 = img.points[0];
  const refW = H[6] * p1.pixelX + H[7] * p1.pixelY + H[8];

  const corners = [
    [0, 0],
    [img.width, 0],
    [img.width, img.height],
    [0, img.height],
  ];
  const mapped = [];
  for (const [x, y] of corners) {
    const w = H[6] * x + H[7] * y + H[8];
    if (w * refW <= 0) return roundBounds(lim); // corner beyond the horizon
    mapped.push(applyHomography(H, x, y));
  }

  const xs = mapped.map((p) => p.x);
  const ys = mapped.map((p) => p.y);
  return roundBounds({
    xMin: Math.max(Math.min(...xs), lim.xMin),
    xMax: Math.min(Math.max(...xs), lim.xMax),
    yMin: Math.max(Math.min(...ys), lim.yMin),
    yMax: Math.min(Math.max(...ys), lim.yMax),
  });
}

function roundBounds(b) {
  return {
    xMin: Math.floor(b.xMin),
    xMax: Math.ceil(b.xMax),
    yMin: Math.floor(b.yMin),
    yMax: Math.ceil(b.yMax),
  };
}

/**
 * Pick the smallest line step whose screen spacing near the calibration square is at
 * least MIN_SPACING, so dense grids don't turn into a solid wash.
 */
function chooseStep(Hinv, calibGrid, viewScale) {
  const cx = calibGrid.reduce((s, p) => s + p.x, 0) / 4;
  const cy = calibGrid.reduce((s, p) => s + p.y, 0) / 4;
  const o = applyHomography(Hinv, cx, cy);
  const ux = applyHomography(Hinv, cx + 1, cy);
  const uy = applyHomography(Hinv, cx, cy + 1);
  const unitPx = Math.min(Math.hypot(ux.x - o.x, ux.y - o.y), Math.hypot(uy.x - o.x, uy.y - o.y)) * viewScale;

  for (const step of STEPS) {
    if (unitPx * step >= MIN_SPACING) return step;
  }
  return STEPS[STEPS.length - 1];
}

/**
 * Map the grid segment g0→g1 into image pixels: keep only the part in front of the
 * camera, then clip to the image rectangle. Returns [a, b] or null if nothing is visible.
 */
function mapSegment(Hinv, wSign, wMin, g0, g1, img) {
  const w = (g) => wSign * (Hinv[6] * g.x + Hinv[7] * g.y + Hinv[8]);
  const w0 = w(g0);
  const w1 = w(g1);

  // Keep only the part in front of the horizon (w ≥ wMin), where mapped coords are finite
  if (w0 <= wMin && w1 <= wMin) return null;
  if (w0 <= wMin || w1 <= wMin) {
    // w is linear along the segment: cut where it reaches wMin
    const t = (wMin - w0) / (w1 - w0);
    const cut = { x: g0.x + (g1.x - g0.x) * t, y: g0.y + (g1.y - g0.y) * t };
    if (w0 <= wMin) g0 = cut;
    else g1 = cut;
  }

  const a = applyHomography(Hinv, g0.x, g0.y);
  const b = applyHomography(Hinv, g1.x, g1.y);
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
  return clipToRect(a, b, img.width, img.height);
}

/**
 * Liang–Barsky clip of segment a→b to [0, W] × [0, H].
 */
function clipToRect(a, b, W, H) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges = [
    [-dx, a.x],
    [dx, W - a.x],
    [-dy, a.y],
    [dy, H - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null; // parallel and outside
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return [
    { x: a.x + dx * t0, y: a.y + dy * t0 },
    { x: a.x + dx * t1, y: a.y + dy * t1 },
  ];
}

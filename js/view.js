/**
 * view.js — Pure zoom / pan / scroll-limit maths for the canvas view
 *
 * A view is { scale, offsetX, offsetY } (see coordinates.js). These functions mutate
 * or return views without touching the DOM, so canvas.js stays about events and
 * drawing and the maths can be unit-tested directly.
 */

import { canvasToImageRaw } from './coordinates.js';

/** Maximum zoom (CSS px per image px); minimum is half the fit-to-window scale */
export const MAX_SCALE = 32;

/**
 * How far (CSS px) the edge of an image larger than the canvas may be scrolled inside
 * the canvas edge, so corners aren't stuck under the toolbar. Along an axis where the
 * image fits, it is centred instead.
 */
export const EDGE_MARGIN = 48;

/**
 * Clamp a zoom scale to [fitScale / 2, MAX_SCALE].
 */
export function clampScale(scale, fitScale) {
  const min = Math.min(fitScale / 2, MAX_SCALE);
  return Math.min(Math.max(scale, min), MAX_SCALE);
}

/**
 * Zoom by `factor`, keeping the image pixel under canvas point (cx, cy) fixed.
 */
export function zoomAt(view, cx, cy, factor, fitScale) {
  const next = clampScale(view.scale * factor, fitScale);
  const k = next / view.scale;
  view.offsetX = cx - (cx - view.offsetX) * k;
  view.offsetY = cy - (cy - view.offsetY) * k;
  view.scale = next;
}

/**
 * Keep the image from being scrolled out of view: along each axis, centre it if it
 * fits in the canvas, otherwise stop scrolling EDGE_MARGIN past the image edge.
 */
export function constrainView(view, imgW, imgH, canvasW, canvasH) {
  const clampAxis = (offset, imgSize, canvasSize) => {
    const size = imgSize * view.scale;
    if (size <= canvasSize) return (canvasSize - size) / 2;
    return Math.min(Math.max(offset, canvasSize - size - EDGE_MARGIN), EDGE_MARGIN);
  };
  view.offsetX = clampAxis(view.offsetX, imgW, canvasW);
  view.offsetY = clampAxis(view.offsetY, imgH, canvasH);
}

/**
 * After the canvas is resized from old to new CSS size, keep the image pixel that was
 * at the canvas centre at the centre.
 */
export function recenterOnResize(view, oldW, oldH, newW, newH) {
  const { px, py } = canvasToImageRaw(oldW / 2, oldH / 2, view);
  view.offsetX = newW / 2 - px * view.scale;
  view.offsetY = newH / 2 - py * view.scale;
}

/**
 * Offset to translate segment a–b by (dx, dy), limited so neither end leaves the
 * [0, W] × [0, H] image. Returns the clamped { dx, dy }.
 */
export function clampSegmentOffset(a, b, dx, dy, W, H) {
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  return {
    dx: clamp(dx, -Math.min(a.x, b.x), W - Math.max(a.x, b.x)),
    dy: clamp(dy, -Math.min(a.y, b.y), H - Math.max(a.y, b.y)),
  };
}

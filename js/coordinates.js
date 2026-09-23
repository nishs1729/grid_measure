/**
 * coordinates.js — Coordinate conversion utilities
 *
 * Handles the mapping between:
 *   1. Mouse/client coordinates
 *   2. Canvas coordinates (CSS pixels, independent of devicePixelRatio)
 *   3. Original image pixel coordinates
 *
 * The mapping is a view transform: canvas = image * scale + offset. Each image keeps
 * its own view (zoom + pan); "fit to window" is just the starting view.
 */

/**
 * @typedef {Object} View
 * @property {number} scale    — canvas CSS px per image px
 * @property {number} offsetX  — canvas x of image pixel 0
 * @property {number} offsetY  — canvas y of image pixel 0
 */

/**
 * The view that fits an image inside a canvas, centred, preserving aspect ratio.
 *
 * @param {number} canvasW — canvas width in CSS pixels
 * @param {number} canvasH — canvas height in CSS pixels
 * @param {number} imgW    — original image width in pixels
 * @param {number} imgH    — original image height in pixels
 * @returns {View}
 */
export function computeImageFit(canvasW, canvasH, imgW, imgH) {
  const scale = Math.min(canvasW / imgW, canvasH / imgH);
  return {
    scale,
    offsetX: (canvasW - imgW * scale) / 2,
    offsetY: (canvasH - imgH * scale) / 2,
  };
}

/**
 * Convert mouse event coordinates to canvas-space coordinates.
 *
 * @param {MouseEvent} event
 * @param {HTMLCanvasElement} canvas
 * @returns {{cx: number, cy: number}}
 */
export function mouseToCanvas(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    cx: event.clientX - rect.left,
    cy: event.clientY - rect.top,
  };
}

/**
 * Convert canvas-space coordinates to image pixel coordinates, without bounds checks.
 *
 * @param {number} cx
 * @param {number} cy
 * @param {View} view
 * @returns {{px: number, py: number}}
 */
export function canvasToImageRaw(cx, cy, view) {
  return {
    px: (cx - view.offsetX) / view.scale,
    py: (cy - view.offsetY) / view.scale,
  };
}

/**
 * Convert canvas-space coordinates to original image pixel coordinates.
 *
 * @param {number} cx — canvas x
 * @param {number} cy — canvas y
 * @param {View} view
 * @param {number} imgW — image width in pixels
 * @param {number} imgH — image height in pixels
 * @returns {{px: number, py: number}|null} — null if outside image bounds
 */
export function canvasToImage(cx, cy, view, imgW, imgH) {
  const { px, py } = canvasToImageRaw(cx, cy, view);

  // Allow a small margin for edge clicks
  if (px < -1 || py < -1 || px > imgW + 1 || py > imgH + 1) {
    return null;
  }

  return { px, py };
}

/**
 * Convert original image pixel coordinates to canvas-space coordinates.
 *
 * @param {number} px — image pixel x
 * @param {number} py — image pixel y
 * @param {View} view
 * @returns {{cx: number, cy: number}}
 */
export function imageToCanvas(px, py, view) {
  return {
    cx: px * view.scale + view.offsetX,
    cy: py * view.scale + view.offsetY,
  };
}

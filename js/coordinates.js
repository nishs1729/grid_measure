/**
 * coordinates.js — Coordinate conversion utilities
 *
 * Handles the mapping between:
 *   1. Mouse/client coordinates
 *   2. Canvas element coordinates
 *   3. Original image pixel coordinates
 *
 * The image is drawn centered inside the canvas, preserving aspect ratio.
 * We track the scale and offset so we can convert accurately.
 */

/**
 * @typedef {Object} ImageFit
 * @property {number} scale    — ratio: displayed size / original size
 * @property {number} offsetX  — horizontal offset in canvas pixels
 * @property {number} offsetY  — vertical offset in canvas pixels
 * @property {number} drawW    — drawn width in canvas pixels
 * @property {number} drawH    — drawn height in canvas pixels
 */

/**
 * Compute how an image fits inside a canvas while preserving aspect ratio.
 *
 * @param {number} canvasW — canvas element width (CSS pixels, matches canvas.width if DPR=1)
 * @param {number} canvasH — canvas element height
 * @param {number} imgW    — original image width in pixels
 * @param {number} imgH    — original image height in pixels
 * @returns {ImageFit}
 */
export function computeImageFit(canvasW, canvasH, imgW, imgH) {
  const scaleX = canvasW / imgW;
  const scaleY = canvasH / imgH;
  const scale = Math.min(scaleX, scaleY);

  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const offsetX = (canvasW - drawW) / 2;
  const offsetY = (canvasH - drawH) / 2;

  return { scale, offsetX, offsetY, drawW, drawH };
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
 * Convert canvas-space coordinates to original image pixel coordinates.
 *
 * @param {number} cx — canvas x
 * @param {number} cy — canvas y
 * @param {ImageFit} fit
 * @returns {{px: number, py: number}|null} — null if outside image bounds
 */
export function canvasToImage(cx, cy, fit) {
  const px = (cx - fit.offsetX) / fit.scale;
  const py = (cy - fit.offsetY) / fit.scale;

  // Allow a small margin for edge clicks
  if (px < -1 || py < -1 || px > fit.drawW / fit.scale + 1 || py > fit.drawH / fit.scale + 1) {
    return null;
  }

  return { px, py };
}

/**
 * Convert original image pixel coordinates to canvas-space coordinates.
 *
 * @param {number} px — image pixel x
 * @param {number} py — image pixel y
 * @param {ImageFit} fit
 * @returns {{cx: number, cy: number}}
 */
export function imageToCanvas(px, py, fit) {
  return {
    cx: px * fit.scale + fit.offsetX,
    cy: py * fit.scale + fit.offsetY,
  };
}

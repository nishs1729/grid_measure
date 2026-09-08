/**
 * points.js — Point CRUD and calibration management
 */

import state, { getSelectedImage, getImageById } from './state.js';
import { computeCalibrationHomography, applyHomography } from './homography.js';

/** Distinct colors for points, cycling if needed */
const POINT_COLORS = [
  '#ff4444', // P1 red
  '#44aaff', // P2 blue
  '#44dd44', // P3 green
  '#ffaa00', // P4 orange
  '#e844ff', // P5 magenta
  '#00ddcc', // P6 teal
  '#ff6699', // P7 pink
  '#88cc00', // P8 lime
  '#aa88ff', // P9 purple
  '#ffdd44', // P10 gold
  '#00aaff', // P11
  '#ff8844', // P12
];

export function getPointColor(index) {
  return POINT_COLORS[index % POINT_COLORS.length];
}

/**
 * Add a new point to the currently selected image.
 *
 * @param {number} pixelX — original image pixel x
 * @param {number} pixelY — original image pixel y
 * @returns {object|null} — the created point, or null
 */
export function addPoint(pixelX, pixelY) {
  const img = getSelectedImage();
  if (!img) return null;

  const index = img.points.length;
  const label = `P${index + 1}`;

  let gridX = null;
  let gridY = null;

  // Calibration points have fixed grid coordinates from state.calibDst
  if (index < 4) {
    gridX = state.calibDst[index].x;
    gridY = state.calibDst[index].y;
  } else if (img.calibration.homography) {
    // Measurement point: compute grid coords via homography
    const g = applyHomography(img.calibration.homography, pixelX, pixelY);
    gridX = g.x;
    gridY = g.y;
  }

  const point = { label, pixelX, pixelY, gridX, gridY };
  img.points.push(point);

  // Recompute homography when P4 is placed
  if (index === 3) {
    recalibrate(img);
  }

  return point;
}

/**
 * Move an existing point to new pixel coordinates.
 *
 * @param {number} pointIndex
 * @param {number} newPixelX
 * @param {number} newPixelY
 */
export function movePoint(pointIndex, newPixelX, newPixelY) {
  const img = getSelectedImage();
  if (!img || pointIndex < 0 || pointIndex >= img.points.length) return;

  const pt = img.points[pointIndex];
  pt.pixelX = newPixelX;
  pt.pixelY = newPixelY;

  if (pointIndex < 4) {
    // Calibration point moved — recalibrate
    if (img.points.length >= 4) {
      recalibrate(img);
    }
  } else if (img.calibration.homography) {
    // Measurement point moved — recompute its grid coords
    const g = applyHomography(img.calibration.homography, newPixelX, newPixelY);
    pt.gridX = g.x;
    pt.gridY = g.y;
  }
}

/**
 * Delete the last (most recently added) point.
 */
export function deleteLastPoint() {
  const img = getSelectedImage();
  if (!img || img.points.length === 0) return;

  img.points.pop();

  // If we now have fewer than 4 points, clear calibration
  if (img.points.length < 4) {
    img.calibration.homography = null;
    // Clear grid coords from remaining non-calibration points (shouldn't exist, but safety)
    img.points.forEach((pt, i) => {
      if (i >= 4) {
        pt.gridX = null;
        pt.gridY = null;
      }
    });
  } else {
    // Recalibrate in case a calibration point was the one removed (unlikely with stack-based deletion)
    recalibrate(img);
  }
}

/**
 * Clear all points from the current image.
 */
export function resetPoints() {
  const img = getSelectedImage();
  if (!img) return;
  img.points = [];
  img.calibration.homography = null;
}

/**
 * Recompute the homography from the current P1-P4 and update all measurement points.
 */
export function recalibrate(img) {
  if (!img || img.points.length < 4) {
    img.calibration.homography = null;
    return;
  }

  const calibPoints = img.points.slice(0, 4).map((pt) => ({
    x: pt.pixelX,
    y: pt.pixelY,
  }));

  try {
    img.calibration.homography = computeCalibrationHomography(calibPoints, state.calibDst);
  } catch (e) {
    console.error('Homography computation failed:', e);
    img.calibration.homography = null;
    return;
  }

  // Update all measurement points (P5 onward)
  for (let i = 4; i < img.points.length; i++) {
    const pt = img.points[i];
    const g = applyHomography(img.calibration.homography, pt.pixelX, pt.pixelY);
    pt.gridX = g.x;
    pt.gridY = g.y;
  }
}

/**
 * Find the index of a point near the given image pixel coordinates.
 * Returns -1 if no point is close enough.
 *
 * @param {number} px — image pixel x
 * @param {number} py — image pixel y
 * @param {number} threshold — max distance in image pixels
 * @returns {number}
 */
export function findPointNear(px, py, threshold = 15) {
  const img = getSelectedImage();
  if (!img) return -1;

  let bestDist = threshold;
  let bestIdx = -1;

  for (let i = 0; i < img.points.length; i++) {
    const pt = img.points[i];
    const d = Math.hypot(pt.pixelX - px, pt.pixelY - py);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  return bestIdx;
}

/**
 * Get the status message for the current state.
 */
export function getStatusMessage() {
  const img = getSelectedImage();
  if (!img) return 'Load an image to begin';

  const n = img.points.length;
  if (n === 0) return 'Click P1 — first calibration point (grid origin)';
  if (n === 1) return 'Click P2 — second calibration point (1,0)';
  if (n === 2) return 'Click P3 — third calibration point (1,1)';
  if (n === 3) return 'Click P4 — fourth calibration point (0,1)';

  if (!img.calibration.homography) {
    return '⚠ Calibration failed — reposition P1–P4';
  }

  return 'Calibration complete — click to add measurement points';
}

/**
 * homography.js — 4-point projective (homography) transformation
 *
 * Computes the 3×3 projective matrix H such that for each correspondence
 *   (srcX, srcY) → (dstX, dstY)
 * we have:
 *   [w·dstX]   [h0 h1 h2] [srcX]
 *   [w·dstY] = [h3 h4 h5] [srcY]
 *   [w     ]   [h6 h7  1] [  1 ]
 *
 * The four fixed correspondences are:
 *   P1 → (0,0)   P2 → (1,0)   P3 → (1,1)   P4 → (0,1)
 */

/**
 * Solve an n×(n+1) augmented matrix in-place via Gaussian elimination
 * with partial pivoting. Returns the solution vector.
 */
function gaussianElimination(A, n) {
  // Forward elimination
  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(A[row][col]);
      if (v > maxVal) {
        maxVal = v;
        maxRow = row;
      }
    }
    if (maxVal < 1e-12) {
      throw new Error('Singular matrix in homography computation');
    }
    // Swap rows
    if (maxRow !== col) {
      const tmp = A[col];
      A[col] = A[maxRow];
      A[maxRow] = tmp;
    }
    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / A[col][col];
      for (let j = col; j <= n; j++) {
        A[row][j] -= factor * A[col][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n);
  for (let row = n - 1; row >= 0; row--) {
    let sum = A[row][n];
    for (let j = row + 1; j < n; j++) {
      sum -= A[row][j] * x[j];
    }
    x[row] = sum / A[row][row];
  }
  return x;
}

/**
 * Compute the 3×3 homography matrix from 4 source points (image pixels)
 * to 4 destination points (grid coordinates).
 *
 * @param {Array<{x: number, y: number}>} src — 4 source points (image pixel coords)
 * @param {Array<{x: number, y: number}>} dst — 4 destination points (grid coords)
 * @returns {Float64Array} — 9-element array representing a 3×3 row-major matrix
 */
export function computeHomography(src, dst) {
  // Build the 8×9 system A·h = 0
  // We set h8 = 1, so we solve for h0..h7
  // Each correspondence gives 2 equations:
  //   srcX*h0 + srcY*h1 + h2 - dstX*srcX*h6 - dstX*srcY*h7 = dstX
  //   srcX*h3 + srcY*h4 + h5 - dstY*srcX*h6 - dstY*srcY*h7 = dstY

  const A = [];
  for (let i = 0; i < 4; i++) {
    const sx = src[i].x, sy = src[i].y;
    const dx = dst[i].x, dy = dst[i].y;

    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy, dx]);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy, dy]);
  }

  const h = gaussianElimination(A, 8);

  // H = [h0 h1 h2; h3 h4 h5; h6 h7 1]
  return new Float64Array([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]);
}

/**
 * Compute the homography from 4 calibration points (image pixels)
 * using fixed or user-supplied grid destinations.
 *
 * @param {Array<{x: number, y: number}>} calibPoints — P1..P4 image pixel coords
 * @param {Array<{x: number, y: number}>} [dst] — optional grid destinations for P1..P4;
 *   defaults to the anticlockwise unit square: (0,0),(1,0),(1,1),(0,1).
 * @returns {Float64Array} — 3×3 homography matrix
 */
export function computeCalibrationHomography(calibPoints, dst = null) {
  const gridDst = dst ?? [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  return computeHomography(calibPoints, gridDst);
}


/**
 * Apply the homography to transform a point.
 * @param {Float64Array} H — 3×3 row-major homography
 * @param {number} x
 * @param {number} y
 * @returns {{x: number, y: number}}
 */
export function applyHomography(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return {
    x: (H[0] * x + H[1] * y + H[2]) / w,
    y: (H[3] * x + H[4] * y + H[5]) / w,
  };
}

/**
 * Invert a 3×3 matrix.
 * @param {Float64Array} M — 9-element row-major
 * @returns {Float64Array} — inverted 3×3
 */
export function invertMatrix3x3(M) {
  const [a, b, c, d, e, f, g, h, i] = M;

  const det =
    a * (e * i - f * h) -
    b * (d * i - f * g) +
    c * (d * h - e * g);

  if (Math.abs(det) < 1e-14) {
    throw new Error('Singular matrix — cannot invert');
  }

  const invDet = 1.0 / det;

  return new Float64Array([
    (e * i - f * h) * invDet,
    (c * h - b * i) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * i) * invDet,
    (a * i - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * h - e * g) * invDet,
    (b * g - a * h) * invDet,
    (a * e - b * d) * invDet,
  ]);
}

/**
 * Compute the inverse homography (grid → image pixels).
 * @param {Float64Array} H
 * @returns {Float64Array}
 */
export function invertHomography(H) {
  return invertMatrix3x3(H);
}

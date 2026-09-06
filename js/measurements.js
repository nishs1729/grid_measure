/**
 * measurements.js — Distance calculations in grid space
 */

/**
 * Euclidean distance between two points in grid coordinates.
 *
 * @param {{gridX: number, gridY: number}} a
 * @param {{gridX: number, gridY: number}} b
 * @returns {number|null} — distance, or null if either point lacks grid coords
 */
export function gridDistance(a, b) {
  if (a.gridX == null || a.gridY == null || b.gridX == null || b.gridY == null) {
    return null;
  }
  return Math.hypot(b.gridX - a.gridX, b.gridY - a.gridY);
}

/**
 * Get measurement pairs from an image's points.
 * Consecutive measurement points are paired: P5–P6, P7–P8, etc.
 *
 * @param {Array} points — full points array for an image
 * @returns {Array<{a: object, b: object, distance: number|null}>}
 */
export function getMeasurementPairs(points) {
  const pairs = [];
  // Measurement points start at index 4 (P5)
  for (let i = 4; i < points.length - 1; i += 2) {
    const a = points[i];
    const b = points[i + 1];
    pairs.push({
      a,
      b,
      distance: gridDistance(a, b),
    });
  }
  return pairs;
}

/**
 * Convert grid-unit distance to physical units.
 *
 * @param {number} gridDist — distance in grid units
 * @param {number|null} unitSize — physical size of one grid unit
 * @returns {number|null}
 */
export function toPhysicalUnits(gridDist, unitSize) {
  if (unitSize == null || gridDist == null) return null;
  return gridDist * unitSize;
}

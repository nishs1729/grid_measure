/**
 * csvFormat.js — Pure CSV logic: header layout, rows, quoting, parsing, merging
 *
 * No DOM or app state here, so it can be unit-tested directly. csvExport.js wires
 * these functions to the buttons, the current images and the file download.
 */

/**
 * @typedef {Object} ExportSettings
 * @property {number|null} gridUnitSize — physical size of one grid unit, or null
 * @property {string} gridUnitLabel — e.g. 'mm'
 * @property {Array<{x: number, y: number}>} calibDst — grid coordinates of P1–P4
 */

/**
 * Maximum number of measurement points (P5+) across the given images.
 */
export function getMaxMeasurementPoints(images) {
  let max = 0;
  for (const img of images) {
    const measCount = Math.max(0, img.points.length - 4);
    if (measCount > max) max = measCount;
  }
  return max;
}

/**
 * Number of measurement points implied by an existing header (highest P<n>_grid_x, n ≥ 5).
 */
export function measurementPointsInHeader(header) {
  let max = 0;
  for (const col of header) {
    const m = /^P(\d+)_grid_x$/.exec(col);
    if (m && Number(m[1]) >= 5) max = Math.max(max, Number(m[1]) - 4);
  }
  return max;
}

/**
 * Build the CSV header based on the number of measurement points.
 */
export function buildHeader(maxMeas) {
  const cols = [
    'image',
    'image_width',
    'image_height',
    'grid_unit_size',
    'grid_unit',
  ];
  for (let i = 1; i <= 4; i++) cols.push(`P${i}_pixel_x`, `P${i}_pixel_y`);
  for (let i = 1; i <= 4; i++) cols.push(`P${i}_grid_x`, `P${i}_grid_y`);
  for (let i = 0; i < maxMeas; i++) {
    const pn = i + 5;
    cols.push(`P${pn}_grid_x`, `P${pn}_grid_y`);
  }
  return cols;
}

/**
 * Build a CSV row for a single image. Values are placed by column name, so the
 * header order can change without breaking rows. Columns not in the header are dropped.
 *
 * @param {object} img — image state (name, width, height, points)
 * @param {string[]} header
 * @param {ExportSettings} settings
 */
export function buildRow(img, header, settings) {
  const values = {
    image: img.name,
    image_width: img.width,
    image_height: img.height,
    grid_unit_size: settings.gridUnitSize ?? '',
    grid_unit: settings.gridUnitLabel,
  };

  // P1–P4 pixel coordinates
  for (let i = 0; i < 4 && i < img.points.length; i++) {
    const pt = img.points[i];
    values[`P${i + 1}_pixel_x`] = pt.pixelX.toFixed(2);
    values[`P${i + 1}_pixel_y`] = pt.pixelY.toFixed(2);
  }

  // P1–P4 grid destinations
  for (let i = 0; i < 4; i++) {
    values[`P${i + 1}_grid_x`] = settings.calibDst[i].x;
    values[`P${i + 1}_grid_y`] = settings.calibDst[i].y;
  }

  // P5+ grid coordinates
  for (let i = 4; i < img.points.length; i++) {
    const pt = img.points[i];
    values[`P${i + 1}_grid_x`] = pt.gridX != null ? pt.gridX.toFixed(4) : '';
    values[`P${i + 1}_grid_y`] = pt.gridY != null ? pt.gridY.toFixed(4) : '';
  }

  return header.map((col) => values[col] ?? '');
}

/**
 * Escape a CSV field (quote if needed).
 */
export function csvEscape(val) {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Convert rows to CSV string.
 */
export function rowsToCsv(header, rows) {
  const lines = [header.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

/**
 * Parse a CSV string into { header: string[], rows: string[][] }.
 */
export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [] };

  const parse = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }
    result.push(current);
    return result;
  };

  const header = parse(lines[0]);
  const rows = lines.slice(1).map(parse);
  return { header, rows };
}

/**
 * True for an empty header or one with GridMeasure's key columns.
 */
export function isGridMeasureHeader(header) {
  return header.length === 0 || (header.includes('image') && header.includes('P1_pixel_x'));
}

/**
 * Merge an existing parsed CSV with rows for new images.
 *
 * The merged header is the standard layout, wide enough for both the old and new
 * measurement points, followed by any extra columns the existing file has. Existing
 * rows are re-mapped by column name, so older files without newer columns (e.g.
 * grid_unit_size / grid_unit) line up; the columns they lack are left blank.
 *
 * @param {{header: string[], rows: string[][]}} existing
 * @param {object[]} images — images to add
 * @param {ExportSettings} settings
 * @returns {{header: string[], rows: string[][]}}
 */
export function mergeCsv(existing, images, settings) {
  const maxMeas = Math.max(getMaxMeasurementPoints(images), measurementPointsInHeader(existing.header));
  const header = buildHeader(maxMeas);
  for (const col of existing.header) {
    if (!header.includes(col)) header.push(col);
  }

  const existingIndex = new Map(existing.header.map((col, i) => [col, i]));
  const remapped = existing.rows.map((row) =>
    header.map((col) => (existingIndex.has(col) ? row[existingIndex.get(col)] ?? '' : ''))
  );

  const added = images.map((img) => buildRow(img, header, settings));
  return { header, rows: [...remapped, ...added] };
}

/**
 * File name for an appended export: strip ".csv" and any previous
 * "_updated[_<timestamp>]" suffix so names don't pile up.
 */
export function appendedFileName(originalName, ts) {
  const base = originalName
    .replace(/\.csv$/i, '')
    .replace(/_updated(_\d{4}-\d{2}-\d{2}_\d{6})?$/, '');
  return `${base}_updated_${ts}.csv`;
}

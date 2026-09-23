/**
 * csvExport.js — CSV generation (new / append), file download, file reading
 */

import state from './state.js';
import { timestamp } from './util.js';

/**
 * Initialize CSV export buttons.
 *
 * @param {Function} onUpdate
 */
export function initCsvExport(onUpdate) {
  const exportNewBtn = document.getElementById('export-new-csv');
  const exportAppendBtn = document.getElementById('export-append-csv');
  const appendFileInput = document.getElementById('append-file-input');

  exportNewBtn.addEventListener('click', () => {
    exportNewCsv();
  });

  exportAppendBtn.addEventListener('click', () => {
    appendFileInput.click();
  });

  appendFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await appendToCsv(file);
    appendFileInput.value = '';
  });
}

/**
 * Split images into those that can be exported (calibration succeeded) and those skipped.
 */
function partitionImages() {
  const exportable = state.images.filter((img) => img.calibration.homography != null);
  const skipped = state.images.filter((img) => img.calibration.homography == null);
  return { exportable, skipped };
}

/**
 * Warn about images that will be left out. Returns false if the export should stop.
 */
function confirmExport(exportable, skipped) {
  if (exportable.length === 0) {
    alert('No images have a successful calibration (P1–P4). Calibrate at least one image to export.');
    return false;
  }
  if (skipped.length === 0) return true;

  const max = 10;
  const names = skipped.slice(0, max).map((img) => img.name).join(', ');
  const more = skipped.length > max ? ` and ${skipped.length - max} more` : '';
  return confirm(
    `${skipped.length} image(s) will be skipped (not calibrated): ${names}${more}.\n\nContinue?`
  );
}

/**
 * Maximum number of measurement points (P5+) across the given images.
 */
function getMaxMeasurementPoints(images) {
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
function measurementPointsInHeader(header) {
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
function buildHeader(maxMeas) {
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
 */
function buildRow(img, header) {
  const values = {
    image: img.name,
    image_width: img.width,
    image_height: img.height,
    grid_unit_size: state.gridUnitSize ?? '',
    grid_unit: state.gridUnitLabel,
  };

  // P1–P4 pixel coordinates
  for (let i = 0; i < 4 && i < img.points.length; i++) {
    const pt = img.points[i];
    values[`P${i + 1}_pixel_x`] = pt.pixelX.toFixed(2);
    values[`P${i + 1}_pixel_y`] = pt.pixelY.toFixed(2);
  }

  // P1–P4 grid destinations from state.calibDst
  for (let i = 0; i < 4; i++) {
    values[`P${i + 1}_grid_x`] = state.calibDst[i].x;
    values[`P${i + 1}_grid_y`] = state.calibDst[i].y;
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
function csvEscape(val) {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Convert rows to CSV string.
 */
function rowsToCsv(header, rows) {
  const lines = [header.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

/**
 * Trigger download of a string as a file.
 */
function downloadString(content, filename, mimeType = 'text/csv') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export all calibrated images as a new CSV.
 */
function exportNewCsv() {
  const { exportable, skipped } = partitionImages();
  if (!confirmExport(exportable, skipped)) return;

  const header = buildHeader(getMaxMeasurementPoints(exportable));
  const rows = exportable.map((img) => buildRow(img, header));
  const csv = rowsToCsv(header, rows);
  downloadString(csv, `gridmeasure_${timestamp()}.csv`);
}

/**
 * Parse a CSV string into { header: string[], rows: string[][] }.
 */
function parseCsv(text) {
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
 * Append current image data to an existing CSV file.
 *
 * Existing rows are re-mapped into the merged header by column name, so files written
 * before columns were added (e.g. grid_unit_size / grid_unit) line up correctly;
 * columns the old file lacks are left blank.
 */
async function appendToCsv(file) {
  const text = await file.text();
  const existing = parseCsv(text);

  if (existing.header.length > 0 && !(existing.header.includes('image') && existing.header.includes('P1_pixel_x'))) {
    alert(`"${file.name}" doesn't look like a GridMeasure CSV (missing "image" / "P1_pixel_x" columns). Nothing was exported.`);
    return;
  }

  const { exportable, skipped } = partitionImages();
  if (!confirmExport(exportable, skipped)) return;

  // Merged header: standard columns wide enough for both old and new rows,
  // plus any extra columns the existing file has, kept at the end
  const maxMeas = Math.max(getMaxMeasurementPoints(exportable), measurementPointsInHeader(existing.header));
  const mergedHeader = buildHeader(maxMeas);
  for (const col of existing.header) {
    if (!mergedHeader.includes(col)) mergedHeader.push(col);
  }

  const existingIndex = new Map(existing.header.map((col, i) => [col, i]));
  const remappedExisting = existing.rows.map((row) =>
    mergedHeader.map((col) => (existingIndex.has(col) ? row[existingIndex.get(col)] ?? '' : ''))
  );

  const newRows = exportable.map((img) => buildRow(img, mergedHeader));
  const csv = rowsToCsv(mergedHeader, [...remappedExisting, ...newRows]);

  // Generate filename; strip a previous _updated[_<timestamp>] suffix so names don't pile up
  const baseName = file.name
    .replace(/\.csv$/i, '')
    .replace(/_updated(_\d{4}-\d{2}-\d{2}_\d{6})?$/, '');
  downloadString(csv, `${baseName}_updated_${timestamp()}.csv`);
}

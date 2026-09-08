/**
 * csvExport.js — CSV generation (new / append), file download, file reading
 */

import state from './state.js';

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
 * Determine the maximum number of measurement points across all images.
 */
function getMaxMeasurementPoints() {
  let max = 0;
  for (const img of state.images) {
    const measCount = Math.max(0, img.points.length - 4);
    if (measCount > max) max = measCount;
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
    'P1_pixel_x', 'P1_pixel_y',
    'P2_pixel_x', 'P2_pixel_y',
    'P3_pixel_x', 'P3_pixel_y',
    'P4_pixel_x', 'P4_pixel_y',
    'P1_grid_x', 'P1_grid_y',
    'P2_grid_x', 'P2_grid_y',
    'P3_grid_x', 'P3_grid_y',
    'P4_grid_x', 'P4_grid_y',
  ];
  for (let i = 0; i < maxMeas; i++) {
    const pn = i + 5;
    cols.push(`P${pn}_grid_x`, `P${pn}_grid_y`);
  }
  return cols;
}

/**
 * Build a CSV row for a single image.
 */
function buildRow(img, totalCols) {
  const row = new Array(totalCols).fill('');

  row[0] = img.name;
  row[1] = img.width;
  row[2] = img.height;

  // P1-P4 pixel coordinates (cols 3-10)
  for (let i = 0; i < 4 && i < img.points.length; i++) {
    const pt = img.points[i];
    row[3 + i * 2] = pt.pixelX.toFixed(1);
    row[3 + i * 2 + 1] = pt.pixelY.toFixed(1);
  }

  // P1-P4 grid destinations from state.calibDst (cols 11-18)
  for (let i = 0; i < 4; i++) {
    row[11 + i * 2] = state.calibDst[i].x;
    row[11 + i * 2 + 1] = state.calibDst[i].y;
  }

  // P5+ grid coordinates (cols 19+)
  for (let i = 4; i < img.points.length; i++) {
    const pt = img.points[i];
    const colIdx = 19 + (i - 4) * 2;
    if (colIdx < totalCols) {
      row[colIdx] = pt.gridX != null ? pt.gridX.toFixed(4) : '';
      row[colIdx + 1] = pt.gridY != null ? pt.gridY.toFixed(4) : '';
    }
  }

  return row;
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
 * Export all current images as a new CSV.
 */
function exportNewCsv() {
  // Only export images that have at least P1-P4
  const exportable = state.images.filter((img) => img.points.length >= 4);

  if (exportable.length === 0) {
    alert('No images have complete calibration (P1–P4). Add at least 4 points to export.');
    return;
  }

  const maxMeas = getMaxMeasurementPoints();
  const header = buildHeader(maxMeas);
  const rows = exportable.map((img) => buildRow(img, header.length));
  const csv = rowsToCsv(header, rows);
  downloadString(csv, 'gridmeasure_export.csv');
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
 */
async function appendToCsv(file) {
  const text = await file.text();
  const existing = parseCsv(text);

  const exportable = state.images.filter((img) => img.points.length >= 4);
  if (exportable.length === 0) {
    alert('No images have complete calibration (P1–P4).');
    return;
  }

  // Determine required header width
  const maxMeasNew = getMaxMeasurementPoints();
  const newHeader = buildHeader(maxMeasNew);

  // Merge headers: take the wider one
  let mergedHeader;
  if (existing.header.length >= newHeader.length) {
    mergedHeader = existing.header;
  } else {
    mergedHeader = newHeader;
  }

  // Pad existing rows to new width
  const paddedExisting = existing.rows.map((row) => {
    while (row.length < mergedHeader.length) row.push('');
    return row;
  });

  // Build new rows
  const newRows = exportable.map((img) => buildRow(img, mergedHeader.length));

  const csv = rowsToCsv(mergedHeader, [...paddedExisting, ...newRows]);

  // Generate filename
  const baseName = file.name.replace(/\.csv$/i, '');
  downloadString(csv, `${baseName}_updated.csv`);
}

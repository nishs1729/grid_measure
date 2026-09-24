/**
 * csvExport.js — Export / Append buttons, skip warnings and file download
 *
 * The CSV format itself (header, rows, parsing, merging) lives in csvFormat.js.
 */

import state from './state.js';
import { timestamp } from './util.js';
import {
  buildHeader,
  buildRow,
  rowsToCsv,
  parseCsv,
  getMaxMeasurementPoints,
  isGridMeasureHeader,
  mergeCsv,
  appendedFileName,
} from './csvFormat.js';

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
 * Current export settings from app state.
 * @returns {import('./csvFormat.js').ExportSettings}
 */
function exportSettings() {
  return { gridUnitSize: state.gridUnitSize, gridUnitLabel: state.gridUnitLabel, calibDst: state.calibDst };
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
  const rows = exportable.map((img) => buildRow(img, header, exportSettings()));
  const csv = rowsToCsv(header, rows);
  downloadString(csv, `gridmeasure_${timestamp()}.csv`);
}

/**
 * Append current image data to an existing CSV file.
 *
 * Existing rows are re-mapped into the merged header by column name, so files written
 * before columns were added (e.g. grid_unit_size / grid_unit) line up correctly;
 * columns the old file lacks are left blank.
 */
async function appendToCsv(file) {
  const existing = parseCsv(await file.text());

  if (!isGridMeasureHeader(existing.header)) {
    alert(`"${file.name}" doesn't look like a GridMeasure CSV (missing "image" / "P1_pixel_x" columns). Nothing was exported.`);
    return;
  }

  const { exportable, skipped } = partitionImages();
  if (!confirmExport(exportable, skipped)) return;

  const merged = mergeCsv(existing, exportable, exportSettings());
  downloadString(rowsToCsv(merged.header, merged.rows), appendedFileName(file.name, timestamp()));
}

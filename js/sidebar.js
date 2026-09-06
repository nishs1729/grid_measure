/**
 * sidebar.js — Right sidebar: point list, calibration diagnostics, hover highlights
 */

import state, { getSelectedImage } from './state.js';
import { getPointColor, getStatusMessage, deleteLastPoint, resetPoints } from './points.js';

/**
 * Initialize sidebar event handlers.
 *
 * @param {Function} onUpdate — full UI update callback
 */
export function initSidebar(onUpdate) {
  const deleteLastBtn = document.getElementById('delete-last-btn');
  const resetBtn = document.getElementById('reset-points-btn');

  deleteLastBtn.addEventListener('click', () => {
    deleteLastPoint();
    onUpdate();
  });

  resetBtn.addEventListener('click', () => {
    const img = getSelectedImage();
    if (!img || img.points.length === 0) return;
    if (confirm('Remove all points from this image?')) {
      resetPoints();
      onUpdate();
    }
  });

  // Grid unit size input
  const unitInput = document.getElementById('grid-unit-size');
  unitInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    state.gridUnitSize = isNaN(val) || val <= 0 ? null : val;
    renderSidebar(onUpdate);
  });
}

/**
 * Render the right sidebar contents.
 *
 * @param {Function} onUpdate
 */
export function renderSidebar(onUpdate) {
  const img = getSelectedImage();
  const statusEl = document.getElementById('status-message');
  const pointListEl = document.getElementById('point-list');
  const diagnosticsEl = document.getElementById('calibration-diagnostics');
  const deleteLastBtn = document.getElementById('delete-last-btn');
  const resetBtn = document.getElementById('reset-points-btn');

  // Status message
  statusEl.textContent = getStatusMessage();

  // Point list
  pointListEl.innerHTML = '';

  if (!img) {
    deleteLastBtn.style.display = 'none';
    resetBtn.style.display = 'none';
    diagnosticsEl.innerHTML = '';
    return;
  }

  deleteLastBtn.style.display = img.points.length > 0 ? 'inline-flex' : 'none';
  resetBtn.style.display = img.points.length > 0 ? 'inline-flex' : 'none';

  for (let i = 0; i < img.points.length; i++) {
    const pt = img.points[i];
    const color = getPointColor(i);
    const isCalib = i < 4;
    const isLast = i === img.points.length - 1;
    const isHovered = i === state.hoveredPointIndex;

    const row = document.createElement('div');
    row.className = `point-row ${isHovered ? 'hovered' : ''} ${isCalib ? 'calibration' : 'measurement'}`;
    row.dataset.pointIndex = i;

    let gridText = '';
    if (pt.gridX != null && pt.gridY != null) {
      gridText = `grid: (${pt.gridX.toFixed(3)}, ${pt.gridY.toFixed(3)})`;
    } else {
      gridText = 'grid: —';
    }

    const typeLabel = isCalib ? '<span class="point-type calib">CALIB</span>' : '<span class="point-type meas">MEAS</span>';

    row.innerHTML = `
      <span class="point-color" style="background: ${color}"></span>
      <span class="point-label">${pt.label}</span>
      ${typeLabel}
      <span class="point-coords">img: (${pt.pixelX.toFixed(1)}, ${pt.pixelY.toFixed(1)})</span>
      <span class="point-grid">${gridText}</span>
      ${isLast ? '<button class="point-delete-btn" title="Delete point">&times;</button>' : ''}
    `;

    // Hover highlight bidirectional
    row.addEventListener('mouseenter', () => {
      state.hoveredPointIndex = i;
      onUpdate(true);
    });
    row.addEventListener('mouseleave', () => {
      state.hoveredPointIndex = -1;
      onUpdate(true);
    });

    // Delete last point
    if (isLast) {
      const delBtn = row.querySelector('.point-delete-btn');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteLastPoint();
        onUpdate();
      });
    }

    pointListEl.appendChild(row);
  }

  // Calibration Diagnostics
  renderCalibrationDiagnostics(img, diagnosticsEl);
}

// ---- Calibration Diagnostics ----

/**
 * Compute and render calibration diagnostics from P1–P4.
 */
function renderCalibrationDiagnostics(img, container) {
  container.innerHTML = '';

  if (img.points.length < 4 || !img.calibration.homography) {
    return;
  }

  const p1 = img.points[0];
  const p2 = img.points[1];
  const p3 = img.points[2];
  const p4 = img.points[3];

  const H = img.calibration.homography;

  // --- Vectors ---
  const ux = p2.pixelX - p1.pixelX;
  const uy = p2.pixelY - p1.pixelY;
  const vx = p4.pixelX - p1.pixelX;
  const vy = p4.pixelY - p1.pixelY;

  // --- 1. Rotation (angle of P1→P2 baseline) ---
  const rotationRad = Math.atan2(uy, ux);
  const rotationDeg = rotationRad * (180 / Math.PI);

  // --- 2. Scale (pixels per grid unit along P1→P2) ---
  const scaleU = Math.hypot(ux, uy);
  const scaleV = Math.hypot(vx, vy);
  const scaleAvg = (scaleU + scaleV) / 2;

  // Physical scale if grid unit size is set
  let physicalScale = null;
  if (state.gridUnitSize != null && state.gridUnitSize > 0) {
    physicalScale = scaleAvg / state.gridUnitSize; // px per mm
  }

  // --- 3. Aspect ratio ---
  const aspectRatio = scaleV / scaleU;

  // --- 4. Corner angle / Skew ---
  const dotUV = ux * vx + uy * vy;
  const cosAngle = dotUV / (scaleU * scaleV);
  const cornerAngleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
  const cornerAngleDeg = cornerAngleRad * (180 / Math.PI);
  const skewDeg = 90 - cornerAngleDeg;

  // --- 5. Perspective (from H matrix bottom row) ---
  const h6 = H[6];
  const h7 = H[7];
  const perspMagnitude = Math.hypot(h6, h7);

  // Keystone ratio: compare opposite sides
  const topSide = Math.hypot(p2.pixelX - p1.pixelX, p2.pixelY - p1.pixelY);
  const bottomSide = Math.hypot(p3.pixelX - p4.pixelX, p3.pixelY - p4.pixelY);
  const keystoneRatio = topSide / bottomSide;

  let perspLabel;
  if (perspMagnitude < 1e-6) {
    perspLabel = 'None (orthographic)';
  } else if (perspMagnitude < 5e-4) {
    perspLabel = 'Minimal';
  } else if (perspMagnitude < 2e-3) {
    perspLabel = 'Moderate';
  } else {
    perspLabel = 'Strong';
  }

  // --- Build the UI ---
  const header = document.createElement('div');
  header.className = 'diag-header';
  header.textContent = 'Calibration Diagnostics';
  container.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'diag-grid';

  grid.appendChild(makeDiagCard(
    'Rotation',
    formatSign(rotationDeg, 1) + '°',
    'Tilt of grid relative to image'
  ));

  let scaleDetail = `${scaleU.toFixed(1)} × ${scaleV.toFixed(1)} px`;
  if (physicalScale != null) {
    scaleDetail += ` · ${physicalScale.toFixed(1)} px/${state.gridUnitLabel}`;
  }
  grid.appendChild(makeDiagCard(
    'Scale',
    `${scaleAvg.toFixed(1)} px/unit`,
    scaleDetail
  ));

  grid.appendChild(makeDiagCard(
    'Aspect Ratio',
    aspectRatio.toFixed(3),
    aspectRatio > 0.995 && aspectRatio < 1.005 ? 'Square ✓' : `${((aspectRatio - 1) * 100).toFixed(1)}% deviation`
  ));

  grid.appendChild(makeDiagCard(
    'Corner Angle',
    cornerAngleDeg.toFixed(1) + '°',
    Math.abs(skewDeg) < 0.5 ? 'Orthogonal ✓' : `${formatSign(skewDeg, 1)}° skew`
  ));

  grid.appendChild(makeDiagCard(
    'Perspective',
    perspLabel,
    `Keystone: ${keystoneRatio.toFixed(3)}`
  ));

  container.appendChild(grid);
}

function makeDiagCard(title, value, detail) {
  const card = document.createElement('div');
  card.className = 'diag-card';
  card.innerHTML = `
    <span class="diag-title">${title}</span>
    <span class="diag-value">${value}</span>
    <span class="diag-detail">${detail}</span>
  `;
  return card;
}

function formatSign(val, decimals) {
  const s = val.toFixed(decimals);
  return val >= 0 ? '+' + s : s;
}

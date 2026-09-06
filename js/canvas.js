/**
 * canvas.js — Canvas rendering engine
 *
 * Draws the current image and all point overlays on the main canvas.
 */

import state, { getSelectedImage } from './state.js';
import { computeImageFit, mouseToCanvas, canvasToImage, imageToCanvas } from './coordinates.js';
import { getPointColor, addPoint, findPointNear, movePoint } from './points.js';

let canvas, ctx;
let currentFit = null;

/**
 * Initialize the canvas module.
 *
 * @param {Function} onUpdate — callback to re-render the full UI
 */
export function initCanvas(onUpdate) {
  canvas = document.getElementById('main-canvas');
  ctx = canvas.getContext('2d');

  // Resize canvas to fill workspace
  resizeCanvas();
  window.addEventListener('resize', () => {
    resizeCanvas();
    renderCanvas();
  });

  // Mouse events
  canvas.addEventListener('mousedown', (e) => onMouseDown(e, onUpdate));
  canvas.addEventListener('mousemove', (e) => onMouseMove(e, onUpdate));
  canvas.addEventListener('mouseup', (e) => onMouseUp(e, onUpdate));
  canvas.addEventListener('mouseleave', () => {
    hideMagnifier();
  });
}

/**
 * Resize the canvas to match its CSS layout size.
 */
function resizeCanvas() {
  const wrapper = document.getElementById('canvas-wrapper');
  canvas.width = wrapper.clientWidth;
  canvas.height = wrapper.clientHeight;
}

/**
 * Get the current image fit (for use by magnifier and other modules).
 */
export function getCurrentFit() {
  return currentFit;
}

export function getCanvas() {
  return canvas;
}

/**
 * Render the full canvas: image + all points.
 */
export function renderCanvas() {
  if (!canvas || !ctx) return;

  // Ensure canvas matches container
  const wrapper = document.getElementById('canvas-wrapper');
  if (canvas.width !== wrapper.clientWidth || canvas.height !== wrapper.clientHeight) {
    canvas.width = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const img = getSelectedImage();
  if (!img) {
    currentFit = null;
    drawPlaceholder();
    return;
  }

  // Compute fit
  currentFit = computeImageFit(canvas.width, canvas.height, img.width, img.height);

  // Draw image
  ctx.drawImage(
    img.imageElement,
    currentFit.offsetX,
    currentFit.offsetY,
    currentFit.drawW,
    currentFit.drawH
  );

  // Draw points
  for (let i = 0; i < img.points.length; i++) {
    drawPoint(img.points[i], i);
  }
}

/**
 * Draw placeholder text when no image is loaded.
 */
function drawPlaceholder() {
  ctx.fillStyle = '#555';
  ctx.font = '16px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Add images using the left sidebar', canvas.width / 2, canvas.height / 2);
}

/**
 * Draw a single point on the canvas: unfilled circle with crosshair and label.
 */
function drawPoint(point, index) {
  if (!currentFit) return;

  const { cx, cy } = imageToCanvas(point.pixelX, point.pixelY, currentFit);
  const color = getPointColor(index);
  const isHovered = index === state.hoveredPointIndex;
  const isDragging = state.drag.active && state.drag.pointIndex === index;
  const radius = isHovered || isDragging ? 10 : 7;
  const crossSize = isHovered || isDragging ? 14 : 10;

  ctx.save();

  // Unfilled circle
  ctx.strokeStyle = color;
  ctx.lineWidth = isHovered || isDragging ? 2.5 : 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Crosshair
  ctx.beginPath();
  ctx.moveTo(cx - crossSize, cy);
  ctx.lineTo(cx + crossSize, cy);
  ctx.moveTo(cx, cy - crossSize);
  ctx.lineTo(cx, cy + crossSize);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Label
  ctx.fillStyle = color;
  ctx.font = `bold 11px Inter, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';

  // Background for label readability
  const labelText = point.label;
  const metrics = ctx.measureText(labelText);
  const lx = cx + radius + 4;
  const ly = cy - radius - 2;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(lx - 2, ly - 12, metrics.width + 4, 14);
  ctx.fillStyle = color;
  ctx.fillText(labelText, lx, ly);

  ctx.restore();
}

// ---- Mouse interaction ----

function onMouseDown(e, onUpdate) {
  const img = getSelectedImage();
  if (!img || !currentFit) return;

  const { cx, cy } = mouseToCanvas(e, canvas);
  const coords = canvasToImage(cx, cy, currentFit);
  if (!coords) return;

  const { px, py } = coords;

  // Check if click is near an existing point (for dragging)
  // Scale threshold by the inverse of the fit scale so it works at any zoom
  const threshold = 12 / currentFit.scale;
  const nearIdx = findPointNear(px, py, threshold);

  if (nearIdx >= 0) {
    // Start dragging
    state.drag.active = true;
    state.drag.pointIndex = nearIdx;
    state.drag.imageId = img.id;
    canvas.style.cursor = 'grabbing';
  } else {
    // Add new point
    addPoint(px, py);
    onUpdate();
  }
}

function onMouseMove(e, onUpdate) {
  const img = getSelectedImage();
  if (!img || !currentFit) return;

  const { cx, cy } = mouseToCanvas(e, canvas);
  const coords = canvasToImage(cx, cy, currentFit);

  // Update magnifier
  if (coords) {
    showMagnifier(e, img, coords.px, coords.py);
  } else {
    hideMagnifier();
  }

  if (state.drag.active) {
    if (!coords) return;
    movePoint(state.drag.pointIndex, coords.px, coords.py);
    renderCanvas();
    onUpdate(true); // true = sidebar-only update
  } else {
    // Hover detection for cursor change
    if (coords) {
      const threshold = 12 / currentFit.scale;
      const nearIdx = findPointNear(coords.px, coords.py, threshold);
      if (nearIdx >= 0) {
        canvas.style.cursor = 'grab';
        if (state.hoveredPointIndex !== nearIdx) {
          state.hoveredPointIndex = nearIdx;
          renderCanvas();
          onUpdate(true);
        }
      } else {
        canvas.style.cursor = 'crosshair';
        if (state.hoveredPointIndex !== -1) {
          state.hoveredPointIndex = -1;
          renderCanvas();
          onUpdate(true);
        }
      }
    } else {
      canvas.style.cursor = 'default';
    }
  }
}

function onMouseUp(e, onUpdate) {
  if (state.drag.active) {
    state.drag.active = false;
    state.drag.pointIndex = -1;
    canvas.style.cursor = 'crosshair';
    onUpdate();
  }
}

// ---- Magnifier ----

let magnifierEl = null;
let magnifierCanvas = null;
let magnifierCtx = null;

export function initMagnifier() {
  magnifierEl = document.getElementById('magnifier');
  magnifierCanvas = document.getElementById('magnifier-canvas');
  magnifierCtx = magnifierCanvas.getContext('2d');

  const size = 130;
  magnifierCanvas.width = size;
  magnifierCanvas.height = size;
}

function showMagnifier(e, img, px, py) {
  if (!magnifierEl || !magnifierCtx || !currentFit) return;

  const zoom = 4;
  const size = 130;
  const half = size / 2;

  // Draw the zoomed region from the original image
  const srcSize = size / (currentFit.scale * zoom);

  magnifierCtx.clearRect(0, 0, size, size);

  // Save and clip to circle
  magnifierCtx.save();
  magnifierCtx.beginPath();
  magnifierCtx.arc(half, half, half, 0, Math.PI * 2);
  magnifierCtx.clip();

  magnifierCtx.drawImage(
    img.imageElement,
    px - srcSize / 2,
    py - srcSize / 2,
    srcSize,
    srcSize,
    0,
    0,
    size,
    size
  );

  magnifierCtx.restore();

  // Draw crosshair
  magnifierCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  magnifierCtx.lineWidth = 1;
  magnifierCtx.beginPath();
  magnifierCtx.moveTo(half - 15, half);
  magnifierCtx.lineTo(half + 15, half);
  magnifierCtx.moveTo(half, half - 15);
  magnifierCtx.lineTo(half, half + 15);
  magnifierCtx.stroke();

  // Draw circle border
  magnifierCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  magnifierCtx.lineWidth = 2;
  magnifierCtx.beginPath();
  magnifierCtx.arc(half, half, half - 1, 0, Math.PI * 2);
  magnifierCtx.stroke();

  // Position the magnifier relative to the canvas wrapper
  const canvasRect = canvas.getBoundingClientRect();
  const { cx, cy } = mouseToCanvas(e, canvas);

  let magX = cx - half;
  let magY = cy - size - 20; // 20px above cursor

  // If near top edge, show below cursor
  if (magY < 0) {
    magY = cy + 20;
  }

  // Keep within horizontal bounds
  if (magX < 0) magX = 0;
  if (magX + size > canvas.width) magX = canvas.width - size;

  magnifierEl.style.left = `${magX}px`;
  magnifierEl.style.top = `${magY}px`;
  magnifierEl.style.display = 'block';
}

function hideMagnifier() {
  if (magnifierEl) {
    magnifierEl.style.display = 'none';
  }
}

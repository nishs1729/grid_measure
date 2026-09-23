/**
 * canvas.js — Canvas rendering engine
 *
 * Draws the current image and all point overlays on the main canvas, and handles
 * pointer interaction: placing/selecting/dragging points, zoom (Ctrl+wheel, pinch) and
 * pan (wheel / Shift+wheel, Space+drag, middle-drag, touch drag on empty area / two fingers).
 *
 * All drawing and coordinate math is in CSS pixels; the backing store is scaled by
 * devicePixelRatio so rendering stays sharp on high-DPI screens.
 */

import state, { getSelectedImage, MAGNIFIER_ZOOM_STEPS } from './state.js';
import {
  computeImageFit,
  mouseToCanvas,
  canvasToImage,
  canvasToImageRaw,
  imageToCanvas,
} from './coordinates.js';
import { getPointColor, addPoint, findPointNear, movePoint } from './points.js';
import { loadSetting, saveSetting } from './util.js';

let canvas, ctx;
let onUpdateCb = () => {};

/** Canvas size in CSS pixels and the pixel ratio the backing store was sized for */
let cssW = 0;
let cssH = 0;
let dpr = 1;

/** Screen distance (CSS px) a pointer must move before a press becomes a drag or pan */
const DRAG_THRESHOLD = 3;

/** Hit radius (CSS px) for grabbing or selecting a point */
const HIT_RADIUS = 12;

/** Maximum zoom (CSS px per image px); minimum is half the fit-to-window scale */
const MAX_SCALE = 32;

/** Wheel zoom sensitivity: factor = exp(-deltaY * speed) */
const WHEEL_ZOOM_SPEED = 0.0015;

/**
 * How far (CSS px) the edge of an image larger than the canvas may be scrolled inside
 * the canvas edge, so corners aren't stuck under the toolbar. Along an axis where the
 * image fits, it is centred instead.
 */
const EDGE_MARGIN = 48;

/** Screen px per image px at which image smoothing is turned off to show real pixels */
const PIXELATED_SCALE = 4;

/** Space bar held (Space+drag pans) */
let panKeyHeld = false;

/** Active pan: { pointerId, lastCx, lastCy } or null */
let pan = null;

/** Touch pointers currently down: pointerId → { cx, cy } */
const touches = new Map();

/** Active two-finger pinch: { startDist, startScale, anchorPx, anchorPy } or null */
let pinch = null;

/** Touch pointers left down after a pinch ends; ignored until lifted */
const ignoredPointers = new Set();

/** Last mouse position over the canvas, used to refresh the loupe after zooming */
let lastHover = null;

/**
 * Initialize the canvas module.
 *
 * @param {Function} onUpdate — callback to re-render the full UI
 */
export function initCanvas(onUpdate) {
  canvas = document.getElementById('main-canvas');
  ctx = canvas.getContext('2d');
  onUpdateCb = onUpdate;

  syncCanvasSize();
  window.addEventListener('resize', () => renderCanvas());
  watchPixelRatio();

  // Pointer events (mouse, pen and touch)
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch') lastHover = null;
    if (!state.drag.active) hideMagnifier();
  });
  canvas.addEventListener('wheel', onWheel, { passive: false });
  // Stop the middle button from starting the browser's autoscroll
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1) e.preventDefault();
  });

  document.getElementById('fit-view-btn')?.addEventListener('click', resetView);
}

// ---- Sizing ----

/**
 * Match the backing store to the wrapper's CSS size × devicePixelRatio.
 * When the CSS size changes, every image's view keeps the image pixel at the
 * centre of the canvas in place.
 */
function syncCanvasSize() {
  const wrapper = document.getElementById('canvas-wrapper');
  const w = wrapper.clientWidth;
  const h = wrapper.clientHeight;
  const ratio = window.devicePixelRatio || 1;

  if (w !== cssW || h !== cssH) {
    if (cssW > 0 && cssH > 0) {
      for (const img of state.images) {
        const v = img.view;
        if (!v) continue;
        const { px, py } = canvasToImageRaw(cssW / 2, cssH / 2, v);
        v.offsetX = w / 2 - px * v.scale;
        v.offsetY = h / 2 - py * v.scale;
      }
    }
    cssW = w;
    cssH = h;
  }

  // The canvas's CSS size stays 100% of the wrapper (styles.css); only the backing store scales
  const bw = Math.round(w * ratio);
  const bh = Math.round(h * ratio);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  dpr = ratio;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * Re-render when devicePixelRatio changes (browser zoom, moving to another monitor).
 * A resolution media query only matches one ratio, so re-register after each change.
 */
function watchPixelRatio() {
  const mq = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  mq?.addEventListener?.(
    'change',
    () => {
      renderCanvas();
      watchPixelRatio();
    },
    { once: true }
  );
}

// ---- View (zoom / pan) ----

function fitView(img) {
  return computeImageFit(cssW, cssH, img.width, img.height);
}

/**
 * The image's view, created as fit-to-window the first time it is shown.
 */
function ensureView(img) {
  if (!img.view && cssW > 0 && cssH > 0) img.view = fitView(img);
  return img.view;
}

/**
 * Keep the image from being scrolled out of view: along each axis, centre it if it
 * fits in the canvas, otherwise stop scrolling EDGE_MARGIN past the image edge.
 */
function constrainView(img) {
  const v = img.view;
  const clampAxis = (offset, imgSize, canvasSize) => {
    const size = imgSize * v.scale;
    if (size <= canvasSize) return (canvasSize - size) / 2;
    return Math.min(Math.max(offset, canvasSize - size - EDGE_MARGIN), EDGE_MARGIN);
  };
  v.offsetX = clampAxis(v.offsetX, img.width, cssW);
  v.offsetY = clampAxis(v.offsetY, img.height, cssH);
}

function clampScale(img, scale) {
  const min = Math.min(fitView(img).scale / 2, MAX_SCALE);
  return Math.min(Math.max(scale, min), MAX_SCALE);
}

/**
 * Zoom by `factor`, keeping the image pixel under canvas point (cx, cy) fixed.
 */
function zoomAt(img, cx, cy, factor) {
  const v = img.view;
  const next = clampScale(img, v.scale * factor);
  const k = next / v.scale;
  v.offsetX = cx - (cx - v.offsetX) * k;
  v.offsetY = cy - (cy - v.offsetY) * k;
  v.scale = next;
}

/**
 * Reset the selected image to fit-to-window (Fit button, '0' / 'F' keys).
 */
export function resetView() {
  const img = getSelectedImage();
  if (!img) return;
  img.view = fitView(img);
  renderCanvas();
  refreshMagnifier();
}

/**
 * Space bar state for Space+drag panning (driven by keyboard.js).
 */
export function setPanKey(held) {
  if (panKeyHeld === held) return;
  panKeyHeld = held;
  if (!pan && !state.drag.active) canvas.style.cursor = held ? 'grab' : 'crosshair';
}

function updateZoomIndicator(view) {
  const el = document.getElementById('zoom-level');
  if (el) el.textContent = view ? `${Math.round(view.scale * 100)}%` : '';
}

// ---- Rendering ----

/**
 * Render the full canvas: image + all points.
 */
export function renderCanvas() {
  if (!canvas || !ctx) return;

  syncCanvasSize();
  ctx.clearRect(0, 0, cssW, cssH);

  const img = getSelectedImage();
  const view = img && ensureView(img);
  if (!view) {
    drawPlaceholder();
    updateZoomIndicator(null);
    return;
  }

  // Single place that enforces scroll limits, whichever interaction moved the view
  constrainView(img);

  // Show individual image pixels when zoomed in far enough
  ctx.imageSmoothingEnabled = view.scale < PIXELATED_SCALE;

  // Draw only the visible part of the image (cheaper at high zoom)
  const x0 = Math.max(0, Math.floor(-view.offsetX / view.scale));
  const y0 = Math.max(0, Math.floor(-view.offsetY / view.scale));
  const x1 = Math.min(img.width, Math.ceil((cssW - view.offsetX) / view.scale));
  const y1 = Math.min(img.height, Math.ceil((cssH - view.offsetY) / view.scale));
  if (x1 > x0 && y1 > y0) {
    ctx.drawImage(
      img.imageElement,
      x0, y0, x1 - x0, y1 - y0,
      view.offsetX + x0 * view.scale,
      view.offsetY + y0 * view.scale,
      (x1 - x0) * view.scale,
      (y1 - y0) * view.scale
    );
  }

  // Draw points
  for (let i = 0; i < img.points.length; i++) {
    drawPoint(img.points[i], i, view);
  }

  updateZoomIndicator(view);
}

/**
 * Draw placeholder text when no image is loaded.
 */
function drawPlaceholder() {
  ctx.fillStyle = '#555';
  ctx.font = '16px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Add, drop or paste images to begin', cssW / 2, cssH / 2);
}

/**
 * Draw a single point on the canvas: unfilled circle with crosshair and label.
 */
function drawPoint(point, index, view) {
  const { cx, cy } = imageToCanvas(point.pixelX, point.pixelY, view);
  const color = getPointColor(index);
  const isHovered = index === state.hoveredPointIndex;
  const isDragging = state.drag.active && state.drag.pointIndex === index;
  const isSelected = index === state.selectedPointIndex;
  const radius = isHovered || isDragging || isSelected ? 10 : 7;
  const crossSize = isHovered || isDragging || isSelected ? 14 : 10;

  ctx.save();

  // Selection ring: dark outline + white core, visible on light and dark images
  if (isSelected) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Unfilled circle
  ctx.strokeStyle = color;
  ctx.lineWidth = isHovered || isDragging || isSelected ? 2.5 : 2;
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

// ---- Pointer interaction ----

/**
 * Canvas coords → image pixel coords, clamped to the image. Used while dragging,
 * when pointer capture can report positions outside the image.
 */
function canvasToImageClamped(cx, cy, img) {
  const { px, py } = canvasToImageRaw(cx, cy, img.view);
  return {
    px: Math.min(Math.max(px, 0), img.width),
    py: Math.min(Math.max(py, 0), img.height),
  };
}

function onPointerDown(e) {
  const img = getSelectedImage();
  if (!img || !ensureView(img)) return;

  const { cx, cy } = mouseToCanvas(e, canvas);

  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { cx, cy });
    canvas.setPointerCapture(e.pointerId);
    if (touches.size === 2) {
      startPinch(img);
      return;
    }
    if (touches.size > 2) return;
  }

  // Pan: middle button, or Space + primary button
  if (e.button === 1 || (e.button === 0 && panKeyHeld)) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    pan = { pointerId: e.pointerId, lastCx: cx, lastCy: cy };
    canvas.style.cursor = 'grabbing';
    hideMagnifier();
    return;
  }

  if (e.button !== 0) return; // other buttons unused

  const coords = canvasToImage(cx, cy, img.view, img.width, img.height);
  if (!coords) {
    // Press outside the image: just clear the selection
    if (state.selectedPointIndex !== -1) {
      state.selectedPointIndex = -1;
      onUpdateCb(true);
    }
    return;
  }

  // Keep receiving events for this pointer even if it leaves the canvas
  canvas.setPointerCapture(e.pointerId);

  const nearIdx = findPointNear(coords.px, coords.py, HIT_RADIUS / img.view.scale);

  if (nearIdx >= 0) {
    // Don't drag yet — wait to see whether this is a click (select) or a drag
    state.drag.pending = { kind: 'point', pointIndex: nearIdx, startCx: cx, startCy: cy, pointerId: e.pointerId };
  } else if (e.pointerType === 'touch') {
    // Touch on empty area: a tap adds a point on release; a drag pans instead.
    // Deferring also avoids adding a point when this is the first finger of a pinch.
    state.drag.pending = { kind: 'add', px: coords.px, py: coords.py, startCx: cx, startCy: cy, pointerId: e.pointerId };
  } else {
    // Empty image area: clear selection and add a new point
    state.selectedPointIndex = -1;
    addPoint(coords.px, coords.py);
    onUpdateCb();
  }
}

function onPointerMove(e) {
  const img = getSelectedImage();
  if (!img || !img.view) return;

  const { cx, cy } = mouseToCanvas(e, canvas);

  if (touches.has(e.pointerId)) {
    touches.set(e.pointerId, { cx, cy });
    if (pinch) {
      updatePinch(img);
      return;
    }
  }
  if (ignoredPointers.has(e.pointerId)) return;
  if (e.pointerType !== 'touch') lastHover = { clientX: e.clientX, clientY: e.clientY, pointerType: e.pointerType };

  // Promote a pending press once it has moved far enough
  const pending = state.drag.pending;
  if (pending && pending.pointerId === e.pointerId &&
      Math.hypot(cx - pending.startCx, cy - pending.startCy) > DRAG_THRESHOLD) {
    state.drag.pending = null;
    if (pending.kind === 'point') {
      state.drag.active = true;
      state.drag.pointIndex = pending.pointIndex;
      state.drag.imageId = img.id;
      state.selectedPointIndex = pending.pointIndex; // dragged point becomes selected for nudging
      canvas.style.cursor = 'grabbing';
    } else {
      // Touch drag on empty area → pan from where the finger started
      pan = { pointerId: e.pointerId, lastCx: pending.startCx, lastCy: pending.startCy };
    }
  }

  if (pan && pan.pointerId === e.pointerId) {
    img.view.offsetX += cx - pan.lastCx;
    img.view.offsetY += cy - pan.lastCy;
    pan.lastCx = cx;
    pan.lastCy = cy;
    renderCanvas();
    return;
  }

  if (state.drag.active) {
    const { px, py } = canvasToImageClamped(cx, cy, img);
    showMagnifier(e, img, px, py);
    movePoint(state.drag.pointIndex, px, py);
    onUpdateCb(true); // true = sidebar + canvas only
    return;
  }

  const coords = canvasToImage(cx, cy, img.view, img.width, img.height);

  // Update magnifier
  if (coords) {
    showMagnifier(e, img, coords.px, coords.py);
  } else {
    hideMagnifier();
  }

  // Hover highlight and cursor (not meaningful for touch)
  if (e.pointerType === 'touch' || state.drag.pending) return;
  if (panKeyHeld) {
    canvas.style.cursor = 'grab';
    return;
  }
  if (!coords) {
    canvas.style.cursor = 'default';
    return;
  }
  const nearIdx = findPointNear(coords.px, coords.py, HIT_RADIUS / img.view.scale);
  canvas.style.cursor = nearIdx >= 0 ? 'grab' : 'crosshair';
  if (state.hoveredPointIndex !== nearIdx) {
    state.hoveredPointIndex = nearIdx;
    onUpdateCb(true);
  }
}

function onPointerUp(e) {
  if (endTouch(e.pointerId)) return;

  if (pan && pan.pointerId === e.pointerId) {
    pan = null;
    canvas.style.cursor = panKeyHeld ? 'grab' : 'crosshair';
    return;
  }

  const pending = state.drag.pending;
  if (pending && pending.pointerId === e.pointerId) {
    state.drag.pending = null;
    if (pending.kind === 'point') {
      // Pressed on a point without moving: select it
      state.selectedPointIndex = pending.pointIndex;
      onUpdateCb(true);
    } else {
      // Touch tap on empty area: add a point where the finger went down
      state.selectedPointIndex = -1;
      addPoint(pending.px, pending.py);
      hideMagnifier();
      onUpdateCb();
    }
    return;
  }

  if (state.drag.active) {
    state.drag.active = false;
    state.drag.pointIndex = -1;
    canvas.style.cursor = 'grab';
    if (e.pointerType === 'touch') hideMagnifier();
    onUpdateCb();
  }
}

/**
 * Abandon any press, drag, pan or pinch for this pointer (e.g. the browser took over).
 */
function onPointerCancel(e) {
  if (endTouch(e.pointerId)) return;
  if (pan && pan.pointerId === e.pointerId) pan = null;
  cancelDrag();
}

/**
 * Bookkeeping when a touch pointer lifts. Returns true if the event belonged to a
 * pinch (or a finger left over from one) and needs no further handling.
 */
function endTouch(pointerId) {
  const wasPinching = pinch != null;
  touches.delete(pointerId);
  if (wasPinching) {
    if (touches.size < 2) {
      pinch = null;
      // The remaining finger must not start placing or dragging a point
      for (const id of touches.keys()) ignoredPointers.add(id);
    }
    return true;
  }
  return ignoredPointers.delete(pointerId);
}

function cancelDrag() {
  const wasDragging = state.drag.active;
  state.drag.pending = null;
  state.drag.active = false;
  state.drag.pointIndex = -1;
  hideMagnifier();
  if (wasDragging) onUpdateCb();
}

function startPinch(img) {
  // A second finger turns whatever the first finger was doing into a pinch
  const wasDragging = state.drag.active;
  state.drag.pending = null;
  state.drag.active = false;
  state.drag.pointIndex = -1;
  pan = null;
  hideMagnifier();
  if (wasDragging) onUpdateCb();

  const [a, b] = [...touches.values()];
  const midX = (a.cx + b.cx) / 2;
  const midY = (a.cy + b.cy) / 2;
  const anchor = canvasToImageRaw(midX, midY, img.view);
  pinch = {
    startDist: Math.max(1, Math.hypot(b.cx - a.cx, b.cy - a.cy)),
    startScale: img.view.scale,
    anchorPx: anchor.px,
    anchorPy: anchor.py,
  };
}

/**
 * Zoom by the change in finger distance and keep the image point that started under
 * the fingers' midpoint under the current midpoint (so pinch also pans).
 */
function updatePinch(img) {
  const [a, b] = [...touches.values()];
  const dist = Math.hypot(b.cx - a.cx, b.cy - a.cy);
  const midX = (a.cx + b.cx) / 2;
  const midY = (a.cy + b.cy) / 2;
  const v = img.view;
  v.scale = clampScale(img, pinch.startScale * (dist / pinch.startDist));
  v.offsetX = midX - pinch.anchorPx * v.scale;
  v.offsetY = midY - pinch.anchorPy * v.scale;
  renderCanvas();
}

/** Accumulated Alt+wheel delta; the loupe steps once per ~wheel notch */
let loupeWheelAccum = 0;

/**
 * Wheel: scroll vertically (and horizontally for trackpads); Shift+wheel scrolls
 * horizontally; Ctrl+wheel zooms around the cursor (trackpad pinch also arrives as
 * Ctrl+wheel); Alt+wheel changes the loupe magnification.
 */
function onWheel(e) {
  const img = getSelectedImage();
  if (!img || !img.view) return;
  e.preventDefault(); // also blocks browser page zoom on Ctrl+wheel

  // Normalise line/page deltas (Firefox) to pixels
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? cssH : 1;

  if (e.altKey) {
    // Some platforms turn Alt+wheel into horizontal scroll
    loupeWheelAccum += (e.deltaY || e.deltaX) * unit;
    if (Math.abs(loupeWheelAccum) >= 50) {
      stepMagnifierZoom(loupeWheelAccum < 0 ? 1 : -1);
      loupeWheelAccum = 0;
    }
    return;
  }

  if (e.ctrlKey || e.metaKey) {
    const { cx, cy } = mouseToCanvas(e, canvas);
    zoomAt(img, cx, cy, Math.exp(-e.deltaY * unit * WHEEL_ZOOM_SPEED));
  } else {
    // Scroll like a document: wheel down moves the view down (image up).
    // Some browsers already turn Shift+wheel into deltaX, others leave it in deltaY.
    const dx = e.shiftKey ? (e.deltaX || e.deltaY) : e.deltaX;
    const dy = e.shiftKey ? 0 : e.deltaY;
    img.view.offsetX -= dx * unit;
    img.view.offsetY -= dy * unit;
  }
  renderCanvas();
  refreshMagnifier();
}

// ---- Magnifier ----

const MAGNIFIER_SIZE = 130; // CSS px

let magnifierEl = null;
let magnifierCanvas = null;
let magnifierCtx = null;
let magnifierEnabled = false; // off by default; 'Z' or the Zoom button turns it on

export function initMagnifier() {
  magnifierEl = document.getElementById('magnifier');
  magnifierCanvas = document.getElementById('magnifier-canvas');
  magnifierCtx = magnifierCanvas.getContext('2d');

  const saved = Number(loadSetting('magnifierZoom'));
  if (MAGNIFIER_ZOOM_STEPS.includes(saved)) state.magnifierZoom = saved;

  // Wire up toggle button ('Z' shortcut lives in keyboard.js)
  const toggleBtn = document.getElementById('magnifier-toggle');
  if (toggleBtn) {
    syncMagnifierButton();
    toggleBtn.addEventListener('click', toggleMagnifier);
  }
}

/**
 * Toggle the magnifier loupe on/off (button and 'Z' key).
 */
export function toggleMagnifier() {
  magnifierEnabled = !magnifierEnabled;
  if (!magnifierEnabled) hideMagnifier();
  syncMagnifierButton();
}

function syncMagnifierButton() {
  const btn = document.getElementById('magnifier-toggle');
  if (btn) btn.classList.toggle('active', magnifierEnabled);
}

/**
 * Step the loupe magnification up (+1) or down (-1) through MAGNIFIER_ZOOM_STEPS.
 */
export function stepMagnifierZoom(dir) {
  const idx = MAGNIFIER_ZOOM_STEPS.indexOf(state.magnifierZoom);
  const next = MAGNIFIER_ZOOM_STEPS[Math.min(Math.max(idx + dir, 0), MAGNIFIER_ZOOM_STEPS.length - 1)];
  if (next === state.magnifierZoom) return;
  state.magnifierZoom = next;
  saveSetting('magnifierZoom', next);
  refreshMagnifier();
}

/**
 * Redraw the loupe at the last mouse position (after zoom changes without pointer movement).
 */
function refreshMagnifier() {
  const img = getSelectedImage();
  if (!lastHover || !img?.view || !magnifierEl || magnifierEl.style.display !== 'block') return;
  const { cx, cy } = mouseToCanvas(lastHover, canvas);
  const coords = canvasToImage(cx, cy, img.view, img.width, img.height);
  if (coords) showMagnifier(lastHover, img, coords.px, coords.py);
  else hideMagnifier();
}

function showMagnifier(e, img, px, py) {
  if (!magnifierEl || !magnifierCtx || !img.view || !magnifierEnabled) return;

  const zoom = state.magnifierZoom;
  const size = MAGNIFIER_SIZE;
  const half = size / 2;

  // Match the loupe's backing store to the pixel ratio; draw in CSS px
  const bs = Math.round(size * dpr);
  if (magnifierCanvas.width !== bs) {
    magnifierCanvas.width = bs;
    magnifierCanvas.height = bs;
  }
  magnifierCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Magnification is relative to the screen, so it stays useful at any canvas zoom
  const pxPerImagePx = img.view.scale * zoom;
  const srcSize = size / pxPerImagePx;

  magnifierCtx.clearRect(0, 0, size, size);

  // Save and clip to circle
  magnifierCtx.save();
  magnifierCtx.beginPath();
  magnifierCtx.arc(half, half, half, 0, Math.PI * 2);
  magnifierCtx.clip();

  // Show individual image pixels once they are big enough to see
  magnifierCtx.imageSmoothingEnabled = pxPerImagePx < PIXELATED_SCALE;
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

  // Draw gap crosshair (lines stop short of center) with outline for contrast
  const gap = 5; // gap radius around the center dot
  const arm = 15; // how far the lines extend from center

  const drawCrosshairLines = () => {
    magnifierCtx.beginPath();
    // Left arm
    magnifierCtx.moveTo(half - arm, half);
    magnifierCtx.lineTo(half - gap, half);
    // Right arm
    magnifierCtx.moveTo(half + gap, half);
    magnifierCtx.lineTo(half + arm, half);
    // Top arm
    magnifierCtx.moveTo(half, half - arm);
    magnifierCtx.lineTo(half, half - gap);
    // Bottom arm
    magnifierCtx.moveTo(half, half + gap);
    magnifierCtx.lineTo(half, half + arm);
    magnifierCtx.stroke();
  };

  // Dark outline
  magnifierCtx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  magnifierCtx.lineWidth = 3;
  drawCrosshairLines();
  // White core
  magnifierCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  magnifierCtx.lineWidth = 1;
  drawCrosshairLines();

  // Center dot — dark ring then white fill
  magnifierCtx.beginPath();
  magnifierCtx.arc(half, half, 2.5, 0, Math.PI * 2);
  magnifierCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  magnifierCtx.fill();
  magnifierCtx.beginPath();
  magnifierCtx.arc(half, half, 1.5, 0, Math.PI * 2);
  magnifierCtx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  magnifierCtx.fill();

  // Zoom level label (e.g. "8×") at the bottom
  const label = `${zoom}×`;
  magnifierCtx.font = '600 10px Inter, sans-serif';
  magnifierCtx.textAlign = 'center';
  magnifierCtx.textBaseline = 'middle';
  const labelW = magnifierCtx.measureText(label).width + 10;
  magnifierCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  magnifierCtx.beginPath();
  if (magnifierCtx.roundRect) magnifierCtx.roundRect(half - labelW / 2, size - 22, labelW, 14, 7);
  else magnifierCtx.rect(half - labelW / 2, size - 22, labelW, 14);
  magnifierCtx.fill();
  magnifierCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  magnifierCtx.fillText(label, half, size - 15);

  // Draw circle border
  magnifierCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  magnifierCtx.lineWidth = 2;
  magnifierCtx.beginPath();
  magnifierCtx.arc(half, half, half - 1, 0, Math.PI * 2);
  magnifierCtx.stroke();

  // Position the magnifier relative to the canvas wrapper
  const { cx, cy } = mouseToCanvas(e, canvas);

  // A finger hides the spot being picked, so lift the loupe well clear for touch
  const isTouch = e.pointerType === 'touch';
  const lift = isTouch ? 80 : 20;

  let magX = cx - half;
  let magY = cy - size - lift; // above the pointer

  if (magY < 0) {
    if (isTouch) {
      // Near the top edge: put it beside the finger rather than under it
      magY = Math.max(0, cy - half);
      magX = cx + lift + size <= cssW ? cx + lift : cx - lift - size;
    } else {
      magY = cy + 20; // below the cursor
    }
  }

  // Keep within horizontal bounds
  if (magX < 0) magX = 0;
  if (magX + size > cssW) magX = cssW - size;

  magnifierEl.style.left = `${magX}px`;
  magnifierEl.style.top = `${magY}px`;
  magnifierEl.style.display = 'block';
}

function hideMagnifier() {
  if (magnifierEl) {
    magnifierEl.style.display = 'none';
  }
}

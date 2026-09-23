/**
 * keyboard.js — Global keyboard shortcuts
 *
 * All shortcuts live here so they can't clash. Shortcuts are ignored while typing in a
 * form control, while Ctrl/Cmd is held (browser shortcuts), and while the instructions
 * panel is open (its own Esc handler is the only one active then). Alt is only used
 * with the arrow keys.
 */

import state, { getSelectedImage, selectNextImage, selectPrevImage } from './state.js';
import { deleteLastPoint, movePoint } from './points.js';
import { toggleMagnifier, toggleGrid, resetView, setPanKey, stepMagnifierZoom } from './canvas.js';
import { requestResetPoints } from './sidebar.js';
import { isInstructionsOpen } from './instructions.js';
import { isTypingTarget } from './util.js';

/** Arrow key → unit direction in image pixels */
const ARROW_DIRECTIONS = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * @param {Function} onUpdate — full UI update callback
 */
export function initKeyboard(onUpdate) {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) return; // leave browser shortcuts (Ctrl+R etc.) alone
    if (isTypingTarget(e.target) || isInstructionsOpen()) return;

    if (e.key in ARROW_DIRECTIONS) {
      if (nudgeSelectedPoint(e, onUpdate)) e.preventDefault();
      return;
    }
    if (e.altKey) return;

    switch (e.key) {
      case ' ':
        setPanKey(true); // held Space + drag pans
        break;
      case '0':
      case 'f':
      case 'F':
        resetView();
        break;
      case '+':
      case '=':
        stepMagnifierZoom(1);
        break;
      case '-':
      case '_':
        stepMagnifierZoom(-1);
        break;
      case ']':
      case 'PageDown':
        if (selectNextImage()) onUpdate();
        break;
      case '[':
      case 'PageUp':
        if (selectPrevImage()) onUpdate();
        break;
      case 'Delete':
      case 'Backspace':
        // Only the last point can be deleted (deleting earlier ones would renumber the rest)
        deleteLastPoint();
        onUpdate();
        break;
      case 'Escape':
        if (state.selectedPointIndex === -1) return;
        state.selectedPointIndex = -1;
        onUpdate(true);
        break;
      case 'r':
      case 'R':
        requestResetPoints(onUpdate);
        break;
      case 'z':
      case 'Z':
        toggleMagnifier();
        break;
      case 'g':
      case 'G':
        toggleGrid();
        break;
      default:
        return; // not ours — don't preventDefault
    }
    e.preventDefault();
  });

  // Release Space panning; also swallow the keyup so a focused button isn't "clicked"
  document.addEventListener('keyup', (e) => {
    if (e.key !== ' ') return;
    setPanKey(false);
    if (!isTypingTarget(e.target)) e.preventDefault();
  });
  // Keyup is lost if the window loses focus while Space is held
  window.addEventListener('blur', () => setPanKey(false));
}

/**
 * Move the selected point by 0.1 px (plain), 1 px (Shift) or 10 px (Alt), clamped to the image.
 * @returns {boolean} — true if a point was moved
 */
function nudgeSelectedPoint(e, onUpdate) {
  const img = getSelectedImage();
  const idx = state.selectedPointIndex;
  if (!img || idx < 0 || idx >= img.points.length) return false;

  const step = e.altKey ? 10 : e.shiftKey ? 1 : 0.1;
  const [dx, dy] = ARROW_DIRECTIONS[e.key];
  const pt = img.points[idx];
  // Round to 2 decimals (the CSV precision) so repeated 0.1 steps don't accumulate float noise
  const round = (v) => Math.round(v * 100) / 100;
  const x = Math.min(Math.max(round(pt.pixelX + dx * step), 0), img.width);
  const y = Math.min(Math.max(round(pt.pixelY + dy * step), 0), img.height);

  movePoint(idx, x, y);
  // Moving P1–P4 can change calibration status, which the thumbnail list shows
  onUpdate(idx >= 4);
  return true;
}

/**
 * keyboard.js — Global keyboard shortcuts
 *
 * All shortcuts live here so they can't clash. Shortcuts are ignored while typing in a
 * form control, while a modifier (Ctrl/Cmd/Alt) is held, and while the instructions
 * panel is open (its own Esc handler is the only one active then).
 */

import { selectNextImage, selectPrevImage } from './state.js';
import { deleteLastPoint } from './points.js';
import { toggleMagnifier } from './canvas.js';
import { requestResetPoints } from './sidebar.js';
import { isInstructionsOpen } from './instructions.js';
import { isTypingTarget } from './util.js';

/**
 * @param {Function} onUpdate — full UI update callback
 */
export function initKeyboard(onUpdate) {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts (Ctrl+R etc.) alone
    if (isTypingTarget(e.target) || isInstructionsOpen()) return;

    switch (e.key) {
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
        deleteLastPoint();
        onUpdate();
        break;
      case 'r':
      case 'R':
        requestResetPoints(onUpdate);
        break;
      case 'z':
      case 'Z':
        toggleMagnifier();
        break;
      default:
        return; // not ours — don't preventDefault
    }
    e.preventDefault();
  });
}

/**
 * app.js — Entry point: wires up all modules and handles top-level rendering
 */

import state from './state.js';
import { initImageLoader, renderImageList } from './imageLoader.js';
import { initCanvas, renderCanvas, initMagnifier } from './canvas.js';
import { initSidebar, renderSidebar } from './sidebar.js';
import { initCsvExport } from './csvExport.js';
import { initInstructions } from './instructions.js';
import { initKeyboard } from './keyboard.js';

/**
 * Full UI update callback.
 * @param {boolean} [sidebarOnly=false] — if true, only update sidebar + canvas (not image list)
 */
function onUpdate(sidebarOnly = false) {
  if (!sidebarOnly) {
    renderImageList(onUpdate);
  }
  renderSidebar(onUpdate);
  renderCanvas();
}

function init() {
  initImageLoader(onUpdate);
  initCanvas(onUpdate);
  initMagnifier();
  initSidebar(onUpdate);
  initCsvExport(onUpdate);
  initInstructions();
  initKeyboard(onUpdate);

  // Initial render
  onUpdate();

  // Test hook (end-to-end tests only): expose state read-only when loaded with ?test=1
  if (new URLSearchParams(location.search).has('test')) {
    window.__gm = { state };
  }
}

document.addEventListener('DOMContentLoaded', init);

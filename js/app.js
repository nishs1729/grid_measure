/**
 * app.js — Entry point: wires up all modules and handles top-level rendering
 */

import state from './state.js';
import { initImageLoader, renderImageList } from './imageLoader.js';
import { initCanvas, renderCanvas, initMagnifier } from './canvas.js';
import { initSidebar, renderSidebar } from './sidebar.js';
import { initCsvExport } from './csvExport.js';

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

  // Initial render
  onUpdate();
}

document.addEventListener('DOMContentLoaded', init);

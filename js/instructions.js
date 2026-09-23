/**
 * instructions.js — User guide overlay: a centred dialog with tabbed sections
 */

import { loadSetting, saveSetting } from './util.js';

const DEFAULT_TAB = 'start';

let openModalFn = null;

/**
 * True while the user guide is open (other shortcuts are suspended).
 */
export function isInstructionsOpen() {
  return !!document.getElementById('instructions-modal')?.classList.contains('open');
}

/**
 * Open the user guide, optionally at a specific tab (e.g. 'accuracy').
 *
 * @param {string} [tab]
 */
export function openInstructions(tab) {
  openModalFn?.(tab);
}

export function initInstructions() {
  const openBtn = document.getElementById('instructions-btn');
  const modal = document.getElementById('instructions-modal');
  const closeBtn = document.getElementById('instructions-close-btn');
  const doneBtn = document.getElementById('instructions-done-btn');
  const backdrop = document.getElementById('instructions-backdrop');
  const body = modal?.querySelector('.instructions-body');
  const tabs = Array.from(modal?.querySelectorAll('[role="tab"]') || []);

  if (!openBtn || !modal) return;

  /**
   * Show one tab's panel and mark its tab selected (roving tabindex for arrow keys).
   */
  function selectTab(name, { focus = false } = {}) {
    const target = tabs.find((t) => t.dataset.tab === name) || tabs[0];
    for (const tab of tabs) {
      const selected = tab === target;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    }
    if (body) body.scrollTop = 0;
    if (focus) target.focus();
    saveSetting('guideTab', target.dataset.tab);
  }

  function openModal(tab) {
    selectTab(tab || loadSetting('guideTab', DEFAULT_TAB));
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    openBtn.setAttribute('aria-expanded', 'true');
    tabs.find((t) => t.getAttribute('aria-selected') === 'true')?.focus();
    document.addEventListener('keydown', handleKeyDown);
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    openBtn.setAttribute('aria-expanded', 'false');
    openBtn.focus();
    document.removeEventListener('keydown', handleKeyDown);
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      closeModal();
    }
  }

  // Tab bar: click, and Left/Right/Home/End when a tab has focus
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab));
    tab.addEventListener('keydown', (e) => {
      const next = {
        ArrowRight: (i + 1) % tabs.length,
        ArrowLeft: (i - 1 + tabs.length) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      selectTab(tabs[next].dataset.tab, { focus: true });
    });
  });

  // In-text links that jump to another tab ("Calibrate tab →")
  modal.addEventListener('click', (e) => {
    const link = e.target.closest('[data-goto]');
    if (!link) return;
    e.preventDefault();
    selectTab(link.dataset.goto, { focus: true });
  });

  openModalFn = openModal;
  openBtn.addEventListener('click', () => openModal());
  closeBtn?.addEventListener('click', closeModal);
  doneBtn?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', closeModal);
}

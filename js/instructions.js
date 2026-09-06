/**
 * instructions.js — Handles the Instructions & User Guide slide-out panel
 */

export function initInstructions() {
  const openBtn = document.getElementById('instructions-btn');
  const modal = document.getElementById('instructions-modal');
  const closeBtn = document.getElementById('instructions-close-btn');
  const doneBtn = document.getElementById('instructions-done-btn');
  const backdrop = document.getElementById('instructions-backdrop');

  if (!openBtn || !modal) return;

  function openModal() {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    openBtn.setAttribute('aria-expanded', 'true');
    closeBtn?.focus();
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

  openBtn.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  doneBtn?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', closeModal);
}

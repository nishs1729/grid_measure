/**
 * util.js — Small shared helpers: timestamps, persisted settings, on-screen notices
 */

/**
 * Local time as YYYY-MM-DD_HHMMSS (no colons, so it is safe in file names on every OS).
 */
export function timestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * True when keyboard focus is in a text-entry control (shortcuts should be ignored).
 */
export function isTypingTarget(el) {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
}

const SETTINGS_PREFIX = 'gridmeasure.';

/**
 * Read a persisted setting. Storage can be unavailable (private mode, blocked site data),
 * so failures fall back to the default.
 */
export function loadSetting(key, fallback = null) {
  try {
    const val = localStorage.getItem(SETTINGS_PREFIX + key);
    return val == null ? fallback : val;
  } catch {
    return fallback;
  }
}

/**
 * Persist a setting (null removes it). Failures are ignored.
 */
export function saveSetting(key, value) {
  try {
    if (value == null) localStorage.removeItem(SETTINGS_PREFIX + key);
    else localStorage.setItem(SETTINGS_PREFIX + key, String(value));
  } catch {
    // Storage unavailable — setting simply won't persist
  }
}

let noticeTimer = null;

/**
 * Show a dismissible notice at the bottom of the workspace.
 *
 * @param {string} message
 * @param {'info'|'error'} [kind='info']
 * @param {number} [durationMs=6000]
 */
export function showNotice(message, kind = 'info', durationMs = 6000) {
  let el = document.getElementById('notice');
  if (!el) {
    el = document.createElement('div');
    el.id = 'notice';
    el.setAttribute('role', 'status');
    el.addEventListener('click', () => el.classList.remove('visible'));
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `notice notice-${kind} visible`;

  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => el.classList.remove('visible'), durationMs);
}

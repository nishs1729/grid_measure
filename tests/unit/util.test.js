import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSetting, saveSetting, isTypingTarget } from '../../js/util.js';

test('settings round-trip through localStorage with a prefix', () => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => (store[k] = v),
    removeItem: (k) => delete store[k],
  };
  assert.equal(loadSetting('x', 'dflt'), 'dflt');
  saveSetting('x', 42);
  assert.equal(store['gridmeasure.x'], '42');
  assert.equal(loadSetting('x'), '42');
  saveSetting('x', null);
  assert.equal(loadSetting('x', 'gone'), 'gone');
});

test('settings fall back quietly when storage throws', () => {
  globalThis.localStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.equal(loadSetting('x', 'fallback'), 'fallback');
  assert.doesNotThrow(() => saveSetting('x', 1));
});

test('isTypingTarget recognises form controls only', () => {
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) assert.ok(isTypingTarget({ tagName: tag }));
  for (const tag of ['BODY', 'BUTTON', 'CANVAS']) assert.ok(!isTypingTarget({ tagName: tag }));
  assert.ok(!isTypingTarget(null));
});

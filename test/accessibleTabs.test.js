import assert from 'node:assert/strict';
import test from 'node:test';

import { getKeyboardTabId } from '../src/lib/accessibleTabs.js';

const tabs = ['overview', 'players', 'bracket', 'results'];

test('tab keyboard navigation wraps and supports Home and End', () => {
  assert.equal(getKeyboardTabId(tabs, 'overview', 'ArrowLeft'), 'results');
  assert.equal(getKeyboardTabId(tabs, 'results', 'ArrowRight'), 'overview');
  assert.equal(getKeyboardTabId(tabs, 'players', 'Home'), 'overview');
  assert.equal(getKeyboardTabId(tabs, 'players', 'End'), 'results');
  assert.equal(getKeyboardTabId(tabs, 'players', 'Enter'), null);
});

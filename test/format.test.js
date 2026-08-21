import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatDateLine,
  formatLongDate,
  formatShortDate,
} from '../src/lib/format.js';

test('date formatting returns safe fallbacks for missing or invalid values', () => {
  assert.equal(formatShortDate(''), '');
  assert.equal(formatShortDate('not-a-date'), '');
  assert.equal(formatLongDate(null), '');
  assert.equal(formatDateLine(undefined), 'Schedule TBD');
});

test('date formatting does not crash on an invalid time zone', () => {
  assert.equal(formatShortDate('2026-08-21T12:00:00Z', 'Not/A_Zone'), '');
  assert.equal(formatDateLine('2026-08-21T12:00:00Z', 'Not/A_Zone'), 'Schedule TBD');
});

test('date formatting preserves valid dates', () => {
  assert.equal(formatShortDate('2026-08-21T12:00:00Z'), 'Aug 21');
  assert.match(formatDateLine('2026-08-21T12:00:00Z'), /^Fri, Aug 21, 2026 • 8:00 AM ET$/);
});

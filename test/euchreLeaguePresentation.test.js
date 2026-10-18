import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectEuchreLeagueSchedule } from '../src/lib/euchreLeagueClient.js';

const screen = readFileSync(new URL('../src/screens/EuchreLeaguesScreen.jsx', import.meta.url), 'utf8');

test('schedule mixes divisions chronologically, preserves week/division filters and leaves source fixtures unchanged', () => {
  const fixtures = [
    { id: 'd1-w1', phase: 'regular', week: 1, divisionId: 'division-1', scheduledFor: '2026-10-25T22:00:00Z' },
    { id: 'd1-w2', phase: 'regular', week: 2, divisionId: 'division-1', scheduledFor: '2026-11-01T23:00:00Z' },
    { id: 'd2-w1', phase: 'regular', week: 1, divisionId: 'division-2', scheduledFor: '2026-10-25T22:00:00Z' },
    { id: 'd2-w2', phase: 'regular', week: 2, divisionId: 'division-2', scheduledFor: '2026-11-01T23:00:00Z' },
    { id: 'playoff', phase: 'playoff', week: 8, divisionId: 'championship', scheduledFor: '2026-12-13T23:00:00Z' },
  ];
  const before = structuredClone(fixtures);
  assert.deepEqual(selectEuchreLeagueSchedule(fixtures).map(match => match.id), ['d1-w1', 'd2-w1', 'd1-w2', 'd2-w2']);
  assert.deepEqual(selectEuchreLeagueSchedule(fixtures, { week: '2', division: 'division-2' }).map(match => match.id), ['d2-w2']);
  assert.deepEqual(selectEuchreLeagueSchedule(fixtures, { phase: 'playoff' }).map(match => match.id), ['playoff']);
  const rescheduled = fixtures.map(match => match.id === 'd1-w1' ? { ...match, scheduledFor: '2026-11-05T23:00:00Z' } : match);
  assert.equal(selectEuchreLeagueSchedule(rescheduled).at(-1).id, 'd1-w1');
  assert.deepEqual(fixtures, before);
  assert.deepEqual(selectEuchreLeagueSchedule(), []);
});

test('personal fixtures use the wrapping grid and cards can shrink on narrow layouts', () => {
  assert.match(screen, /<View style=\{styles\.grid\}>\{viewer\.matchAccess\.slice\(0, 3\)\.map/);
  for (const name of ['division', 'fixture']) {
    assert.ok(screen.includes(`${name}: { flexGrow: 1, flexShrink: 1, flexBasis: 350, minWidth: 0`));
  }
});

// Source-level wiring witnesses complement actual browser interaction tests.
test('league page clears private records, viewers and exports when a read or entitlement fails', () => {
  const clear = screen.slice(screen.indexOf('const clearLeagueAccess ='), screen.indexOf('const load ='));
  for (const statement of ['requestSequence.current += 1', 'accessGeneration.current += 1', 'setAuthorized(false)', 'setRecords([])', 'setViewers({})', "setConfirm('')", 'setCsv(null)']) {
    assert.ok(clear.includes(statement), statement);
  }
  assert.match(screen, /catch \(failure\)\s*\{\s*if \(sequence === requestSequence\.current\)\s*\{[\s\S]*?clearLeagueAccess\(\); setError\(failure\.message\); setLoading\(false\);/);
});

test('CSV exports remain bound to their league when creation or navigation changes the selected season', () => {
  assert.match(screen, /setCsv\(\{ leagueId: selectedId, content: result\.csv \}\)/);
  assert.match(screen, /const currentCsv = csv\?\.leagueId === selectedId \? csv\.content : ''/);
  assert.match(screen, /!!currentCsv && <Field label="Standings CSV \(copy to save\)" value=\{currentCsv\}/);
});

test('league page immediately invalidates stale responses on account or operator-key changes', () => {
  assert.ok(screen.includes("const ACCOUNT_CHANGED_EVENT = 'one-v-one-tournaments-player-account-changed'"));
  assert.match(screen, /const accountChanged = \(\) => \{ clearLeagueAccess\(\); setLoading\(true\); load\(\); \}/);
  assert.ok(screen.includes('addEventListener?.(ACCOUNT_CHANGED_EVENT, accountChanged)'));
  assert.ok(screen.includes('removeEventListener?.(ACCOUNT_CHANGED_EVENT, accountChanged)'));
  assert.match(screen, /onPress=\{\(\) => \{ clearLeagueAccess\(\); setLoading\(true\); if \(tokenInput === token\) load\(\); else setToken\(tokenInput\); \}\}>Verify access/);
  const action = screen.slice(screen.indexOf('const act ='), screen.indexOf('const selectView ='));
  assert.match(action, /const generation = accessGeneration\.current/);
  assert.match(action, /await requestEuchreLeagues\([\s\S]*?if \(generation !== accessGeneration\.current\) return;/);
  assert.match(action, /openUrl: url => generation === accessGeneration\.current \? Linking\.openURL\(url\) : undefined/);
  assert.match(action, /catch \(failure\) \{ if \(generation === accessGeneration\.current\) setError\(failure\.message\); \}/);
});

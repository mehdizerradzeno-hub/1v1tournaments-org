import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { simulationDirectory } from '../scripts/simulate-euchre-leagues.mjs';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/simulate-euchre-leagues.mjs', import.meta.url));

test('32-player league recovers from actual process restarts mid-series and before playoffs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'euchre-league-restart-test-'));
  const env = { ...process.env };
  for (const name of ['BLOBS_TOKEN', 'NETLIFY_AUTH_TOKEN', 'BLOBS_SITE_ID', 'NETLIFY_SITE_ID', 'NETLIFY_BLOBS_CONTEXT']) delete env[name];
  const run = async stage => {
    const { stdout, stderr } = await execute(process.execPath, [script, '--stage', stage, '--state', directory], { env, timeout: 60000 });
    assert.equal(stderr, '');
    return JSON.parse(stdout);
  };
  try {
    const initial = await run('init');
    assert.equal(initial.players, 32);
    assert.equal(initial.divisions, 4);
    assert.equal(initial.regularRounds, 7);
    assert.equal(initial.regularSeries, 112);
    assert.equal(initial.games, 1);
    assert.equal(initial.completedRegularSeries, 0);
    const regular = await run('regular');
    assert.equal(regular.phase, 'playoffs');
    assert.equal(regular.completedRegularSeries, 112);
    assert.equal(regular.games, 336);
    assert.equal(regular.qualifiers, 8);
    assert.equal(regular.champions, 0);
    const complete = await run('playoffs');
    assert.equal(complete.phase, 'complete');
    assert.equal(complete.playoffSeries, 7);
    assert.equal(complete.games, 350);
    assert.equal(complete.champions, 1);
    assert.match(complete.champion, /^sim_player_\d{3}$/);
  } finally {
    // Only this test's mkdtemp-owned directory, never any application store.
    await rm(directory, { recursive: true, force: true });
  }
});

test('simulation refuses an existing directory without the disposable marker', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'euchre-league-unmarked-test-'));
  try { await assert.rejects(simulationDirectory(directory), /ENOENT/); }
  finally { await rm(directory, { recursive: true, force: true }); }
});

test('HTTP/ticket/callback pipeline survives a process exit after bracket finalization and a restart before playoffs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'euchre-league-http-restart-test-'));
  const httpScript = fileURLToPath(new URL('../scripts/simulate-euchre-league-http.mjs', import.meta.url));
  const env = { ...process.env };
  for (const name of ['BLOBS_TOKEN', 'NETLIFY_AUTH_TOKEN', 'BLOBS_SITE_ID', 'NETLIFY_SITE_ID', 'NETLIFY_BLOBS_CONTEXT']) delete env[name];
  const run = async stage => {
    const result = await execute(process.execPath, [httpScript, stage, directory], { env, timeout: 120000 });
    assert.equal(result.stderr, '');
    return JSON.parse(result.stdout);
  };
  try {
    const initial = await run('init');
    assert.equal(initial.brackets, 1);
    assert.equal(initial.games, 0, 'linked write has not happened when the first process exits');
    const regular = await run('regular');
    assert.equal(regular.games, 336);
    assert.equal(regular.brackets, 336);
    assert.equal(regular.completedSeries, 112);
    assert.equal(regular.qualifiers, 8);
    assert.equal(regular.champions, 0);
    const final = await run('playoffs');
    assert.equal(final.players, 32);
    assert.equal(final.divisions, 4);
    assert.equal(final.regularRounds, 7);
    assert.equal(final.regularSeries, 112);
    assert.equal(final.completedSeries, 119);
    assert.equal(final.games, 350);
    assert.equal(final.brackets, 350);
    assert.equal(final.champions, 1);
    assert.match(final.champion, /^tester_\d{3}$/);
  } finally {
    // Delete only this test-owned, marked, disposable temporary directory.
    await rm(directory, { recursive: true, force: true });
  }
});

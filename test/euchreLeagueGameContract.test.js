import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const defaultEngine = fileURLToPath(new URL('../../../artifacts/api-server/src/tournament-access.ts', import.meta.url));
const engineSource = process.env.EUCHRE_LEAGUE_ENGINE_WORKTREE
  ? resolve(process.env.EUCHRE_LEAGUE_ENGINE_WORKTREE, 'artifacts/api-server/src/tournament-access.ts') : defaultEngine;

test('actual Euchre game consumer accepts both synthetic league tournament tickets without engine changes', {
  skip: existsSync(engineSource) ? false : 'Set EUCHRE_LEAGUE_ENGINE_WORKTREE to the read-only Euchre checkout for cross-repository verification.',
}, async () => {
  const script = fileURLToPath(new URL('../integration/euchreLeagueGameContract.mts', import.meta.url));
  const loader = fileURLToPath(new URL('../integration/ts-source-loader.mjs', import.meta.url));
  const { stdout } = await promisify(execFile)(process.execPath, ['--experimental-transform-types', '--experimental-loader', loader, script], { timeout: 30000 });
  assert.deepEqual(JSON.parse(stdout), { ok: true, engineConsumer: 'parseVerifiedTournamentMatchAccess', verifiedSeats: 2 });
});

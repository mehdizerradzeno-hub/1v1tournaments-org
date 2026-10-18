import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { leagueHttpFixture, fixtureConfig, fixturePlayer } from './euchreLeagueFixture.mjs';

// Read-only import of the actual game-side consumer, never start its HTTP server or persistence.
const worktree = process.env.EUCHRE_LEAGUE_ENGINE_WORKTREE || resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const source = pathToFileURL(resolve(worktree, 'artifacts/api-server/src/tournament-access.ts')).href;
const { parseVerifiedTournamentMatchAccess } = await import(source);
const fixture = leagueHttpFixture();
const league = await fixture.seed(8);
const match = league.matches[0];
for (const [index, canonical] of [match.homePlayerId, match.awayPlayerId].entries()) {
  const account = fixturePlayer(Number(canonical.split('-').at(-1)));
  const opened = await fixture.request(account, { action: 'open-match', leagueId: fixtureConfig.id, matchId: match.id });
  assert.equal(opened.statusCode, 201, opened.body);
  const verified = parseVerifiedTournamentMatchAccess(opened.data, { matchId: opened.data.matchId,
    canonicalAccountId: canonical, now: fixture.clock().getTime() });
  assert.equal(verified.seatIndex, index);
  assert.equal(verified.seat, index === 0 ? 'north' : 'south');
  assert.equal(verified.canonicalAccountId, canonical);
  assert.equal(verified.participants[index].handle, account.playerHandle);
  assert.equal(verified.tournamentContext.returnPath, `/tournaments/${opened.data.tournamentSlug}`);
}
console.log(JSON.stringify({ ok: true, engineConsumer: 'parseVerifiedTournamentMatchAccess', verifiedSeats: 2 }));

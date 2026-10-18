import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localSimulationStore, simulationDirectory } from './simulate-euchre-leagues.mjs';
import { leagueHttpFixture, fixtureConfig, fixturePlayer } from '../integration/euchreLeagueFixture.mjs';

/** Real process-restored HTTP handler + existing tournament pipeline, synthetic file collections only. */
export async function simulateLeagueHttpStage(stage, requestedDirectory) {
  if (!['init', 'regular', 'playoffs'].includes(stage)) throw new Error('Choose init, regular or playoffs.');
  const directory = await simulationDirectory(requestedDirectory, stage === 'init');
  const stores = new Map();
  const storeFor = name => {
    if (!stores.has(name)) stores.set(name, localSimulationStore(directory, name));
    return stores.get(name);
  };
  const f = leagueHttpFixture({ storeFor });
  const leagueId = fixtureConfig.id;
  let league;
  async function play(match, outage = false) {
    const account = fixturePlayer(Number(match.homePlayerId.split('-').at(-1)));
    const opened = await f.request(account, { action: 'open-match', leagueId, matchId: match.id });
    if (opened.statusCode !== 201) throw new Error(opened.body);
    const homeWins = match.phase === 'playoff' || match.series.games.length !== 1;
    const reported = await f.report(opened.data, homeWins, outage
      ? { writer: { syncLinkedLeagueTournamentResult() { throw new Error('synthetic linked-store interruption'); } } } : {});
    if (outage ? reported.error?.statusCode !== 503 : Boolean(reported.error)) throw new Error(reported.error?.body || 'Expected a recoverable interruption.');
    return opened.data;
  }
  if (stage === 'init') {
    league = await f.seed(32);
    await play(league.matches[0], true); // Bracket final, league pending when this process exits.
  } else {
    league = await f.repository().load(leagueId);
    const expectedPhase = stage === 'regular' ? 'regular-season' : 'playoffs';
    if (league?.phase !== expectedPhase) throw new Error(`Expected ${expectedPhase}.`);
    if (stage === 'regular') {
      const assignment = league.matches[0].series.assignments[0];
      const recovered = await f.report(assignment);
      if (!recovered.duplicate || recovered.error) throw new Error('Persisted bracket completion did not recover.');
    }
    for (;;) {
      league = await f.repository().load(leagueId);
      const match = league.matches.find(item => item.phase === (stage === 'regular' ? 'regular' : 'playoff')
        && ['scheduled', 'playing'].includes(item.status));
      if (!match) break;
      await play(match);
    }
  }
  league = await f.repository().load(leagueId);
  const listing = await f.request(null);
  if (listing.statusCode !== 200 || listing.data.leagues.length !== 1) throw new Error('HTTP listing lost the restored season.');
  return { directory, phase: league.phase, players: league.players, divisions: league.divisions.length,
    regularRounds: league.schedule.length, regularSeries: league.matches.filter(m => m.phase === 'regular').length,
    completedSeries: league.matches.filter(m => m.status === 'complete').length,
    games: league.matches.reduce((count, m) => count + m.series.games.length, 0),
    brackets: (await storeFor('tournament-brackets').list()).blobs.length,
    qualifiers: league.championship?.qualifiers.length || 0,
    champions: league.championship?.champion ? 1 : 0,
    champion: league.championship?.champion?.displayName || null };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [stage, directory] = process.argv.slice(2);
  console.log(JSON.stringify(await simulateLeagueHttpStage(stage, directory)));
}

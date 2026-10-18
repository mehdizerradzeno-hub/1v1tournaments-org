import { createEuchreLeagueRepository } from '../netlify/functions/_euchre-league-store.mjs';
import { handleEuchreLeagueRequest } from '../netlify/functions/euchre-leagues.mjs';
import { validateEuchreLeagueGameCompletion } from '../netlify/functions/_euchre-league-games.mjs';
import { reportAuthoritativeResultWithRetry } from '../netlify/functions/tournament-bracket.mjs';
import { normalizeTournamentResultCallback } from '../netlify/functions/_tournament-game-contract.mjs';
import { syncLinkedLeagueTournamentResult } from '../netlify/functions/_linked-league-result.mjs';

/** Synthetic JSON/CAS persistence only. This module never constructs a live SDK store. */
export function memoryLeagueStores() {
  const collections = new Map();
  return name => {
    if (collections.has(name)) return collections.get(name);
    const rows = new Map();
    let sequence = 0;
    const store = {
      async getWithMetadata(key) {
        const row = rows.get(key);
        return row ? { data: JSON.parse(row.body), etag: row.etag } : null;
      },
      async get(key) { return (await store.getWithMetadata(key))?.data || null; },
      async set(key, body, options = {}) {
        const row = rows.get(key);
        if ((options.onlyIfNew && row) || (options.onlyIfMatch && options.onlyIfMatch !== row?.etag)) return { modified: false };
        rows.set(key, { body, etag: String(++sequence) });
        return { modified: true, etag: String(sequence) };
      },
      async setJSON(key, value, options) { return store.set(key, JSON.stringify(value), options); },
      list(options = {}) {
        const page = { blobs: [...rows.keys()].filter(key => !options.prefix || key.startsWith(options.prefix)).map(key => ({ key })) };
        return options.paginate ? (async function* () { yield page; })() : Promise.resolve(page);
      },
    };
    collections.set(name, store);
    return store;
  };
}

export const fixtureHost = { id: 'host-private', canonicalAccountId: 'host-canonical', playerHandle: 'organizer', usernameClaimedAt: '2026-01-01' };
export const fixturePlayer = i => ({ id: `account-${i}`, canonicalAccountId: `canonical-${String(i).padStart(3, '0')}`,
  playerHandle: `tester_${String(i).padStart(3, '0')}`, usernameClaimedAt: '2026-01-01' });
export const fixtureConfig = { id: 'synthetic-euchre-league', name: 'Disposable Euchre acceptance season',
  playerCap: 32, divisionCount: 4, playoffSize: 8, firstRoundDate: '2026-10-25', timeZone: 'America/New_York', weeklyPlayTime: '18:00' };

export function leagueHttpFixture({ storeFor = memoryLeagueStores(), now = '2026-12-31T23:00:00Z' } = {}) {
  let currentTime = new Date(now);
  const clock = () => new Date(currentTime);
  const repository = options => createEuchreLeagueRepository({ store: storeFor('leagues'), clock, ...options });
  const dependencies = {
    storeFor, clock, euchreBaseUrl: 'https://euchre.invalid/play',
    getAccountFromEvent: async event => event.fixtureAccount || null,
    isHostAccount: account => account?.id?.startsWith('host-'),
    requireTournamentAdmin: async event => event.fixtureAccount?.id?.startsWith('host-')
      ? { method: 'account', account: event.fixtureAccount }
      : { error: { statusCode: event.fixtureAccount ? 403 : 401, message: 'Approved host required.' } },
    createRepository: repository,
  };
  async function request(account, payload = null, query = {}) {
    const response = await handleEuchreLeagueRequest({ httpMethod: payload ? 'POST' : 'GET', headers: {},
      fixtureAccount: account, body: payload ? JSON.stringify(payload) : undefined, queryStringParameters: query }, dependencies);
    return { ...response, data: JSON.parse(response.body) };
  }
  async function seed(count = 8, config = {}) {
    const created = await request(fixtureHost, { action: 'create', league: { ...fixtureConfig, ...config } });
    if (created.statusCode !== 201) throw new Error(created.body);
    for (let i = 1; i <= count; i += 1) {
      const joined = await request(fixturePlayer(i), { action: 'join', leagueId: fixtureConfig.id });
      if (joined.statusCode !== 200) throw new Error(joined.body);
    }
    const started = await request(fixtureHost, { action: 'start', leagueId: fixtureConfig.id });
    if (started.statusCode !== 200) throw new Error(started.body);
    return repository().load(fixtureConfig.id);
  }
  async function report(assignment, homeWins = true, options = {}) {
    const bracketStore = storeFor('tournament-brackets');
    const bracket = await bracketStore.get(`${assignment.tournamentSlug}.json`);
    const match = bracket.rounds[0].matches[0];
    const winner = match.players[homeWins ? 0 : 1];
    const result = normalizeTournamentResultCallback({ protocolVersion: '2026-08-04', game: 'euchre',
      tournamentId: assignment.tournamentSlug, matchId: match.id, completionId: `${match.id}-complete`,
      winnerParticipantId: winner.id, winnerCanonicalAccountId: winner.canonicalAccountId,
      scores: homeWins ? { north: 10, south: 7 } : { north: 7, south: 12 }, forfeit: false, ...options.result }, assignment.tournamentSlug);
    return reportAuthoritativeResultWithRetry(assignment.tournamentSlug, result, {
      loadBracketWithMetadata: async slug => { const row = await bracketStore.getWithMetadata(`${slug}.json`); return row && { bracket: row.data, etag: row.etag }; },
      saveBracket: async (value, conditional) => {
        const written = await bracketStore.setJSON(`${value.tournamentSlug}.json`, value, conditional);
        return written.modified ? value : { modified: false };
      },
      loadTournamentForBracket: slug => storeFor('tournament-events').get(`${slug}.json`),
      validateEuchreLeagueGameCompletion: input => validateEuchreLeagueGameCompletion(input, { euchreLeagueRepository: repository() }),
      syncLinkedLeagueTournamentResult: input => syncLinkedLeagueTournamentResult(input, {
        loadLeagueById: id => repository().load(id), euchreLeagueRepository: repository(),
      }),
      ...options.writer,
    });
  }
  return { request, repository, seed, report, storeFor, clock, dependencies, setTime(value) { currentTime = new Date(value); } };
}

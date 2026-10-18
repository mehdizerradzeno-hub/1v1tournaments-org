import { getStoreWithFallback } from './_account-utils.mjs';
import {
  EUCHRE_LEAGUE_VERSION, EuchreLeagueError, createEuchreLeagueSeason,
  enrollEuchreLeaguePlayer, startEuchreLeagueSeason, assignEuchreLeagueGame, recordEuchreLeagueGame,
} from '../../src/lib/euchreLeagueSeason.js';
import { advanceEuchreLeagueChampionship } from './_euchre-league-championship.mjs';

function keyFor(id) {
  if (!/^[a-z0-9][a-z0-9-]{0,100}$/.test(String(id))) throw new EuchreLeagueError('invalid_league_id', 'Choose a valid league.', 400);
  return `${id}.json`;
}

/** No live-store fallback here: tests must explicitly supply their disposable store. */
export function createEuchreLeagueRepository({ store, clock = () => new Date(), authorize = () => {} }) {
  if (!store?.getWithMetadata || !store?.set) throw new Error('Euchre leagues require a conditional-write-capable store.');
  async function load(id) {
    const result = await store.getWithMetadata(keyFor(id), { type: 'json', consistency: 'strong' });
    if (!result) return null;
    if (result.data?.leagueFormatVersion !== EUCHRE_LEAGUE_VERSION) throw new EuchreLeagueError('wrong_league_format', 'This is not a versioned Euchre league.', 400);
    return { league: result.data, etag: result.etag };
  }
  async function change(id, operation, context = {}) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const loaded = await load(id);
      if (!loaded) throw new EuchreLeagueError('league_not_found', 'That league was not found.', 404);
      if (!loaded.etag) throw new Error('A league ETag is required for safe concurrent writes.');
      await authorize(loaded.league, context);
      const outcome = await operation(structuredClone(loaded.league), clock());
      if (outcome?.duplicate) return outcome;
      const league = advanceEuchreLeagueChampionship(outcome?.league || outcome, clock());
      league.revision = loaded.league.revision + 1;
      const saved = await store.set(keyFor(id), JSON.stringify(league), {
        onlyIfMatch: loaded.etag,
        metadata: { leagueId: id, gameSlug: 'euchre', leagueFormatVersion: EUCHRE_LEAGUE_VERSION, status: league.status },
      });
      if (saved?.modified === true) return { ...(outcome?.league ? outcome : {}), league };
      if (saved?.modified !== false) throw new Error('The store did not confirm a conditional league write.');
    }
    throw new EuchreLeagueError('write_conflict', 'The league changed repeatedly. Retry the same operation safely.');
  }
  return {
    async list() {
      if (!store.list) throw new Error('League listing is unavailable.');
      const listed = store.list({ paginate: true });
      const pages = typeof listed?.[Symbol.asyncIterator] === 'function' ? listed : [await listed];
      const leagues = [];
      for await (const { blobs = [] } of pages) {
        for (let offset = 0; offset < blobs.length; offset += 16) {
          const rows = await Promise.all(blobs.slice(offset, offset + 16).map(blob => store.getWithMetadata(blob.key, { type: 'json', consistency: 'strong' })));
          leagues.push(...rows.filter(row => row?.data?.leagueFormatVersion === EUCHRE_LEAGUE_VERSION).map(row => row.data));
        }
      }
      return leagues.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    },
    async create(payload, ownerCanonicalAccountId, context = {}) {
      const league = createEuchreLeagueSeason(payload, ownerCanonicalAccountId, clock());
      await authorize(league, { ...context, action: 'create' });
      const result = await store.set(keyFor(league.id), JSON.stringify(league), { onlyIfNew: true,
        metadata: { leagueId: league.id, gameSlug: 'euchre', leagueFormatVersion: EUCHRE_LEAGUE_VERSION, status: league.status } });
      if (result?.modified !== true) throw new EuchreLeagueError('league_exists', 'That league ID already exists.');
      return league;
    },
    async load(id) { return (await load(id))?.league || null; },
    change,
    enroll(id, identity, context) { return change(id, (league, now) => enrollEuchreLeaguePlayer(league, identity, now), context); },
    start(id, context) { return change(id, startEuchreLeagueSeason, context); },
    assignGame(id, matchId, assignment, context) { return change(id, (league, now) => assignEuchreLeagueGame(league, matchId, assignment, now), context); },
    recordGame(id, matchId, completion, context) { return change(id, (league, now) => recordEuchreLeagueGame(league, matchId, completion, now), context); },
  };
}

/** Runtime adapter; invoking this is forbidden in acceptance simulations. */
export function runtimeEuchreLeagueRepository(options = {}) {
  return createEuchreLeagueRepository({ ...options, store: options.store || getStoreWithFallback('leagues') });
}

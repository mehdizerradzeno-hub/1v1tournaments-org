import { handleNetlifyWebRequest } from './_netlify-web-handler.mjs';
import { getAccountFromEvent } from './_account-utils.mjs';
import { requireEuchreLeagueHost, euchreLeaguePlayerIdentity } from './_euchre-league-auth.mjs';
import { runtimeEuchreLeagueRepository } from './_euchre-league-store.mjs';
import { publicEuchreLeague, organizerEuchreLeague, euchreLeagueViewer } from './_euchre-league-public.mjs';
import { EuchreLeagueError, manageEuchreLeagueSeason, withdrawEuchreLeaguePlayer } from '../../src/lib/euchreLeagueSeason.js';
import { TournamentGameContractError } from './_tournament-game-contract.mjs';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0, must-revalidate',
  Vary: 'Cookie, Authorization', 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (statusCode, value) => ({ statusCode, headers, body: JSON.stringify(value) });
const text = value => String(value || '').trim();
const visible = league => league.visibility === 'public' && league.status !== 'archived';

export async function handleEuchreLeagueRequest(event, dependencies = {}) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (!['GET', 'POST'].includes(event.httpMethod)) return json(405, { error: 'Use GET or POST.', code: 'method_not_allowed' });
  try {
    let payload = {};
    if (event.httpMethod === 'POST') {
      try { payload = JSON.parse(event.body || '{}'); }
      catch { throw new EuchreLeagueError('invalid_json', 'Enter a valid JSON payload.', 400); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new EuchreLeagueError('invalid_json', 'Enter a JSON object.', 400);
    }
    const query = event.queryStringParameters || {};
    const leagueId = text(payload.leagueId || query.leagueId);
    const admin = query.admin === 'true';
    const action = text(payload.action);
    const getAccount = dependencies.getAccountFromEvent || getAccountFromEvent;
    const host = league => requireEuchreLeagueHost(event, league, dependencies);
    let hostAccess;
    if (admin || (event.httpMethod === 'POST' && !['join', 'leave', 'open-match'].includes(action))) {
      hostAccess = await host(null);
    }
    const account = await getAccount(event);
    const clock = dependencies.clock || (() => new Date());
    const repo = (dependencies.createRepository || runtimeEuchreLeagueRepository)({
      clock, authorize: async (league, context) => {
        if (!context.authorize) throw new EuchreLeagueError('authorization_required', 'An authorized operation is required.', 403);
        await context.authorize(league);
      },
    });
    const responseFor = (league, organizer = false) => ({ ok: true,
      league: organizer ? organizerEuchreLeague(league) : publicEuchreLeague(league),
      viewer: euchreLeagueViewer(league, account, clock()), canManage: organizer });
    const load = async () => {
      const league = await repo.load(leagueId);
      if (!league) throw new EuchreLeagueError('league_not_found', 'That league was not found.', 404);
      return league;
    };
    if (event.httpMethod === 'GET') {
      if (leagueId) {
        const league = await load();
        if (admin) await host(league);
        else if (!visible(league)) throw new EuchreLeagueError('league_not_found', 'That league was not found.', 404);
        return json(200, responseFor(league, admin));
      }
      let leagues = await repo.list();
      leagues = leagues.filter(league => admin
        ? hostAccess.method === 'token' || league.ownerCanonicalAccountId === hostAccess.canonicalAccountId
        : visible(league));
      return json(200, { ok: true, leagues: leagues.map(league => admin ? organizerEuchreLeague(league) : publicEuchreLeague(league)),
        viewerByLeagueId: Object.fromEntries(leagues.map(league => [league.id, euchreLeagueViewer(league, account, clock())])), canManage: admin });
    }
    if (['submit-result', 'report-result', 'force-result'].includes(action)) {
      throw new EuchreLeagueError('authoritative_results_only', 'League series accept only verified game-server tournament callbacks.', 403);
    }
    if (action === 'create') {
      const league = await repo.create(payload.league || {}, hostAccess.canonicalAccountId, { authorize: latest => host(latest) });
      return json(201, responseFor(league, true));
    }
    const league = await load();
    if (action === 'join' || action === 'leave') {
      const identity = euchreLeaguePlayerIdentity(account, dependencies);
      const authorize = latest => {
        if (!visible(latest)) throw new EuchreLeagueError('league_not_found', 'That league was not found.', 404);
        euchreLeaguePlayerIdentity(account, dependencies);
      };
      const updated = action === 'join'
        ? await repo.enroll(leagueId, identity, { authorize })
        : await repo.change(leagueId, (latest, now) => withdrawEuchreLeaguePlayer(latest, identity.canonicalAccountId, now), { authorize });
      return json(200, responseFor(updated.league));
    }
    if (action === 'open-match') {
      const identity = euchreLeaguePlayerIdentity(account, dependencies);
      const matchId = text(payload.matchId);
      const authorize = latest => {
        const match = latest.matches.find(item => item.id === matchId);
        if (!match || ![match.homePlayerId, match.awayPlayerId].includes(identity.canonicalAccountId)) {
          throw new EuchreLeagueError('not_assigned', 'This account is not assigned to that series.', 403);
        }
        if (latest.status !== 'active' || !['scheduled', 'playing'].includes(match.status)) {
          throw new EuchreLeagueError('match_unavailable', 'That series is not available for play.');
        }
        if (new Date(match.scheduledFor) > new Date(clock())) throw new EuchreLeagueError('match_not_due', 'This match opens at its scheduled time.');
        if (latest.matches.some(other => other.id !== matchId && other.status !== 'complete'
          && [other.homePlayerId, other.awayPlayerId].includes(identity.canonicalAccountId)
          && other.series.assignments.length > other.series.games.length)) {
          throw new EuchreLeagueError('other_game_active', 'Finish your assigned game before opening another series.');
        }
      };
      authorize(league);
      const openMatch = dependencies.openLeagueMatch || (await import('./_euchre-league-games.mjs')).openEuchreLeagueMatch;
      return await openMatch({ event, leagueId, matchId, repo, authorize, account, clock }, dependencies);
    }
    await host(league);
    const context = { authorize: latest => host(latest) };
    if (action === 'start') return json(200, responseFor((await repo.start(leagueId, context)).league, true));
    if (action === 'remove-player') {
      const changed = await repo.change(leagueId, (latest, now) => withdrawEuchreLeaguePlayer(latest, text(payload.canonicalAccountId), now), context);
      return json(200, responseFor(changed.league, true));
    }
    if (['update', 'set-registration', 'pause', 'resume', 'archive', 'reschedule'].includes(action)) {
      const changed = await repo.change(leagueId, (latest, now) => manageEuchreLeagueSeason(latest, action, action === 'update' ? payload.patch || {} : payload, now), context);
      return json(200, responseFor(changed.league, true));
    }
    if (action === 'export-standings') {
      const rows = publicEuchreLeague(league).divisions.flatMap(division => division.standings.map(row => [division.name, row.rank, row.username, row.wins, row.losses, row.gameDifferential, row.pointDifferential]));
      const csv = [['division', 'rank', 'username', 'wins', 'losses', 'gameDifferential', 'pointDifferential'], ...rows]
        .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
      return json(200, { ok: true, csv });
    }
    throw new EuchreLeagueError('invalid_action', 'Choose a supported league action.', 400);
  } catch (error) {
    if (error instanceof EuchreLeagueError || error instanceof TournamentGameContractError) return json(error.statusCode, { error: error.message, code: error.code });
    // Do not expose storage errors, session data, or credentials to the browser.
    console.error('Euchre league request failed', { name: error?.name || 'Error' });
    return json(503, { error: 'League storage or match access is temporarily unavailable.', code: 'league_unavailable' });
  }
}

export default function netlifyHandler(request) {
  return handleNetlifyWebRequest(request, handleEuchreLeagueRequest);
}

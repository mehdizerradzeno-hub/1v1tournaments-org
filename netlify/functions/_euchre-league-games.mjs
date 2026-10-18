import { createHash } from 'node:crypto';
import { getStoreWithFallback, accountCanonicalId, playerUsernameForAccount } from './_account-utils.mjs';
import { euchreLeaguePlayerIdentity } from './_euchre-league-auth.mjs';
import { buildBracket } from './tournament-bracket.mjs';
import { normalizeHostedTournament, createHostedTournament } from './_tournament-events-utils.mjs';
import { issueTournamentMatchTicket } from './tournament-match-access.mjs';
import { runtimeEuchreLeagueRepository } from './_euchre-league-store.mjs';
import { TournamentGameContractError } from './_tournament-game-contract.mjs';
import { EUCHRE_LEAGUE_VERSION, EuchreLeagueError, recordEuchreLeagueGame } from '../../src/lib/euchreLeagueSeason.js';

function digest(value) { return createHash('sha256').update(value).digest('hex').slice(0, 32); }
function conflict(message) { throw new EuchreLeagueError('game_assignment_conflict', message); }

export function planEuchreLeagueGame(league, matchId, now = new Date(), currentUsernames = null) {
  const match = league.matches.find(item => item.id === matchId);
  if (!match?.homeTeam || !match?.awayTeam || match.status === 'complete') conflict('Choose an unfinished assigned series.');
  const gameNumber = match.series.games.length + 1;
  const tournamentSlug = `elg-${digest(`${league.id}:${league.currentSeasonId}:${matchId}:${gameNumber}`)}`;
  const tournamentMatchId = `${tournamentSlug}-r1-m1`;
  const stored = match.series.assignments.find(item => item.gameNumber === gameNumber);
  const playerUsernames = stored?.playerUsernames || currentUsernames || [match.homeTeam, match.awayTeam]
    .map(player => ({ canonicalAccountId: player.canonicalAccountId, username: player.displayName }));
  const assignment = { gameNumber, tournamentSlug, tournamentMatchId, playerUsernames };
  if (stored && (stored.tournamentSlug !== tournamentSlug || stored.tournamentMatchId !== tournamentMatchId)) conflict('The next game is already assigned elsewhere.');
  const timestamp = new Date(now).getTime();
  const signups = [match.homeTeam, match.awayTeam].map((player, index) => ({
    id: `league-seat-${digest(`${tournamentSlug}:${player.canonicalAccountId}`)}`,
    tournamentSlug, accountId: player.accountId || player.canonicalAccountId,
    canonicalAccountId: player.canonicalAccountId,
    playerName: playerUsernames[index].username, playerHandle: playerUsernames[index].username, status: 'registered',
    createdAt: new Date(timestamp + index).toISOString(),
  }));
  const tournament = normalizeHostedTournament({ slug: tournamentSlug, gameSlug: 'euchre',
    title: `${league.name} · Game ${gameNumber}`, date: match.scheduledFor,
    mode: 'single-elimination', rosterCap: 2, minimumPlayers: 2,
    visibility: 'unlisted', publicDiscovery: false,
    links: [{ label: 'Return to league', href: `/leagues/euchre?league=${encodeURIComponent(league.id)}` }],
    competitionMeta: { competitionMode: 'league', leagueId: league.id, seasonId: league.currentSeasonId,
      divisionId: match.divisionId, matchAssignmentId: match.id,
      raw: { leagueFormatVersion: EUCHRE_LEAGUE_VERSION, gameNumber } },
  });
  if (tournament.error) conflict('The league game could not be normalized.');
  const bracket = buildBracket({ tournamentSlug, gameSlug: 'euchre', signups, includeAdminFields: false });
  bracket.euchreLeagueAssignment = { leagueFormatVersion: EUCHRE_LEAGUE_VERSION,
    leagueId: league.id, seriesMatchId: match.id, gameNumber };
  return { assignment, tournament, bracket, signups };
}

async function ensureRecord(store, key, value, validate) {
  const saved = await store.set(key, JSON.stringify(value), { onlyIfNew: true });
  if (saved?.modified === true) return value;
  if (saved?.modified !== false) throw new Error('The store did not confirm game creation.');
  const existing = await store.get(key, { type: 'json', consistency: 'strong' });
  if (!existing || !validate(existing)) conflict('An existing tournament resource has a different assignment.');
  return existing;
}

/** Reserve first, then idempotently materialize the existing tournament resources. */
export async function ensureEuchreLeagueGame({ repo, leagueId, matchId, authorize, account, clock = () => new Date() }, dependencies = {}) {
  const initial = await repo.load(leagueId);
  if (!initial) throw new EuchreLeagueError('league_not_found', 'That league was not found.', 404);
  await authorize(initial);
  const storeFor = dependencies.storeFor || getStoreWithFallback;
  const match = initial.matches.find(item => item.id === matchId);
  const existingAssignment = match?.series.assignments.find(item => item.gameNumber === match.series.games.length + 1);
  let usernames = null;
  if (!existingAssignment && match?.homeTeam && match?.awayTeam) {
    usernames = await Promise.all([match.homeTeam, match.awayTeam].map(async team => {
      const member = initial.participants.find(player => player.canonicalAccountId === team.canonicalAccountId);
      const current = member?.accountRecordKey
        ? await storeFor('player-accounts').get(member.accountRecordKey, { type: 'json', consistency: 'strong' })
        : accountCanonicalId(account) === team.canonicalAccountId ? account : null;
      if (member?.accountRecordKey && !current) throw new EuchreLeagueError('player_account_unavailable', 'An assigned shared account is unavailable. Ask the organizer to investigate.');
      if (!current) return { canonicalAccountId: team.canonicalAccountId, username: team.displayName };
      const identity = euchreLeaguePlayerIdentity(current, dependencies);
      if (identity.canonicalAccountId !== team.canonicalAccountId) conflict('An account record does not match the assigned player.');
      return { canonicalAccountId: identity.canonicalAccountId, username: identity.username };
    }));
  }
  const planned = planEuchreLeagueGame(initial, matchId, clock(), usernames);
  const reserved = await repo.assignGame(leagueId, matchId, planned.assignment, { authorize });
  const plan = planEuchreLeagueGame(reserved.league, matchId, clock());
  const eventStore = storeFor('tournament-events');
  const created = await createHostedTournament(plan.tournament, null, { store: eventStore, updatedAt: new Date(clock()).toISOString() });
  if (!created.created) {
    const existing = await eventStore.get(`${plan.assignment.tournamentSlug}.json`, { type: 'json', consistency: 'strong' });
    const meta = existing?.competitionMeta;
    if (meta?.leagueId !== leagueId || meta?.matchAssignmentId !== matchId
      || meta?.raw?.leagueFormatVersion !== EUCHRE_LEAGUE_VERSION || meta?.raw?.gameNumber !== plan.assignment.gameNumber
      || existing.gameSlug !== 'euchre' || existing.deleted) conflict('The game tournament is not the reserved league assignment.');
  }
  for (const [index, signup] of plan.signups.entries()) {
    await ensureRecord(storeFor('tournament-signups'), `${signup.tournamentSlug}/league-seat-${index}.json`, signup,
      old => old.id === signup.id && old.canonicalAccountId === signup.canonicalAccountId && old.playerHandle === signup.playerHandle);
  }
  const bracket = await ensureRecord(storeFor('tournament-brackets'), `${plan.assignment.tournamentSlug}.json`, plan.bracket, old => {
    const marker = old.euchreLeagueAssignment;
    const players = old.rounds?.[0]?.matches?.[0]?.players || [];
    return marker?.leagueId === leagueId && marker?.seriesMatchId === matchId && marker?.gameNumber === plan.assignment.gameNumber
      && old.gameSlug === 'euchre' && players.length === 2
      && players.every((player, index) => player?.id === plan.signups[index].id && player?.canonicalAccountId === plan.signups[index].canonicalAccountId);
  });
  return { ...plan, bracket };
}

export async function assertEuchreLeagueTicketAccess(bracket, account, dependencies = {}) {
  const marker = bracket.euchreLeagueAssignment;
  if (!marker || marker.leagueFormatVersion !== EUCHRE_LEAGUE_VERSION) {
    throw new TournamentGameContractError(403, 'This league assignment is invalid.', 'invalid_league_assignment');
  }
  const repo = dependencies.euchreLeagueRepository || runtimeEuchreLeagueRepository();
  const league = await repo.load(marker.leagueId);
  const match = league?.matches.find(item => item.id === marker.seriesMatchId);
  const assignment = match?.series.assignments.find(item => item.gameNumber === marker.gameNumber);
  const canonical = accountCanonicalId(account);
  const availableStatus = league?.status === 'active' || (dependencies.allowPaused && league?.status === 'paused');
  if (!league || !match || !availableStatus || match.status === 'complete'
    || ![match.homePlayerId, match.awayPlayerId].includes(canonical)
    || marker.gameNumber !== match.series.games.length + 1
    || assignment?.tournamentSlug !== bracket.tournamentSlug
    || assignment?.tournamentMatchId !== `${bracket.tournamentSlug}-r1-m1`
    || new Date(match.scheduledFor) > new Date(dependencies.clock ? dependencies.clock() : Date.now())) {
    throw new TournamentGameContractError(403, 'This league game is not available to this player.', 'league_game_unavailable');
  }
  if (account?.playerHandle) {
    const assignedPlayer = bracket.rounds[0].matches[0].players.find(player => player.canonicalAccountId === canonical);
    if (assignedPlayer?.handle !== playerUsernameForAccount(account)) {
      throw new TournamentGameContractError(409, 'Your username changed after this game was assigned. Restore the assigned username before reconnecting; the next game uses your current claimed username.', 'game_username_changed');
    }
  }
}

export async function openEuchreLeagueMatch(input, dependencies = {}) {
  const { assignment } = await ensureEuchreLeagueGame(input, dependencies);
  const storeFor = dependencies.storeFor || getStoreWithFallback;
  return issueTournamentMatchTicket(input.event, { matchId: assignment.tournamentMatchId, tournamentSlug: assignment.tournamentSlug }, {
    ...dependencies,
    getAccountFromEvent: async () => input.account, clock: input.clock, euchreLeagueRepository: input.repo,
    loadBracket: slug => storeFor('tournament-brackets').get(`${slug}.json`, { type: 'json', consistency: 'strong' }),
    saveTicket: async (ticket, record) => {
      const { ticketKey } = await import('./tournament-match-access.mjs');
      await storeFor('tournament-match-tickets').setJSON(ticketKey(ticket), record);
    },
    isHostedTournamentDeleted: async slug => Boolean((await storeFor('tournament-events').get(`${slug}.json`, { type: 'json', consistency: 'strong' }))?.deleted),
    loadTournamentMatchRevocation: matchId => storeFor('tournament-match-revocations').get(`${matchId}.json`, { type: 'json', consistency: 'strong' }),
  });
}

/** Preflight before the ordinary bracket is finalized: invalid scores cannot poison it. */
export async function validateEuchreLeagueGameCompletion({ bracket, result }, dependencies = {}) {
  const marker = bracket.euchreLeagueAssignment;
  const repo = dependencies.euchreLeagueRepository || runtimeEuchreLeagueRepository();
  const league = await repo.load(marker.leagueId);
  if (!league) throw new TournamentGameContractError(404, 'The league assignment was not found.', 'league_not_found');
  try {
    recordEuchreLeagueGame(league, marker.seriesMatchId, {
      tournamentSlug: bracket.tournamentSlug, tournamentMatchId: result.matchId,
      completionId: result.completionId, winnerCanonicalAccountId: result.winnerCanonicalAccountId,
      scores: result.scores, forfeit: result.forfeit, forfeitReason: result.forfeitReason,
    });
  } catch (error) {
    if (error instanceof EuchreLeagueError) throw new TournamentGameContractError(error.statusCode, error.message, error.code);
    throw error;
  }
}

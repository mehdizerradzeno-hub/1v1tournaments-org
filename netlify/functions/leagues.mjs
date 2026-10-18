import { connectLambda } from '@netlify/blobs';

import {
  accountCanonicalId,
  getAccountFromEvent,
  hasClaimedPlayerUsername,
  playerUsernameForAccount,
} from './_account-utils.mjs';
import { requireTournamentAdmin } from './_host-auth.mjs';
import { EuchreLeagueError } from '../../src/lib/euchreLeagueSeason.js';
import {
  addLeagueParticipant,
  archiveLeague,
  exportLeagueStandings,
  launchLeagueMatch,
  loadLeagueById,
  listLeagues,
  promoteLeagueWaitlist,
  regenerateLeagueSchedule,
  removeLeagueParticipant,
  replaceLeagueParticipant,
  saveLeague,
  setLeagueRegistration,
  upsertLeagueMatchResult,
} from './_league-utils.mjs';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function cleanText(value, fallback = '') {
  return String(value || '').trim();
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || '{}');
  } catch {
    return null;
  }
}

function isPublicLeague(league) {
  return cleanText(league?.visibility || 'public').toLowerCase() === 'public';
}

function isCurrentSeasonMatch(league, match) {
  const seasonId = cleanText(league?.currentSeasonId || league?.season?.id);
  const matchSeasonId = cleanText(match?.seasonId);
  return !seasonId || !matchSeasonId || matchSeasonId === seasonId;
}

function publicTeam(team) {
  if (!team) return null;
  return { displayName: cleanText(team.displayName || 'TBD') || 'TBD' };
}

function publicStanding(entry) {
  if (!entry) return null;
  return {
    rank: Number.isInteger(Number(entry.rank)) && Number(entry.rank) > 0 ? Number(entry.rank) : null,
    displayName: cleanText(entry.displayName || 'Player') || 'Player',
    wins: Math.max(0, Number.parseInt(entry.wins, 10) || 0),
    losses: Math.max(0, Number.parseInt(entry.losses, 10) || 0),
    ties: Math.max(0, Number.parseInt(entry.ties, 10) || 0),
    winPercent: Math.max(0, Number.parseFloat(entry.winPercent) || 0),
    pointsFor: Math.max(0, Number.parseInt(entry.pointsFor, 10) || 0),
    pointsAgainst: Math.max(0, Number.parseInt(entry.pointsAgainst, 10) || 0),
    pointDifferential: Number.parseInt(entry.pointDifferential, 10) || 0,
    currentStreak: Number.parseInt(entry.currentStreak, 10) || 0,
    status: cleanText(entry.status || 'enrolled') || 'enrolled',
  };
}

function publicResult(result) {
  if (!result) return null;
  const source = cleanText(result.source);
  const sourceTournamentSlug = cleanText(result.sourceTournamentSlug).toLowerCase();
  const verifiedTournament = source === 'tournament-authoritative-result'
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourceTournamentSlug);

  return {
    winner: ['home', 'away', 'tie'].includes(cleanText(result.winner).toLowerCase())
      ? cleanText(result.winner).toLowerCase()
      : '',
    homeScore: Number.isFinite(Number(result.homeScore)) ? String(result.homeScore) : '0',
    awayScore: Number.isFinite(Number(result.awayScore)) ? String(result.awayScore) : '0',
    tie: Boolean(result.tie),
    forfeit: Boolean(result.forfeit),
    noShow: Boolean(result.noShow),
    dispute: Boolean(result.dispute),
    completedAt: cleanText(result.completedAt),
    ...(verifiedTournament ? {
      source: 'tournament-authoritative-result',
      sourceTournamentSlug,
    } : {}),
  };
}

function publicMatch(match) {
  return {
    id: cleanText(match?.id),
    gameSlug: cleanText(match?.gameSlug),
    seasonId: cleanText(match?.seasonId),
    divisionId: cleanText(match?.divisionId),
    weekIndex: Number.isInteger(Number(match?.weekIndex)) ? Number(match.weekIndex) : 0,
    seasonWeek: Number.isInteger(Number(match?.seasonWeek)) ? Number(match.seasonWeek) : 0,
    scheduledFor: cleanText(match?.scheduledFor),
    status: cleanText(match?.status || 'scheduled') || 'scheduled',
    homeTeam: publicTeam(match?.homeTeam),
    awayTeam: publicTeam(match?.awayTeam),
    venue: cleanText(match?.venue || 'online') || 'online',
    result: publicResult(match?.result),
  };
}

/**
 * Browser-facing league shape. The raw league contains canonical identities,
 * contact addresses, assignment metadata, callback IDs, and room URLs; none
 * belongs in a public standings or schedule response.
 */
export function publicLeagueRecord(league) {
  const currentMatches = (league?.matches || []).filter((match) => isCurrentSeasonMatch(league, match));
  return {
    id: cleanText(league?.id),
    slug: cleanText(league?.slug),
    name: cleanText(league?.name || 'League') || 'League',
    description: cleanText(league?.description),
    status: cleanText(league?.status || 'active') || 'active',
    visibility: 'public',
    gameSlug: cleanText(league?.gameSlug),
    venue: {
      name: cleanText(league?.venue?.name || 'Online') || 'Online',
      mode: cleanText(league?.venue?.mode || 'online') || 'online',
      table: cleanText(league?.venue?.table),
    },
    rulesetReference: cleanText(league?.rulesetReference),
    organizer: cleanText(league?.organizer),
    startDate: cleanText(league?.startDate),
    endDate: cleanText(league?.endDate),
    seasonRegistrationStart: cleanText(league?.seasonRegistrationStart),
    seasonRegistrationEnd: cleanText(league?.seasonRegistrationEnd),
    registrationOpen: league?.registrationOpen !== false,
    playerCap: Math.max(0, Number.parseInt(league?.playerCap, 10) || 0),
    weeklyPlayDay: cleanText(league?.weeklyPlayDay),
    weeklyPlayTime: cleanText(league?.weeklyPlayTime),
    timeZone: cleanText(league?.timeZone),
    seasonConfig: {
      scheduleFormat: cleanText(league?.seasonConfig?.scheduleFormat),
      regularWeeks: Math.max(0, Number.parseInt(league?.seasonConfig?.regularWeeks, 10) || 0),
      doubleRoundRobin: Boolean(league?.seasonConfig?.doubleRoundRobin),
      playoffEnabled: Boolean(league?.seasonConfig?.playoffEnabled),
      playoffSize: Math.max(0, Number.parseInt(league?.seasonConfig?.playoffSize, 10) || 0),
      playoffFormat: cleanText(league?.seasonConfig?.playoffFormat),
    },
    currentSeasonId: cleanText(league?.currentSeasonId),
    season: {
      id: cleanText(league?.season?.id),
      name: cleanText(league?.season?.name),
      startDate: cleanText(league?.season?.startDate),
      endDate: cleanText(league?.season?.endDate),
      scheduleFormat: cleanText(league?.season?.scheduleFormat),
      playoffFormat: cleanText(league?.season?.playoffFormat),
      weekDay: cleanText(league?.season?.weekDay),
      startTime: cleanText(league?.season?.startTime),
      startTimeZone: cleanText(league?.season?.startTimeZone),
      weeklyPlayDay: cleanText(league?.season?.weeklyPlayDay),
      weeklyPlayTime: cleanText(league?.season?.weeklyPlayTime),
      isActive: league?.season?.isActive !== false,
    },
    participants: (league?.participants || []).map((participant) => ({
      displayName: cleanText(participant?.displayName || 'Player') || 'Player',
      division: cleanText(participant?.division || 'Open') || 'Open',
      status: cleanText(participant?.status || 'enrolled') || 'enrolled',
    })),
    players: Math.max(0, Number.parseInt(league?.players, 10) || 0),
    matches: currentMatches.map(publicMatch),
    standings: (league?.standings || []).map(publicStanding).filter(Boolean),
    createdAt: cleanText(league?.createdAt),
    updatedAt: cleanText(league?.updatedAt),
  };
}

function sameCanonicalAccount(value, canonicalAccountId) {
  return Boolean(canonicalAccountId && cleanText(value) === canonicalAccountId);
}

/**
 * Personal data that is safe only for the signed-in player. Match room URLs
 * remain absent unless that player is assigned to the fixture.
 */
export function publicLeagueViewer(league, account) {
  const canonicalAccountId = cleanText(accountCanonicalId(account));
  if (!canonicalAccountId) return null;

  const participant = (league?.participants || []).find((entry) => (
    sameCanonicalAccount(entry?.canonicalAccountId || entry?.accountId, canonicalAccountId)
  ));
  const standing = (league?.standings || []).find((entry) => (
    sameCanonicalAccount(entry?.canonicalAccountId || entry?.accountId, canonicalAccountId)
  ));
  const matchAccess = (league?.matches || []).filter((match) => isCurrentSeasonMatch(league, match)).flatMap((match) => {
    const seat = sameCanonicalAccount(match?.homeTeam?.canonicalAccountId || match?.homePlayerId, canonicalAccountId)
      ? 'home'
      : sameCanonicalAccount(match?.awayTeam?.canonicalAccountId || match?.awayPlayerId, canonicalAccountId)
        ? 'away'
        : '';
    if (!seat) return [];
    return [{
      matchId: cleanText(match?.id),
      seat,
      roomUrl: cleanText(match?.roomUrl),
    }];
  });

  return {
    membership: participant ? {
      status: cleanText(participant.status || 'enrolled') || 'enrolled',
      division: cleanText(participant.division || 'Open') || 'Open',
    } : null,
    standing: publicStanding(standing),
    matchAccess,
  };
}

export function publicLeagueReadPayload(league, account) {
  if (!isPublicLeague(league)) return null;
  return {
    league: publicLeagueRecord(league),
    viewer: publicLeagueViewer(league, account),
  };
}

export function publicLeaguesReadPayload(leagues, account) {
  const visibleLeagues = (leagues || []).filter(isPublicLeague);
  return {
    leagues: visibleLeagues.map(publicLeagueRecord),
    viewerByLeagueId: Object.fromEntries(visibleLeagues.map((league) => [
      cleanText(league.id),
      publicLeagueViewer(league, account),
    ])),
  };
}

/**
 * Injectable read handler so privacy behavior is proven at the HTTP boundary,
 * including the distinction between public and authenticated host reads.
 */
export async function handleLeagueReadRequest(event, dependencies = {}) {
  try {
    const query = event?.queryStringParameters || {};
    const leagueId = cleanText(query.leagueId || query.id || '');
    const adminRequested = cleanText(query.admin).toLowerCase() === 'true';
    const getAccount = dependencies.getAccountFromEvent || getAccountFromEvent;
    const requireAdmin = dependencies.requireTournamentAdmin || requireTournamentAdmin;
    const loadById = dependencies.loadLeagueById || loadLeagueById;
    const list = dependencies.listLeagues || listLeagues;
    const account = await getAccount(event);

    if (adminRequested) {
      const adminCheck = await requireAdmin(event);
      if (adminCheck.error) return json(adminCheck.error.statusCode, { error: adminCheck.error.message });
    }

    if (leagueId) {
      const league = await loadById(leagueId);
      if (!league) return json(404, { error: 'That league was not found.' });
      if (league.leagueFormatVersion === 'euchre-1v1-season-v1') return json(409, { error: 'Use the Euchre league page for this season.', code: 'versioned_league_required' });
      if (adminRequested) return json(200, { ok: true, league });
      const payload = publicLeagueReadPayload(league, account);
      if (!payload) return json(404, { error: 'That league was not found.' });
      return json(200, { ok: true, ...payload });
    }

    const includeArchived = cleanText(query.includeArchived).toLowerCase() === 'true';
    const leagues = await list({ includeArchived: adminRequested && includeArchived });
    if (adminRequested) return json(200, { ok: true, leagues });

    return json(200, { ok: true, ...publicLeaguesReadPayload(leagues, account) });
  } catch (error) {
    console.error('Leagues load failed', error);
    return json(500, { error: 'League storage is not available yet.' });
  }
}

async function handleLeagueRequest(event) {
  if (event.blobs) {
    connectLambda(event);
  }

  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  const leagueId = cleanText(event.queryStringParameters?.leagueId || event.queryStringParameters?.id || '');

  if (event.httpMethod === 'GET') return handleLeagueReadRequest(event);

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use GET to load leagues or POST to manage leagues.' });
  }

  const payload = parseBody(event);
  if (!payload) {
    return json(400, { error: 'League payload must be valid JSON.' });
  }

  const action = cleanText(payload.action).toLowerCase();

  if (['create', 'save', 'update', 'edit'].includes(action)) {
    const adminCheck = await requireTournamentAdmin(event);
    if (adminCheck.error) return json(adminCheck.error.statusCode, { error: adminCheck.error.message });

    const league = await saveLeague(payload.league || payload, adminCheck.account);
    return json(200, { ok: true, league });
  }

  if (action === 'archive') {
    const adminCheck = await requireTournamentAdmin(event);
    if (adminCheck.error) return json(adminCheck.error.statusCode, { error: adminCheck.error.message });

    const targetLeagueId = cleanText(payload.leagueId || leagueId);
    if (!targetLeagueId) return json(400, { error: 'Choose a league before archiving it.' });

    const league = await archiveLeague(targetLeagueId, adminCheck.account);
    if (!league) return json(404, { error: 'Choose a league before archiving it.' });
    return json(200, { ok: true, league });
  }

  if (action === 'set-registration') {
    const adminCheck = await requireTournamentAdmin(event);
    if (adminCheck.error) return json(adminCheck.error.statusCode, { error: adminCheck.error.message });

    const targetLeagueId = cleanText(payload.leagueId || leagueId);
    const registrationOpen = payload.registrationOpen !== false;
    const league = await setLeagueRegistration(targetLeagueId, registrationOpen, adminCheck.account);
    if (!league) return json(404, { error: 'Choose a league before changing registration.' });
    return json(200, { ok: true, league });
  }

  if (action === 'generate-schedule' || action === 'generate') {
    const adminCheck = await requireTournamentAdmin(event);
    if (adminCheck.error) return json(adminCheck.error.statusCode, { error: adminCheck.error.message });

    const targetLeagueId = cleanText(payload.leagueId || leagueId);
    if (!targetLeagueId) return json(400, { error: 'Choose a league before generating schedule.' });

    const league = await regenerateLeagueSchedule(targetLeagueId, {
      weekCount: payload.weekCount,
      doubleRoundRobin: payload.doubleRoundRobin,
    });

    if (!league) return json(404, { error: 'Choose a league before generating schedule.' });
    return json(200, { ok: true, league });
  }

  if (action === 'join') {
    const account = await getAccountFromEvent(event);
    const targetLeagueId = cleanText(payload.leagueId || leagueId);

    if (!targetLeagueId) return json(400, { error: 'Choose a league before joining it.' });
    if (!account) return json(401, { error: 'Create or sign in to a player account before joining a league.' });
    const username = playerUsernameForAccount(account);
    if (!username || !hasClaimedPlayerUsername(account)) {
      return json(409, {
        error: 'Choose a unique username in your 1v1 account before joining a league.',
        code: 'username_required',
      });
    }
    const visibleLeague = await loadLeagueById(targetLeagueId);
    if (!visibleLeague || !isPublicLeague(visibleLeague)) {
      return json(404, { error: 'That league was not found.' });
    }

    const result = await addLeagueParticipant(targetLeagueId, {
      accountId: account.id,
      accountEmail: account.email,
      canonicalAccountId: accountCanonicalId(account),
      displayName: username,
    }, {
      deactivateOnly: false,
    });

    if (!result) return json(404, { error: 'That league was not found.' });
    if (result.blocked === 'archived') {
      return json(409, { error: 'That league is archived and no longer accepts join requests.' });
    }
    if (result.blocked === 'registration-closed') {
      return json(409, { error: 'League registration is currently closed.' });
    }

    return json(200, {
      ok: true,
      league: publicLeagueRecord(result.league),
      viewer: publicLeagueViewer(result.league, account),
      waitlisted: Boolean(result.waitlisted),
    });
  }

  if (action === 'leave') {
    const account = await getAccountFromEvent(event);
    const targetLeagueId = cleanText(payload.leagueId || leagueId);

    if (!targetLeagueId) return json(400, { error: 'Choose a league before leaving it.' });
    if (!account) return json(401, { error: 'Create or sign in to a player account before leaving this league.' });

    const league = await removeLeagueParticipant(targetLeagueId, {
      accountId: account.id,
      accountEmail: account.email,
      canonicalAccountId: accountCanonicalId(account),
    });

    if (!league) return json(404, { error: 'That league was not found.' });
    return json(200, {
      ok: true,
      league: publicLeagueRecord(league),
      viewer: publicLeagueViewer(league, account),
    });
  }

  if (action === 'remove-participant' || action === 'remove-player') {
    const adminCheck = await requireTournamentAdmin(event);
    if (adminCheck.error) return json(adminCheck.error.statusCode, { error: adminCheck.error.message });

    const targetLeagueId = cleanText(payload.leagueId || leagueId);
    if (!targetLeagueId) return json(400, { error: 'Choose a league before removing a player.' });

    const league = await replaceLeagueParticipant(targetLeagueId, {
      accountId: payload.accountId,
      canonicalAccountId: payload.canonicalAccountId,
    }, adminCheck.account);

    if (!league) return json(404, { error: 'That league was not found.' });
    return json(200, { ok: true, league });
  }

  if (action === 'promote-waitlist') {
    const adminCheck = await requireTournamentAdmin(event);
    if (adminCheck.error) return json(adminCheck.error.statusCode, { error: adminCheck.error.message });

    const targetLeagueId = cleanText(payload.leagueId || leagueId);
    if (!targetLeagueId) return json(400, { error: 'Choose a league before promoting a player.' });

    const league = await promoteLeagueWaitlist(targetLeagueId, {
      accountId: payload.accountId,
      canonicalAccountId: payload.canonicalAccountId,
    });

    if (!league) return json(404, { error: 'That league was not found.' });
    return json(200, { ok: true, league });
  }

  if (action === 'launch-match' || action === 'set-match-room') {
    const adminCheck = await requireTournamentAdmin(event);
    if (adminCheck.error) return json(adminCheck.error.statusCode, { error: adminCheck.error.message });

    const targetLeagueId = cleanText(payload.leagueId || leagueId);
    const matchId = cleanText(payload.matchId);
    if (!targetLeagueId || !matchId) return json(400, { error: 'Choose a league and match before launching match.' });

    const league = await launchLeagueMatch(targetLeagueId, matchId, payload.roomUrl, adminCheck.account);
    if (!league) return json(404, { error: 'That league or match was not found.' });
    if (league.launchUnavailable) {
      return json(409, {
        error: 'Match launch is not configured for this league game yet. Add a verified room URL or configure the game service.',
        gameSlug: league.gameSlug,
      });
    }
    return json(200, { ok: true, league, match: league.match || null });
  }

  if (action === 'submit-result' || action === 'report-result' || action === 'force-result') {
    const adminCheck = await requireTournamentAdmin(event);
    if (adminCheck.error) return json(adminCheck.error.statusCode, { error: adminCheck.error.message });

    const targetLeagueId = cleanText(payload.leagueId || leagueId);
    const matchId = cleanText(payload.matchId || payload.id);
    if (!targetLeagueId || !matchId) return json(400, { error: 'Choose a league and match before reporting a result.' });

    const result = payload.result || payload;
    const updated = await upsertLeagueMatchResult(targetLeagueId, matchId, result, {
      source: cleanText(payload.source, 'admin'),
      callbackId: cleanText(payload.callbackId),
      force: action === 'force-result',
      updatedBy: cleanText(adminCheck.account?.id || adminCheck.account?.email || 'system'),
    });

    if (!updated) return json(404, { error: 'That league or match was not found.' });
    return json(200, {
      ok: true,
      league: {
        ...updated,
      },
      duplicate: Boolean(updated.duplicate),
      completeIgnored: Boolean(updated.completeIgnored),
    });
  }

  if (action === 'export-standings') {
    const adminCheck = await requireTournamentAdmin(event);
    if (adminCheck.error) return json(adminCheck.error.statusCode, { error: adminCheck.error.message });

    const targetLeagueId = cleanText(payload.leagueId || leagueId);
    if (!targetLeagueId) return json(400, { error: 'Choose a league before exporting standings.' });

    const csv = await exportLeagueStandings(targetLeagueId);
    return json(200, { ok: true, csv });
  }

  return json(400, { error: 'Choose a supported league action.' });
}

export async function handler(event) {
  try { return await handleLeagueRequest(event); }
  catch (error) {
    if (error instanceof EuchreLeagueError) return json(error.statusCode, { error: error.message, code: error.code });
    throw error;
  }
}

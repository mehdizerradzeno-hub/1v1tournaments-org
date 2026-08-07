import { connectLambda } from '@netlify/blobs';

import { accountCanonicalId, getAccountFromEvent } from './_account-utils.mjs';
import { requireTournamentAdmin } from './_host-auth.mjs';
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

export async function handler(event) {
  if (event.blobs) {
    connectLambda(event);
  }

  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  const leagueId = cleanText(event.queryStringParameters?.leagueId || event.queryStringParameters?.id || '');

  if (event.httpMethod === 'GET') {
    try {
      if (leagueId) {
        const league = await loadLeagueById(leagueId);
        if (!league) return json(404, { error: 'That league was not found.' });
        return json(200, { ok: true, league });
      }

      const includeArchived = cleanText(event.queryStringParameters?.includeArchived).toLowerCase() === 'true';
      return json(200, { ok: true, leagues: await listLeagues({ includeArchived }) });
    } catch (error) {
      console.error('Leagues load failed', error);
      return json(500, { error: 'League storage is not available yet.' });
    }
  }

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

    const result = await addLeagueParticipant(targetLeagueId, {
      accountId: account.id,
      accountEmail: account.email,
      canonicalAccountId: accountCanonicalId(account),
      displayName: cleanText(payload.displayName || account.playerName),
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

    return json(200, { ok: true, league: result.league, waitlisted: Boolean(result.waitlisted) });
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
    return json(200, { ok: true, league });
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

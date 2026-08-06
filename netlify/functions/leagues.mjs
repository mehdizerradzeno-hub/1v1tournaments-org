import { connectLambda } from '@netlify/blobs';

import { accountCanonicalId, getAccountFromEvent } from './_account-utils.mjs';
import { requireTournamentAdmin } from './_host-auth.mjs';
import {
  addLeagueParticipant,
  archiveLeague,
  loadLeagueById,
  listLeagues,
  removeLeagueParticipant,
  regenerateLeagueSchedule,
  saveLeague,
  upsertLeagueMatchResult,
} from './_league-utils.mjs';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

function cleanText(value, fallback = '') {
  return String(value || '').trim();
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

        if (!league) {
          return json(404, { error: 'That league was not found.' });
        }

        return json(200, { ok: true, league });
      }

      const includeArchived = cleanText(event.queryStringParameters?.includeArchived).toLowerCase() === 'true';
      return json(200, {
        ok: true,
        leagues: await listLeagues({ includeArchived }),
      });
    } catch (error) {
      console.error('Leagues load failed', error);
      return json(500, { error: 'League storage is not available yet.' });
    }
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use GET to load leagues or POST to save, join, or manage leagues.' });
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'League payload must be valid JSON.' });
  }

  const action = cleanText(payload.action).toLowerCase();
  if (action === 'create' || action === 'save' || action === 'edit' || action === 'update') {
    const adminCheck = await requireTournamentAdmin(event);
    if (adminCheck.error) return json(adminCheck.error.statusCode, { error: adminCheck.error.message });

    const league = await saveLeague(payload.league || payload, adminCheck.account);
    return json(200, { ok: true, league });
  }

  if (action === 'archive') {
    const adminCheck = await requireTournamentAdmin(event);
    if (adminCheck.error) return json(adminCheck.error.statusCode, { error: adminCheck.error.message });
    const targetLeagueId = cleanText(payload.leagueId || leagueId);
    const league = await archiveLeague(targetLeagueId, adminCheck.account);

    if (!league) {
      return json(404, { error: 'Choose a league before archiving it.' });
    }

    return json(200, { ok: true, league });
  }

  if (action === 'generate-schedule' || action === 'generate') {
    const adminCheck = await requireTournamentAdmin(event);
    if (adminCheck.error) return json(adminCheck.error.statusCode, { error: adminCheck.error.message });
    const targetLeagueId = cleanText(payload.leagueId || leagueId);
    const league = await regenerateLeagueSchedule(targetLeagueId, { weekCount: payload.weekCount });

    if (!league) {
      return json(404, { error: 'Choose a league before generating schedule.' });
    }

    return json(200, { ok: true, league });
  }

  if (action === 'join') {
      const account = await getAccountFromEvent(event);
    const targetLeagueId = cleanText(payload.leagueId || leagueId);

    if (!targetLeagueId) {
      return json(400, { error: 'Choose a league before joining it.' });
    }

    if (!account) {
      return json(401, { error: 'Create or sign in to a player account before joining a league.' });
    }

    const league = await addLeagueParticipant(targetLeagueId, {
      accountId: account.id,
      accountEmail: account.email,
      canonicalAccountId: accountCanonicalId(account),
      displayName: cleanText(payload.displayName || account.playerName),
    });

    if (!league) {
      return json(404, { error: 'That league was not found.' });
    }

    return json(200, {
      ok: true,
      league,
      waitlisted: Boolean(league.waitlisted),
    });
  }

  if (action === 'leave') {
    const account = await getAccountFromEvent(event);
    const targetLeagueId = cleanText(payload.leagueId || leagueId);

    if (!targetLeagueId) {
      return json(400, { error: 'Choose a league before leaving it.' });
    }

    if (!account) {
      return json(401, { error: 'Create or sign in to a player account before leaving this league.' });
    }

    const league = await removeLeagueParticipant(targetLeagueId, {
      accountId: account.id,
      accountEmail: account.email,
      canonicalAccountId: accountCanonicalId(account),
    });

    if (!league) {
      return json(404, { error: 'That league was not found.' });
    }

    return json(200, { ok: true, league });
  }

  if (action === 'submit-result' || action === 'report-result') {
    const adminCheck = await requireTournamentAdmin(event);
    if (adminCheck.error) return json(adminCheck.error.statusCode, { error: adminCheck.error.message });

    const targetLeagueId = cleanText(payload.leagueId || leagueId);
    const matchId = cleanText(payload.matchId || payload.id);

    const league = await upsertLeagueMatchResult(targetLeagueId, matchId, payload.result || payload);

    if (!league) {
      return json(404, { error: 'Choose an active league and match before reporting a result.' });
    }

    return json(200, { ok: true, league });
  }

  return json(400, { error: 'Choose a supported league action.' });
}

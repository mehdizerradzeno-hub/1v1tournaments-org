import { connectLambda } from '@netlify/blobs';

import { requireTournamentAdmin } from './_host-auth.mjs';
import { loadHostedTournament } from './_tournament-events-utils.mjs';
import {
  deleteTournamentSettings,
  loadTournamentSettings,
  normalizeTournamentSettings,
  saveTournamentSettings,
} from './_tournament-settings-utils.mjs';
import { cleanText } from './_account-utils.mjs';
import { isTournamentReadOnlyHistory } from '../../src/lib/adminTournamentVisibility.js';
import { siteData } from '../../src/lib/siteData.js';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

async function historicalTournamentResponse(tournamentSlug) {
  const hostedTournament = await loadHostedTournament(tournamentSlug);
  const seededTournament = siteData.tournaments.find((tournament) => tournament.slug === tournamentSlug) || null;
  const tournament = hostedTournament || seededTournament;

  return tournament && isTournamentReadOnlyHistory(tournament)
    ? json(409, {
      error: 'This tournament is read-only history and its schedule cannot be changed.',
      code: 'tournament_history_read_only',
    })
    : null;
}

export async function handler(event) {
  if (event.blobs) {
    connectLambda(event);
  }

  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  const requestedSlug = cleanText(event.queryStringParameters?.slug);

  if (event.httpMethod === 'GET') {
    if (!requestedSlug) {
      return json(400, { error: 'Choose a tournament before loading schedule settings.' });
    }

    try {
      return json(200, {
        ok: true,
        tournamentSlug: requestedSlug,
        settings: await loadTournamentSettings(requestedSlug),
      });
    } catch (error) {
      console.error('Tournament settings load failed', error);
      return json(500, { error: 'Tournament settings storage is not available yet.' });
    }
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use GET to load settings or POST to save host schedule settings.' });
  }

  const adminCheck = await requireTournamentAdmin(event);

  if (adminCheck.error) {
    return json(adminCheck.error.statusCode, { error: adminCheck.error.message });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Schedule settings payload must be valid JSON.' });
  }

  const tournamentSlug = cleanText(requestedSlug || payload.tournamentSlug);

  if (!tournamentSlug) {
    return json(400, { error: 'Choose a tournament before changing schedule settings.' });
  }

  try {
    const historicalResponse = await historicalTournamentResponse(tournamentSlug);

    if (historicalResponse) {
      return historicalResponse;
    }

    if (payload.action === 'reset') {
      await deleteTournamentSettings(tournamentSlug);

      return json(200, {
        ok: true,
        hostAuth: adminCheck.method,
        tournamentSlug,
        settings: null,
      });
    }

    const settings = normalizeTournamentSettings(payload.settings || payload, tournamentSlug);

    if (settings.error) {
      return json(400, { error: settings.error });
    }

    const savedSettings = await saveTournamentSettings(settings, adminCheck.account);

    return json(200, {
      ok: true,
      hostAuth: adminCheck.method,
      tournamentSlug: savedSettings.tournamentSlug,
      settings: savedSettings,
    });
  } catch (error) {
    console.error('Tournament settings save failed', error);
    return json(500, { error: 'Tournament settings storage is not available yet.' });
  }
}

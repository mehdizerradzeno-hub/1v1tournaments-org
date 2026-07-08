import { connectLambda } from '@netlify/blobs';

import { cleanText } from './_account-utils.mjs';
import { requireTournamentAdmin } from './_host-auth.mjs';
import {
  listHostedTournaments,
  loadHostedTournament,
  normalizeHostedTournament,
  saveHostedTournament,
} from './_tournament-events-utils.mjs';

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

export async function handler(event) {
  if (event.blobs) {
    connectLambda(event);
  }

  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  const requestedSlug = cleanText(event.queryStringParameters?.slug);

  if (event.httpMethod === 'GET') {
    try {
      if (requestedSlug) {
        const tournament = await loadHostedTournament(requestedSlug);

        return json(200, {
          ok: true,
          tournament,
          tournaments: tournament ? [tournament] : [],
        });
      }

      return json(200, {
        ok: true,
        tournaments: await listHostedTournaments(),
      });
    } catch (error) {
      console.error('Tournament events load failed', error);
      return json(500, { error: 'Tournament event storage is not available yet.' });
    }
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use GET to load events or POST to save a hosted event.' });
  }

  const adminCheck = await requireTournamentAdmin(event);

  if (adminCheck.error) {
    return json(adminCheck.error.statusCode, { error: adminCheck.error.message });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Tournament event payload must be valid JSON.' });
  }

  if (!['save', 'upsert', undefined].includes(payload.action)) {
    return json(400, { error: 'Choose a supported tournament event action.' });
  }

  const tournament = normalizeHostedTournament(payload.tournament || payload);

  if (tournament.error) {
    return json(400, { error: tournament.error });
  }

  try {
    const savedTournament = await saveHostedTournament(tournament, adminCheck.account);

    return json(200, {
      ok: true,
      hostAuth: adminCheck.method,
      tournament: savedTournament,
      tournaments: await listHostedTournaments(),
    });
  } catch (error) {
    console.error('Tournament event save failed', error);
    return json(500, { error: 'Tournament event storage is not available yet.' });
  }
}

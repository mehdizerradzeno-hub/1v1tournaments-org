import { connectLambda } from '@netlify/blobs';

import { accountCanonicalId, cleanText } from './_account-utils.mjs';
import { requireTournamentAdmin } from './_host-auth.mjs';
import { isTournamentReadOnlyHistory } from '../../src/lib/adminTournamentVisibility.js';
import { siteData } from '../../src/lib/siteData.js';
import {
  createHostedTournament,
  deleteHostedTournament,
  listHostedTournaments,
  listPublicHostedTournaments,
  loadHostedTournament,
  loadHostedTournamentRecord,
  normalizeHostedTournament,
  saveHostedTournament,
} from './_tournament-events-utils.mjs';

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
      error: 'This tournament is read-only history and cannot be changed.',
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
    try {
      if (requestedSlug) {
        const tournament = await loadHostedTournament(requestedSlug);

        if (!tournament) {
          return json(404, { error: 'That hosted tournament was not found.' });
        }

        return json(200, {
          ok: true,
          tournament,
          tournaments: [tournament],
        });
      }

      if (cleanText(event.queryStringParameters?.scope).toLowerCase() === 'admin') {
        const adminCheck = await requireTournamentAdmin(event);

        if (adminCheck.error) {
          return json(adminCheck.error.statusCode, { error: adminCheck.error.message });
        }

        return json(200, {
          ok: true,
          hostAuth: adminCheck.method,
          tournaments: await listHostedTournaments(),
        });
      }

      return json(200, {
        ok: true,
        tournaments: await listPublicHostedTournaments(),
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

  if (!['create', 'delete', 'save', 'update', 'upsert', undefined].includes(payload.action)) {
    return json(400, { error: 'Choose a supported tournament event action.' });
  }

  if (payload.action === 'delete') {
    const tournamentSlug = cleanText(requestedSlug || payload.tournamentSlug || payload.slug);

    if (!tournamentSlug) {
      return json(400, { error: 'Choose a tournament before deleting it.' });
    }

    try {
      const historicalResponse = await historicalTournamentResponse(tournamentSlug);

      if (historicalResponse) {
        return historicalResponse;
      }

      const deletion = await deleteHostedTournament(tournamentSlug, {
        deletedBy: accountCanonicalId(adminCheck.account) || adminCheck.method,
      });

      if (deletion.blocked) {
        return json(409, {
          error: 'This tournament has an active assigned match. Finish, cancel, or archive it before deleting the event.',
          code: deletion.code,
        });
      }

      if (deletion.notFound) {
        return json(404, { error: 'That hosted tournament was not found.' });
      }

      return json(200, {
        ok: true,
        deleted: deletion.deleted,
        hostAuth: adminCheck.method,
        tournament: deletion.tournament,
        tournamentSlug,
        tournaments: await listHostedTournaments(),
      });
    } catch (error) {
      console.error('Tournament event delete failed', error);
      return json(500, { error: 'Tournament event storage is not available yet.' });
    }
  }

  const tournament = normalizeHostedTournament(payload.tournament || payload);

  if (tournament.error) {
    return json(400, { error: tournament.error });
  }

  try {
    const historicalResponse = await historicalTournamentResponse(tournament.slug);

    if (historicalResponse) {
      return historicalResponse;
    }

    if (payload.action === 'create') {
      const creation = await createHostedTournament(tournament, adminCheck.account);

      if (creation.conflict) {
        return json(409, { error: creation.error, code: creation.code });
      }

      return json(201, {
        ok: true,
        hostAuth: adminCheck.method,
        tournament: creation.tournament,
        tournaments: await listHostedTournaments(),
      });
    }

    const originalSlug = cleanText(payload.originalSlug || tournament.slug);

    if (originalSlug !== tournament.slug) {
      return json(409, {
        error: 'Event URL slugs cannot be changed after creation. Keep the existing slug while editing this tournament.',
        code: 'tournament_slug_rename_not_supported',
      });
    }

    const existing = await loadHostedTournamentRecord(tournament.slug);

    if (!existing && !siteData.tournaments.some((item) => item.slug === tournament.slug)) {
      return json(404, {
        error: 'That tournament does not exist yet. Create it before editing it.',
        code: 'tournament_not_found',
      });
    }

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

import { connectLambda } from '@netlify/blobs';

import { cleanText } from './_account-utils.mjs';
import { requireTournamentAdmin } from './_host-auth.mjs';
import {
  applyTournamentSeriesOperation,
  createTournamentSeries,
  loadTournamentSeries,
  previewTournamentSeries,
  previewTournamentSeriesOperation,
} from './_tournament-series-utils.mjs';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

export async function handler(event) {
  if (event.blobs) connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return json(204, {});

  const adminCheck = await requireTournamentAdmin(event);
  if (adminCheck.error) return json(adminCheck.error.statusCode, { error: adminCheck.error.message });

  if (event.httpMethod === 'GET') {
    const seriesId = cleanText(event.queryStringParameters?.seriesId);
    if (!seriesId) return json(400, { error: 'Choose a tournament series.' });

    const series = await loadTournamentSeries(seriesId);
    return series ? json(200, { ok: true, series }) : json(404, { error: 'That tournament series was not found.' });
  }

  if (event.httpMethod !== 'POST') return json(405, { error: 'Use GET or POST for tournament series.' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Tournament series payload must be valid JSON.' });
  }

  try {
    if (payload.action === 'preview-create') {
      return json(200, { ok: true, preview: previewTournamentSeries(payload, adminCheck.account) });
    }

    if (payload.action === 'create') {
      const result = await createTournamentSeries(payload, adminCheck.account);
      if (result.conflict) return json(409, result);
      return json(result.created ? 201 : 200, { ok: true, ...result });
    }

    if (payload.action === 'preview-operation') {
      const preview = await previewTournamentSeriesOperation(payload, adminCheck.account);
      if (preview.notFound) return json(404, preview);
      if (preview.conflict) return json(409, preview);
      return json(200, { ok: true, preview });
    }

    if (payload.action === 'apply-operation') {
      const result = await applyTournamentSeriesOperation(payload, adminCheck.account);
      if (result.notFound) return json(404, result);
      if (result.conflict) return json(409, result);
      return json(200, { ok: true, ...result });
    }

    return json(400, { error: 'Choose a supported tournament series action.' });
  } catch (error) {
    console.error('Tournament series operation failed', error);
    return json(400, { error: error instanceof Error ? error.message : 'Tournament series operation failed.' });
  }
}

import { connectLambda } from '@netlify/blobs';

import { accountCanonicalId, cleanText } from './_account-utils.mjs';
import {
  loadEuchrePilotPolicy,
  loadEuchrePilotReadiness,
  saveEuchrePilotPolicy,
} from './_euchre-pilot-utils.mjs';
import { requireTournamentAdmin } from './_host-auth.mjs';
import { loadHostedTournament } from './_tournament-events-utils.mjs';
import {
  normalizeEuchrePilotPolicy,
  normalizePilotCanonicalAccountId,
  validateEuchrePilotConfiguration,
} from '../../src/lib/euchrePilot.js';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function pilotResponse(policy, readiness, hostAuth) {
  return {
    ok: true,
    hostAuth,
    pilot: policy,
    readiness,
    recovery: {
      reconnect: 'The participant reopens Play My Match to reuse the active assignment safely.',
      callbackRetry: 'Euchre owns durable callback retry. Refresh this view to confirm delivery.',
      noShow: 'Use the authenticated host winner control for the present player after venue policy is satisfied.',
    },
    limitations: {
      roomConnectionTelemetry: false,
      callbackRetryControl: false,
    },
  };
}

export async function handler(event) {
  if (event.blobs) connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return json(405, { error: 'Use GET to inspect an invited pilot or POST to configure it.' });
  }

  const adminCheck = await requireTournamentAdmin(event);

  if (adminCheck.error) {
    return json(adminCheck.error.statusCode, { error: adminCheck.error.message });
  }

  let payload = {};

  if (event.httpMethod === 'POST') {
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'Pilot admin payload must be valid JSON.' });
    }
  }

  const tournamentSlug = cleanText(
    event.queryStringParameters?.slug || payload.tournamentSlug,
  );

  if (!tournamentSlug) {
    return json(400, { error: 'Choose an Euchre tournament before managing its pilot.' });
  }

  try {
    const tournament = await loadHostedTournament(tournamentSlug);

    if (!tournament) {
      return json(404, { error: 'Create the hosted tournament before configuring its invited pilot.' });
    }

    if (tournament.gameSlug !== 'euchre') {
      return json(409, { error: 'Invited Euchre pilot controls can only be attached to an Euchre tournament.' });
    }

    if (event.httpMethod === 'GET') {
      const policy = await loadEuchrePilotPolicy(tournamentSlug);

      if (!policy) {
        return json(404, { error: 'This tournament does not have an invited Euchre pilot policy yet.' });
      }

      return json(200, pilotResponse(
        policy,
        await loadEuchrePilotReadiness(policy),
        adminCheck.method,
      ));
    }

    if (!['configure', 'set-check-in'].includes(payload.action)) {
      return json(400, { error: 'Choose configure or set-check-in for the invited pilot.' });
    }

    const existing = await loadEuchrePilotPolicy(tournamentSlug);
    let policy;

    if (payload.action === 'configure') {
      const validation = validateEuchrePilotConfiguration(payload);

      if (validation.error) return json(400, { error: validation.error });

      const now = new Date().toISOString();
      const invitedSet = new Set(validation.invitedCanonicalAccountIds);
      policy = normalizeEuchrePilotPolicy({
        ...existing,
        tournamentSlug,
        enabled: true,
        capacity: validation.capacity,
        invitedCanonicalAccountIds: validation.invitedCanonicalAccountIds,
        checkedInCanonicalAccountIds: (existing?.checkedInCanonicalAccountIds || [])
          .filter((canonicalAccountId) => invitedSet.has(canonicalAccountId)),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        updatedBy: accountCanonicalId(adminCheck.account) || adminCheck.method,
      });
    } else {
      if (!existing?.enabled) {
        return json(409, { error: 'Configure the invited pilot before recording check-in.' });
      }

      const canonicalAccountId = normalizePilotCanonicalAccountId(payload.canonicalAccountId);

      if (!canonicalAccountId || !existing.invitedCanonicalAccountIds.includes(canonicalAccountId)) {
        return json(403, { error: 'Only an admitted canonical account can be checked in.' });
      }

      const readiness = await loadEuchrePilotReadiness(existing);
      const registered = readiness.registeredPlayers.some((player) => (
        player.canonicalAccountId === canonicalAccountId
      ));

      if (!registered) {
        return json(409, { error: 'The admitted player must register before the host checks them in.' });
      }

      const checkedInSet = new Set(existing.checkedInCanonicalAccountIds);
      if (payload.checkedIn === false) checkedInSet.delete(canonicalAccountId);
      else checkedInSet.add(canonicalAccountId);

      policy = normalizeEuchrePilotPolicy({
        ...existing,
        checkedInCanonicalAccountIds: [...checkedInSet],
        updatedAt: new Date().toISOString(),
        updatedBy: accountCanonicalId(adminCheck.account) || adminCheck.method,
      });
    }

    const saved = await saveEuchrePilotPolicy(policy);
    return json(200, pilotResponse(
      saved,
      await loadEuchrePilotReadiness(saved),
      adminCheck.method,
    ));
  } catch (error) {
    console.error('Invited Euchre pilot management failed', error);
    return json(500, { error: 'Invited Euchre pilot storage is not available yet.' });
  }
}

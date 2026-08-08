import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  buildEuchrePilotReadiness,
  evaluateEuchrePilotSignupAccess,
  normalizeInvitedCanonicalAccountIds,
  validateEuchrePilotConfiguration,
} from '../src/lib/euchrePilot.js';

const ids = Array.from({ length: 8 }, (_, index) => `acct_00000000-0000-4000-8000-00000000000${index}`);

test('invited pilot configuration accepts only unique canonical IDs for 4 or 8 seats', () => {
  assert.deepEqual(normalizeInvitedCanonicalAccountIds([ids[0], ids[0], 'legacy-1']), [ids[0]]);
  assert.equal(validateEuchrePilotConfiguration({ capacity: 6, invitedCanonicalAccountIds: [] }).error.length > 0, true);
  assert.equal(validateEuchrePilotConfiguration({ capacity: 4, invitedCanonicalAccountIds: [ids[0], ids[0]] }).error.length > 0, true);
  assert.deepEqual(validateEuchrePilotConfiguration({ capacity: 8, invitedCanonicalAccountIds: ids }), {
    capacity: 8,
    invitedCanonicalAccountIds: ids,
  });
});

test('signup access requires an explicitly admitted canonical account and preserves non-pilot behavior', () => {
  const policy = { enabled: true, capacity: 4, invitedCanonicalAccountIds: ids.slice(0, 4) };

  assert.equal(evaluateEuchrePilotSignupAccess(null, '').allowed, true);
  assert.deepEqual(evaluateEuchrePilotSignupAccess(policy, 'legacy-account').code, 'canonical_identity_required');
  assert.deepEqual(evaluateEuchrePilotSignupAccess(policy, ids[5]).code, 'not_admitted');
  assert.deepEqual(evaluateEuchrePilotSignupAccess(policy, ids[0], { signupCount: 4 }).code, 'pilot_full');
  assert.deepEqual(evaluateEuchrePilotSignupAccess(policy, ids[0], { existing: true, signupCount: 4 }).code, 'admitted');
});

test('pilot readiness separates admission, registration, check-in, assignment, and callback state', () => {
  const policy = {
    tournamentSlug: 'pilot-4',
    enabled: true,
    capacity: 4,
    invitedCanonicalAccountIds: ids.slice(0, 4),
    checkedInCanonicalAccountIds: ids.slice(0, 2),
  };
  const signups = ids.slice(0, 3).map((canonicalAccountId, index) => ({
    id: `signup-${index}`,
    canonicalAccountId,
    playerName: `Player ${index + 1}`,
  }));
  const bracket = {
    status: 'published',
    rounds: [{
      title: 'Semifinal',
      matches: [{
        id: 'pilot-4-r1-m1',
        status: 'final',
        players: [
          { id: 'signup-0', canonicalAccountId: ids[0], name: 'Player 1' },
          { id: 'signup-1', canonicalAccountId: ids[1], name: 'Player 2' },
        ],
        winnerName: 'Player 1',
        completion: { completionId: 'completion-1' },
      }, {
        id: 'pilot-4-r1-m2',
        status: 'pending',
        players: [
          { id: 'signup-2', canonicalAccountId: ids[2], name: 'Player 3' },
          null,
        ],
      }, {
        id: 'pilot-4-r1-m3',
        status: 'pending',
        players: [
          null,
          { id: 'signup-3', canonicalAccountId: ids[3], name: 'Player 4' },
        ],
      }],
    }],
  };
  const readiness = buildEuchrePilotReadiness({ policy, signups, bracket });

  assert.equal(readiness.admittedPlayers.length, 4);
  assert.equal(readiness.registeredPlayers.length, 3);
  assert.equal(readiness.checkedInPlayers.length, 2);
  assert.equal(readiness.missingPlayers.length, 2);
  assert.equal(readiness.completedResults.length, 1);
  assert.equal(readiness.callbackConfirmedCount, 1);
  assert.equal(readiness.assignedMatches[0].roomConnectionStatus, 'complete');
  assert.equal(readiness.assignedMatches[0].callbackStatus, 'confirmed');
  assert.deepEqual(readiness.assignedMatches[0].players.map((player) => player.seat), ['North', 'South']);
  assert.deepEqual(readiness.assignedMatches[1].players.map((player) => player.seat), ['North']);
  assert.deepEqual(readiness.assignedMatches[2].players.map((player) => player.seat), ['South']);
  assert.equal(readiness.readyToStart, false);
  assert.equal(readiness.roomTelemetryAvailable, false);
});

test('pilot admin route and private host endpoint exist without changing public Euchre discovery', () => {
  const route = fileURLToPath(new URL('../app/admin/euchre-pilot.jsx', import.meta.url));
  const endpoint = fileURLToPath(new URL('../netlify/functions/tournament-pilot.mjs', import.meta.url));
  const signup = fileURLToPath(new URL('../netlify/functions/tournament-signup.mjs', import.meta.url));
  const siteData = fileURLToPath(new URL('../src/lib/siteData.js', import.meta.url));

  assert.equal(existsSync(route), true);
  const endpointSource = readFileSync(endpoint, 'utf8');

  assert.match(endpointSource, /requireTournamentAdmin/);
  assert.match(endpointSource, /roomConnectionTelemetry: false/);
  assert.match(endpointSource, /tournament\.gameSlug !== 'euchre'/);
  assert.match(endpointSource, /only be attached to an Euchre tournament/);
  assert.match(readFileSync(signup, 'utf8'), /evaluateEuchrePilotSignupAccess/);
  assert.match(readFileSync(siteData, 'utf8'), /Current tournament operations are Spades-only/);
});

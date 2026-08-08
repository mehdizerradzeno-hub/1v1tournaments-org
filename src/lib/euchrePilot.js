export const EUCHRE_PILOT_PROTOCOL_VERSION = '2026-08-04';
export const EUCHRE_PILOT_CAPACITIES = Object.freeze([4, 8]);

function cleanText(value, maxLength = 160) {
  return String(value || '').trim().slice(0, maxLength);
}

export function normalizePilotCanonicalAccountId(value) {
  const canonicalAccountId = cleanText(value, 128);

  return /^acct_[A-Za-z0-9-]{8,123}$/.test(canonicalAccountId)
    ? canonicalAccountId
    : '';
}

export function normalizeInvitedCanonicalAccountIds(value) {
  const incoming = Array.isArray(value)
    ? value
    : String(value || '').split(/[\s,]+/);

  return [...new Set(incoming.map(normalizePilotCanonicalAccountId).filter(Boolean))];
}

export function normalizeEuchrePilotPolicy(value = {}) {
  const capacity = Number.parseInt(value.capacity, 10);
  const invitedCanonicalAccountIds = normalizeInvitedCanonicalAccountIds(
    value.invitedCanonicalAccountIds,
  );
  const invitedSet = new Set(invitedCanonicalAccountIds);
  const checkedInCanonicalAccountIds = normalizeInvitedCanonicalAccountIds(
    value.checkedInCanonicalAccountIds,
  ).filter((canonicalAccountId) => invitedSet.has(canonicalAccountId));

  return {
    protocolVersion: EUCHRE_PILOT_PROTOCOL_VERSION,
    tournamentSlug: cleanText(value.tournamentSlug, 120),
    game: 'euchre',
    access: 'invite-only',
    enabled: value.enabled !== false,
    capacity: EUCHRE_PILOT_CAPACITIES.includes(capacity) ? capacity : 4,
    invitedCanonicalAccountIds,
    checkedInCanonicalAccountIds,
    createdAt: cleanText(value.createdAt, 80),
    updatedAt: cleanText(value.updatedAt, 80),
    updatedBy: cleanText(value.updatedBy, 160),
  };
}

export function validateEuchrePilotConfiguration(value = {}) {
  const capacity = Number.parseInt(value.capacity, 10);
  const rawIds = Array.isArray(value.invitedCanonicalAccountIds)
    ? value.invitedCanonicalAccountIds
    : String(value.invitedCanonicalAccountIds || '').split(/[\s,]+/).filter(Boolean);
  const normalizedIds = normalizeInvitedCanonicalAccountIds(rawIds);

  if (!EUCHRE_PILOT_CAPACITIES.includes(capacity)) {
    return { error: 'Invited Euchre pilots must have a 4-player or 8-player cap.' };
  }

  if (normalizedIds.length !== rawIds.length) {
    return { error: 'Every admitted player must have one valid, unique acct_ canonical account ID.' };
  }

  if (normalizedIds.length > capacity) {
    return { error: `This pilot has ${normalizedIds.length} admitted players but only ${capacity} seats.` };
  }

  return {
    capacity,
    invitedCanonicalAccountIds: normalizedIds,
  };
}

export function evaluateEuchrePilotSignupAccess(policy, canonicalAccountId, options = {}) {
  if (!policy?.enabled) {
    return { allowed: true, code: 'pilot_not_enabled' };
  }

  const normalizedPolicy = normalizeEuchrePilotPolicy(policy);
  const normalizedAccountId = normalizePilotCanonicalAccountId(canonicalAccountId);

  if (!normalizedAccountId) {
    return {
      allowed: false,
      code: 'canonical_identity_required',
      message: 'A canonical 1v1 account is required for this invited Euchre pilot.',
    };
  }

  if (!normalizedPolicy.invitedCanonicalAccountIds.includes(normalizedAccountId)) {
    return {
      allowed: false,
      code: 'not_admitted',
      message: 'This account is not on the invited player list for this Euchre pilot.',
    };
  }

  if (!options.existing && Number(options.signupCount || 0) >= normalizedPolicy.capacity) {
    return {
      allowed: false,
      code: 'pilot_full',
      message: 'This invited Euchre pilot has reached its player cap.',
    };
  }

  return { allowed: true, code: 'admitted' };
}

function signupCanonicalAccountId(signup) {
  return normalizePilotCanonicalAccountId(
    signup?.canonicalAccountId || signup?.accountCanonicalId,
  );
}

function publicPilotPlayer(signup, canonicalAccountId, checkedIn) {
  return {
    canonicalAccountId,
    playerName: cleanText(signup?.playerName, 120),
    playerHandle: cleanText(signup?.playerHandle, 80),
    registered: Boolean(signup),
    checkedIn,
  };
}

export function buildEuchrePilotReadiness({ policy, signups = [], bracket = null } = {}) {
  const normalizedPolicy = normalizeEuchrePilotPolicy(policy);
  const signupsByCanonicalId = new Map(
    signups
      .map((signup) => [signupCanonicalAccountId(signup), signup])
      .filter(([canonicalAccountId]) => canonicalAccountId),
  );
  const checkedInSet = new Set(normalizedPolicy.checkedInCanonicalAccountIds);
  const admittedPlayers = normalizedPolicy.invitedCanonicalAccountIds.map((canonicalAccountId) => (
    publicPilotPlayer(
      signupsByCanonicalId.get(canonicalAccountId),
      canonicalAccountId,
      checkedInSet.has(canonicalAccountId),
    )
  ));
  const assignedMatches = (bracket?.rounds || []).flatMap((round) => (
    (round.matches || []).map((match) => {
      const players = (match.players || []).map((player, seatIndex) => player ? ({
        participantId: player.id,
        canonicalAccountId: normalizePilotCanonicalAccountId(player.canonicalAccountId || player.accountId),
        name: cleanText(player.name, 120),
        seatIndex,
        seat: seatIndex === 0 ? 'North' : 'South',
      }) : null).filter(Boolean);
      const final = match.status === 'final';

      return {
        id: match.id,
        round: round.title,
        status: match.status,
        players,
        winnerName: cleanText(match.winnerName, 120),
        roomConnectionStatus: final
          ? 'complete'
          : match.status === 'ready'
            ? 'telemetry-unavailable'
            : 'not-open',
        callbackStatus: match.completion
          ? 'confirmed'
          : final
            ? 'host-resolved'
            : 'pending',
        completionId: cleanText(match.completion?.completionId, 160),
      };
    })
  ));
  const checkedInPlayers = admittedPlayers.filter((player) => player.checkedIn);
  const missingPlayers = admittedPlayers.filter((player) => !player.registered || !player.checkedIn);
  const completedResults = assignedMatches.filter((match) => match.status === 'final');

  return {
    tournamentSlug: normalizedPolicy.tournamentSlug,
    capacity: normalizedPolicy.capacity,
    admittedPlayers,
    registeredPlayers: admittedPlayers.filter((player) => player.registered),
    checkedInPlayers,
    missingPlayers,
    assignedMatches,
    completedResults,
    callbackConfirmedCount: completedResults.filter((match) => match.callbackStatus === 'confirmed').length,
    advancementStatus: bracket?.winner
      ? 'champion-confirmed'
      : bracket
        ? 'bracket-active'
        : 'not-started',
    champion: bracket?.winner
      ? {
          participantId: bracket.winner.id,
          canonicalAccountId: normalizePilotCanonicalAccountId(
            bracket.winner.canonicalAccountId || bracket.winner.accountId,
          ),
          name: cleanText(bracket.winner.name, 120),
        }
      : null,
    readyToStart: admittedPlayers.length === normalizedPolicy.capacity
      && admittedPlayers.every((player) => player.registered && player.checkedIn)
      && !bracket,
    roomTelemetryAvailable: false,
  };
}

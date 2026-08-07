const DEFAULT_LEAGUE_GAME = 'spades';
const DEFAULT_TIME_ZONE = 'America/New_York';
const DEFAULT_ROOM_PREFIX = 'https://1v1spades.com/match';
const MIN_PLAYER_CAP = 2;
const MAX_PLAYER_CAP = 128;

function cleanText(value, fallback = '') {
  return String(value || '').trim().slice(0, 500);
}

function cleanId(value, fallback = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '') || fallback;
}

function cleanGame(value, fallback = DEFAULT_LEAGUE_GAME) {
  const raw = cleanText(value, fallback).toLowerCase();
  return ['spades', 'euchre'].includes(raw) ? raw : fallback;
}

function cleanStatus(value, fallback = 'active') {
  const status = cleanText(value, fallback).toLowerCase();
  return ['active', 'paused', 'archived', 'complete', 'draft'].includes(status) ? status : fallback;
}

function cleanVisibility(value, fallback = 'public') {
  const visibility = cleanText(value, fallback).toLowerCase();
  return ['public', 'private', 'unlisted'].includes(visibility) ? visibility : fallback;
}

function normalizeDate(value) {
  const raw = cleanText(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function toInt(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function canonicalIdentityKey(identity) {
  const canonical = cleanText(identity?.canonicalAccountId, identity?.accountId, identity?.id);
  const accountId = cleanText(identity?.accountId);
  const email = cleanText(identity?.accountEmail, identity?.email);

  if (canonical) return canonical;
  if (accountId) return accountId;
  return email;
}

function normalizeDivision(value) {
  return cleanText(value, 'Open');
}

function findPlayerIndex(players, identity) {
  const canonical = canonicalIdentityKey(identity);
  const accountId = cleanText(identity?.accountId);
  const email = cleanText(identity?.accountEmail, identity?.email);
  const display = cleanText(identity?.displayName, identity?.playerName);

  return players.findIndex((player) => (
    (canonical && player?.canonicalAccountId && player.canonicalAccountId === canonical)
    || (accountId && player.accountId === accountId)
    || (email && player.accountEmail === email)
    || (display && player.displayName === display)
  ));
}

function normalizeVenue(payload = {}) {
  const venuePayload = payload.venue || payload;
  return {
    venueId: cleanText(venuePayload.venueId || venuePayload.id, ''),
    name: cleanText(venuePayload.name || venuePayload.venueName, 'Online'),
    address: cleanText(venuePayload.address || venuePayload.venueAddress),
    mode: cleanText(venuePayload.mode || venuePayload.venueMode || 'online', 'online'),
    table: cleanText(venuePayload.table || venuePayload.venueTable),
    notes: cleanText(venuePayload.notes || venuePayload.venueNotes),
    url: cleanText(venuePayload.url || venuePayload.link),
  };
}

function normalizeCompetitionSettings(payload = {}) {
  const scheduleFormat = cleanText(payload.scheduleFormat || payload.regularFormat || payload.season?.scheduleFormat, 'single-round-robin');
  const normalizedSchedule = ['single-round-robin', 'double-round-robin'].includes(scheduleFormat)
    ? scheduleFormat
    : 'single-round-robin';

  return {
    scheduleFormat: normalizedSchedule,
    regularWeeks: toInt(payload.regularWeeks, 0, 0, 52),
    matchesPerPlayer: Math.max(1, toInt(payload.matchesPerPlayer, 1, 1, 200)),
    doubleRoundRobin: Boolean(payload.doubleRoundRobin || payload.scheduleFormat === 'double-round-robin'),
    byeEnabled: payload.byeEnabled !== false,
    playoffEnabled: Boolean(payload.playoffEnabled),
    playoffSize: toInt(payload.playoffSize || payload.playoff?.size, 0, 0, 64),
    playoffFormat: cleanText(payload.playoffFormat || payload.playoff?.format, 'single-elimination'),
    weekDay: cleanText(payload.weekDay || payload.weeklyPlayDay || 'Sunday', 'Sunday'),
    winValue: Number.isFinite(Number.parseFloat(payload.winValue)) ? Number.parseFloat(payload.winValue) : 1,
    lossValue: Number.isFinite(Number.parseFloat(payload.lossValue)) ? Number.parseFloat(payload.lossValue) : 0,
    tieValue: Number.isFinite(Number.parseFloat(payload.tieValue)) ? Number.parseFloat(payload.tieValue) : 0,
    primaryTieBreaker: cleanText(payload.primaryTieBreaker, 'win_percent'),
    secondaryTieBreaker: cleanText(payload.secondaryTieBreaker, 'point_differential'),
  };
}

function normalizeSeason(payload = {}) {
  return {
    id: cleanText(payload.id || payload.seasonId, 'season-1'),
    name: cleanText(payload.name || payload.seasonName, 'Season 1'),
    startDate: normalizeDate(payload.startDate || payload.seasonStartDate),
    endDate: normalizeDate(payload.endDate || payload.seasonEndDate),
    registrationStart: normalizeDate(payload.registrationStart || payload.registrationStartDate),
    registrationEnd: normalizeDate(payload.registrationEnd || payload.registrationEndDate),
    scheduleFormat: cleanText(payload.scheduleFormat || payload.schedule?.format, 'weekly-rounds'),
    playoffFormat: cleanText(payload.playoffFormat || payload.playoff?.format, 'single-elimination'),
    weekDay: cleanText(payload.weekDay || payload.weeklyPlayDay || 'Sunday', 'Sunday'),
    startTime: cleanText(payload.startTime, '18:00'),
    startTimeZone: cleanText(payload.timeZone || payload.timeZoneName || DEFAULT_TIME_ZONE),
    weeklyPlayDay: cleanText(payload.weeklyPlayDay || payload.weekDay, 'Sunday'),
    weeklyPlayTime: cleanText(payload.weeklyPlayTime || payload.startTime, '18:00'),
    isActive: Boolean(payload.isActive !== false),
  };
}

function normalizeParticipant(payload = {}) {
  const canonicalAccountId = cleanText(payload.canonicalAccountId, payload.accountId, payload.id);
  const accountId = cleanText(payload.accountId, canonicalAccountId);
  return {
    accountId,
    accountEmail: cleanText(payload.accountEmail, payload.email, payload.contactEmail),
    canonicalAccountId,
    displayName: cleanText(payload.displayName || payload.playerName, 'Player'),
    division: normalizeDivision(payload.division),
    eligibility: cleanText(payload.eligibility, 'eligible'),
    status: cleanText(payload.status, 'enrolled'),
    joinedAt: normalizeDate(payload.joinedAt || payload.createdAt || new Date().toISOString()),
    waitlistedAt: normalizeDate(payload.waitlistedAt),
    deactivatedAt: normalizeDate(payload.deactivatedAt),
    notes: cleanText(payload.notes || payload.note),
    matchAssignments: Array.isArray(payload.matchAssignments) ? payload.matchAssignments : [],
  };
}

function normalizeMatchResult(value = {}) {
  const homeScore = Number.parseInt(value.homeScore, 10);
  const awayScore = Number.parseInt(value.awayScore, 10);

  return {
    winner: cleanText(value.winner, value.winnerId ? 'home' : ''),
    winnerId: cleanText(value.winnerId),
    homeScore: Number.isFinite(homeScore) ? String(homeScore) : '0',
    awayScore: Number.isFinite(awayScore) ? String(awayScore) : '0',
    tie: Boolean(value.tie),
    forfeit: Boolean(value.forfeit),
    noShow: Boolean(value.noShow),
    dispute: Boolean(value.dispute),
    source: cleanText(value.source),
    callbackId: cleanText(value.callbackId),
    completedAt: normalizeDate(value.completedAt || new Date().toISOString()),
    reason: cleanText(value.reason),
    correctedBy: cleanText(value.correctedBy),
    correctedAt: normalizeDate(value.correctedAt),
  };
}

function normalizeMatch(payload = {}) {
  const asTeam = (value = {}) => ({
    canonicalAccountId: cleanText(value.canonicalAccountId || value.accountId || value.id),
    accountId: cleanText(value.accountId),
    displayName: cleanText(value.displayName, 'TBD'),
  });

  const homeTeam = payload.homeTeam ? asTeam(payload.homeTeam) : null;
  const awayTeam = payload.awayTeam ? asTeam(payload.awayTeam) : null;

  return {
    id: cleanText(payload.id),
    gameSlug: cleanGame(payload.gameSlug || payload.leagueGame || payload.launchGame),
    leagueId: cleanText(payload.leagueId),
    seasonId: cleanText(payload.seasonId),
    divisionId: cleanText(payload.divisionId),
    weekIndex: toInt(payload.weekIndex || payload.seasonWeek, 1, 1, 520),
    seasonWeek: toInt(payload.seasonWeek || payload.weekIndex, 1, 1, 520),
    scheduledFor: normalizeDate(payload.scheduledFor),
    status: cleanText(payload.status, 'scheduled'),
    homePlayerId: cleanText(payload.homePlayerId || payload.homeTeam?.canonicalAccountId || payload.homeTeam?.accountId),
    awayPlayerId: cleanText(payload.awayPlayerId || payload.awayTeam?.canonicalAccountId || payload.awayTeam?.accountId),
    homeTeam,
    awayTeam,
    venue: cleanText(payload.venue || payload.venueName || 'online'),
    roomUrl: cleanText(payload.roomUrl),
    launchGame: cleanGame(payload.launchGame),
    roomLaunchedAt: normalizeDate(payload.roomLaunchedAt),
    callbackIds: Array.isArray(payload.callbackIds) ? [...payload.callbackIds] : [],
    result: payload.result ? normalizeMatchResult(payload.result) : null,
    resultHistory: Array.isArray(payload.resultHistory) ? payload.resultHistory.map(normalizeMatchResult) : [],
    createdAt: normalizeDate(payload.createdAt || new Date().toISOString()),
    updatedAt: normalizeDate(payload.updatedAt || new Date().toISOString()),
  };
}

function dedupeRecords(values = [], selector = (value) => cleanText(value?.id)) {
  const seen = new Set();
  return values.filter((value) => {
    const key = selector(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildLeagueRecord(payload = {}) {
  const now = new Date().toISOString();
  const leagueId = cleanId(payload.id || payload.slug || payload.leagueId, `league-${Math.random().toString(36).slice(2, 9)}`);

  const season = normalizeSeason(payload.season || payload);
  const settings = normalizeCompetitionSettings(payload.competition || payload.seasonConfig || payload);
  const participants = Array.isArray(payload.participants) ? payload.participants.map(normalizeParticipant) : [];

  return {
    id: leagueId,
    slug: cleanId(payload.slug || leagueId, leagueId),
    name: cleanText(payload.name, 'League'),
    description: cleanText(payload.description || payload.summary),
    status: cleanStatus(payload.status),
    visibility: cleanVisibility(payload.visibility, payload.publicity),
    gameSlug: cleanGame(payload.gameSlug || payload.game || DEFAULT_LEAGUE_GAME),
    venue: normalizeVenue(payload.venue || payload),
    rulesetReference: cleanText(payload.rulesetReference || payload.ruleset),
    organizer: cleanText(payload.organizer || payload.admin || payload.host),
    startDate: normalizeDate(payload.startDate || payload.startAt),
    endDate: normalizeDate(payload.endDate || payload.endAt),
    seasonRegistrationStart: normalizeDate(payload.seasonRegistrationStart || payload.registrationStart),
    seasonRegistrationEnd: normalizeDate(payload.seasonRegistrationEnd || payload.registrationEnd),
    registrationOpen: payload.registrationOpen !== false,
    playerCap: toInt(payload.playerCap || payload.maxPlayers, 16, MIN_PLAYER_CAP, MAX_PLAYER_CAP),
    weeklyPlayDay: cleanText(payload.weeklyPlayDay || payload.weekDay || settings.weekDay, 'Sunday'),
    weeklyPlayTime: cleanText(payload.weeklyPlayTime || payload.startTime || '18:00'),
    timeZone: cleanText(payload.timeZone || DEFAULT_TIME_ZONE),
    seasonConfig: settings,
    currentSeasonId: cleanText(payload.currentSeasonId || season.id),
    season,
    participants,
    players: participants.length,
    schedule: dedupeRecords(Array.isArray(payload.schedule) ? payload.schedule : [], (entry) => cleanText(entry?.week || entry?.id)),
    matches: dedupeRecords(Array.isArray(payload.matches) ? payload.matches.map(normalizeMatch) : []),
    standings: Array.isArray(payload.standings) ? payload.standings : [],
    createdAt: normalizeDate(payload.createdAt || now),
    updatedAt: normalizeDate(payload.updatedAt || now),
    archivedAt: normalizeDate(payload.archivedAt),
    updatedBy: cleanText(payload.updatedBy),
    createdBy: cleanText(payload.createdBy),
  };
}

export function joinLeagueRecord(league, identity = {}, options = {}) {
  const record = buildLeagueRecord(league);
  const players = [...record.participants];
  const canonical = canonicalIdentityKey(identity);

  const index = findPlayerIndex(players, { ...identity, canonicalAccountId: canonical });
  const playerName = cleanText(identity.displayName || identity.playerName || identity.name, 'Player');

  if (index >= 0) {
    const existing = players[index];
    const next = {
      ...existing,
      displayName: cleanText(existing.displayName || playerName),
      accountEmail: cleanText(existing.accountEmail || identity.accountEmail || identity.email),
      canonicalAccountId: cleanText(existing.canonicalAccountId || canonical),
      status: existing.status === 'waitlist' && !options.deactivateOnly ? 'enrolled' : existing.status,
      joinedAt: existing.status === 'waitlist' ? new Date().toISOString() : (existing.joinedAt || new Date().toISOString()),
      waitlistedAt: existing.status === 'waitlist' ? '' : existing.waitlistedAt,
    };

    players[index] = next;
    return { league: { ...record, participants: players }, changed: false, waitlisted: next.status === 'waitlist', promoted: null };
  }

  const capacityActive = players.filter((p) => p.status !== 'waitlist' && p.status !== 'removed' && p.status !== 'inactive').length;
  const shouldWaitlist = capacityActive >= record.playerCap;

  const nextPlayer = normalizeParticipant({
    ...identity,
    accountId: identity.accountId || identity.id,
    canonicalAccountId: canonical,
    displayName: playerName,
    status: shouldWaitlist ? 'waitlist' : 'enrolled',
    waitlistedAt: shouldWaitlist ? new Date().toISOString() : '',
  });

  const nextPlayers = [...players, nextPlayer];
  return {
    league: { ...record, participants: nextPlayers, players: nextPlayers.length },
    changed: true,
    waitlisted: shouldWaitlist,
    promoted: null,
  };
}

export function leaveLeagueRecord(league, identity = {}, options = {}) {
  const record = buildLeagueRecord(league);
  const players = [...record.participants];
  const index = findPlayerIndex(players, identity);

  if (index < 0) {
    return { league: record, changed: false, promoted: null };
  }

  const departing = players[index];
  const hadActiveSeat = departing.status !== 'waitlist' && departing.status !== 'removed' && departing.status !== 'inactive';

  players.splice(index, 1);

  let promoted = null;
  if (hadActiveSeat) {
    const waitlistIndex = players.findIndex((entry) => entry.status === 'waitlist');
    if (waitlistIndex >= 0) {
      players[waitlistIndex] = {
        ...players[waitlistIndex],
        status: 'enrolled',
        waitlistedAt: '',
        joinedAt: new Date().toISOString(),
      };
      promoted = players[waitlistIndex].canonicalAccountId || players[waitlistIndex].accountId;
    }
  }

  if (options.deactivateOnly) {
    players.push({
      ...departing,
      status: 'inactive',
      deactivatedAt: new Date().toISOString(),
    });
  }

  return {
    league: { ...record, participants: players, players: players.length },
    changed: true,
    promoted,
  };
}

export function promoteFromWaitlist(record, identity = {}) {
  const league = buildLeagueRecord(record);
  const players = [...league.participants];
  const index = players.findIndex((player) => {
    const match = findPlayerIndex([player], identity);
    return match >= 0 && player.status === 'waitlist';
  });

  if (index < 0) {
    return { league, changed: false };
  }

  players[index] = {
    ...players[index],
    status: 'enrolled',
    waitlistedAt: '',
    joinedAt: players[index].joinedAt || new Date().toISOString(),
  };

  return { league: { ...league, participants: players }, changed: true };
}

export function buildLeagueMatchRoomUrl(league, match, options = {}) {
  const leagueId = cleanText(league?.id || league?.leagueId);
  const matchId = cleanText(match?.id);
  const gameSlug = cleanGame(match?.gameSlug || league?.gameSlug);
  const configuredPrefixes = options.gameMatchBaseUrls || {};
  const roomPrefix = cleanText(
    configuredPrefixes[gameSlug] || (gameSlug === 'spades' ? DEFAULT_ROOM_PREFIX : ''),
  ).replace(/\/$/, '');

  if (!matchId || !roomPrefix) return '';
  return `${roomPrefix}/${leagueId}-${matchId}`;
}

function canonicalMatchIdentity(match, winnerId) {
  const value = cleanText(winnerId);
  if (!value) return '';

  const teams = [match.homeTeam, match.awayTeam].filter(Boolean);
  const team = teams.find((candidate) => (
    cleanText(candidate.canonicalAccountId) === value
    || cleanText(candidate.accountId) === value
  ));
  return cleanText(team?.canonicalAccountId || value);
}

function resultSignature(result = {}) {
  return JSON.stringify({
    winner: cleanText(result.winner),
    winnerId: cleanText(result.winnerId),
    homeScore: cleanText(result.homeScore, '0'),
    awayScore: cleanText(result.awayScore, '0'),
    forfeit: Boolean(result.forfeit),
    noShow: Boolean(result.noShow),
    tie: Boolean(result.tie),
  });
}

export function applyLeagueMatchResult(league, matchId, result = {}, options = {}) {
  const record = buildLeagueRecord(league);
  const matches = [...record.matches];
  const matchIndex = matches.findIndex((match) => match.id === cleanText(matchId));

  if (matchIndex < 0) {
    return {
      league: record,
      changed: false,
      duplicate: false,
      completeIgnored: false,
      match: null,
    };
  }

  const existing = matches[matchIndex];
  const normalized = normalizeMatchResult(result);
  const callbackId = cleanText(options.callbackId);

  const duplicate = Boolean(callbackId && existing.callbackIds.includes(callbackId));
  if (existing.status === 'complete' && duplicate && !options.force) {
    return {
      league: record,
      changed: false,
      duplicate: true,
      completeIgnored: true,
      match: existing,
    };
  }

  const nextResult = {
    ...(existing.result || {}),
    ...normalized,
    winner: normalized.winner || existing.result?.winner || '',
    winnerId: canonicalMatchIdentity(existing, normalized.winnerId) || existing.result?.winnerId || '',
    source: cleanText(normalized.source || existing.result?.source || options.source),
    completedAt: normalized.completedAt || new Date().toISOString(),
    callbackId: callbackId || existing.result?.callbackId,
  };

  const nextHistory = [...(existing.resultHistory || [])];
  if (!options.skipHistory && resultSignature(nextResult) !== resultSignature(existing.result || {})) {
    nextHistory.unshift({
      ...nextResult,
      createdAt: new Date().toISOString(),
      updatedBy: cleanText(options.updatedBy || options.source),
    });
    if (nextHistory.length > 20) nextHistory.splice(20);
  }

  const nextMatch = {
    ...existing,
    result: nextResult,
    status: nextResult.winner ? 'complete' : existing.status,
    callbackIds: callbackId
      ? [...new Set([...(existing.callbackIds || []).map(cleanText), cleanText(callbackId)])].filter(Boolean)
      : (existing.callbackIds || []),
    resultHistory: nextHistory,
    updatedAt: new Date().toISOString(),
    roomLaunchedAt: existing.roomLaunchedAt || '',
  };

  matches[matchIndex] = nextMatch;
  return {
    league: {
      ...record,
      matches,
      updatedAt: nextMatch.updatedAt,
    },
    match: nextMatch,
    changed: resultSignature(existing.result || {}) !== resultSignature(nextResult),
    duplicate,
    completeIgnored: false,
  };
}

function ensureParticipantName(record, participantId) {
  const match = record.participants.find((player) => player.canonicalAccountId === participantId || player.accountId === participantId);
  return cleanText(match?.displayName, 'TBD');
}

function participantMatchIdentity(record, participantId) {
  const participant = record.participants.find((player) => (
    player.canonicalAccountId === participantId || player.accountId === participantId
  ));

  return {
    canonicalAccountId: cleanText(participant?.canonicalAccountId || participantId),
    accountId: cleanText(participant?.accountId),
    displayName: cleanText(participant?.displayName || 'TBD'),
  };
}

export function buildLeagueStandings(league) {
  const record = buildLeagueRecord(league);
  const totals = new Map();

  const ensureTotals = (participantId, displayName = 'Player') => {
    const key = participantId || displayName;
    if (!totals.has(key)) {
      totals.set(key, {
        accountId: '',
        canonicalAccountId: participantId,
        displayName,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        currentStreak: 0,
        status: 'enrolled',
      });
    }
    return totals.get(key);
  };

  (record.matches || []).forEach((match) => {
    if (!match || match.status !== 'complete' || !match.result) return;

    const homeId = match.homeTeam?.canonicalAccountId || match.homePlayerId;
    const awayId = match.awayTeam?.canonicalAccountId || match.awayPlayerId;
    const home = ensureTotals(homeId, ensureParticipantName(record, homeId));
    const away = ensureTotals(awayId, ensureParticipantName(record, awayId));

    const homeScore = Number.parseInt(match.result.homeScore, 10) || 0;
    const awayScore = Number.parseInt(match.result.awayScore, 10) || 0;
    home.pointsFor += homeScore;
    home.pointsAgainst += awayScore;
    away.pointsFor += awayScore;
    away.pointsAgainst += homeScore;

    if (match.result.tie || match.result.winner === 'tie') {
      home.ties += 1;
      away.ties += 1;
      home.currentStreak = 0;
      away.currentStreak = 0;
      return;
    }

    const homeWon = match.result.winnerId
      ? match.result.winnerId === homeId
      : match.result.winner === 'home';

    if (homeWon) {
      home.wins += 1;
      away.losses += 1;
      home.currentStreak = home.currentStreak >= 0 ? home.currentStreak + 1 : 1;
      away.currentStreak = 0;
    } else {
      away.wins += 1;
      home.losses += 1;
      away.currentStreak = away.currentStreak >= 0 ? away.currentStreak + 1 : 1;
      home.currentStreak = 0;
    }
  });

  const active = record.participants.filter((entry) => !['removed', 'inactive'].includes(entry.status));
  active.forEach((entry) => {
    const key = entry.canonicalAccountId || entry.accountId;
    if (!totals.has(key)) {
      totals.set(key, {
        accountId: entry.accountId,
        canonicalAccountId: entry.canonicalAccountId || entry.accountId,
        displayName: entry.displayName,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        currentStreak: 0,
        status: entry.status,
      });
    }
  });

  const standings = [...totals.values()].map((entry) => {
    const wins = Number(entry.wins || 0);
    const losses = Number(entry.losses || 0);
    const ties = Number(entry.ties || 0);
    const played = wins + losses + ties;
    const winPercent = played ? Math.round(((wins + 0.5 * ties) / played) * 10000) / 100 : 0;
    const pointDifferential = (Number(entry.pointsFor) || 0) - (Number(entry.pointsAgainst) || 0);
    const source = record.participants.find((participant) => participant.canonicalAccountId === (entry.canonicalAccountId || entry.accountId));

    return {
      ...entry,
      wins,
      losses,
      ties,
      gamesPlayed: played,
      winPercent,
      pointDifferential,
      pointsFor: Number(entry.pointsFor || 0),
      pointsAgainst: Number(entry.pointsAgainst || 0),
      status: source?.status || entry.status,
    };
  });

  standings.sort((left, right) => {
    if (right.wins !== left.wins) return right.wins - left.wins;
    if (right.pointDifferential !== left.pointDifferential) return right.pointDifferential - left.pointDifferential;
    if (right.winPercent !== left.winPercent) return right.winPercent - left.winPercent;
    return right.wins + right.losses - (left.wins + left.losses);
  });

  return standings.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function buildRoundPairings(participants, doubleRoundRobin = false) {
  const ids = [...participants];
  if (ids.length < 2) return [];

  const withBye = [...ids];
  const hadBye = withBye.length % 2 === 1;
  if (hadBye) withBye.push('bye');

  const fixed = withBye[0];
  const rotating = withBye.slice(1);
  const rounds = [];
  const totalRounds = withBye.length - 1;

  for (let round = 0; round < totalRounds; round += 1) {
    const arranged = [fixed, ...rotating];
    const pairs = [];

    for (let index = 0; index < arranged.length / 2; index += 1) {
      const home = arranged[index];
      const away = arranged[arranged.length - 1 - index];
      if (home === 'bye' || away === 'bye') {
        continue;
      }
      pairs.push([home, away]);
    }

    const tail = rotating.pop();
    rotating.unshift(tail);
    rounds.push(pairs);

    if (doubleRoundRobin) {
      rounds.push([...pairs].map((pair) => pair.slice().reverse()));
    }
  }

  return rounds;
}

function leagueMatchLabel(league, weekIndex) {
  const time = cleanText(league.weeklyPlayTime, '18:00');
  const day = cleanText(league.weeklyPlayDay, 'Sunday');
  return `${day} ${time} · Week ${weekIndex}`;
}

export function leagueWeekLabel(dateText) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TIME_ZONE,
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateText || new Date()));
}

function scheduleDateForWeek(league, weekIndex) {
  const start = new Date(league.startDate || new Date());
  const dayName = cleanText(league.weeklyPlayDay, 'Sunday');
  const time = cleanText(league.weeklyPlayTime, '18:00');

  if (!Number.isFinite(start.getTime())) {
    return new Date().toISOString();
  }

  const wanted = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(dayName.toLowerCase().slice(0, 8));
  const current = start.getDay();
  const addDays = ((wanted - current) + 7) % 7;
  const date = new Date(start);
  date.setDate(date.getDate() + addDays + (weekIndex - 1) * 7);

  const [hourRaw, minuteRaw] = time.split(':');
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  if (Number.isFinite(hour) && Number.isFinite(minute)) {
    date.setHours(hour, minute, 0, 0);
  }

  return date.toISOString();
}

export function generateLeagueSchedule(league, options = {}) {
  const record = buildLeagueRecord(league);
  const weekCount = toInt(
    options.weekCount || record.seasonConfig.regularWeeks || record.season.regularWeeks,
    1,
    1,
    52,
  );

  const enrolled = record.participants.filter((player) => !['waitlist', 'removed', 'inactive'].includes(player.status));
  const enrolledIds = enrolled.map((player) => player.canonicalAccountId || player.accountId);

  const pairings = buildRoundPairings(enrolledIds, record.seasonConfig.doubleRoundRobin || false);
  const maxWeeks = Math.min(pairings.length, weekCount);
  const existing = [...record.matches];

  const matches = [];
  const schedule = [];

  for (let week = 1; week <= maxWeeks; week += 1) {
    const pairs = pairings[week - 1] || [];
    const weekMatches = pairs.map((pair, index) => {
      const matchId = `${record.id}-w${week}-${index + 1}`;
      const existingMatch = existing.find((item) => item.id === matchId);
      const home = pair[0];
      const away = pair[1];
      return {
        id: matchId,
        gameSlug: record.gameSlug,
        leagueId: record.id,
        seasonId: record.currentSeasonId || record.season?.id,
        divisionId: '',
        seasonWeek: week,
        weekIndex: week,
        scheduledFor: scheduleDateForWeek(record, week),
        weekLabel: leagueMatchLabel(record, week),
        status: existingMatch?.status === 'complete' ? 'complete' : 'scheduled',
        homePlayerId: home,
        awayPlayerId: away,
        homeTeam: participantMatchIdentity(record, home),
        awayTeam: participantMatchIdentity(record, away),
        venue: record.venue?.name || 'online',
        roomUrl: existingMatch?.roomUrl || buildLeagueMatchRoomUrl(record, { id: matchId, gameSlug: record.gameSlug }),
        roomLaunchedAt: existingMatch?.roomLaunchedAt || '',
        result: existingMatch?.status === 'complete' && existingMatch?.result ? existingMatch.result : null,
        resultHistory: existingMatch?.resultHistory || [],
        callbackIds: existingMatch?.callbackIds || [],
        createdAt: existingMatch?.createdAt || new Date().toISOString(),
        updatedAt: existingMatch?.updatedAt || new Date().toISOString(),
      };
    });

    schedule.push({
      week,
      label: `Week ${week}`,
      scheduledDate: scheduleDateForWeek(record, week),
      matches: weekMatches,
      table: record.venue?.table || 'table-1',
    });
    matches.push(...weekMatches);
  }

  const completeMatches = existing.filter((item) => item.status === 'complete' && !matches.some((candidate) => candidate.id === item.id));
  const nextMatches = [...matches, ...completeMatches];

  return {
    ...record,
    schedule,
    matches: dedupeRecords(nextMatches, (item) => item.id),
    updatedAt: new Date().toISOString(),
  };
}

export function nextLeagueMatch(league, accountIdentity = {}) {
  const record = buildLeagueRecord(league);
  const canonical = canonicalIdentityKey(accountIdentity);
  if (!canonical) return null;

  const participantMatches = (record.matches || [])
    .filter((match) => {
      if (match.status !== 'scheduled') return false;
      return (
        cleanText(match.homeTeam?.canonicalAccountId) === canonical
        || cleanText(match.awayTeam?.canonicalAccountId) === canonical
      );
    })
    .sort((left, right) => new Date(left.scheduledFor || '').getTime() - new Date(right.scheduledFor || '').getTime());

  return participantMatches[0] || null;
}

export function standingsToCsv(league) {
  const standings = buildLeagueStandings(league);
  const header = ['rank', 'player', 'wins', 'losses', 'ties', 'winPercent', 'pointsFor', 'pointsAgainst', 'pointDifferential', 'streak', 'status'];
  const lines = [header.join(',')];

  standings.forEach((row) => {
    lines.push([
      row.rank,
      `"${String(row.displayName || '').replace(/"/g, '""')}"`,
      row.wins,
      row.losses,
      row.ties,
      row.winPercent,
      row.pointsFor,
      row.pointsAgainst,
      row.pointDifferential,
      row.currentStreak,
      row.status,
    ].join(','));
  });

  return lines.join('\n');
}

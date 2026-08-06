const DEFAULT_LEAGUE_GAME = 'spades';
const DEFAULT_TIME_ZONE = 'America/New_York';
const MIN_PLAYER_CAP = 2;
const MAX_PLAYER_CAP = 64;

function cleanText(value, fallback = '') {
  return String(value || '').trim().slice(0, 500);
}

function cleanId(value, fallback = '') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '');
}

function cleanGame(value, fallback = DEFAULT_LEAGUE_GAME) {
  const game = cleanText(value, fallback).toLowerCase();
  return game || fallback;
}

function sanitizeStatus(value) {
  const status = cleanText(value, 'active').toLowerCase();
  return ['active', 'paused', 'archived', 'complete'].includes(status) ? status : 'active';
}

function positiveInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function normalizeLeagueDate(value) {
  const raw = cleanText(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function normalizeDivision(value) {
  return cleanText(value, 'Open');
}

function findPlayerIndex(players, identity) {
  const canonical = cleanText(identity?.canonicalAccountId, identity?.accountId, identity?.id);
  const accountId = cleanText(identity?.accountId);
  const email = cleanText(identity?.accountEmail);
  const display = cleanText(identity?.displayName);

  return players.findIndex((player) => (
    player.canonicalAccountId === canonical
    || (canonical && player.canonicalAccountId === canonical)
    || (accountId && player.accountId === accountId)
    || (email && player.accountEmail === email)
    || (display && player.displayName === display)
  ));
}

function makeWeekLabel(dateText) {
  if (!dateText) return 'Week TBD';
  const value = new Date(dateText);

  if (Number.isNaN(value.getTime())) {
    return 'Week TBD';
  }

  const shortDate = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TIME_ZONE,
    month: 'short',
    day: 'numeric',
  }).format(value);
  return `${shortDate}`;
}

export function buildLeagueRecord(payload = {}) {
  const now = new Date().toISOString();
  const leagueId = cleanId(payload.id || payload.slug || payload.leagueId || payload.name, `league-${Math.random().toString(36).slice(2, 8)}`);
  const playerCap = positiveInteger(payload.playerCap, 16, MIN_PLAYER_CAP, MAX_PLAYER_CAP);
  const weeklyPlayDay = cleanText(payload.weeklyPlayDay, 'Sunday');

  const participants = Array.isArray(payload.participants) ? payload.participants.map((player) => ({
    accountId: cleanText(player.accountId),
    accountEmail: cleanText(player.accountEmail),
    canonicalAccountId: cleanText(player.canonicalAccountId, player.accountId),
    displayName: cleanText(player.displayName, 'Player'),
    division: normalizeDivision(player.division),
    eligibility: cleanText(player.eligibility, 'eligible'),
    status: cleanText(player.status, 'enrolled'),
    joinedAt: normalizeLeagueDate(player.joinedAt || now),
    waitlistedAt: normalizeLeagueDate(player.waitlistedAt),
    matchAssignments: Array.isArray(player.matchAssignments) ? player.matchAssignments : [],
  })) : [];

  return {
    id: leagueId,
    slug: leagueId,
    name: cleanText(payload.name, 'League'),
    status: sanitizeStatus(payload.status),
    gameSlug: cleanGame(payload.gameSlug, DEFAULT_LEAGUE_GAME),
    venue: {
      venueId: cleanText(payload.venue?.venueId || payload.venueId),
      mode: cleanText(payload.venue?.mode || payload.venue, 'online'),
      table: cleanText(payload.venue?.table, ''),
    },
    rulesetReference: cleanText(payload.rulesetReference),
    currentSeasonId: cleanText(payload.currentSeasonId),
    startDate: normalizeLeagueDate(payload.startDate || payload.startAt),
    seasonRegistrationStart: normalizeLeagueDate(payload.seasonRegistrationStart),
    seasonRegistrationEnd: normalizeLeagueDate(payload.seasonRegistrationEnd),
    season: {
      id: cleanText(payload.season?.id || payload.seasonId, 'season-1'),
      name: cleanText(payload.season?.name || 'Season 1'),
      startDate: normalizeLeagueDate(payload.season?.startDate || payload.startDate),
      endDate: normalizeLeagueDate(payload.season?.endDate),
      registrationStart: normalizeLeagueDate(payload.season?.registrationStart),
      registrationEnd: normalizeLeagueDate(payload.season?.registrationEnd),
      scheduleFormat: cleanText(payload.season?.scheduleFormat, 'weekly-rounds'),
      playoffFormat: cleanText(payload.season?.playoffFormat, 'single-elimination'),
    },
    weeklyPlayDay,
    playerCap,
    scheduleFormat: cleanText(payload.scheduleFormat, 'weekly-rounds'),
    playoffFormat: cleanText(payload.playoffFormat, 'single-elimination'),
    participants,
    schedule: Array.isArray(payload.schedule) ? payload.schedule : [],
    matches: Array.isArray(payload.matches) ? payload.matches : [],
    standings: Array.isArray(payload.standings) ? payload.standings : [],
    updatedAt: normalizeLeagueDate(payload.updatedAt || now),
    createdAt: normalizeLeagueDate(payload.createdAt || now),
  };
}

export function joinLeagueRecord(league, identity = {}) {
  const record = buildLeagueRecord(league);
  const players = [...record.participants];
  const playerName = cleanText(identity.displayName || identity.playerName || identity.name, 'Player');
  const player = {
    accountId: cleanText(identity.accountId),
    accountEmail: cleanText(identity.accountEmail),
    canonicalAccountId: cleanText(identity.canonicalAccountId, identity.accountId),
    displayName: playerName,
    division: normalizeDivision(identity.division),
    eligibility: cleanText(identity.eligibility, 'eligible'),
    status: 'enrolled',
    joinedAt: new Date().toISOString(),
    waitlistedAt: '',
    matchAssignments: [],
  };
  const existingIndex = findPlayerIndex(players, identity);

  if (existingIndex >= 0) {
    return {
      league: {
        ...record,
        participants: players.map((existing, index) => (index === existingIndex ? { ...existing, ...player } : existing)),
      },
      changed: false,
      waitlisted: false,
    };
  }

  const isWaitlistFull = players.filter((entry) => entry.status !== 'waitlist').length >= record.playerCap;
  if (isWaitlistFull) {
    player.status = 'waitlist';
    player.waitlistedAt = new Date().toISOString();
  }

  players.push({
    ...player,
    status: isWaitlistFull ? 'waitlist' : 'enrolled',
    waitlistedAt: isWaitlistFull ? new Date().toISOString() : '',
  });

  return {
    league: {
      ...record,
      participants: players,
    },
    changed: true,
    waitlisted: isWaitlistFull,
  };
}

export function leaveLeagueRecord(league, identity = {}) {
  const record = buildLeagueRecord(league);
  const players = [...record.participants];
  const index = findPlayerIndex(players, identity);

  if (index < 0) {
    return { league: record, changed: false };
  }

  players.splice(index, 1);
  return { league: { ...record, participants: players }, changed: true };
}

export function buildLeagueStandings(league) {
  const record = buildLeagueRecord(league);
  const totalsByPlayer = new Map();

  function ensureTotals(canonicalAccountId, displayName) {
    const key = canonicalAccountId || displayName;
    if (totalsByPlayer.has(key)) {
      return totalsByPlayer.get(key);
    }

    const payload = {
      accountId: '',
      displayName,
      canonicalAccountId: canonicalAccountId,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      currentStreak: 0,
      lastResult: null,
      seed: 0,
    };

    totalsByPlayer.set(key, payload);
    return payload;
  }

  record.matches.forEach((match) => {
    if (!match.homeTeam || !match.awayTeam || !match.result) return;

    const home = ensureTotals(match.homeTeam.canonicalAccountId, match.homeTeam.displayName);
    const away = ensureTotals(match.awayTeam.canonicalAccountId, match.awayTeam.displayName);

    const homeScore = Number.parseInt(match.result.homeScore, 10) || 0;
    const awayScore = Number.parseInt(match.result.awayScore, 10) || 0;
    const isHomeWin = match.result.winner === 'home';

    home.pointsFor += homeScore;
    home.pointsAgainst += awayScore;
    away.pointsFor += awayScore;
    away.pointsAgainst += homeScore;

    if (isHomeWin) {
      home.wins += 1;
      home.lastResult = 'W';
      away.losses += 1;
      away.lastResult = 'L';
      home.currentStreak = home.currentStreak > 0 ? home.currentStreak + 1 : 1;
      away.currentStreak = 0;
    } else {
      away.wins += 1;
      away.lastResult = 'W';
      home.losses += 1;
      home.lastResult = 'L';
      away.currentStreak = away.currentStreak > 0 ? away.currentStreak + 1 : 1;
      home.currentStreak = 0;
    }
  });

  const totalParticipants = [
    ...record.participants
      .filter((player) => player.status !== 'removed')
      .map((participant) => ensureTotals(participant.canonicalAccountId, participant.displayName)),
    ...Array.from(totalsByPlayer.values()),
  ];

  const uniqueTotalsByPlayer = new Map();
  totalParticipants.forEach((participant) => {
    const key = participant.canonicalAccountId || participant.displayName;
    uniqueTotalsByPlayer.set(key, {
      ...uniqueTotalsByPlayer.get(key),
      ...participant,
    });
  });

  const standingRows = [...uniqueTotalsByPlayer.values()]
    .map((entry) => {
      const gamesPlayed = Number(entry.wins) + Number(entry.losses);
      const winPercent = gamesPlayed ? Math.round((entry.wins / gamesPlayed) * 10000) / 100 : 0;
      const pointDiff = entry.pointsFor - entry.pointsAgainst;

      return {
        ...entry,
        wins: Number(entry.wins),
        losses: Number(entry.losses),
        gamesPlayed,
        winPercent,
        pointDifferential: pointDiff,
      };
    })
    .sort((left, right) => {
      if (right.wins !== left.wins) return right.wins - left.wins;
      if (right.pointDifferential !== left.pointDifferential) return right.pointDifferential - left.pointDifferential;
      return right.winPercent - left.winPercent;
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  const enrichedParticipants = standingRows.map((entry) => ({
    ...entry,
    status: record.participants.find((participant) => participant.canonicalAccountId === entry.canonicalAccountId)?.status || 'enrolled',
  }));

  return enrichedParticipants;
}

export function generateLeagueSchedule(league, options = {}) {
  const record = buildLeagueRecord(league);
  const weekCount = positiveInteger(options.weekCount, 1, 1, 52);
  const enrolled = record.participants.filter((participant) => participant.status === 'enrolled');
  const participantIds = enrolled.map((participant) => participant.canonicalAccountId || participant.accountId);
  const scheduleDate = normalizeLeagueDate(record.startDate || new Date().toISOString());
  const seedDateMs = scheduleDate ? new Date(scheduleDate).getTime() : Date.now();

  if (!participantIds.length || weekCount < 1) {
    return { ...record, schedule: [], matches: [] };
  }

  const byes = participantIds.length % 2 === 0 ? [] : participantIds.slice(-1);
  const players = [...participantIds, ...byes].filter(Boolean);

  const matches = [];
  const schedule = [];

  for (let week = 0; week < weekCount; week += 1) {
    const weekDate = new Date(seedDateMs + week * 7 * 24 * 60 * 60 * 1000).toISOString();
    const scheduled = [];
    const weekPlayers = [...players];

    for (let index = 0; index < weekPlayers.length; index += 2) {
      const home = weekPlayers[index];
      const away = weekPlayers[index + 1];

      if (!away || !home || byes.includes(home) || byes.includes(away)) {
        continue;
      }

      const matchId = `${record.id}-w${week + 1}-${index}`;
      scheduled.push({
        id: matchId,
        homePlayerId: home,
        awayPlayerId: away,
        scheduledFor: weekDate,
        weekLabel: `${makeWeekLabel(weekDate)} (week ${week + 1})`,
        venue: record.venue.mode,
        roomUrl: '',
        status: 'scheduled',
      });

      matches.push({
        id: matchId,
        gameSlug: record.gameSlug,
        leagueId: record.id,
        seasonId: record.currentSeasonId || record.season?.id,
        divisionId: '',
        weekIndex: week + 1,
        scheduledFor: weekDate,
        status: 'scheduled',
        homeTeam: { canonicalAccountId: home, displayName: record.participants.find((player) => player.canonicalAccountId === home)?.displayName || 'TBD' },
        awayTeam: { canonicalAccountId: away, displayName: record.participants.find((player) => player.canonicalAccountId === away)?.displayName || 'TBD' },
        result: null,
      });
    }

    schedule.push({
      week: week + 1,
      scheduledDate: weekDate,
      label: `Week ${week + 1}`,
      matches: scheduled,
    });
  }

  return {
    ...record,
    schedule,
    matches,
    updatedAt: new Date().toISOString(),
  };
}

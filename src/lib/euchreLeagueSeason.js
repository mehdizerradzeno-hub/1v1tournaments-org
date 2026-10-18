import { buildLeagueRecord, buildRoundPairings } from './leagueCatalog.js';

export const EUCHRE_LEAGUE_VERSION = 'euchre-1v1-season-v1';
export function isEuchreLeagueUsername(value) {
  return /^[a-z0-9_]{3,20}$/.test(value) && value !== 'guest' && !/^guest_?(?:[a-f0-9]{4,}|player)$/i.test(value);
}
export const EUCHRE_LEAGUE_TIEBREAKERS = Object.freeze([
  'series-win-percentage', 'tied-group-head-to-head', 'game-differential',
  'point-differential', 'canonical-account-id',
]);

export class EuchreLeagueError extends Error {
  constructor(code, message, statusCode = 409) {
    super(message);
    this.name = 'EuchreLeagueError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function fail(code, message, statusCode) {
  throw new EuchreLeagueError(code, message, statusCode);
}

function text(value) { return String(value ?? '').trim(); }
function compareId(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function integer(value, min, max, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    fail('invalid_configuration', `${name} must be a whole number from ${min} to ${max}.`, 400);
  }
  return parsed;
}
function id(value, name) {
  const parsed = text(value);
  if (!/^[a-z0-9][a-z0-9-]{0,100}$/.test(parsed)) {
    fail('invalid_configuration', `${name} must use a valid lowercase slug.`, 400);
  }
  return parsed;
}
function assertSeason(league) {
  if (league?.leagueFormatVersion !== EUCHRE_LEAGUE_VERSION || league?.gameSlug !== 'euchre') {
    fail('wrong_league_format', 'This action requires a versioned Euchre 1V1 season.', 400);
  }
}
function copy(league) { assertSeason(league); return structuredClone(league); }
function activePlayers(league) {
  return league.participants.filter(player => player.status === 'enrolled');
}
function nowText(now) {
  const value = new Date(now).toISOString();
  return value;
}

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

/** Keep the advertised local weekly time across DST, independent of server TZ. */
export function euchreLeagueWeekDate(firstRoundDate, weeklyTime, timeZone, weekIndex = 1) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(firstRoundDate)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(text(weeklyTime))) {
    fail('invalid_schedule', 'Choose a calendar date and a 24-hour weekly play time.', 400);
  }
  integer(weekIndex, 1, 260, 'Week');
  const [year, month, day] = firstRoundDate.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  if (base.toISOString().slice(0, 10) !== firstRoundDate) fail('invalid_schedule', 'Choose a real calendar date.', 400);
  base.setUTCDate(base.getUTCDate() + (weekIndex - 1) * 7);
  const [hour, minute] = weeklyTime.split(':').map(Number);
  const localTimestamp = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hour, minute);
  let candidate = localTimestamp;
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const p = localParts(new Date(candidate), timeZone);
      const actual = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
      const difference = localTimestamp - actual;
      if (!difference) return new Date(candidate).toISOString();
      candidate += difference;
    }
  } catch {
    fail('invalid_schedule', 'Choose a supported IANA time zone.', 400);
  }
  fail('invalid_schedule', 'That local time does not exist because of a daylight-saving transition.', 400);
}

export function createEuchreLeagueSeason(payload, ownerCanonicalAccountId, now = new Date()) {
  const leagueId = id(payload.id || payload.slug, 'League ID');
  const seasonId = id(payload.seasonId || 'season-1', 'Season ID');
  const ownerId = text(ownerCanonicalAccountId);
  if (!ownerId) fail('owner_required', 'A host-approved account must own the league.', 403);
  const playerCap = integer(payload.playerCap ?? 32, 8, 128, 'Player capacity');
  const divisionCount = integer(payload.divisionCount ?? 4, 1, 16, 'Division count');
  const playoffSize = integer(payload.playoffSize ?? divisionCount * 2, 2, 64, 'Playoff size');
  if ((playoffSize & (playoffSize - 1)) !== 0 || playoffSize > playerCap || playoffSize % divisionCount !== 0) {
    fail('invalid_configuration', 'Playoff size must be a power of two, fit the roster, and divide evenly across divisions.', 400);
  }
  if (divisionCount * 2 > playerCap) fail('invalid_configuration', 'Each division needs at least two players.', 400);
  const name = text(payload.name);
  if (!name || name.length > 100) fail('invalid_configuration', 'Enter a league name of at most 100 characters.', 400);
  const firstRoundDate = text(payload.firstRoundDate);
  const weeklyPlayTime = text(payload.weeklyPlayTime || '18:00');
  const timeZone = text(payload.timeZone || 'America/New_York');
  const startDate = euchreLeagueWeekDate(firstRoundDate, weeklyPlayTime, timeZone);
  const weeklyPlayDay = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' })
    .format(new Date(`${firstRoundDate}T12:00:00Z`));
  const timestamp = nowText(now);
  return {
    ...buildLeagueRecord({ id: leagueId, name, description: text(payload.description).slice(0, 500),
      visibility: payload.visibility, registrationOpen: payload.registrationOpen,
      gameSlug: 'euchre', playerCap,
      status: 'draft', participants: [], matches: [], startDate, weeklyPlayTime, weeklyPlayDay, timeZone,
      season: { id: seasonId, name: text(payload.seasonName || 'Season 1').slice(0, 100), startDate },
      seasonConfig: { playoffEnabled: true, playoffSize, scheduleFormat: 'single-round-robin' },
      createdAt: timestamp, updatedAt: timestamp }),
    leagueFormatVersion: EUCHRE_LEAGUE_VERSION,
    ownerCanonicalAccountId: ownerId,
    phase: 'registration', revision: 0,
    divisionCount, playoffSize, firstRoundDate,
    matchFormat: { bestOf: 3, winsRequired: 2, gameTarget: 10 },
    tiebreakers: [...EUCHRE_LEAGUE_TIEBREAKERS],
    divisions: [], championship: null,
  };
}

/** Only the HTTP layer may supply an identity, derived from a claimed account. */
export function enrollEuchreLeaguePlayer(league, identity, now = new Date()) {
  const next = copy(league);
  if (next.status === 'archived') fail('league_archived', 'Archived leagues are read-only.');
  if (next.phase !== 'registration' || next.registrationOpen === false) fail('registration_closed', 'Registration is closed.');
  const canonicalAccountId = text(identity.canonicalAccountId);
  const username = text(identity.username).toLowerCase();
  if (!canonicalAccountId || !isEuchreLeagueUsername(username)) {
    fail('username_required', 'A claimed 1v1 username and canonical account are required.', 400);
  }
  if (next.participants.some(p => p.canonicalAccountId === canonicalAccountId)) return next;
  if (next.participants.some(p => p.displayName === username)) fail('duplicate_username', 'That username is already registered.');
  if (activePlayers(next).length >= next.playerCap) fail('league_full', 'This league has reached its player capacity.');
  next.participants.push({ canonicalAccountId, accountId: text(identity.accountId || canonicalAccountId),
    ...(/^[a-f0-9]{40}\.json$/.test(identity.accountRecordKey || '') ? { accountRecordKey: identity.accountRecordKey } : {}),
    displayName: username, status: 'enrolled', joinedAt: nowText(now), division: '' });
  next.players = next.participants.length;
  next.updatedAt = nowText(now);
  return next;
}

export function withdrawEuchreLeaguePlayer(league, canonicalAccountId, now = new Date()) {
  const next = copy(league);
  if (next.status === 'archived') fail('league_archived', 'Archived leagues are read-only.');
  if (next.phase !== 'registration') fail('roster_locked', 'The roster is locked after the season starts.');
  next.participants = next.participants.filter(player => player.canonicalAccountId !== canonicalAccountId);
  next.players = next.participants.length;
  next.updatedAt = nowText(now);
  return next;
}

export function manageEuchreLeagueSeason(league, action, payload = {}, now = new Date()) {
  const next = copy(league);
  if (next.status === 'archived') fail('league_archived', 'Archived leagues are read-only.');
  if (action === 'update') {
    const allowed = next.phase === 'registration'
      ? ['name', 'description', 'playerCap', 'divisionCount', 'playoffSize', 'firstRoundDate', 'weeklyPlayTime', 'timeZone', 'visibility']
      : ['name', 'description'];
    if (Object.keys(payload).some(key => !allowed.includes(key))) fail('configuration_locked', 'Only supported settings may be changed; competition settings lock at season start.', 400);
    if (next.phase === 'registration') {
      const candidate = createEuchreLeagueSeason({ ...next, ...payload, seasonId: next.currentSeasonId, seasonName: next.season.name }, next.ownerCanonicalAccountId, now);
      if (candidate.playerCap < activePlayers(next).length) fail('invalid_roster', 'Capacity cannot be smaller than the enrolled roster.');
      Object.assign(next, Object.fromEntries(allowed.map(key => [key, candidate[key]])), {
        startDate: candidate.startDate, weeklyPlayDay: candidate.weeklyPlayDay, season: candidate.season, seasonConfig: candidate.seasonConfig,
      });
    } else {
      const name = text(payload.name ?? next.name);
      if (!name || name.length > 100) fail('invalid_configuration', 'Enter a name of at most 100 characters.', 400);
      next.name = name;
      next.description = text(payload.description ?? next.description).slice(0, 500);
    }
  } else if (action === 'set-registration') {
    if (next.phase !== 'registration') fail('roster_locked', 'Registration cannot reopen after the season starts.');
    if (typeof payload.registrationOpen !== 'boolean') fail('invalid_configuration', 'Registration state must be true or false.', 400);
    next.registrationOpen = payload.registrationOpen;
  } else if (action === 'pause' || action === 'resume') {
    if (!['regular-season', 'playoffs'].includes(next.phase) || next.status === 'archived') fail('invalid_phase', 'Only an active season may be paused or resumed.');
    next.status = action === 'pause' ? 'paused' : 'active';
  } else if (action === 'archive') {
    if (next.matches.some(match => match.series.assignments.length > match.series.games.length && match.status !== 'complete')) {
      fail('game_in_progress', 'Finish assigned games before archiving. Pause instead to prevent new launches.');
    }
    next.status = 'archived';
    next.registrationOpen = false;
    next.archivedAt = nowText(now);
  } else if (action === 'reschedule') {
    const match = next.matches.find(item => item.id === payload.matchId);
    if (!match) fail('fixture_not_found', 'Choose a scheduled fixture.', 404);
    if (match.series.assignments.length || match.status === 'complete') fail('schedule_locked', 'An assigned or completed series cannot be rescheduled.');
    const date = new Date(payload.scheduledFor);
    if (!Number.isFinite(date.getTime()) || date < new Date(now)) fail('invalid_schedule', 'Choose a valid future match time.', 400);
    match.scheduledFor = date.toISOString();
    match.updatedAt = nowText(now);
  } else fail('invalid_action', 'Unsupported league management action.', 400);
  next.updatedAt = nowText(now);
  return next;
}

export function startEuchreLeagueSeason(league, now = new Date()) {
  const next = copy(league);
  if (next.status === 'archived') fail('league_archived', 'Archived leagues cannot be started.');
  if (next.phase !== 'registration') fail('season_started', 'A started season cannot be regenerated.');
  const players = activePlayers(next).sort((a, b) => compareId(a.canonicalAccountId, b.canonicalAccountId));
  if (players.length < 8 || players.length > next.playerCap || players.length < next.divisionCount * 2) {
    fail('invalid_roster', 'Enroll 8–128 players with at least two in every division before starting.');
  }
  const qualifiersPerDivision = next.playoffSize / next.divisionCount;
  if (Math.floor(players.length / next.divisionCount) < qualifiersPerDivision) fail('invalid_roster', 'The roster cannot fill the configured playoff places.');
  const divisions = Array.from({ length: next.divisionCount }, (_, index) => ({
    id: `division-${index + 1}`, name: `Division ${index + 1}`, participantIds: [],
  }));
  players.forEach((player, index) => {
    const division = divisions[index % divisions.length];
    player.division = division.id;
    division.participantIds.push(player.canonicalAccountId);
  });
  next.participants = players;
  next.divisions = divisions;
  next.matches = [];
  next.schedule = [];
  let regularRounds = 0;
  const playerById = new Map(players.map(player => [player.canonicalAccountId, player]));
  for (const division of divisions) {
    const roster = players.filter(p => p.division === division.id);
    const rounds = roster.length % 2 ? roster.length : roster.length - 1;
    regularRounds = Math.max(regularRounds, rounds);
    // Reuse the established Hub circle algorithm, without the legacy UI's
    // 52-week truncation or host-local clock (128 in one division needs 127).
    const pairings = buildRoundPairings(roster.map(p => p.canonicalAccountId));
    pairings.forEach((pairs, weekIndex) => {
      const week = weekIndex + 1;
      const scheduledFor = euchreLeagueWeekDate(next.firstRoundDate, next.weeklyPlayTime, next.timeZone, week);
      pairs.forEach(([homeId, awayId], matchIndex) => {
        const fixtureId = `${next.id}-${next.currentSeasonId}-${division.id}-w${week}-m${matchIndex + 1}`;
        const asTeam = playerId => ({ canonicalAccountId: playerId,
          accountId: playerById.get(playerId).accountId, displayName: playerById.get(playerId).displayName });
        next.matches.push({ id: fixtureId, leagueId: next.id, gameSlug: 'euchre',
          seasonId: next.currentSeasonId, divisionId: division.id, phase: 'regular',
          homePlayerId: homeId, awayPlayerId: awayId, homeTeam: asTeam(homeId), awayTeam: asTeam(awayId),
          weekIndex: week, seasonWeek: week, scheduledFor, status: 'scheduled',
          roomUrl: '', callbackIds: [], result: null, resultHistory: [],
          createdAt: nowText(now), updatedAt: nowText(now),
          series: { bestOf: 3, gameTarget: 10, homeWins: 0, awayWins: 0, games: [], assignments: [] } });
      });
    });
  }
  for (let week = 1; week <= regularRounds; week += 1) {
    next.schedule.push({ week, label: `Week ${week}`,
      scheduledDate: euchreLeagueWeekDate(next.firstRoundDate, next.weeklyPlayTime, next.timeZone, week),
      matchIds: next.matches.filter(m => m.weekIndex === week).map(m => m.id) });
  }
  next.seasonConfig.regularWeeks = regularRounds;
  next.registrationOpen = false;
  next.phase = 'regular-season';
  next.status = 'active';
  next.updatedAt = nowText(now);
  return next;
}

function fixture(league, matchId, acceptingCompletion = false) {
  const match = league.matches.find(m => m.id === matchId);
  if (!match || !match.homeTeam || !match.awayTeam) fail('fixture_not_ready', 'This fixture is not ready for play.');
  if (!acceptingCompletion && ['paused', 'archived'].includes(league.status)) fail('league_unavailable', 'The league is not accepting game actions.');
  return match;
}

export function assignEuchreLeagueGame(league, matchId, assignment, now = new Date()) {
  const next = copy(league);
  const match = fixture(next, matchId);
  if (match.status === 'complete') fail('series_complete', 'This series already has a winner.');
  const gameNumber = match.series.games.length + 1;
  const tournamentSlug = id(assignment.tournamentSlug, 'Game tournament');
  const tournamentMatchId = text(assignment.tournamentMatchId);
  if (!tournamentMatchId || tournamentMatchId.length > 240) fail('invalid_assignment', 'A tournament match identity is required.', 400);
  const previous = match.series.assignments.find(a => a.gameNumber === gameNumber);
  if (previous) {
    if (previous.tournamentSlug !== tournamentSlug || previous.tournamentMatchId !== tournamentMatchId) fail('assignment_conflict', 'This game already has a different tournament assignment.');
    return next;
  }
  if (next.matches.some(m => m.series.assignments.some(a => a.tournamentSlug === tournamentSlug || a.tournamentMatchId === tournamentMatchId))) {
    fail('assignment_conflict', 'A tournament game cannot be reused for another league fixture.');
  }
  let playerUsernames;
  if (assignment.playerUsernames) {
    playerUsernames = assignment.playerUsernames;
    if (!Array.isArray(playerUsernames) || playerUsernames.length !== 2
      || playerUsernames.some((player, index) => player.canonicalAccountId !== [match.homePlayerId, match.awayPlayerId][index] || !isEuchreLeagueUsername(player.username))) {
      fail('invalid_assignment', 'Game username snapshots must match both assigned accounts.', 400);
    }
    playerUsernames = playerUsernames.map(player => ({ canonicalAccountId: player.canonicalAccountId, username: player.username }));
  }
  match.series.assignments.push({ gameNumber, tournamentSlug, tournamentMatchId, assignedAt: nowText(now), ...(playerUsernames ? { playerUsernames } : {}) });
  match.status = 'playing';
  next.updatedAt = nowText(now);
  return next;
}

/** Called only after the existing dedicated tournament reporter authenticates. */
export function recordEuchreLeagueGame(league, matchId, completion, now = new Date()) {
  const next = copy(league);
  const match = fixture(next, matchId, true);
  const completionId = text(completion.completionId);
  const game = {
    completionId, tournamentSlug: text(completion.tournamentSlug),
    tournamentMatchId: text(completion.tournamentMatchId),
    winnerId: text(completion.winnerCanonicalAccountId),
    homeScore: completion.scores?.north, awayScore: completion.scores?.south,
    forfeit: completion.forfeit === true, forfeitReason: text(completion.forfeitReason),
  };
  if (!completionId || completionId.length > 240) fail('invalid_completion', 'A completion identity is required.', 400);
  const duplicateMatch = next.matches.find(m => m.series.games.some(g => g.completionId === completionId));
  if (duplicateMatch) {
    const existing = duplicateMatch.series.games.find(g => g.completionId === completionId);
    const previous = { ...existing };
    delete previous.completedAt;
    delete previous.gameNumber;
    if (duplicateMatch.id !== match.id || JSON.stringify(previous) !== JSON.stringify(game)) fail('completion_conflict', 'A completion identity cannot be changed or reused.');
    return { league: next, duplicate: true, seriesComplete: match.status === 'complete' };
  }
  if (next.status === 'archived') fail('league_unavailable', 'The league is archived.');
  if (match.status === 'complete') fail('series_complete', 'A third game cannot be recorded after a two-game sweep.');
  const assignment = match.series.assignments.find(a => a.gameNumber === match.series.games.length + 1);
  if (!assignment || assignment.tournamentSlug !== game.tournamentSlug || assignment.tournamentMatchId !== game.tournamentMatchId) {
    fail('unassigned_game', 'Only the next assigned authoritative game may update the series.');
  }
  const homeId = match.homeTeam.canonicalAccountId;
  const awayId = match.awayTeam.canonicalAccountId;
  if (![homeId, awayId].includes(game.winnerId)) fail('wrong_winner', 'The game winner is not assigned to this fixture.');
  if (![game.homeScore, game.awayScore].every(score => Number.isInteger(score) && score >= 0 && score <= 13)) {
    fail('invalid_game_score', 'Euchre game scores must be whole numbers from 0 to 13.', 400);
  }
  const winnerScore = game.winnerId === homeId ? game.homeScore : game.awayScore;
  const loserScore = game.winnerId === homeId ? game.awayScore : game.homeScore;
  if (game.forfeit ? !game.forfeitReason || loserScore >= 10 : winnerScore < 10 || loserScore >= 10 || winnerScore <= loserScore) {
    fail('invalid_game_score', 'A normal game must reach 10; forfeits require the existing authoritative reason.', 400);
  }
  match.series.games.push({ ...game, gameNumber: assignment.gameNumber, completedAt: nowText(now) });
  match.callbackIds.push(completionId);
  if (game.winnerId === homeId) match.series.homeWins += 1;
  else match.series.awayWins += 1;
  if (Math.max(match.series.homeWins, match.series.awayWins) === 2) {
    match.status = 'complete';
    match.result = { winner: match.series.homeWins === 2 ? 'home' : 'away',
      winnerId: match.series.homeWins === 2 ? homeId : awayId,
      homeScore: match.series.homeWins, awayScore: match.series.awayWins,
      source: 'tournament-authoritative-series', completedAt: nowText(now) };
  }
  next.updatedAt = nowText(now);
  return { league: next, duplicate: false, seriesComplete: match.status === 'complete' };
}

export function euchreLeagueStandings(league) {
  assertSeason(league);
  const rows = new Map(activePlayers(league).map(p => [p.canonicalAccountId, {
    canonicalAccountId: p.canonicalAccountId, displayName: p.displayName, divisionId: p.division,
    wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsFor: 0, pointsAgainst: 0,
  }]));
  const completed = league.matches.filter(m => m.phase === 'regular' && m.status === 'complete');
  for (const match of completed) {
    const home = rows.get(match.homeTeam.canonicalAccountId);
    const away = rows.get(match.awayTeam.canonicalAccountId);
    if (!home || !away) fail('invalid_roster', 'A completed fixture has an unknown participant.');
    const winner = match.result.winnerId === home.canonicalAccountId ? home : away;
    const loser = winner === home ? away : home;
    winner.wins += 1; loser.losses += 1;
    home.gamesWon += match.series.homeWins; home.gamesLost += match.series.awayWins;
    away.gamesWon += match.series.awayWins; away.gamesLost += match.series.homeWins;
    for (const game of match.series.games) {
      home.pointsFor += game.homeScore; home.pointsAgainst += game.awayScore;
      away.pointsFor += game.awayScore; away.pointsAgainst += game.homeScore;
    }
  }
  const rateCompare = (a, b) => b.wins * (a.wins + a.losses || 1) - a.wins * (b.wins + b.losses || 1);
  return league.divisions.map(division => {
    const entries = [...rows.values()].filter(row => row.divisionId === division.id);
    const headToHead = new Map();
    for (const row of entries) {
      const tied = new Set(entries.filter(other => rateCompare(row, other) === 0).map(other => other.canonicalAccountId));
      const mini = { wins: 0, losses: 0 };
      for (const match of completed) {
        const home = match.homeTeam.canonicalAccountId;
        const away = match.awayTeam.canonicalAccountId;
        if (!tied.has(home) || !tied.has(away) || ![home, away].includes(row.canonicalAccountId)) continue;
        if (match.result.winnerId === row.canonicalAccountId) mini.wins += 1;
        else mini.losses += 1;
      }
      headToHead.set(row.canonicalAccountId, mini);
    }
    entries.sort((a, b) => rateCompare(a, b)
      || rateCompare(headToHead.get(a.canonicalAccountId), headToHead.get(b.canonicalAccountId))
      || (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost)
      || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
      || compareId(a.canonicalAccountId, b.canonicalAccountId));
    return { ...division, standings: entries.map((row, index) => ({ ...row, rank: index + 1,
      gamesPlayed: row.wins + row.losses,
      winPercent: row.wins + row.losses ? row.wins / (row.wins + row.losses) * 100 : 0,
      gameDifferential: row.gamesWon - row.gamesLost, pointDifferential: row.pointsFor - row.pointsAgainst })) };
  });
}

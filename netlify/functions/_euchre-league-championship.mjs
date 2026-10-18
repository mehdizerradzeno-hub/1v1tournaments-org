import { buildBracket, findMatch, setMatchWinner } from './tournament-bracket.mjs';
import {
  EUCHRE_LEAGUE_VERSION, EuchreLeagueError, euchreLeagueStandings, euchreLeagueWeekDate,
} from '../../src/lib/euchreLeagueSeason.js';

function ascii(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

/** Standard seeded slots: 1/8, 4/5, 2/7, 3/6 for an eight-seat bracket. */
export function championshipSeedSlots(size) {
  if (!Number.isInteger(size) || size < 2 || size > 64 || (size & (size - 1))) {
    throw new EuchreLeagueError('invalid_playoff_size', 'Playoffs require a power-of-two field from 2 to 64.');
  }
  let slots = [1, 2];
  for (let width = 4; width <= size; width *= 2) slots = slots.flatMap(seed => [seed, width + 1 - seed]);
  return slots;
}

function qualify(league) {
  const perDivision = league.playoffSize / league.divisionCount;
  const qualifiers = euchreLeagueStandings(league).flatMap(division => division.standings.slice(0, perDivision));
  qualifiers.sort((a, b) => a.rank - b.rank
    || b.wins * (a.wins + a.losses || 1) - a.wins * (b.wins + b.losses || 1)
    || b.gameDifferential - a.gameDifferential
    || b.pointDifferential - a.pointDifferential
    || ascii(a.canonicalAccountId, b.canonicalAccountId));
  if (qualifiers.length !== league.playoffSize || new Set(qualifiers.map(q => q.canonicalAccountId)).size !== league.playoffSize) {
    throw new EuchreLeagueError('invalid_qualifiers', 'The championship field is incomplete or duplicated.');
  }
  return qualifiers.map((row, index) => ({ ...row, seed: index + 1 }));
}

function createChampionship(league, now) {
  const qualifiers = qualify(league);
  const seedById = new Map(qualifiers.map(q => [q.canonicalAccountId, q.seed]));
  const slots = championshipSeedSlots(qualifiers.length);
  const signups = slots.map((seed, index) => {
    const player = qualifiers[seed - 1];
    return { id: player.canonicalAccountId, canonicalAccountId: player.canonicalAccountId,
      playerName: player.displayName, playerHandle: player.displayName,
      createdAt: new Date(new Date(now).getTime() + index).toISOString() };
  });
  // Reuse the existing bracket construction, bye handling, and advancement.
  // Entrants are supplied in seeded slot order, without altering normal events.
  const bracket = buildBracket({ tournamentSlug: `${league.id}-${league.currentSeasonId}-championship`,
    signups, gameSlug: 'euchre' });
  for (const player of bracket.participants) player.seed = seedById.get(player.canonicalAccountId);
  bracket.createdAt = new Date(now).toISOString();
  bracket.updatedAt = bracket.createdAt;
  return { qualifiers, bracket, qualifiedAt: bracket.createdAt, champion: null };
}

function synchronizeFixtures(league, now) {
  const asTeam = player => player ? { canonicalAccountId: player.canonicalAccountId,
    accountId: player.accountId || player.canonicalAccountId, displayName: player.handle || player.name } : null;
  for (const round of league.championship.bracket.rounds) {
    for (const bracketMatch of round.matches) {
      let match = league.matches.find(m => m.id === bracketMatch.id);
      if (!match) {
        const week = league.seasonConfig.regularWeeks + round.index;
        match = { id: bracketMatch.id, leagueId: league.id, gameSlug: 'euchre',
          seasonId: league.currentSeasonId, divisionId: 'championship', phase: 'playoff',
          weekIndex: week, seasonWeek: week,
          scheduledFor: euchreLeagueWeekDate(league.firstRoundDate, league.weeklyPlayTime, league.timeZone, week),
          status: 'pending', homeTeam: null, awayTeam: null, homePlayerId: '', awayPlayerId: '',
          roomUrl: '', callbackIds: [], result: null, resultHistory: [],
          createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
          series: { bestOf: 3, gameTarget: 10, homeWins: 0, awayWins: 0, games: [], assignments: [] } };
        league.matches.push(match);
      }
      if (match.series.games.length || match.series.assignments.length || match.status === 'complete') continue;
      match.homeTeam = asTeam(bracketMatch.players[0]);
      match.awayTeam = asTeam(bracketMatch.players[1]);
      match.homePlayerId = match.homeTeam?.canonicalAccountId || '';
      match.awayPlayerId = match.awayTeam?.canonicalAccountId || '';
      match.status = match.homeTeam && match.awayTeam ? 'scheduled' : 'pending';
    }
  }
}

/** Deterministic, restart-safe derived advancement, saved in the same CAS write. */
export function advanceEuchreLeagueChampionship(record, now = new Date()) {
  if (record?.leagueFormatVersion !== EUCHRE_LEAGUE_VERSION) return record;
  const league = structuredClone(record);
  if (league.phase === 'regular-season') {
    const regular = league.matches.filter(m => m.phase === 'regular');
    if (!regular.length || regular.some(m => m.status !== 'complete')) return league;
    league.championship = createChampionship(league, now);
    league.phase = 'playoffs';
  }
  if (league.phase !== 'playoffs') return league;
  const bracket = league.championship.bracket;
  // Round order permits recovery even after all prerequisite results were saved.
  for (const round of bracket.rounds) {
    for (const bracketMatch of round.matches) {
      const fixture = league.matches.find(m => m.id === bracketMatch.id);
      if (fixture?.status !== 'complete' || bracketMatch.status === 'final') continue;
      const winner = bracketMatch.players.find(p => p?.canonicalAccountId === fixture.result.winnerId);
      if (!winner || !bracketMatch.players.every(Boolean)) {
        throw new EuchreLeagueError('championship_conflict', 'A playoff result does not match its seeded bracket.');
      }
      setMatchWinner(bracket, findMatch(bracket, bracketMatch.id), winner);
    }
  }
  synchronizeFixtures(league, now);
  if (bracket.status === 'complete') {
    const champion = league.championship.qualifiers.find(q => q.canonicalAccountId === bracket.winner.id);
    if (!champion) throw new EuchreLeagueError('championship_conflict', 'The champion is not a qualified player.');
    league.championship.champion = { canonicalAccountId: champion.canonicalAccountId,
      displayName: champion.displayName, seed: champion.seed };
    league.phase = 'complete';
    league.status = 'complete';
    league.completedAt = new Date(now).toISOString();
  }
  bracket.updatedAt = new Date(now).toISOString();
  return league;
}

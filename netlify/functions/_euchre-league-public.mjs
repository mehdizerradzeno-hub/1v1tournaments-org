import { accountCanonicalId } from './_account-utils.mjs';
import { euchreLeagueStandings } from '../../src/lib/euchreLeagueSeason.js';

const standing = row => ({ rank: row.rank, username: row.displayName, wins: row.wins, losses: row.losses,
  gamesWon: row.gamesWon, gamesLost: row.gamesLost, gameDifferential: row.gameDifferential,
  pointsFor: row.pointsFor, pointsAgainst: row.pointsAgainst, pointDifferential: row.pointDifferential,
  winPercent: row.winPercent });

/** An explicit allowlist: never expose account IDs, callbacks, tickets, or raw bracket IDs. */
export function publicEuchreLeague(league) {
  const tables = euchreLeagueStandings(league);
  return {
    id: league.id, name: league.name, description: league.description,
    leagueFormatVersion: league.leagueFormatVersion, gameSlug: 'euchre', phase: league.phase, status: league.status,
    visibility: league.visibility, seasonName: league.season.name, seasonId: league.currentSeasonId,
    registrationOpen: league.registrationOpen, playerCap: league.playerCap, players: league.players,
    firstRoundDate: league.firstRoundDate, weeklyPlayDay: league.weeklyPlayDay,
    weeklyPlayTime: league.weeklyPlayTime, timeZone: league.timeZone,
    divisionCount: league.divisionCount, playoffSize: league.playoffSize,
    regularRounds: league.seasonConfig.regularWeeks, matchFormat: { ...league.matchFormat },
    tiebreakers: [...league.tiebreakers],
    participants: league.participants.map(player => ({ username: player.displayName, divisionId: player.division, status: player.status })),
    divisions: tables.map(division => ({ id: division.id, name: division.name, standings: division.standings.map(standing) })),
    schedule: league.schedule.map(week => ({ week: week.week, label: week.label, scheduledDate: week.scheduledDate })),
    matches: league.matches.map(match => ({ id: match.id, phase: match.phase, divisionId: match.divisionId,
      week: match.weekIndex, scheduledFor: match.scheduledFor, status: match.status,
      home: match.homeTeam?.displayName || null, away: match.awayTeam?.displayName || null,
      homeWins: match.series.homeWins, awayWins: match.series.awayWins,
      winner: match.result ? (match.result.winner === 'home' ? match.homeTeam?.displayName : match.awayTeam?.displayName) : null,
      games: match.series.games.map(game => ({ gameNumber: game.gameNumber, homeScore: game.homeScore,
        awayScore: game.awayScore, forfeit: game.forfeit, completedAt: game.completedAt,
        sourceTournamentSlug: game.tournamentSlug })),
    })),
    championship: league.championship ? {
      qualifiedAt: league.championship.qualifiedAt,
      qualifiers: league.championship.qualifiers.map(row => ({ seed: row.seed, username: row.displayName,
        divisionId: row.divisionId, divisionRank: row.rank })),
      champion: league.championship.champion ? { username: league.championship.champion.displayName,
        seed: league.championship.champion.seed } : null,
    } : null,
    createdAt: league.createdAt, updatedAt: league.updatedAt,
  };
}

export function euchreLeagueViewer(league, account, now = new Date()) {
  const canonical = accountCanonicalId(account);
  if (!canonical) return null;
  const member = league.participants.find(p => p.canonicalAccountId === canonical);
  if (!member) return { membership: null, matchAccess: [] };
  const row = euchreLeagueStandings(league).flatMap(d => d.standings).find(r => r.canonicalAccountId === canonical);
  return { membership: { username: member.displayName, status: member.status, divisionId: member.division },
    standing: row ? standing(row) : null,
    matchAccess: league.matches.filter(match => match.status !== 'complete' && match.status !== 'pending'
      && [match.homePlayerId, match.awayPlayerId].includes(canonical)).map(match => ({
      matchId: match.id, gameNumber: match.series.games.length + 1,
      availableAt: match.scheduledFor, canOpen: league.status === 'active' && new Date(match.scheduledFor) <= new Date(now),
    })),
  };
}

export function organizerEuchreLeague(league) {
  return { ...publicEuchreLeague(league), revision: league.revision,
    roster: league.participants.map(player => ({ canonicalAccountId: player.canonicalAccountId,
      username: player.displayName, divisionId: player.division, status: player.status })) };
}

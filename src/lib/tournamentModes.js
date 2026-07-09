export const TOURNAMENT_MODES = [
  {
    value: 'single-elimination',
    label: 'Single Elimination',
    shortLabel: 'Single elim',
    format: 'Single-elimination bracket',
    rosterCap: 8,
    minimumPlayers: 2,
    generation: 'live',
    summary: 'Fast bracket. One loss knocks a player out.',
  },
  {
    value: 'best-of-3-single-elimination',
    label: 'Best of 3 Single Elimination',
    shortLabel: 'Best of 3',
    format: 'Best-of-3 single-elimination bracket',
    rosterCap: 8,
    minimumPlayers: 2,
    generation: 'planned',
    summary: 'Same bracket, but each matchup is first to two wins.',
  },
  {
    value: 'round-robin',
    label: 'Round Robin',
    shortLabel: 'Round robin',
    format: 'Round-robin table',
    rosterCap: 6,
    minimumPlayers: 3,
    generation: 'planned',
    summary: 'Everyone plays everyone. Best for small groups.',
  },
  {
    value: 'king-of-the-table',
    label: 'King of the Table',
    shortLabel: 'King table',
    format: 'King-of-the-table queue',
    rosterCap: 8,
    minimumPlayers: 2,
    generation: 'planned',
    summary: 'Winner stays on stream while challengers rotate in.',
  },
  {
    value: 'four-player-double-elimination',
    label: '4-Man Double Elimination',
    shortLabel: '4-man double elim',
    format: '4-player double-elimination bracket',
    rosterCap: 4,
    minimumPlayers: 4,
    generation: 'live',
    summary: 'Four players, second chance, grand final with optional reset.',
  },
];

export const DEFAULT_TOURNAMENT_MODE = 'single-elimination';

export function getTournamentMode(value) {
  return TOURNAMENT_MODES.find((mode) => mode.value === value) || TOURNAMENT_MODES[0];
}

export function getTournamentModeValue(value) {
  return getTournamentMode(value).value;
}

export function getTournamentModeLabel(value) {
  return getTournamentMode(value).label;
}

export function canGenerateTournamentMode(value) {
  return getTournamentMode(value).generation === 'live';
}

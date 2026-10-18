import { getRequestedHostTournamentGame } from './euchreTournamentEntry.js';

// Keep the original /admin?game=... tournament entry links working.
export function getAdminEntryView(query = {}) {
  const event = Array.isArray(query.event) ? query.event[0] : query.event;
  return getRequestedHostTournamentGame(query.game) || (typeof event === 'string' && event.trim())
    ? 'tournaments' : 'dashboard';
}

export const ADMIN_COMPETITION_WORKSPACES = Object.freeze([
  {
    id: 'tournaments', title: 'Tournaments', eyebrow: 'Event operations',
    description: 'Create events, manage signups, seed brackets, and run tournament matches.',
    href: '/admin/tournaments', action: 'Manage tournaments',
    detail: 'Spades · Euchre · Gin Rummy',
  },
  {
    id: 'leagues', title: 'Leagues', eyebrow: 'Season operations',
    description: 'Manage season registration, divisions, weekly schedules, standings, and playoffs.',
    links: [
      { title: 'Euchre 1V1', description: 'Best-of-three series, weekly divisions, and a seeded championship.', href: '/admin/euchre-leagues', action: 'Manage Euchre leagues' },
      { title: 'Spades & legacy leagues', description: 'The existing league console for schedules, rosters, and linked matches.', href: '/admin/leagues', action: 'Open existing league console' },
    ],
  },
]);

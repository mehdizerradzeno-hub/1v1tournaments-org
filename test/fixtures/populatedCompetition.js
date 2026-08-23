const FIXTURE_PLAYER_COUNT = 32;
const FIXTURE_EVENT_COUNT = 18;
const PLAYERS_PER_EVENT = 16;

export const populatedFixturePlayers = [
  'Fixture Alexandra “Ace of Spades” Montgomery-Winters',
  "Fixture Renée O'Connell",
  'Fixture 李 Ming',
  ...Array.from(
    { length: FIXTURE_PLAYER_COUNT - 3 },
    (_, index) => `Fixture Player ${String(index + 4).padStart(2, '0')}`,
  ),
];

function rotatePlayers(offset) {
  return Array.from(
    { length: PLAYERS_PER_EVENT },
    (_, index) => populatedFixturePlayers[(offset + index) % populatedFixturePlayers.length],
  );
}

export function createPopulatedCompetitionResults() {
  return Array.from({ length: FIXTURE_EVENT_COUNT }, (_, eventIndex) => {
    const gameSlug = eventIndex % 3 === 2 ? 'euchre' : 'spades';
    const players = rotatePlayers(eventIndex * 5);
    const placements = players.map((name, index) => ({ place: index + 1, name }));
    const matchRecords = players.map((name, index) => ({
      name,
      wins: index === 0 ? 4 : index < 3 ? 3 : index < 7 ? 2 : index < 12 ? 1 : 0,
      losses: index === 0 ? 0 : 1,
    }));
    const date = new Date(Date.UTC(2026, 0, eventIndex + 1, 20)).toISOString();

    return {
      slug: `fixture-${gameSlug}-event-${eventIndex + 1}`,
      tournamentSlug: `fixture-${gameSlug}-event-${eventIndex + 1}`,
      gameSlug,
      badge: 'Synthetic test fixture',
      status: 'complete',
      title: `Fixture ${gameSlug === 'spades' ? 'Spades' : 'Euchre'} Event ${eventIndex + 1} Results`,
      winner: placements[0].name,
      summary: `${placements[0].name} won the synthetic fixture event.`,
      score: 'Champion',
      date,
      placements,
      matchRecords,
      notes: ['Synthetic populated-state test data. Never shown publicly.'],
    };
  });
}

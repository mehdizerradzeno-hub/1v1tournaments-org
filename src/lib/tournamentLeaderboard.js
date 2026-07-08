function cleanName(value) {
  return String(value || '').trim();
}

function resultDateMs(result) {
  const parsed = new Date(result?.date).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function createEntry(name) {
  return {
    name,
    eventsPlayed: 0,
    tournamentWins: 0,
    finalsMade: 0,
    matchWins: 0,
    matchLosses: 0,
    placements: [],
    gameSlugs: new Set(),
    latestResult: null,
    latestResultDateMs: 0,
  };
}

function ensureEntry(entriesByName, name) {
  const clean = cleanName(name);

  if (!clean) {
    return null;
  }

  if (!entriesByName.has(clean)) {
    entriesByName.set(clean, createEntry(clean));
  }

  return entriesByName.get(clean);
}

function applyPlacement(entry, result, placement) {
  const place = Number(placement.place);

  entry.eventsPlayed += 1;
  entry.placements.push({
    place,
    title: result.title,
    tournamentSlug: result.tournamentSlug,
    gameSlug: result.gameSlug,
    date: result.date,
  });

  if (place === 1) {
    entry.tournamentWins += 1;
  }

  if (place === 1 || place === 2) {
    entry.finalsMade += 1;
  }

  if (result.gameSlug) {
    entry.gameSlugs.add(result.gameSlug);
  }

  const dateMs = resultDateMs(result);
  if (!entry.latestResult || dateMs >= entry.latestResultDateMs) {
    entry.latestResult = {
      place,
      title: result.title,
      tournamentSlug: result.tournamentSlug,
      gameSlug: result.gameSlug,
      date: result.date,
    };
    entry.latestResultDateMs = dateMs;
  }
}

function applyMatchRecord(entry, record) {
  entry.matchWins += Number(record?.wins || 0);
  entry.matchLosses += Number(record?.losses || 0);
}

function inferMatchRecordsFromPlacements(result, entriesByName) {
  const placements = result?.placements || [];
  const champion = placements.find((placement) => Number(placement.place) === 1);
  const runnerUp = placements.find((placement) => Number(placement.place) === 2);

  if (champion?.name) {
    const entry = ensureEntry(entriesByName, champion.name);
    if (entry) entry.matchWins += 1;
  }

  if (runnerUp?.name) {
    const entry = ensureEntry(entriesByName, runnerUp.name);
    if (entry) entry.matchLosses += 1;
  }
}

function winRate(matchWins, matchLosses) {
  const total = matchWins + matchLosses;
  return total > 0 ? Math.round((matchWins / total) * 100) : 0;
}

function leaderboardScore(entry) {
  return (
    entry.tournamentWins * 1000
    + entry.finalsMade * 250
    + entry.matchWins * 35
    - entry.matchLosses * 10
    + entry.eventsPlayed * 5
  );
}

export function buildTournamentLeaderboard(results = [], options = {}) {
  const { gameSlug = '' } = options;
  const entriesByName = new Map();
  const filteredResults = (results || []).filter((result) => {
    if (!result?.placements?.length) {
      return false;
    }

    return !gameSlug || result.gameSlug === gameSlug;
  });

  filteredResults.forEach((result) => {
    result.placements.forEach((placement) => {
      const entry = ensureEntry(entriesByName, placement.name);
      if (entry) {
        applyPlacement(entry, result, placement);
      }
    });

    if (result.matchRecords?.length) {
      result.matchRecords.forEach((record) => {
        const entry = ensureEntry(entriesByName, record.name);
        if (entry) {
          applyMatchRecord(entry, record);
        }
      });
    } else {
      inferMatchRecordsFromPlacements(result, entriesByName);
    }
  });

  return [...entriesByName.values()]
    .map((entry) => {
      const score = leaderboardScore(entry);

      return {
        ...entry,
        rank: 0,
        score,
        winRate: winRate(entry.matchWins, entry.matchLosses),
        gameSlugs: [...entry.gameSlugs].sort(),
      };
    })
    .sort((left, right) =>
      right.score - left.score
      || right.tournamentWins - left.tournamentWins
      || right.finalsMade - left.finalsMade
      || right.matchWins - left.matchWins
      || left.matchLosses - right.matchLosses
      || left.name.localeCompare(right.name),
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function summarizeTournamentLeaderboard(entries = [], results = []) {
  const games = new Set(entries.flatMap((entry) => entry.gameSlugs));

  return {
    playerCount: entries.length,
    eventCount: results.filter((result) => result?.placements?.length).length,
    gameCount: games.size,
    topPlayer: entries[0]?.name || 'TBD',
  };
}

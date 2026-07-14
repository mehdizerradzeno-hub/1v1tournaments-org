import { useEffect, useMemo, useState } from 'react';

import {
  buildResultFromTournamentBracket,
  getTournamentBySlug,
  mergeResults,
  siteData,
} from './siteData.js';
import {
  fetchTournamentBracket,
  fetchTournamentEvent,
  fetchTournamentEvents,
} from './tournamentHostingClient.js';

function isVisibleTournament(tournament) {
  return Boolean(tournament?.slug) && !tournament.deleted && tournament.status !== 'deleted';
}

export function mergeHostedTournamentCatalog(hostedTournaments = [], seededTournaments = siteData.tournaments) {
  const tournamentsBySlug = new Map();

  seededTournaments.filter(isVisibleTournament).forEach((tournament) => {
    tournamentsBySlug.set(tournament.slug, tournament);
  });

  hostedTournaments.filter(Boolean).forEach((tournament) => {
    if (!tournament.slug) {
      return;
    }

    if (!isVisibleTournament(tournament)) {
      tournamentsBySlug.delete(tournament.slug);
      return;
    }

    tournamentsBySlug.set(tournament.slug, tournament);
  });

  return [...tournamentsBySlug.values()];
}

export function buildCompletedLiveResults(tournaments = [], bracketsBySlug = {}) {
  return tournaments
    .map((tournament) => {
      const bracketRecord = bracketsBySlug[tournament.slug];
      const bracket = bracketRecord?.bracket || bracketRecord || null;

      return buildResultFromTournamentBracket(tournament, bracket);
    })
    .filter(Boolean);
}

async function loadHostedTournaments() {
  try {
    const response = await fetchTournamentEvents();

    return response.tournaments || [];
  } catch {
    return [];
  }
}

async function loadBracketEntry(tournament) {
  try {
    const response = await fetchTournamentBracket({ slug: tournament.slug });

    return [tournament.slug, response.bracket || null];
  } catch {
    return [tournament.slug, null];
  }
}

export function useLiveTournamentResult(slug = siteData.site.primaryTournamentSlug) {
  const [resultState, setResultState] = useState({ slug: '', result: null });

  useEffect(() => {
    if (!slug) {
      return undefined;
    }

    let active = true;

    async function loadLiveResult() {
      try {
        const [eventResponse, response] = await Promise.all([
          fetchTournamentEvent({ slug }).catch(() => ({ tournament: null })),
          fetchTournamentBracket({ slug }),
        ]);
        const tournament = isVisibleTournament(eventResponse.tournament)
          ? eventResponse.tournament
          : getTournamentBySlug(slug);
        const derivedResult = buildResultFromTournamentBracket(tournament, response.bracket || null);

        if (active) {
          setResultState({ slug, result: derivedResult });
        }
      } catch {
        if (active) {
          setResultState({ slug, result: null });
        }
      }
    }

    loadLiveResult();

    return () => {
      active = false;
    };
  }, [slug]);

  return resultState.slug === slug ? resultState.result : null;
}

export function useLiveTournamentResults() {
  const [results, setResults] = useState([]);

  useEffect(() => {
    let active = true;

    async function loadLiveResults() {
      const hostedTournaments = await loadHostedTournaments();
      const tournaments = mergeHostedTournamentCatalog(hostedTournaments);
      const bracketEntries = await Promise.all(tournaments.map(loadBracketEntry));
      const bracketsBySlug = Object.fromEntries(bracketEntries);
      const nextResults = buildCompletedLiveResults(tournaments, bracketsBySlug);

      if (active) {
        setResults(nextResults);
      }
    }

    loadLiveResults();

    return () => {
      active = false;
    };
  }, []);

  return results;
}

export function useMergedLiveResults(baseResults) {
  const liveResults = useLiveTournamentResults();

  return useMemo(() => mergeResults(baseResults, liveResults), [baseResults, liveResults]);
}

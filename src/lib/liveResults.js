import { useEffect, useMemo, useState } from 'react';

import {
  buildResultFromTournamentBracket,
  getTournamentBySlug,
  mergeResults,
  siteData,
} from './siteData.js';
import { fetchTournamentBracket } from './tournamentHostingClient.js';

export function useLiveTournamentResult(slug = siteData.site.primaryTournamentSlug) {
  const [resultState, setResultState] = useState({ slug: '', result: null });

  useEffect(() => {
    if (!slug) {
      return undefined;
    }

    let active = true;

    async function loadLiveResult() {
      try {
        const tournament = getTournamentBySlug(slug);
        const response = await fetchTournamentBracket({ slug });
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

export function useMergedLiveResults(baseResults, slug = siteData.site.primaryTournamentSlug) {
  const liveResult = useLiveTournamentResult(slug);

  return useMemo(() => mergeResults(baseResults, liveResult), [baseResults, liveResult]);
}

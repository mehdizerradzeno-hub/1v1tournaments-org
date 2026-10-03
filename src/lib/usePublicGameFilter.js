import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';

import { normalizePublicGameSlug } from './publicPresentationCatalog.js';

export function usePublicGameFilter() {
  const params = useLocalSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const requested = Array.isArray(params.game) ? params.game[0] : params.game;
  const activeGame = normalizePublicGameSlug(requested) || 'all';

  function selectGame(nextGame) {
    const normalized = normalizePublicGameSlug(nextGame);

    if (!normalized) {
      router.push(pathname);
      return;
    }

    router.push({ pathname, params: { game: normalized } });
  }

  return [activeGame, selectGame];
}

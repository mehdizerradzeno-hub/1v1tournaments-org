import { useLocalSearchParams } from 'expo-router';

import GameScreen from '../../src/screens/GameScreen.jsx';
import { siteData } from '../../src/lib/siteData.js';

export function generateStaticParams() {
  return siteData.games
    .filter((game) => !game.shortPath)
    .map((game) => ({
      gameSlug: game.slug,
    }));
}

function normalizeParam(value) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default function GameRoute() {
  const { gameSlug } = useLocalSearchParams();

  return <GameScreen gameSlug={normalizeParam(gameSlug)} />;
}

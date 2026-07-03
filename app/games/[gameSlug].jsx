import { useLocalSearchParams } from 'expo-router';

import GameScreen from '../../src/screens/GameScreen.jsx';

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

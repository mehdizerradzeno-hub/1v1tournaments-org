import { useLocalSearchParams } from 'expo-router';

import GameScreen from '../src/screens/GameScreen.jsx';

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default function EuchreRoute() {
  const { view } = useLocalSearchParams();

  return <GameScreen gameSlug="euchre" initialView={firstValue(view)} />;
}

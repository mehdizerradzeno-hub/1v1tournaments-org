import { useLocalSearchParams } from 'expo-router';

import PlayerProfileScreen from '../../src/screens/PlayerProfileScreen.jsx';

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default function PlayerProfileRoute() {
  const { handle } = useLocalSearchParams();

  return <PlayerProfileScreen handle={firstParam(handle)} />;
}

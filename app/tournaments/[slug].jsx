import { useLocalSearchParams } from 'expo-router';

import TournamentScreen from '../../src/screens/TournamentScreen.jsx';

function normalizeParam(value) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default function TournamentRoute() {
  const { slug } = useLocalSearchParams();

  return <TournamentScreen slug={normalizeParam(slug)} />;
}

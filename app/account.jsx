import { useLocalSearchParams } from 'expo-router';

import TournamentAccountScreen from '../src/screens/TournamentAccountScreen.jsx';

function normalizeMode(mode) {
  const value = Array.isArray(mode) ? mode[0] : mode;
  return value === 'manage' ? 'manage' : 'signin';
}

export default function TournamentAccountRoute() {
  const { mode } = useLocalSearchParams();

  return <TournamentAccountScreen initialMode={normalizeMode(mode)} />;
}

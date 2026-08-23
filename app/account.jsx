import { useLocalSearchParams } from 'expo-router';

import TournamentAccountScreen from '../src/screens/TournamentAccountScreen.jsx';
import {
  normalizeTournamentAccountMode,
  readPasswordRecoveryFragment,
} from '../src/lib/accountConnect.js';

export default function TournamentAccountRoute() {
  const { mode } = useLocalSearchParams();
  const recovery = readPasswordRecoveryFragment();

  return (
    <TournamentAccountScreen
      initialEmail={recovery.email}
      initialMode={normalizeTournamentAccountMode(mode)}
      initialRecoveryToken={recovery.token}
    />
  );
}

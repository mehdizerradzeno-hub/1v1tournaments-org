import { useLocalSearchParams } from 'expo-router';

import EuchreAccountConnectScreen from '../../src/screens/EuchreAccountConnectScreen.jsx';
import { readPasswordRecoveryFragment } from '../../src/lib/accountConnect.js';
import { normalizeEuchreAccountMode } from '../../src/lib/euchreAccountConnect.js';

export default function EuchreAccountConnectRoute() {
  const { mode } = useLocalSearchParams();
  const recovery = readPasswordRecoveryFragment();

  return (
    <EuchreAccountConnectScreen
      initialEmail={recovery.email}
      initialMode={normalizeEuchreAccountMode(mode)}
      initialRecoveryToken={recovery.token}
    />
  );
}

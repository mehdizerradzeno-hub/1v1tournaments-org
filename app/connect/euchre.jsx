import { useLocalSearchParams } from 'expo-router';

import EuchreAccountConnectScreen from '../../src/screens/EuchreAccountConnectScreen.jsx';
import { normalizeEuchreAccountMode } from '../../src/lib/euchreAccountConnect.js';

export default function EuchreAccountConnectRoute() {
  const { mode } = useLocalSearchParams();

  return <EuchreAccountConnectScreen initialMode={normalizeEuchreAccountMode(mode)} />;
}

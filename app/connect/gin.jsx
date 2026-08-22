import { useLocalSearchParams } from 'expo-router';

import GinAccountConnectScreen from '../../src/screens/GinAccountConnectScreen.jsx';
import { normalizeGinAccountMode } from '../../src/lib/ginAccountConnect.js';

export default function GinAccountConnectRoute() {
  const { mode } = useLocalSearchParams();

  return <GinAccountConnectScreen initialMode={normalizeGinAccountMode(mode)} />;
}

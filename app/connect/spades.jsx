import { useLocalSearchParams } from 'expo-router';

import SpadesAccountConnectScreen from '../../src/screens/SpadesAccountConnectScreen.jsx';
import { normalizeSpadesAccountMode } from '../../src/lib/spadesAccountConnect.js';

export default function SpadesAccountConnectRoute() {
  const { mode } = useLocalSearchParams();

  return <SpadesAccountConnectScreen initialMode={normalizeSpadesAccountMode(mode)} />;
}

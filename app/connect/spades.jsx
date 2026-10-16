import { useLocalSearchParams } from 'expo-router';

import SpadesAccountConnectScreen from '../../src/screens/SpadesAccountConnectScreen.jsx';
import {
  normalizeSpadesAccountMode,
  resolveSpadesAccountReturnDestination,
} from '../../src/lib/spadesAccountConnect.js';

export default function SpadesAccountConnectRoute() {
  const { mode, returnTo } = useLocalSearchParams();

  return (
    <SpadesAccountConnectScreen
      initialMode={normalizeSpadesAccountMode(mode)}
      destination={resolveSpadesAccountReturnDestination(returnTo)}
    />
  );
}

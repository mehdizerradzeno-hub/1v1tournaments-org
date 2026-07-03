import { useLocalSearchParams } from 'expo-router';

import CheckInScreen from '../../src/screens/CheckInScreen.jsx';

function normalizeParam(value) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default function CheckInRoute() {
  const { slug } = useLocalSearchParams();

  return <CheckInScreen slug={normalizeParam(slug)} />;
}

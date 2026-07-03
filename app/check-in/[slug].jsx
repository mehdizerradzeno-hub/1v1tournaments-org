import { useLocalSearchParams } from 'expo-router';

import CheckInScreen from '../../src/screens/CheckInScreen.jsx';
import { siteData } from '../../src/lib/siteData.js';

export function generateStaticParams() {
  return siteData.tournaments.map((tournament) => ({
    slug: tournament.slug,
  }));
}

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

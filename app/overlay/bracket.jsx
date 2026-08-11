import { useGlobalSearchParams } from 'expo-router';

import BroadcastBracketScreen from '../../src/screens/BroadcastBracketScreen';

export default function BroadcastBracketRoute() {
  const params = useGlobalSearchParams();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  return <BroadcastBracketScreen tournamentSlug={String(slug || '')} />;
}

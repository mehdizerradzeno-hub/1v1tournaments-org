import { usePathname } from 'expo-router';

import NextScreen from './NextScreen';
import '../styles/tournamentResponsive.css';

export default function TournamentLandingRoute() {
  const pathname = usePathname();

  return <NextScreen showDiscovery={pathname === '/tournaments'} />;
}

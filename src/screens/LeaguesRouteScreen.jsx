import { EmptyState, HubScreen } from '../components/hub-ui.jsx';
import { useHydrated } from '../lib/useHydrated.js';
import LeaguesScreen from './LeaguesScreen.jsx';

function LeaguesLoadingShell() {
  return (
    <HubScreen title="Leagues" subtitle="Loading league data.">
      <EmptyState title="Loading" body="Please wait while leagues load." />
    </HubScreen>
  );
}

export default function LeaguesRouteScreen() {
  const hydrated = useHydrated();

  if (!hydrated) {
    return <LeaguesLoadingShell />;
  }

  return <LeaguesScreen />;
}

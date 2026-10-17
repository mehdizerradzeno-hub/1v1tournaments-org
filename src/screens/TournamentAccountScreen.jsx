import { GameAccountConnectScreen } from './SpadesAccountConnectScreen.jsx';
import {
  resolveTournamentAccountDestination,
  SHARED_ACCOUNT_ACTIONS,
} from '../lib/accountConnect.js';

const TOURNAMENT_HOME_DESTINATION = '/';

async function prepareTournamentAccountReturn(destination) {
  return {
    authorized: true,
    url: destination,
  };
}

export default function TournamentAccountScreen({
  initialEmail = '',
  initialMode = 'signin',
  initialRecoveryToken = '',
  returnTo = TOURNAMENT_HOME_DESTINATION,
}) {
  const destination = resolveTournamentAccountDestination(returnTo);

  return (
    <GameAccountConnectScreen
      accountActions={SHARED_ACCOUNT_ACTIONS}
      badgeLabel="1V1 ACCOUNT"
      destination={destination}
      gameName="Tournament Hub"
      initialEmail={initialEmail}
      initialMode={initialMode}
      initialRecoveryToken={initialRecoveryToken}
      prepareReturn={() => prepareTournamentAccountReturn(destination)}
      returnAfterSignOut
      signedOutManageFallback
      useHubShell
    />
  );
}

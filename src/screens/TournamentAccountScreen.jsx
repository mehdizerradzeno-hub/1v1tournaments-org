import { GameAccountConnectScreen } from './SpadesAccountConnectScreen.jsx';
import {
  prepareTournamentAccountReturn,
  resolveTournamentAccountDestination,
  SHARED_ACCOUNT_ACTIONS,
} from '../lib/accountConnect.js';

const TOURNAMENT_HOME_DESTINATION = '/';

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

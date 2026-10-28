import { GameAccountConnectScreen } from './SpadesAccountConnectScreen.jsx';
import {
  prepareTournamentAccountReturn,
  resolveTournamentAccountDestination,
  SHARED_ACCOUNT_ACTIONS,
  SPADES_HOSTING_DESTINATION,
} from '../lib/accountConnect.js';

const TOURNAMENT_HOME_DESTINATION = '/';

export default function TournamentAccountScreen({
  initialEmail = '',
  initialMode = 'signin',
  initialRecoveryToken = '',
  returnTo = TOURNAMENT_HOME_DESTINATION,
}) {
  const destination = resolveTournamentAccountDestination(returnTo);
  const requireAccountSelection = destination === SPADES_HOSTING_DESTINATION;

  return (
    <GameAccountConnectScreen
      accountActions={SHARED_ACCOUNT_ACTIONS}
      badgeLabel="1V1 ACCOUNT"
      destination={destination}
      gameName={requireAccountSelection ? 'Spades hosting' : 'Tournament Hub'}
      initialEmail={initialEmail}
      initialMode={initialMode}
      initialRecoveryToken={initialRecoveryToken}
      prepareReturn={() => prepareTournamentAccountReturn(destination)}
      requireAccountSelection={requireAccountSelection}
      returnAfterSignOut={!requireAccountSelection}
      signedOutManageFallback
      useHubShell
    />
  );
}

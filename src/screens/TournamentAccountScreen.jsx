import { GameAccountConnectScreen } from './SpadesAccountConnectScreen.jsx';
import { SHARED_ACCOUNT_ACTIONS } from '../lib/accountConnect.js';

const TOURNAMENT_HOME_DESTINATION = '/';

async function prepareTournamentAccountReturn() {
  return {
    authorized: true,
    url: TOURNAMENT_HOME_DESTINATION,
  };
}

export default function TournamentAccountScreen({ initialMode = 'signin' }) {
  return (
    <GameAccountConnectScreen
      accountActions={SHARED_ACCOUNT_ACTIONS}
      badgeLabel="1V1 ACCOUNT"
      destination={TOURNAMENT_HOME_DESTINATION}
      gameName="Tournament Hub"
      initialMode={initialMode}
      prepareReturn={prepareTournamentAccountReturn}
      returnAfterSignOut
      signedOutManageFallback
    />
  );
}

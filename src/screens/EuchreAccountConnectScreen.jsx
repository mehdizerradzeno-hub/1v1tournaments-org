import { GameAccountConnectScreen } from './SpadesAccountConnectScreen.jsx';
import {
  EUCHRE_ACCOUNT_DESTINATION,
  EUCHRE_SIGNED_OUT_ACCOUNT_ACTIONS,
  prepareEuchreAccountReturn,
} from '../lib/euchreAccountConnect.js';

export default function EuchreAccountConnectScreen({ initialMode = 'signin' }) {
  return (
    <GameAccountConnectScreen
      accountActions={EUCHRE_SIGNED_OUT_ACCOUNT_ACTIONS}
      badgeLabel="1V1 EUCHRE"
      destination={EUCHRE_ACCOUNT_DESTINATION}
      gameName="Euchre"
      initialMode={initialMode}
      prepareReturn={prepareEuchreAccountReturn}
      signedOutManageFallback
    />
  );
}

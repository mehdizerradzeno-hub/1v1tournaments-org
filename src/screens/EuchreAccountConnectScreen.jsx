import { GameAccountConnectScreen } from './SpadesAccountConnectScreen.jsx';
import {
  EUCHRE_ACCOUNT_DESTINATION,
  EUCHRE_ACCOUNT_ENTRY_ROUTE,
  EUCHRE_SIGNED_OUT_ACCOUNT_ACTIONS,
  prepareEuchreAccountReturn,
} from '../lib/euchreAccountConnect.js';

export default function EuchreAccountConnectScreen({
  initialEmail = '',
  initialMode = 'signin',
  initialRecoveryToken = '',
}) {
  return (
    <GameAccountConnectScreen
      accountActions={EUCHRE_SIGNED_OUT_ACCOUNT_ACTIONS}
      badgeLabel="1V1 EUCHRE"
      destination={EUCHRE_ACCOUNT_DESTINATION}
      gameName="Euchre"
      initialEmail={initialEmail}
      initialMode={initialMode}
      initialRecoveryToken={initialRecoveryToken}
      passwordRecoveryPath={EUCHRE_ACCOUNT_ENTRY_ROUTE}
      prepareReturn={prepareEuchreAccountReturn}
      signedOutManageFallback
    />
  );
}

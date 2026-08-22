import { GameAccountConnectScreen } from './SpadesAccountConnectScreen.jsx';
import {
  GIN_ACCOUNT_DESTINATION,
  GIN_SIGNED_OUT_ACCOUNT_ACTIONS,
  prepareGinAccountReturn,
} from '../lib/ginAccountConnect.js';

export default function GinAccountConnectScreen({ initialMode = 'signin' }) {
  return (
    <GameAccountConnectScreen
      accountActions={GIN_SIGNED_OUT_ACCOUNT_ACTIONS}
      badgeLabel="1V1 GIN RUMMY"
      destination={GIN_ACCOUNT_DESTINATION}
      gameName="Gin Rummy"
      initialMode={initialMode}
      prepareReturn={prepareGinAccountReturn}
      signedOutManageFallback
    />
  );
}

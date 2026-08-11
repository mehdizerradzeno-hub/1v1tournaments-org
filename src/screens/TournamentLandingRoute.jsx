import { View } from 'react-native';

import NextScreen from './NextScreen';
import '../styles/tournamentResponsive.css';

export default function TournamentLandingRoute() {
  return (
    <View dataSet={{ tournamentPage: 'true' }} style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}>
      <NextScreen />
    </View>
  );
}

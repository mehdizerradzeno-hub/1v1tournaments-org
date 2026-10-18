import { useLocalSearchParams } from 'expo-router';
import AdminHomeScreen from '../src/screens/AdminHomeScreen.jsx';
import AdminScreen from '../src/screens/AdminScreen.jsx';
import { getAdminEntryView } from '../src/lib/adminNavigation.js';

export default function AdminRoute() {
  const query = useLocalSearchParams();
  return getAdminEntryView(query) === 'tournaments' ? <AdminScreen /> : <AdminHomeScreen />;
}

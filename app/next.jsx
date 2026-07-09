import { Redirect } from 'expo-router';

import { getCheckInPath, siteData } from '../src/lib/siteData.js';

export default function NextTournamentShortcut() {
  return <Redirect href={getCheckInPath(siteData.site.primaryTournamentSlug)} />;
}

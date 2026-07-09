import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCheckInPath,
  getGamePath,
  getTournamentBySlug,
  getTournamentPath,
  siteData,
} from '../src/lib/siteData.js';

const spadesRouteFile = fileURLToPath(new URL('../app/spades.jsx', import.meta.url));
const euchreRouteFile = fileURLToPath(new URL('../app/euchre.jsx', import.meta.url));
const aboutRouteFile = fileURLToPath(new URL('../app/about.jsx', import.meta.url));
const contactRouteFile = fileURLToPath(new URL('../app/contact.jsx', import.meta.url));
const leaderboardRouteFile = fileURLToPath(new URL('../app/leaderboard.jsx', import.meta.url));
const liveRouteFile = fileURLToPath(new URL('../app/live.jsx', import.meta.url));
const nextRouteFile = fileURLToPath(new URL('../app/next.jsx', import.meta.url));
const overlayRouteFile = fileURLToPath(new URL('../app/overlay.jsx', import.meta.url));
const overlayBracketRouteFile = fileURLToPath(new URL('../app/overlay/bracket.jsx', import.meta.url));
const overlayCompactRouteFile = fileURLToPath(new URL('../app/overlay/compact.jsx', import.meta.url));
const tournamentRouteFile = fileURLToPath(new URL('../app/tournaments/[slug].jsx', import.meta.url));
const checkInRouteFile = fileURLToPath(new URL('../app/check-in/[slug].jsx', import.meta.url));
const adminRouteFile = fileURLToPath(new URL('../app/admin.jsx', import.meta.url));
const hubUiFile = fileURLToPath(new URL('../src/components/hub-ui.jsx', import.meta.url));
const homeScreenFile = fileURLToPath(new URL('../src/screens/HomeScreen.jsx', import.meta.url));
const adminScreenFile = fileURLToPath(new URL('../src/screens/AdminScreen.jsx', import.meta.url));
const leaderboardScreenFile = fileURLToPath(new URL('../src/screens/LeaderboardScreen.jsx', import.meta.url));
const liveScreenFile = fileURLToPath(new URL('../src/screens/LiveScreen.jsx', import.meta.url));
const nextScreenFile = fileURLToPath(new URL('../src/screens/NextScreen.jsx', import.meta.url));
const overlayScreenFile = fileURLToPath(new URL('../src/screens/OverlayScreen.jsx', import.meta.url));
const resultsScreenFile = fileURLToPath(new URL('../src/screens/ResultsScreen.jsx', import.meta.url));
const rulesScreenFile = fileURLToPath(new URL('../src/screens/RulesScreen.jsx', import.meta.url));
const checkInScreenFile = fileURLToPath(new URL('../src/screens/CheckInScreen.jsx', import.meta.url));
const tournamentScreenFile = fileURLToPath(new URL('../src/screens/TournamentScreen.jsx', import.meta.url));
const signupFunctionFile = fileURLToPath(new URL('../netlify/functions/tournament-signup.mjs', import.meta.url));
const playerAccountFunctionFile = fileURLToPath(new URL('../netlify/functions/player-account.mjs', import.meta.url));
const accountUtilsFunctionFile = fileURLToPath(new URL('../netlify/functions/_account-utils.mjs', import.meta.url));
const hostAuthFunctionFile = fileURLToPath(new URL('../netlify/functions/_host-auth.mjs', import.meta.url));
const adminRosterFunctionFile = fileURLToPath(new URL('../netlify/functions/admin-roster.mjs', import.meta.url));
const tournamentBracketFunctionFile = fileURLToPath(new URL('../netlify/functions/tournament-bracket.mjs', import.meta.url));
const tournamentMatchAccessFunctionFile = fileURLToPath(new URL('../netlify/functions/tournament-match-access.mjs', import.meta.url));
const tournamentPlayerStatusFunctionFile = fileURLToPath(new URL('../netlify/functions/tournament-player-status.mjs', import.meta.url));
const tournamentSettingsFunctionFile = fileURLToPath(new URL('../netlify/functions/tournament-settings.mjs', import.meta.url));
const tournamentSettingsUtilsFile = fileURLToPath(new URL('../netlify/functions/_tournament-settings-utils.mjs', import.meta.url));
const tournamentEventsFunctionFile = fileURLToPath(new URL('../netlify/functions/tournament-events.mjs', import.meta.url));
const tournamentEventsUtilsFile = fileURLToPath(new URL('../netlify/functions/_tournament-events-utils.mjs', import.meta.url));
const discordAlertFunctionFile = fileURLToPath(new URL('../netlify/functions/discord-alert.mjs', import.meta.url));
const hostingClientFile = fileURLToPath(new URL('../src/lib/tournamentHostingClient.js', import.meta.url));
const tournamentCatalogFile = fileURLToPath(new URL('../src/lib/tournamentCatalog.js', import.meta.url));
const tournamentSettingsClientFile = fileURLToPath(new URL('../src/lib/tournamentSettings.js', import.meta.url));
const netlifyConfigFile = fileURLToPath(new URL('../netlify.toml', import.meta.url));

test('/spades stays wired to the dedicated Spades route file', () => {
  assert.equal(getGamePath('spades'), '/spades');
  assert.ok(existsSync(spadesRouteFile));
});

test('/euchre stays wired to the dedicated Euchre route file', () => {
  assert.equal(getGamePath('euchre'), '/euchre');
  assert.ok(existsSync(euchreRouteFile));
});

test('/about stays wired to the public organization page', () => {
  assert.ok(existsSync(aboutRouteFile));
});

test('/contact stays wired to the public contact page', () => {
  assert.ok(existsSync(contactRouteFile));
});

test('/leaderboard stays wired to tournament-only rankings', () => {
  assert.ok(existsSync(leaderboardRouteFile));
  assert.ok(existsSync(leaderboardScreenFile));
  const leaderboardScreenSource = readFileSync(leaderboardScreenFile, 'utf8');

  assert.match(leaderboardScreenSource, /buildTournamentLeaderboard/);
  assert.match(leaderboardScreenSource, /Tournament rankings/);
  assert.match(leaderboardScreenSource, /separate from the Spades in-game leaderboard/);
});

test('homepage stays focused on the stream-day front door', () => {
  assert.ok(existsSync(homeScreenFile));

  const homeScreenSource = readFileSync(homeScreenFile, 'utf8');

  assert.match(homeScreenSource, /HomepageFrontDoor/);
  assert.match(homeScreenSource, /Choose your next move/);
  assert.match(homeScreenSource, /Next tournament/);
  assert.match(homeScreenSource, /Watch live/);
  assert.match(homeScreenSource, /Join tournament/);
  assert.match(homeScreenSource, /Compact lobby/);
  assert.match(homeScreenSource, /TwitchTournamentBoard/);
});

test('public support pages keep players routed back to active tournament flow', () => {
  assert.ok(existsSync(hubUiFile));
  assert.ok(existsSync(resultsScreenFile));
  assert.ok(existsSync(leaderboardScreenFile));
  assert.ok(existsSync(rulesScreenFile));

  const hubUiSource = readFileSync(hubUiFile, 'utf8');
  const resultsScreenSource = readFileSync(resultsScreenFile, 'utf8');
  const leaderboardScreenSource = readFileSync(leaderboardScreenFile, 'utf8');
  const rulesScreenSource = readFileSync(rulesScreenFile, 'utf8');

  assert.match(hubUiSource, /PlayerRouteStrip/);
  assert.match(hubUiSource, /PRIMARY_TOURNAMENT_PATH/);
  assert.match(hubUiSource, /PRIMARY_MATCH_PATH/);
  assert.match(resultsScreenSource, /PlayerRouteStrip/);
  assert.match(leaderboardScreenSource, /PlayerRouteStrip/);
  assert.match(rulesScreenSource, /PlayerRouteStrip/);
  assert.match(resultsScreenSource, /heroVariant="compact"/);
  assert.match(leaderboardScreenSource, /heroVariant="compact"/);
  assert.match(rulesScreenSource, /heroVariant="compact"/);
  assert.match(resultsScreenSource, /stickyActions=\{false\}/);
  assert.match(leaderboardScreenSource, /stickyActions=\{false\}/);
  assert.match(rulesScreenSource, /stickyActions=\{false\}/);
});

test('/next stays wired to the public next-event lobby', () => {
  assert.ok(existsSync(nextRouteFile));
  assert.ok(existsSync(nextScreenFile));
  assert.ok(existsSync(netlifyConfigFile));

  const nextRouteSource = readFileSync(nextRouteFile, 'utf8');
  const nextScreenSource = readFileSync(nextScreenFile, 'utf8');
  const netlifyConfigSource = readFileSync(netlifyConfigFile, 'utf8');

  assert.match(nextRouteSource, /NextScreen/);
  assert.doesNotMatch(nextRouteSource, /Redirect/);
  assert.match(nextScreenSource, /Next tournament lobby/);
  assert.match(nextScreenSource, /heroVariant="compact"/);
  assert.match(nextScreenSource, /stickyActions=\{false\}/);
  assert.match(nextScreenSource, /Starts in/);
  assert.match(nextScreenSource, /Signed up players/);
  assert.match(nextScreenSource, /setInterval\(loadEventData, 15000\)/);
  assert.doesNotMatch(netlifyConfigSource, /from = "\/next"[\s\S]*status = 302/);
});

test('/live stays wired to stream-day command tools', () => {
  assert.ok(existsSync(liveRouteFile));
  assert.ok(existsSync(liveScreenFile));
  assert.ok(existsSync(discordAlertFunctionFile));

  const liveScreenSource = readFileSync(liveScreenFile, 'utf8');
  const hostingClientSource = readFileSync(hostingClientFile, 'utf8');
  const discordAlertSource = readFileSync(discordAlertFunctionFile, 'utf8');

  assert.match(liveScreenSource, /Go-live checklist/);
  assert.match(liveScreenSource, /LiveCockpit/);
  assert.match(liveScreenSource, /LiveTabCommandCard/);
  assert.match(liveScreenSource, /Cockpit/);
  assert.match(liveScreenSource, /heroVariant="compact"/);
  assert.match(liveScreenSource, /stickyActions=\{false\}/);
  assert.match(liveScreenSource, /Control room/);
  assert.match(liveScreenSource, /OBS control/);
  assert.match(liveScreenSource, /Announcement control/);
  assert.match(liveScreenSource, /Links control/);
  assert.match(liveScreenSource, /Presentation setup/);
  assert.match(liveScreenSource, /Twitch command list/);
  assert.match(liveScreenSource, /!join/);
  assert.match(liveScreenSource, /!match/);
  assert.match(liveScreenSource, /Announcement kit/);
  assert.match(liveScreenSource, /Run of show/);
  assert.match(liveScreenSource, /OBS scene map/);
  assert.match(liveScreenSource, /navigator\.clipboard\.writeText/);
  assert.match(liveScreenSource, /Send live alert/);
  assert.match(liveScreenSource, /Fallback admin token/);
  assert.match(liveScreenSource, /TOURNAMENT_ADMIN_TOKEN/);
  assert.match(liveScreenSource, /sendDiscordAlert/);
  assert.match(hostingClientSource, /DISCORD_ALERT_ENDPOINT/);
  assert.match(hostingClientSource, /sendDiscordAlert/);
  assert.match(discordAlertSource, /DISCORD_WEBHOOK_URL/);
  assert.match(discordAlertSource, /requireTournamentAdmin/);
  assert.match(discordAlertSource, /allowed_mentions/);
});

test('overlay routes stay wired to OBS browser sources', () => {
  assert.ok(existsSync(overlayRouteFile));
  assert.ok(existsSync(overlayBracketRouteFile));
  assert.ok(existsSync(overlayCompactRouteFile));
  assert.ok(existsSync(overlayScreenFile));

  const bracketRouteSource = readFileSync(overlayBracketRouteFile, 'utf8');
  const compactRouteSource = readFileSync(overlayCompactRouteFile, 'utf8');
  const overlayScreenSource = readFileSync(overlayScreenFile, 'utf8');

  assert.match(bracketRouteSource, /variant="bracket"/);
  assert.match(compactRouteSource, /variant="compact"/);
  assert.match(overlayScreenSource, /setInterval\(loadEventData, 15000\)/);
  assert.match(overlayScreenSource, /getOverlayStatusLabel/);
});

test('the featured tournament route stays wired to the Spades launch event', () => {
  const featuredSlug = siteData.site.primaryTournamentSlug;
  const tournament = getTournamentBySlug(featuredSlug);

  assert.equal(getTournamentPath(featuredSlug), '/tournaments/spades-summer-series');
  assert.ok(existsSync(tournamentRouteFile));
  assert.ok(tournament);
  assert.equal(tournament?.gameSlug, 'spades');
  assert.deepEqual(tournament?.streamSlugs, ['main-live', 'replay-archive']);
});

test('dynamic public routes declare static export params for Netlify deep links', () => {
  const tournamentRouteSource = readFileSync(tournamentRouteFile, 'utf8');
  const checkInRouteSource = readFileSync(checkInRouteFile, 'utf8');

  assert.match(tournamentRouteSource, /export function generateStaticParams/);
  assert.match(tournamentRouteSource, /siteData\.tournaments\.map/);
  assert.match(checkInRouteSource, /export function generateStaticParams/);
  assert.match(checkInRouteSource, /siteData\.tournaments\.map/);
});

test('the signup route stays wired to the public tournament path', () => {
  assert.equal(getCheckInPath('spades-summer-series'), '/check-in/spades-summer-series');
  assert.ok(existsSync(checkInRouteFile));
});

test('phase 1 signup capture and public counts stay wired through Netlify Functions and Blobs', () => {
  assert.ok(existsSync(signupFunctionFile));
  assert.ok(existsSync(playerAccountFunctionFile));
  assert.ok(existsSync(accountUtilsFunctionFile));
  assert.ok(existsSync(hostAuthFunctionFile));
  assert.ok(existsSync(adminRosterFunctionFile));
  assert.ok(existsSync(tournamentBracketFunctionFile));
  assert.ok(existsSync(tournamentMatchAccessFunctionFile));
  assert.ok(existsSync(tournamentPlayerStatusFunctionFile));
  assert.ok(existsSync(tournamentSettingsFunctionFile));
  assert.ok(existsSync(tournamentSettingsUtilsFile));
  assert.ok(existsSync(tournamentEventsFunctionFile));
  assert.ok(existsSync(tournamentEventsUtilsFile));
  assert.ok(existsSync(hubUiFile));
  assert.ok(existsSync(homeScreenFile));
  assert.ok(existsSync(leaderboardScreenFile));
  assert.ok(existsSync(checkInScreenFile));
  assert.ok(existsSync(tournamentScreenFile));
  assert.ok(existsSync(hostingClientFile));
  assert.ok(existsSync(tournamentCatalogFile));
  assert.ok(existsSync(tournamentSettingsClientFile));

  const signupFunctionSource = readFileSync(signupFunctionFile, 'utf8');
  const playerAccountSource = readFileSync(playerAccountFunctionFile, 'utf8');
  const accountUtilsSource = readFileSync(accountUtilsFunctionFile, 'utf8');
  const hostAuthSource = readFileSync(hostAuthFunctionFile, 'utf8');
  const adminRosterSource = readFileSync(adminRosterFunctionFile, 'utf8');
  const tournamentBracketSource = readFileSync(tournamentBracketFunctionFile, 'utf8');
  const tournamentMatchAccessSource = readFileSync(tournamentMatchAccessFunctionFile, 'utf8');
  const tournamentPlayerStatusSource = readFileSync(tournamentPlayerStatusFunctionFile, 'utf8');
  const tournamentSettingsSource = readFileSync(tournamentSettingsFunctionFile, 'utf8');
  const tournamentSettingsUtilsSource = readFileSync(tournamentSettingsUtilsFile, 'utf8');
  const tournamentEventsSource = readFileSync(tournamentEventsFunctionFile, 'utf8');
  const tournamentEventsUtilsSource = readFileSync(tournamentEventsUtilsFile, 'utf8');
  const hubUiSource = readFileSync(hubUiFile, 'utf8');
  const homeScreenSource = readFileSync(homeScreenFile, 'utf8');
  const leaderboardScreenSource = readFileSync(leaderboardScreenFile, 'utf8');
  const checkInScreenSource = readFileSync(checkInScreenFile, 'utf8');
  const tournamentScreenSource = readFileSync(tournamentScreenFile, 'utf8');
  const hostingClientSource = readFileSync(hostingClientFile, 'utf8');
  const tournamentCatalogSource = readFileSync(tournamentCatalogFile, 'utf8');
  const tournamentSettingsClientSource = readFileSync(tournamentSettingsClientFile, 'utf8');

  assert.match(signupFunctionSource, /@netlify\/blobs/);
  assert.match(signupFunctionSource, /event\.httpMethod === 'GET'/);
  assert.match(signupFunctionSource, /signupCount/);
  assert.match(signupFunctionSource, /getAccountFromEvent/);
  assert.match(signupFunctionSource, /accountId/);
  assert.match(signupFunctionSource, /loadTournamentSettings/);
  assert.match(signupFunctionSource, /registrationStatus/);
  assert.match(signupFunctionSource, /loadTournamentBracket/);
  assert.match(signupFunctionSource, /tournamentStartedMessage/);
  assert.match(signupFunctionSource, /publicTournamentDate/);
  assert.match(signupFunctionSource, /existingByLegacyEmail/);
  assert.match(signupFunctionSource, /linkedSignup/);
  assert.match(playerAccountSource, /createPasswordRecord/);
  assert.match(playerAccountSource, /sessionCookie/);
  assert.match(playerAccountSource, /confirmPassword/);
  assert.match(playerAccountSource, /number or symbol/);
  assert.match(playerAccountSource, /hostApproved/);
  assert.match(accountUtilsSource, /player-accounts/);
  assert.match(accountUtilsSource, /player-sessions/);
  assert.match(hostAuthSource, /TOURNAMENT_HOST_ACCOUNT_EMAILS/);
  assert.match(hostAuthSource, /requireTournamentAdmin/);
  assert.match(adminRosterSource, /@netlify\/blobs/);
  assert.match(adminRosterSource, /requireTournamentAdmin/);
  assert.match(adminRosterSource, /accountId/);
  assert.match(adminRosterSource, /clear-tournament/);
  assert.match(adminRosterSource, /deleteTournamentSignups/);
  assert.match(adminRosterSource, /tournament-brackets/);
  assert.match(tournamentBracketSource, /tournament-brackets/);
  assert.match(tournamentBracketSource, /loadTournamentMode/);
  assert.match(tournamentBracketSource, /canGenerateTournamentMode/);
  assert.match(tournamentBracketSource, /buildFourPlayerDoubleEliminationBracket/);
  assert.match(tournamentBracketSource, /loserNextMatchId/);
  assert.match(tournamentBracketSource, /resetMatchId/);
  assert.match(tournamentBracketSource, /accountId/);
  assert.match(tournamentMatchAccessSource, /tournament-match-tickets/);
  assert.match(tournamentMatchAccessSource, /getAccountFromEvent/);
  assert.match(tournamentMatchAccessSource, /issue-ticket/);
  assert.match(tournamentMatchAccessSource, /verify-ticket/);
  assert.match(tournamentMatchAccessSource, /findSignupForAccount/);
  assert.match(tournamentMatchAccessSource, /ticketMatchesPlayer/);
  assert.match(tournamentMatchAccessSource, /signupId/);
  assert.match(tournamentPlayerStatusSource, /getAccountFromEvent/);
  assert.match(tournamentPlayerStatusSource, /currentMatch/);
  assert.match(tournamentPlayerStatusSource, /ready-match/);
  assert.match(tournamentPlayerStatusSource, /signupMatchesAccount/);
  assert.match(tournamentPlayerStatusSource, /contactEmail/);
  assert.match(tournamentSettingsSource, /requireTournamentAdmin/);
  assert.match(tournamentSettingsSource, /saveTournamentSettings/);
  assert.match(tournamentSettingsSource, /action === 'reset'/);
  assert.match(tournamentSettingsUtilsSource, /tournament-settings/);
  assert.match(tournamentSettingsUtilsSource, /registrationStatus/);
  assert.match(tournamentEventsSource, /requireTournamentAdmin/);
  assert.match(tournamentEventsSource, /listHostedTournaments/);
  assert.match(tournamentEventsSource, /saveHostedTournament/);
  assert.match(tournamentEventsUtilsSource, /tournament-events/);
  assert.match(tournamentEventsUtilsSource, /normalizeHostedTournament/);
  assert.match(hubUiSource, /MOBILE_NAV_ITEMS/);
  assert.match(hubUiSource, /My match/);
  assert.match(hubUiSource, /Leaderboard/);
  assert.match(hubUiSource, /Ranks/);
  assert.match(hubUiSource, /fetchPlayerAccount/);
  assert.match(hubUiSource, /hostApproved/);
  assert.match(hubUiSource, /showMobileNav/);
  assert.match(homeScreenSource, /My match/);
  assert.match(homeScreenSource, /Tournament leaderboard/);
  assert.match(homeScreenSource, /mergeTournamentSettings/);
  assert.match(homeScreenSource, /fetchTournamentEvents/);
  assert.match(homeScreenSource, /mergeTournamentLists/);
  assert.match(leaderboardScreenSource, /buildTournamentLeaderboard/);
  assert.match(leaderboardScreenSource, /Overall standings/);
  assert.doesNotMatch(homeScreenSource, /Host admin/);
  assert.match(tournamentScreenSource, /nativeID="my-match"/);
  assert.match(tournamentScreenSource, /nativeID="registered-players"/);
  assert.match(tournamentScreenSource, /TOURNAMENT_TABS/);
  assert.match(tournamentScreenSource, /TournamentTabs/);
  assert.match(tournamentScreenSource, /TournamentEventConsole/);
  assert.match(tournamentScreenSource, /Event console/);
  assert.match(tournamentScreenSource, /Player command center/);
  assert.match(tournamentScreenSource, /Tournament format/);
  assert.match(tournamentScreenSource, /TournamentFormatCard/);
  assert.match(tournamentScreenSource, /getTournamentFormatDetails/);
  assert.match(tournamentScreenSource, /Exactly 4 players/);
  assert.match(tournamentScreenSource, /TournamentTabCommandCard/);
  assert.match(tournamentScreenSource, /Roster control/);
  assert.match(tournamentScreenSource, /Bracket control/);
  assert.match(tournamentScreenSource, /heroVariant="compact"/);
  assert.match(tournamentScreenSource, /stickyActions=\{false\}/);
  assert.match(tournamentScreenSource, /title="My match"/);
  assert.match(tournamentScreenSource, /fetchTournamentEvent/);
  assert.match(tournamentScreenSource, /mergeTournamentSettings/);
  assert.match(tournamentScreenSource, /getEffectiveRegistrationStatus/);
  assert.match(tournamentScreenSource, /Ticket path/);
  assert.doesNotMatch(tournamentScreenSource, /Open \/spades/);
  assert.doesNotMatch(tournamentScreenSource, /Launch gameplay/);
  assert.doesNotMatch(tournamentScreenSource, /Host admin/);
  assert.match(checkInScreenSource, /Confirm password/);
  assert.match(checkInScreenSource, /Password requirements/);
  assert.match(checkInScreenSource, /registrationOpen/);
  assert.match(checkInScreenSource, /fetchTournamentEvent/);
  assert.match(checkInScreenSource, /mergeTournamentSettings/);
  assert.match(checkInScreenSource, /fetchTournamentBracket/);
  assert.match(hostingClientSource, /fetchPlayerAccount/);
  assert.match(hostingClientSource, /createPlayerAccount/);
  assert.match(hostingClientSource, /fetchSignupSummary/);
  assert.match(hostingClientSource, /fetchTournamentPlayerStatus/);
  assert.match(hostingClientSource, /generateTournamentBracket/);
  assert.match(hostingClientSource, /clearTournamentData/);
  assert.match(hostingClientSource, /fetchTournamentSettings/);
  assert.match(hostingClientSource, /fetchTournamentEvents/);
  assert.match(hostingClientSource, /saveTournamentEvent/);
  assert.match(hostingClientSource, /deleteTournamentEvent/);
  assert.match(hostingClientSource, /saveTournamentSettings/);
  assert.match(hostingClientSource, /resetTournamentSettings/);
  assert.match(hostingClientSource, /fetchTournamentMatch/);
  assert.match(hostingClientSource, /issueTournamentMatchTicket/);
  assert.match(tournamentCatalogSource, /createTournamentRecord/);
  assert.match(tournamentCatalogSource, /getTournamentMode/);
  assert.match(tournamentCatalogSource, /slugifyTournamentTitle/);
  assert.match(tournamentCatalogSource, /mergeTournamentLists/);
  assert.match(tournamentSettingsClientSource, /REGISTRATION_STATUS_OPTIONS/);
  assert.match(tournamentSettingsClientSource, /getEffectiveRegistrationStatus/);
  assert.match(tournamentSettingsClientSource, /zonedDateTimeToIso/);
});

test('Spades match results can report winners through a narrow callback token', () => {
  const tournamentBracketSource = readFileSync(tournamentBracketFunctionFile, 'utf8');
  const readmeSource = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8');

  assert.match(tournamentBracketSource, /TOURNAMENT_MATCH_RESULT_TOKEN/);
  assert.match(tournamentBracketSource, /requireMatchReporter/);
  assert.match(tournamentBracketSource, /reportWinnerWithRetry/);
  assert.match(tournamentBracketSource, /publicMatchDetails/);
  assert.match(tournamentBracketSource, /resultCallback/);
  assert.match(tournamentBracketSource, /getTournamentSlug/);
  assert.match(tournamentBracketSource, /payload\.action === 'reset'/);
  assert.match(readmeSource, /Spades Match Result Callback/);
  assert.match(readmeSource, /GET https:\/\/1v1tournaments\.org\/\.netlify\/functions\/tournament-bracket\?matchId=/);
  assert.match(readmeSource, /"action": "report-winner"/);
});

test('the private admin route stays wired to the hub editor shell', () => {
  assert.ok(existsSync(adminRouteFile));
  assert.ok(existsSync(adminScreenFile));
  const adminScreenSource = readFileSync(adminScreenFile, 'utf8');
  const hostingClientSource = readFileSync(hostingClientFile, 'utf8');

  assert.match(adminScreenSource, /resetTournamentBracket/);
  assert.match(adminScreenSource, /handleCopyMatchCallback/);
  assert.match(adminScreenSource, /Host checklist/);
  assert.match(adminScreenSource, /getBracketReadiness/);
  assert.match(adminScreenSource, /Exactly 4 players/);
  assert.match(adminScreenSource, /handleCopyPlayerInstructions/);
  assert.match(adminScreenSource, /Reset tournament/);
  assert.match(adminScreenSource, /Clear tournament/);
  assert.match(adminScreenSource, /Yes, clear tournament/);
  assert.match(adminScreenSource, /deleteTournamentEvent/);
  assert.match(adminScreenSource, /Post tournament/);
  assert.match(adminScreenSource, /Tournament mode/);
  assert.match(adminScreenSource, /TOURNAMENT_MODES/);
  assert.match(adminScreenSource, /Save event/);
  assert.match(adminScreenSource, /New tournament/);
  assert.match(adminScreenSource, /saveTournamentEvent/);
  assert.match(adminScreenSource, /Player match page/);
  assert.match(adminScreenSource, /handleSaveScheduleSettings/);
  assert.match(adminScreenSource, /resetTournamentSettings/);
  assert.match(adminScreenSource, /Host approved/);
  assert.match(adminScreenSource, /hostApproved/);
  assert.match(hostingClientSource, /resetTournamentBracket/);
  assert.match(hostingClientSource, /adminHeaders/);
  assert.match(hostingClientSource, /credentials: 'include'/);
});

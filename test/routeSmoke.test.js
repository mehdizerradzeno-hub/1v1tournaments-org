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
const sponsorsRouteFile = fileURLToPath(new URL('../app/sponsors.jsx', import.meta.url));
const mediaKitRouteFile = fileURLToPath(new URL('../app/media-kit.jsx', import.meta.url));
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
const sponsorPublicScreenFile = fileURLToPath(new URL('../src/screens/SponsorPublicScreen.jsx', import.meta.url));
const sponsorAdminScreenFile = fileURLToPath(new URL('../src/screens/SponsorAdminScreen.jsx', import.meta.url));
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
const streamCommandsFunctionFile = fileURLToPath(new URL('../netlify/functions/stream-commands.mjs', import.meta.url));
const healthFunctionFile = fileURLToPath(new URL('../netlify/functions/health.mjs', import.meta.url));
const sponsorInquiriesFunctionFile = fileURLToPath(new URL('../netlify/functions/sponsor-inquiries.mjs', import.meta.url));
const sponsorProspectsFunctionFile = fileURLToPath(new URL('../netlify/functions/sponsor-prospects.mjs', import.meta.url));
const sponsorCollateralFunctionFile = fileURLToPath(new URL('../netlify/functions/sponsor-collateral.mjs', import.meta.url));
const hostingClientFile = fileURLToPath(new URL('../src/lib/tournamentHostingClient.js', import.meta.url));
const streamCommandsClientFile = fileURLToPath(new URL('../src/lib/streamCommands.js', import.meta.url));
const twitchBotScriptFile = fileURLToPath(new URL('../scripts/twitch-chat-bot.mjs', import.meta.url));
const packageFile = fileURLToPath(new URL('../package.json', import.meta.url));
const gitignoreFile = fileURLToPath(new URL('../.gitignore', import.meta.url));
const twitchBotEnvExampleFile = fileURLToPath(new URL('../.env.twitch-bot.example', import.meta.url));
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

test('/sponsors and /media-kit stay wired to public sponsor pages', () => {
  assert.ok(existsSync(sponsorsRouteFile));
  assert.ok(existsSync(mediaKitRouteFile));
  assert.ok(existsSync(sponsorPublicScreenFile));
  assert.ok(existsSync(sponsorAdminScreenFile));
  assert.ok(existsSync(sponsorInquiriesFunctionFile));
  assert.ok(existsSync(sponsorProspectsFunctionFile));
  assert.ok(existsSync(sponsorCollateralFunctionFile));

  const sponsorScreenSource = readFileSync(sponsorPublicScreenFile, 'utf8');
  const sponsorAdminScreenSource = readFileSync(sponsorAdminScreenFile, 'utf8');
  const sponsorInquiriesSource = readFileSync(sponsorInquiriesFunctionFile, 'utf8');
  const sponsorProspectsSource = readFileSync(sponsorProspectsFunctionFile, 'utf8');
  const sponsorCollateralSource = readFileSync(sponsorCollateralFunctionFile, 'utf8');

  assert.match(sponsorScreenSource, /Reach a Competitive Card-Game Community/);
  assert.match(sponsorScreenSource, /Audience metrics are omitted publicly until verified/);
  assert.match(sponsorScreenSource, /Private CRM details are never shown publicly/);
  assert.match(sponsorScreenSource, /submitSponsorInquiry/);
  assert.match(sponsorAdminScreenSource, /SPONSOR_WORKSPACE_TABS/);
  assert.match(sponsorAdminScreenSource, /activeTab/);
  assert.match(sponsorAdminScreenSource, /Save edits/);
  assert.match(sponsorAdminScreenSource, /saveDraftEdit/);
  assert.match(sponsorAdminScreenSource, /saveProposalEdit/);
  assert.match(sponsorInquiriesSource, /requireTournamentAdmin/);
  assert.match(sponsorInquiriesSource, /RATE_LIMIT_MAX/);
  assert.match(sponsorInquiriesSource, /sponsor-inquiries/);
  assert.match(sponsorProspectsSource, /requireTournamentAdmin/);
  assert.match(sponsorProspectsSource, /sponsor-prospects/);
  assert.match(sponsorProspectsSource, /upsert-many/);
  assert.match(sponsorProspectsSource, /update-status/);
  assert.match(sponsorCollateralSource, /requireTournamentAdmin/);
  assert.match(sponsorCollateralSource, /sponsor-outreach-drafts/);
  assert.match(sponsorCollateralSource, /sponsor-deals/);
  assert.match(sponsorCollateralSource, /revisionHistory/);
  assert.match(sponsorCollateralSource, /MAX_REVISION_HISTORY/);
  assert.match(sponsorCollateralSource, /archive/);
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
  assert.match(homeScreenSource, /My Match/);
  assert.match(homeScreenSource, /Join/);
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
  assert.match(hubUiSource, /getNextNavTournamentSlug/);
  assert.match(hubUiSource, /My Match/);
  assert.match(hubUiSource, /Player path/);
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
  assert.match(nextScreenSource, /Tournament status/);
  assert.match(nextScreenSource, /heroVariant="compact"/);
  assert.match(nextScreenSource, /stickyActions=\{false\}/);
  assert.match(nextScreenSource, /Starts in/);
  assert.match(nextScreenSource, /Signed up players/);
  assert.match(nextScreenSource, /Twitch commands/);
  assert.match(nextScreenSource, /Scan to join/);
  assert.match(nextScreenSource, /NEXT_CHAT_COMMANDS/);
  assert.match(nextScreenSource, /setInterval\(loadEventData, 15000\)/);
  assert.doesNotMatch(netlifyConfigSource, /from = "\/next"[\s\S]*status = 302/);
});

test('/live stays wired to stream-day command tools', () => {
  assert.ok(existsSync(liveRouteFile));
  assert.ok(existsSync(liveScreenFile));
  assert.ok(existsSync(discordAlertFunctionFile));
  assert.ok(existsSync(streamCommandsFunctionFile));
  assert.ok(existsSync(healthFunctionFile));

  const liveScreenSource = readFileSync(liveScreenFile, 'utf8');
  const hostingClientSource = readFileSync(hostingClientFile, 'utf8');
  const discordAlertSource = readFileSync(discordAlertFunctionFile, 'utf8');
  const streamCommandsSource = readFileSync(streamCommandsFunctionFile, 'utf8');
  const healthSource = readFileSync(healthFunctionFile, 'utf8');
  const streamCommandsClientSource = readFileSync(streamCommandsClientFile, 'utf8');

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
  assert.match(liveScreenSource, /fetchStreamCommands/);
  assert.match(liveScreenSource, /Copy command/);
  assert.match(liveScreenSource, /Announcement kit/);
  assert.match(liveScreenSource, /Run of show/);
  assert.match(liveScreenSource, /OBS scene map/);
  assert.match(liveScreenSource, /navigator\.clipboard\.writeText/);
  assert.match(liveScreenSource, /Send live alert/);
  assert.match(liveScreenSource, /Fallback admin token/);
  assert.match(liveScreenSource, /TOURNAMENT_ADMIN_TOKEN/);
  assert.match(liveScreenSource, /sendDiscordAlert/);
  assert.match(liveScreenSource, /fetchRuntimeHealth/);
  assert.match(liveScreenSource, /Render bot online/);
  assert.match(liveScreenSource, /Last heartbeat/);
  assert.match(hostingClientSource, /DISCORD_ALERT_ENDPOINT/);
  assert.match(hostingClientSource, /sendDiscordAlert/);
  assert.match(hostingClientSource, /STREAM_COMMANDS_ENDPOINT/);
  assert.match(hostingClientSource, /fetchStreamCommands/);
  assert.match(hostingClientSource, /HEALTH_ENDPOINT/);
  assert.match(hostingClientSource, /fetchRuntimeHealth/);
  assert.match(hostingClientSource, /SPONSOR_INQUIRIES_ENDPOINT/);
  assert.match(hostingClientSource, /fetchSponsorInquiries/);
  assert.match(hostingClientSource, /updateSponsorInquiryStatus/);
  assert.match(streamCommandsSource, /stream-commands/);
  assert.match(streamCommandsSource, /requireTournamentAdmin/);
  assert.match(streamCommandsSource, /normalizeStreamCommands/);
  assert.match(streamCommandsClientSource, /buildDefaultStreamCommands/);
  assert.match(streamCommandsClientSource, /!join/);
  assert.match(streamCommandsClientSource, /!signup/);
  assert.match(streamCommandsClientSource, /!match/);
  assert.match(streamCommandsClientSource, /!format/);
  assert.match(streamCommandsClientSource, /!results/);
  assert.match(discordAlertSource, /DISCORD_WEBHOOK_URL/);
  assert.match(discordAlertSource, /requireTournamentAdmin/);
  assert.match(discordAlertSource, /allowed_mentions/);
  assert.match(healthSource, /HEALTH_MONITOR_TOKEN/);
  assert.match(healthSource, /runtime-health/);
  assert.match(healthSource, /twitch-bot\.json/);
  assert.match(healthSource, /Heartbeat stale/);
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
  assert.ok(existsSync(nextScreenFile));
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
  const nextScreenSource = readFileSync(nextScreenFile, 'utf8');
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
  assert.match(tournamentBracketSource, /checkInOpenStatus/);
  assert.match(tournamentBracketSource, /Check-in has not opened yet/);
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
  assert.match(tournamentPlayerStatusSource, /isPlayerEliminated/);
  assert.match(tournamentPlayerStatusSource, /three-player-two-life/);
  assert.match(tournamentPlayerStatusSource, /four-player-double-elimination/);
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
  assert.match(hubUiSource, /getMobileNavItems/);
  assert.match(hubUiSource, /My Match/);
  assert.match(hubUiSource, /Event/);
  assert.match(hubUiSource, /Watch/);
  assert.doesNotMatch(hubUiSource, /label: 'Ranks'/);
  assert.match(hubUiSource, /fetchPlayerAccount/);
  assert.match(hubUiSource, /hostApproved/);
  assert.match(hubUiSource, /showMobileNav/);
  assert.match(homeScreenSource, /My Match/);
  assert.match(homeScreenSource, /Tournament leaderboard/);
  assert.match(homeScreenSource, /mergeTournamentSettings/);
  assert.match(homeScreenSource, /fetchTournamentEvents/);
  assert.match(homeScreenSource, /mergeTournamentLists/);
  assert.match(nextScreenSource, /showHeader=\{false\}/);
  assert.ok(
    nextScreenSource.indexOf('styles.countdownPanel') < nextScreenSource.indexOf('styles.heroBadgeRow'),
    '/next must keep the countdown panel above supporting event badges',
  );
  assert.match(leaderboardScreenSource, /buildTournamentLeaderboard/);
  assert.match(leaderboardScreenSource, /Overall standings/);
  assert.doesNotMatch(homeScreenSource, /Host admin/);
  assert.match(tournamentScreenSource, /nativeID="my-match"/);
  assert.match(tournamentScreenSource, /nativeID="registered-players"/);
  assert.match(tournamentScreenSource, /TOURNAMENT_TABS/);
  assert.match(tournamentScreenSource, /TournamentTabs/);
  assert.match(tournamentScreenSource, /TournamentEventConsole/);
  assert.match(tournamentScreenSource, /Event console/);
  assert.match(tournamentScreenSource, /TournamentArrivalRail/);
  assert.match(tournamentScreenSource, /Arriving from Twitch/);
  assert.match(tournamentScreenSource, /TWITCH_VIEWER_COMMANDS/);
  assert.match(tournamentScreenSource, /Player command center/);
  assert.match(tournamentScreenSource, /Tournament format/);
  assert.match(tournamentScreenSource, /TournamentFormatCard/);
  assert.match(tournamentScreenSource, /getTournamentFormatDetails/);
  assert.match(tournamentScreenSource, /Exactly 4 players/);
  assert.match(tournamentScreenSource, /TournamentTabCommandCard/);
  assert.match(tournamentScreenSource, /Roster control/);
  assert.match(tournamentScreenSource, /Bracket control/);
  assert.match(tournamentScreenSource, /heroVariant="compact"/);
  assert.match(tournamentScreenSource, /stickyActions/);
  assert.match(tournamentScreenSource, /title="Match status"/);
  assert.match(tournamentScreenSource, /fetchTournamentEvent/);
  assert.match(tournamentScreenSource, /mergeTournamentSettings/);
  assert.match(tournamentScreenSource, /getEffectiveRegistrationStatus/);
  assert.match(tournamentScreenSource, /Ticket path/);
  assert.doesNotMatch(tournamentScreenSource, /Open \/spades/);
  assert.doesNotMatch(tournamentScreenSource, /Launch gameplay/);
  assert.doesNotMatch(tournamentScreenSource, /Host admin/);
  assert.match(checkInScreenSource, /Confirm password/);
  assert.match(checkInScreenSource, /SignupFormatPanel/);
  assert.match(checkInScreenSource, /getSignupFormatDetails/);
  assert.match(checkInScreenSource, /Exactly 4 players/);
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

test('Twitch chat bot runner reads editable stream commands', () => {
  assert.ok(existsSync(twitchBotScriptFile));
  assert.ok(existsSync(twitchBotEnvExampleFile));

  const botSource = readFileSync(twitchBotScriptFile, 'utf8');
  const packageSource = readFileSync(packageFile, 'utf8');
  const gitignoreSource = readFileSync(gitignoreFile, 'utf8');
  const envExampleSource = readFileSync(twitchBotEnvExampleFile, 'utf8');
  const readmeSource = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8');

  assert.match(packageSource, /bot:twitch/);
  assert.match(packageSource, /bot:twitch:check/);
  assert.match(gitignoreSource, /\.env\*/);
  assert.match(envExampleSource, /TWITCH_OAUTH_TOKEN=oauth:paste_token_here/);
  assert.match(envExampleSource, /TWITCH_CHANNEL=1v1compspades/);
  assert.match(botSource, /irc\.chat\.twitch\.tv/);
  assert.match(botSource, /TWITCH_BOT_USERNAME/);
  assert.match(botSource, /TWITCH_OAUTH_TOKEN/);
  assert.match(botSource, /\.env\.twitch-bot/);
  assert.match(botSource, /TWITCH_BOT_DRY_RUN/);
  assert.match(botSource, /STREAM_COMMAND_ENDPOINT/);
  assert.match(botSource, /HEALTH_ENDPOINT/);
  assert.match(botSource, /HEALTH_MONITOR_TOKEN/);
  assert.match(botSource, /sendHeartbeat/);
  assert.match(botSource, /stream-commands/);
  assert.match(botSource, /health/);
  assert.match(botSource, /PRIVMSG/);
  assert.match(readmeSource, /Twitch Chat Bot/);
  assert.match(readmeSource, /Production Twitch Bot Worker/);
  assert.match(readmeSource, /HEALTH_MONITOR_TOKEN/);
  assert.match(readmeSource, /\.env\.twitch-bot/);
  assert.match(readmeSource, /npm run bot:twitch:check/);
  assert.match(readmeSource, /npm run bot:twitch/);
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
  assert.match(adminScreenSource, /Stream commands/);
  assert.match(adminScreenSource, /handleSaveStreamCommands/);
  assert.match(adminScreenSource, /Copy endpoint/);
  assert.match(hostingClientSource, /resetTournamentBracket/);
  assert.match(hostingClientSource, /saveStreamCommands/);
  assert.match(hostingClientSource, /adminHeaders/);
  assert.match(hostingClientSource, /credentials: 'include'/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootRoute = await readFile(
  new URL("../app/index.jsx", import.meta.url),
  "utf8",
);
const rootLayout = await readFile(
  new URL("../app/_layout.jsx", import.meta.url),
  "utf8",
);
const publicCardsCss = await readFile(
  new URL("../src/styles/publicCards.css", import.meta.url),
  "utf8",
);
const homeScreen = await readFile(
  new URL("../src/screens/HomeScreen.jsx", import.meta.url),
  "utf8",
);
const hubUi = await readFile(
  new URL("../src/components/hub-ui.jsx", import.meta.url),
  "utf8",
);
const gameScreen = await readFile(
  new URL("../src/screens/GameScreen.jsx", import.meta.url),
  "utf8",
);
const leaderboardScreen = await readFile(
  new URL("../src/screens/LeaderboardScreen.jsx", import.meta.url),
  "utf8",
);

test("root route renders the multi-game platform hub", () => {
  assert.match(rootRoute, /HomeScreen/);
  assert.match(homeScreen, /YOUR GAME\. YOUR BRACKET\./);
  assert.match(homeScreen, /No partner\. No excuses\./);
  assert.match(homeScreen, /getPublicGames/);
  assert.match(publicCardsCss, /physical-card-rotor/);
  assert.match(homeScreen, /CardArtwork/);
  assert.match(homeScreen, /crownShape/);
  assert.match(homeScreen, /euchreCrest/);
  assert.match(homeScreen, /ginHand/);
  assert.match(homeScreen, /cribbageBoard/);
  assert.match(publicCardsCss, /prefers-reduced-motion/);
  assert.match(homeScreen, /getNextEligiblePublicEvent/);
  assert.match(homeScreen, /getLivePublicEvent/);
  assert.match(rootLayout, /import '\.\.\/src\/styles\/publicCards\.css';/);
  assert.doesNotMatch(rootLayout, /PUBLIC_CARD_CSS|scopePublicCardCss|globalThis\.document\.head\.append\(style\)/);
  assert.match(publicCardsCss, /#root \[data-public-card-grid=true\]\{display:grid/);
  assert.match(publicCardsCss, /@media\(max-width:760px\)\{#root \[data-public-card-grid=true\]/);
  assert.match(homeScreen, /const nextEvent = nextFutureEvent \|\| awaitingEvent/);
  assert.match(homeScreen, /const scheduleNow = useVisibleNow\(1000\)/);
  assert.match(homeScreen, /title="Live now"/);
  assert.match(homeScreen, /event\.status === 'live'.*Live now/s);
  assert.match(gameScreen, /event\.status === 'live'/);
  assert.match(gameScreen, /Live now/);
  assert.match(gameScreen, /title="Live and upcoming tournaments"/);
  assert.match(gameScreen, /href=\{game\.playPath\} variant="secondary">Open \{game\.shortName\}/);
  const countdownStrip = homeScreen.slice(
    homeScreen.indexOf('function PublicCountdownStrip'),
    homeScreen.indexOf('function CardArtwork'),
  );
  assert.doesNotMatch(countdownStrip, /LIVE NOW|event\.status === 'live'/);
  assert.match(countdownStrip, /if \(nowMs >= eventMs\)/);
  assert.match(countdownStrip, /href=\{'\/tournaments\/' \+ event\.slug\}/);
  assert.match(homeScreen, /selectedEvents\.filter\(\(event\) => event\.status !== 'live' && new Date\(event\.date\)\.getTime\(\) > scheduleNow\)/);
  assert.match(homeScreen, /usePublicSchedule/);
  assert.doesNotMatch(homeScreen, /TwitchTournamentBoard/);
  assert.doesNotMatch(homeScreen, /StreamCard/);
  assert.doesNotMatch(homeScreen, /PremiumDownloadSection/);
  assert.match(homeScreen, /aria-level=\{1\}/);
});

test("platform navigation keeps competition, account, and My Match visible", () => {
  for (const label of [
    "Compete",
    "Tournaments",
    "Leagues",
    "Rankings",
    "Results",
    "Profile",
    "My Match",
  ]) {
    assert.match(hubUi, new RegExp(`label: '${label}'`));
  }
  assert.match(hubUi, /resolvedPlayerAccount\?\.hostApproved/);
  assert.match(hubUi, /function getPublicMobileNavItems/);
  assert.doesNotMatch(hubUi, /getPublicNavItems\(primaryPaths\)\.slice\(0, 5\)/);
  const publicMobileNav = hubUi.slice(
    hubUi.indexOf("function getPublicMobileNavItems"),
    hubUi.indexOf("function getMobileNavItems"),
  );
  assert.match(publicMobileNav, /label: 'Match'/);
  assert.match(publicMobileNav, /label: 'Profile'/);
});

test("homepage keeps selection and schedule reads within the public presentation contract", () => {
  assert.match(homeScreen, /getPublicEventAction/);
  assert.match(homeScreen, /SCHEDULE_REFRESH_MS/);
  assert.match(homeScreen, /const isDirectSpadesLaunch = game\.slug === 'spades' && game\.webReady && Boolean\(game\.playPath\)/);
  assert.match(homeScreen, /href=\{isDirectSpadesLaunch \? game\.playPath : game\.infoPath\}/);
  assert.match(homeScreen, /isDirectSpadesLaunch \? 'Play Spades' : 'Explore ' \+ game\.shortName/);
  assert.match(homeScreen, /No public ' \+ activeGameName \+ ' tournaments are scheduled/);
  assert.doesNotMatch(homeScreen, /Gin Rummy.*Register/s);
  assert.doesNotMatch(homeScreen, /No results have been invented/);
});

test("ranking cards use explicit public-lane badges", () => {
  assert.doesNotMatch(leaderboardScreen, /game\.badge/);
  assert.match(leaderboardScreen, /Tournament lane/);
  assert.match(leaderboardScreen, /Information lane/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootRoute = await readFile(
  new URL("../app/index.jsx", import.meta.url),
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

test("root route renders the multi-game platform hub", () => {
  assert.match(rootRoute, /HomeScreen/);
  assert.match(homeScreen, /YOUR GAME\. YOUR BRACKET\./);
  assert.match(homeScreen, /No partner\. No excuses\./);
  assert.match(homeScreen, /getPublicGames/);
  assert.match(homeScreen, /physical-card-rotor/);
  assert.match(homeScreen, /CardArtwork/);
  assert.match(homeScreen, /crownShape/);
  assert.match(homeScreen, /euchreCrest/);
  assert.match(homeScreen, /ginHand/);
  assert.match(homeScreen, /cribbageBoard/);
  assert.match(homeScreen, /prefers-reduced-motion/);
  assert.match(homeScreen, /getNextEligiblePublicEvent/);
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
});

test("homepage keeps selection and schedule reads within the public presentation contract", () => {
  assert.match(homeScreen, /getPublicEventAction/);
  assert.match(homeScreen, /SCHEDULE_REFRESH_MS/);
  assert.match(homeScreen, /No public ' \+ activeGameName \+ ' tournaments are scheduled/);
  assert.match(homeScreen, /Explore \{game\.shortName\}/);
  assert.doesNotMatch(homeScreen, /Gin Rummy.*Register/s);
  assert.doesNotMatch(homeScreen, /No results have been invented/);
});

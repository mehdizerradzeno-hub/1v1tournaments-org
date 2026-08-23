import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  APP_STORE_EUCHRE_URL,
  APP_STORE_SPADES_URL,
} from "../src/lib/downloadLinks.js";

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
  assert.match(homeScreen, /COMPETE IN 1V1/);
  assert.match(homeScreen, /Spades and Euchre/);
  assert.match(homeScreen, /No partner\. No excuses\./);
  assert.match(homeScreen, /PLATFORM_GAME_PRESENTATION/);
  assert.doesNotMatch(homeScreen, /TwitchTournamentBoard/);
  assert.doesNotMatch(homeScreen, /StreamCard/);
  assert.match(homeScreen, /homeUpcoming\.length/);
  assert.match(homeScreen, /laterTournaments\.slice\(0, 2\)/);
  assert.match(homeScreen, /aria-level=\{1\}/);
  assert.match(homeScreen, /aria-level=\{2\}/);
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

test("homepage keeps Euchre invitation-only and gives both games App Store buttons", () => {
  assert.doesNotMatch(homeScreen, /Euchre.*Public tournaments/s);
  assert.equal(
    APP_STORE_SPADES_URL,
    "https://apps.apple.com/us/app/1v1-spades/id6776721716?uo=4",
  );
  assert.equal(
    APP_STORE_EUCHRE_URL,
    "https://apps.apple.com/us/app/euchre-1v1/id6788707299",
  );
  assert.match(homeScreen, /appStoreSpades/);
  assert.match(homeScreen, /appStoreEuchre/);
  assert.match(homeScreen, /PLATFORM_APP_STORE_STATEMENT/);
  assert.match(homeScreen, /Download \$\{game\.title\} on the App Store/);
});

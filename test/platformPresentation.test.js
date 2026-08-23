import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLE_RELEASE_STATES,
  findRedditSundayCommunityCup,
  getAppleReleaseLabel,
  getCommunityCupPrimaryAction,
  getFeaturedCompetitionAction,
  getTournamentBroadcastPath,
  PLATFORM_GAME_PRESENTATION,
  PLATFORM_APP_STORE_STATEMENT,
} from "../src/lib/platformPresentation.js";

test("platform presentation reports both games as available on the App Store", () => {
  assert.equal(
    PLATFORM_APP_STORE_STATEMENT,
    "Spades and Euchre are available on the App Store.",
  );
  assert.equal(
    PLATFORM_GAME_PRESENTATION.spades.releaseState,
    APPLE_RELEASE_STATES.AVAILABLE,
  );
  assert.equal(PLATFORM_GAME_PRESENTATION.spades.name, "Spades 1V1");
  assert.equal(
    PLATFORM_GAME_PRESENTATION.euchre.releaseState,
    APPLE_RELEASE_STATES.AVAILABLE,
  );
  assert.equal(PLATFORM_GAME_PRESENTATION.euchre.name, "Euchre 1V1");
  assert.equal(
    getAppleReleaseLabel(PLATFORM_GAME_PRESENTATION.spades.releaseState),
    "Available on App Store",
  );
  assert.equal(
    getAppleReleaseLabel(PLATFORM_GAME_PRESENTATION.euchre.releaseState),
    "Available on App Store",
  );
  assert.ok(
    !PLATFORM_GAME_PRESENTATION.euchre.capabilities.includes(
      "Public tournaments",
    ),
  );
});

test("community cup reuses the authoritative Reddit event without changing it", () => {
  const event = {
    slug: "reddit-sunday-spades-tournament",
    title: "Reddit Sunday Spades Tournament",
    gameSlug: "spades",
  };
  const tournaments = [
    { slug: "other", title: "Other Cup", gameSlug: "spades" },
    event,
  ];

  assert.equal(findRedditSundayCommunityCup(tournaments), event);
  assert.equal(
    getTournamentBroadcastPath(event.slug),
    "/overlay/bracket?slug=reddit-sunday-spades-tournament",
  );
});

test("community cup primary action follows account, registration, match, spectator, and completion state", () => {
  const paths = {
    tournamentPath: "/tournaments/reddit-sunday",
    signupPath: "/check-in/reddit-sunday",
    matchPath: "/tournaments/reddit-sunday#my-match",
    bracketPath: "/tournaments/reddit-sunday#live-bracket",
  };

  assert.equal(
    getCommunityCupPrimaryAction({
      ...paths,
      status: "upcoming",
      registrationStatus: "open",
    }).label,
    "Sign in to register",
  );
  assert.equal(
    getCommunityCupPrimaryAction({
      ...paths,
      status: "upcoming",
      registrationStatus: "open",
      playerStatus: { data: { account: { canonicalAccountId: "acct_one" } } },
    }).label,
    "Register now",
  );
  assert.equal(
    getCommunityCupPrimaryAction({
      ...paths,
      status: "upcoming",
      registrationStatus: "check-in",
      playerStatus: { data: { account: {}, signup: { status: "registered" } } },
    }).label,
    "Check in",
  );
  assert.equal(
    getCommunityCupPrimaryAction({
      ...paths,
      status: "live",
      registrationStatus: "closed",
      hasBracket: true,
      playerStatus: {
        data: { account: {}, signup: {}, currentMatch: { id: "match-1" } },
      },
    }).label,
    "Play My Match",
  );
  assert.equal(
    getCommunityCupPrimaryAction({
      ...paths,
      status: "live",
      registrationStatus: "closed",
      hasBracket: true,
      playerStatus: { data: { account: {} } },
    }).label,
    "Watch bracket",
  );
  assert.equal(
    getCommunityCupPrimaryAction({
      ...paths,
      status: "complete",
      registrationStatus: "closed",
    }).label,
    "View results",
  );
});

test("featured competition action follows authoritative event state", () => {
  const paths = {
    tournamentPath: "/tournaments/sunday",
    signupPath: "/tournaments/sunday#join",
    matchPath: "/tournaments/sunday#my-match",
  };

  assert.deepEqual(
    getFeaturedCompetitionAction({
      ...paths,
      status: "upcoming",
      registrationStatus: "open",
    }),
    {
      label: "Join Tournament",
      href: paths.signupPath,
    },
  );
  assert.deepEqual(
    getFeaturedCompetitionAction({
      ...paths,
      status: "live",
      registrationStatus: "closed",
      hasBracket: true,
    }),
    {
      label: "Find My Match",
      href: paths.matchPath,
    },
  );
  assert.deepEqual(
    getFeaturedCompetitionAction({
      ...paths,
      status: "completed",
      registrationStatus: "closed",
    }),
    {
      label: "View results",
      href: "/results",
    },
  );
  assert.deepEqual(
    getFeaturedCompetitionAction({
      ...paths,
      status: "upcoming",
      registrationStatus: "full",
    }),
    {
      label: "Register",
      href: paths.signupPath,
    },
  );
});

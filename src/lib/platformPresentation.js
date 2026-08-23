export const APPLE_RELEASE_STATES = Object.freeze({
  SUBMITTED: "submitted",
  IN_REVIEW: "in-review",
  APPROVED_COMING_SOON: "approved-coming-soon",
  AVAILABLE: "available",
  UPDATE_PENDING: "update-pending",
});

export const APPLE_RELEASE_LABELS = Object.freeze({
  [APPLE_RELEASE_STATES.SUBMITTED]: "Submitted to Apple",
  [APPLE_RELEASE_STATES.IN_REVIEW]: "In App Review",
  [APPLE_RELEASE_STATES.APPROVED_COMING_SOON]: "Approved — Coming Soon",
  [APPLE_RELEASE_STATES.AVAILABLE]: "Available on App Store",
  [APPLE_RELEASE_STATES.UPDATE_PENDING]:
    "Current version available — update pending",
});

export const PLATFORM_APP_STORE_STATEMENT =
  "Spades and Euchre are available on the App Store.";

export const PLATFORM_GAME_PRESENTATION = Object.freeze({
  spades: Object.freeze({
    slug: "spades",
    name: "Spades 1V1",
    releaseState: APPLE_RELEASE_STATES.AVAILABLE,
    description:
      "Head-to-head Spades with ranked play, bot practice, and tournament assignments.",
    capabilities: Object.freeze([
      "Ranked",
      "Bot practice",
      "Public tournaments",
    ]),
  }),
  euchre: Object.freeze({
    slug: "euchre",
    name: "Euchre 1V1",
    releaseState: APPLE_RELEASE_STATES.AVAILABLE,
    description:
      "Server-authoritative head-to-head Euchre with ranked play and invited competition.",
    capabilities: Object.freeze([
      "Ranked",
      "Bot practice",
      "Invited tournaments",
    ]),
  }),
});

export const REDDIT_SUNDAY_SPADES_TITLE = "Reddit Sunday Spades Tournament";

export function findRedditSundayCommunityCup(tournaments = []) {
  return (
    tournaments.find(
      (tournament) => tournament?.title === REDDIT_SUNDAY_SPADES_TITLE,
    ) ||
    tournaments.find(
      (tournament) =>
        String(
          tournament?.gameSlug || tournament?.game || "spades",
        ).toLowerCase() === "spades" &&
        /reddit/i.test(String(tournament?.title || tournament?.slug || "")) &&
        /sunday/i.test(String(tournament?.title || tournament?.slug || "")),
    ) ||
    null
  );
}

export function getTournamentBroadcastPath(slug) {
  return slug
    ? `/overlay/bracket?slug=${encodeURIComponent(slug)}`
    : "/overlay/bracket";
}

export function getCommunityCupPrimaryAction({
  playerStatus,
  status,
  registrationStatus,
  hasBracket,
  tournamentPath,
  signupPath,
  matchPath,
  bracketPath,
  resultsPath = "/results",
}) {
  const data = playerStatus?.data || null;

  if (
    status === "completed" ||
    status === "complete" ||
    data?.nextStep === "complete" ||
    data?.nextStep === "champion"
  ) {
    return { label: "View results", href: resultsPath };
  }

  if (data?.currentMatch) {
    return { label: "Play My Match", href: matchPath };
  }

  if (!data?.account) {
    if (hasBracket) {
      return {
        label: "Sign in for match",
        href: `${signupPath}?mode=signin#account-access`,
      };
    }

    if (registrationStatus === "open") {
      return {
        label: "Sign in to register",
        href: `${signupPath}?mode=signin#account-access`,
      };
    }

    return { label: "View event", href: tournamentPath };
  }

  if (data.signup) {
    if (hasBracket) {
      return data.nextStep === "eliminated"
        ? { label: "View bracket", href: bracketPath }
        : { label: "My Match", href: matchPath };
    }

    const signupStatus = String(data.signup.status || "").toLowerCase();
    if (
      registrationStatus === "check-in" &&
      !signupStatus.includes("checked")
    ) {
      return { label: "Check in", href: signupPath };
    }

    return { label: "Registration confirmed", href: tournamentPath };
  }

  if (hasBracket) {
    return { label: "Watch bracket", href: bracketPath };
  }

  if (registrationStatus === "open") {
    return { label: "Register now", href: signupPath };
  }

  return { label: "View event", href: tournamentPath };
}

export function getAppleReleaseLabel(releaseState) {
  return APPLE_RELEASE_LABELS[releaseState] || "Release status unavailable";
}

export function getCompetitionLifecycleLabel({ status, hasBracket }) {
  const normalizedStatus = String(status || "")
    .trim()
    .toLowerCase();

  if (hasBracket || normalizedStatus === "live") {
    return "LIVE";
  }

  if (normalizedStatus === "complete" || normalizedStatus === "completed") {
    return "COMPLETE";
  }

  return "UPCOMING";
}

export function getFeaturedCompetitionAction({
  status,
  registrationStatus,
  hasBracket,
  tournamentPath,
  signupPath,
  matchPath,
  resultsPath = "/results",
}) {
  if (status === "completed" || status === "complete") {
    return { label: "View results", href: resultsPath };
  }

  if (status === "cancelled") {
    return { label: "View tournament", href: tournamentPath };
  }

  if (hasBracket || status === "live") {
    return { label: "Find My Match", href: matchPath };
  }

  if (registrationStatus === "open") {
    return { label: "Join Tournament", href: signupPath };
  }

  if (registrationStatus === "full" || registrationStatus === "waitlist") {
    return { label: "Register", href: signupPath };
  }

  if (registrationStatus === "check-in") {
    return { label: "Find My Match", href: matchPath };
  }

  return { label: "View tournaments", href: "/tournaments" };
}

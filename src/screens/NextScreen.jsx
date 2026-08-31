import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ActionButton,
  Badge,
  EmptyState,
  HubScreen,
  Surface,
} from "../components/hub-ui.jsx";
import { TournamentJourney } from "../components/tournament-master-ui.jsx";
import { getTournamentDiscoveryPresentation } from "../lib/tournamentJourneyPresentation.js";
import { formatDateLine } from "../lib/format.js";
import { downloadLinks } from "../lib/downloadLinks.js";
import {
  getCheckInPath,
  getTournamentPath,
  getUpcomingTournaments,
  siteData,
} from "../lib/siteData.js";
import {
  getNextPublicTournament,
  getPublicTournamentCatalog,
  mergeTournamentLists,
} from "../lib/tournamentCatalog.js";
import {
  getCompetitionLifecycleLabel,
} from "../lib/platformPresentation.js";
import {
  getEffectiveRegistrationStatus,
  mergeTournamentSettings,
} from "../lib/tournamentSettings.js";
import {
  fetchSignupSummary,
  fetchTournamentBracket,
  fetchTournamentEvents,
  fetchTournamentSettings,
} from "../lib/tournamentHostingClient.js";
import { startVisibilityAwarePolling } from "../lib/visibilityPoller.js";
import { useVisibleNow } from "../lib/useVisibleNow.js";

const DEFAULT_ROSTER_CAP = 8;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sortTournamentsByDate(tournaments) {
  return [...tournaments].sort(
    (left, right) =>
      new Date(left.date).getTime() - new Date(right.date).getTime(),
  );
}

function getSignupCount(signupSummary) {
  return signupSummary?.count || signupSummary?.signups?.length || 0;
}

function getRosterCap(tournament) {
  return parsePositiveInt(tournament?.rosterCap, DEFAULT_ROSTER_CAP);
}

export default function NextScreen({ showDiscovery = false }) {
  const [eventDataBySlug, setEventDataBySlug] = useState({});
  const [hostedTournaments, setHostedTournaments] = useState([]);
  const [hostedTournamentsLoaded, setHostedTournamentsLoaded] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleRequestId, setScheduleRequestId] = useState(0);
  const nowMs = useVisibleNow(1000);
  const publicTournaments = useMemo(
    () =>
      hostedTournamentsLoaded
        ? mergeTournamentLists(
            getPublicTournamentCatalog(
              getUpcomingTournaments(),
              hostedTournaments,
            ),
            [],
          ).filter((tournament) =>
            ["upcoming", "live"].includes(
              String(tournament?.status || "").toLowerCase(),
            ),
          )
        : [],
    [hostedTournaments, hostedTournamentsLoaded],
  );
  const publicTournamentSlugs = publicTournaments
    .map((tournament) => tournament.slug)
    .join("|");
  const hydratedPublicTournaments = sortTournamentsByDate(
    publicTournaments.map((tournament) =>
      mergeTournamentSettings(
        tournament,
        eventDataBySlug[tournament.slug]?.settings || null,
      ),
    ),
  );
  const tournament = getNextPublicTournament(
    hydratedPublicTournaments,
    eventDataBySlug,
    nowMs,
  );
  const eventData = eventDataBySlug[tournament?.slug || ""] || {};
  const signupSummary = eventData.signupSummary || {
    count: 0,
    signups: [],
    loading: Boolean(tournament),
  };
  const bracket = eventData.bracket || null;
  const registrationMeta = tournament
    ? getEffectiveRegistrationStatus(tournament, {
        hasLiveBracket: Boolean(bracket),
      })
    : { label: "Coming soon", tone: "neutral", value: "coming-soon" };
  const tournamentPath = tournament ? getTournamentPath(tournament.slug) : "/";
  const competitionStatus = tournament
    ? getCompetitionLifecycleLabel({
        status: tournament.status,
        hasBracket: Boolean(bracket),
      })
    : "UPCOMING";
  const statusTone =
    competitionStatus === "LIVE"
      ? "green"
      : competitionStatus === "COMPLETE"
        ? "rose"
        : "blue";
  const signupCount = getSignupCount(signupSummary);
  const rosterCap = getRosterCap(tournament);
  const openSeats = Math.max(rosterCap - signupCount, 0);

  useEffect(() => {
    let active = true;

    async function loadHostedTournaments() {
      if (active) {
        setHostedTournamentsLoaded(false);
        setScheduleError("");
      }

      try {
        const result = await fetchTournamentEvents();

        if (active) {
          setHostedTournaments(result.tournaments || []);
          setHostedTournamentsLoaded(true);
          setScheduleError("");
        }
      } catch (error) {
        if (active) {
          setHostedTournaments([]);
          setHostedTournamentsLoaded(true);
          setScheduleError(
            error instanceof Error
              ? error.message
              : "The live tournament schedule could not be loaded.",
          );
        }
      }
    }

    loadHostedTournaments();

    return () => {
      active = false;
    };
  }, [scheduleRequestId]);

  useEffect(() => {
    if (!publicTournaments.length) {
      return undefined;
    }

    let active = true;
    let refreshing = false;

    async function loadEventData() {
      if (refreshing) {
        return;
      }

      refreshing = true;

      const settled = await Promise.allSettled(
        publicTournaments.map(async (item) => {
          const [settingsResult, bracketResult, signupResult] =
            await Promise.allSettled([
              fetchTournamentSettings({ slug: item.slug }),
              fetchTournamentBracket({ slug: item.slug }),
              fetchSignupSummary({ slug: item.slug }),
            ]);

          return {
            slug: item.slug,
            settings:
              settingsResult.status === "fulfilled"
                ? settingsResult.value.settings || null
                : null,
            bracket:
              bracketResult.status === "fulfilled"
                ? bracketResult.value.bracket || null
                : null,
            signupSummary: {
              count:
                signupResult.status === "fulfilled"
                  ? signupResult.value.signupCount || 0
                  : 0,
              signups:
                signupResult.status === "fulfilled"
                  ? signupResult.value.signups || []
                  : [],
              loading: false,
              unavailable: signupResult.status !== "fulfilled",
            },
          };
        }),
      );

      if (!active) {
        return;
      }

      setEventDataBySlug(
        Object.fromEntries(
          settled
            .filter((result) => result.status === "fulfilled")
            .map((result) => [result.value.slug, result.value]),
        ),
      );

      refreshing = false;
    }

    const stopPolling = startVisibilityAwarePolling(loadEventData, 15000);

    return () => {
      active = false;
      stopPolling();
    };
  }, [publicTournaments, publicTournamentSlugs]);


  if (!hostedTournamentsLoaded) {
    return (
      <HubScreen
        accountHref="/account"
        actions={[{ label: "Home", href: "/" }]}
        eyebrow={showDiscovery ? "Tournaments" : "Next"}
        lead="Loading the live tournament schedule."
        pageDataSet={{ tournamentPage: "true" }}
        stickyActions={false}
        subtitle="Checking events"
        title={showDiscovery ? "Tournaments" : "Next tournament"}
      >
        <Surface style={styles.loadingLobby}>
          <Text style={styles.loadingLabel}>Checking schedule</Text>
          <Text style={styles.loadingTitle}>
            Finding the next live event...
          </Text>
          <Text style={styles.loadingText}>
            One moment while the current tournament list loads.
          </Text>
        </Surface>
      </HubScreen>
    );
  }

  if (!tournament) {
    const scheduleUnavailable = Boolean(scheduleError);

    return (
      <HubScreen
        accountHref="/account"
        actions={[
          { label: "View leagues", href: "/leagues" },
          { label: "Past results", href: "/results", variant: "secondary" },
        ]}
        eyebrow={showDiscovery ? "Tournaments" : "Next"}
        lead={scheduleUnavailable
          ? "The live schedule is temporarily unavailable."
          : "The next public event will appear here when it is scheduled."}
        pageDataSet={{ tournamentPage: "true" }}
        stickyActions={false}
        subtitle={scheduleUnavailable
          ? "The fallback schedule has no upcoming event"
          : "No upcoming tournament is published yet"}
        title={showDiscovery ? "Tournaments" : "Next tournament"}
      >
        {showDiscovery ? <TournamentJourney compact /> : null}
        <EmptyState
          action={(
            <View style={styles.emptyStateActions}>
              {scheduleUnavailable ? (
                <ActionButton onPress={() => setScheduleRequestId((current) => current + 1)}>
                  Retry schedule
                </ActionButton>
              ) : null}
              {downloadLinks.discord ? (
                <ActionButton external href={downloadLinks.discord}>Get event alerts</ActionButton>
              ) : null}
              <ActionButton href="/leagues">Join league play</ActionButton>
              <ActionButton href="/results" variant="secondary">View past results</ActionButton>
            </View>
          )}
          body={scheduleUnavailable
            ? `${scheduleError} Retry the live schedule or use league play and past results in the meantime.`
            : "No public event is open right now. Explore league play or review completed events while the next bracket is prepared."}
          title={scheduleUnavailable ? "Schedule temporarily unavailable" : "Next bracket coming soon"}
        />
      </HubScreen>
    );
  }

  return (
    <HubScreen
      accountHref="/account"
      eyebrow={showDiscovery ? "Tournaments" : "Next event"}
      footerNote={siteData.site.adminNote}
      heroVariant="compact"
      lead="The public lobby for guests: signup count, join link, live link, roster preview, and bracket status."
      pageDataSet={{ tournamentPage: "true" }}
      showHero={false}
      subtitle={formatDateLine(
        tournament.date,
        tournament.timeZone,
        tournament.timeZoneLabel,
      )}
      stickyActions={false}
      title={showDiscovery ? "Tournaments" : tournament.title}
    >
      {showDiscovery ? <TournamentJourney /> : null}
      {scheduleError ? (
        <Surface style={styles.scheduleNotice}>
          <View style={styles.scheduleNoticeCopy}>
            <Text accessibilityRole="alert" style={styles.scheduleNoticeTitle}>
              Live schedule refresh failed
            </Text>
            <Text style={styles.scheduleNoticeText}>
              Showing the last safe fallback schedule. {scheduleError}
            </Text>
          </View>
          <ActionButton
            onPress={() => setScheduleRequestId((current) => current + 1)}
            variant="secondary"
          >
            Retry
          </ActionButton>
        </Surface>
      ) : null}
      <MasterTournamentCard
        bracket={bracket}
        openSeats={openSeats}
        registrationMeta={registrationMeta}
        competitionStatus={competitionStatus}
        rosterCap={rosterCap}
        signupCount={signupCount}
        signupSummary={signupSummary}
        tournament={tournament}
        tournamentPath={tournamentPath}
        statusTone={statusTone}
      />
      {showDiscovery ? (
        <TournamentDiscoveryList
          eventDataBySlug={eventDataBySlug}
          featuredSlug={tournament.slug}
          tournaments={hydratedPublicTournaments}
        />
      ) : null}
    </HubScreen>
  );
}

function TournamentDiscoveryList({ eventDataBySlug, featuredSlug, tournaments }) {
  const remaining = tournaments.filter((tournament) => tournament.slug !== featuredSlug);

  if (!remaining.length) return null;

  return (
    <Surface style={styles.discoverySection}>
      <View style={styles.discoveryHeader}>
        <View style={styles.discoveryHeaderCopy}>
          <Text style={styles.discoveryEyebrow}>TOURNAMENT DISCOVERY</Text>
          <Text style={styles.discoveryTitle}>More tournaments</Text>
        </View>
        <Text style={styles.discoveryMeta}>{remaining.length} available</Text>
      </View>
      <View style={styles.discoveryGrid}>
        {remaining.map((tournament) => {
          const eventData = eventDataBySlug[tournament.slug] || {};
          const bracket = eventData.bracket || null;
          const signupSummary = eventData.signupSummary || { count: 0, loading: true };
          const registrationMeta = getEffectiveRegistrationStatus(tournament, {
            hasLiveBracket: Boolean(bracket),
          });
          const tournamentPath = getTournamentPath(tournament.slug);
          const discovery = getTournamentDiscoveryPresentation({
            hasBracket: Boolean(bracket),
            registrationStatus: registrationMeta.value,
            signupPath: getCheckInPath(tournament.slug),
            signupSummary,
            tournamentPath,
          });
          const gameName = String(tournament.gameSlug || tournament.game || "Spades")
            .replace(/(^|[-_ ])\w/g, (value) => value.toUpperCase())
            .replace(/[-_]/g, " ");

          return (
            <View key={tournament.slug} style={styles.discoveryCard}>
              <View style={styles.discoveryCardTop}>
                <Badge tone={discovery.registered || bracket ? "green" : registrationMeta.tone}>
                  {discovery.statusLabel}
                </Badge>
                <Text style={styles.discoveryGame}>{gameName}</Text>
              </View>
              <Text style={styles.discoveryCardTitle}>{tournament.title}</Text>
              <Text style={styles.discoveryCardDate}>
                {formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)}
              </Text>
              <Text style={styles.discoveryCardMeta}>
                {signupSummary.loading ? "Checking players" : `${signupSummary.count} registered`}
              </Text>
              <View style={styles.discoveryActions}>
                <ActionButton href={discovery.primaryAction.href}>
                  {discovery.primaryAction.label}
                </ActionButton>
                {discovery.secondaryAction ? (
                  <ActionButton href={discovery.secondaryAction.href} variant="secondary">
                    {discovery.secondaryAction.label}
                  </ActionButton>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </Surface>
  );
}

function MasterTournamentCard({
  bracket,
  competitionStatus,
  openSeats,
  registrationMeta,
  rosterCap,
  signupCount,
  signupSummary,
  tournament,
  tournamentPath,
  statusTone,
}) {
  const gameName = String(tournament.gameSlug || tournament.game || "Spades")
    .replace(/(^|[-_ ])\w/g, (value) => value.toUpperCase())
    .replace(/[-_]/g, " ");
  const discovery = getTournamentDiscoveryPresentation({
    hasBracket: Boolean(bracket),
    registrationStatus: registrationMeta.value,
    signupPath: getCheckInPath(tournament.slug),
    signupSummary,
    tournamentPath,
  });
  const playerCount = signupSummary.loading ? "—" : `${signupCount}/${rosterCap}`;
  const spotsLabel = signupSummary.loading
    ? "Checking spots"
    : openSeats > 0
      ? `${openSeats} spot${openSeats === 1 ? "" : "s"} remaining`
      : "Registration full";

  return (
    <Surface dataSet={{ tournamentDiscovery: "true" }} style={styles.masterEventCard}>
      <View style={styles.masterEventHeader}>
        <View style={styles.masterEventBadges}>
          <Badge tone={statusTone}>{competitionStatus}</Badge>
          <Badge tone="blue">{gameName}</Badge>
          <Badge tone="accent">SEASON 1</Badge>
          {discovery.registered ? <Badge tone="green">REGISTERED</Badge> : null}
        </View>
        <Text style={styles.masterEventDate}>
          {formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)}
        </Text>
      </View>

      <View style={styles.masterEventBody}>
        <View style={styles.masterEventCopy}>
          <Text accessibilityRole="header" style={styles.masterEventTitle}>{tournament.title}</Text>
          <Text style={styles.masterEventSummary}>{tournament.summary}</Text>
          <View style={styles.masterEventFacts}>
            <View style={styles.masterEventFact}>
              <Text style={styles.masterEventFactLabel}>PLAYERS</Text>
              <Text style={styles.masterEventFactValue}>{playerCount}</Text>
            </View>
            <View style={styles.masterEventFact}>
              <Text style={styles.masterEventFactLabel}>REGISTRATION</Text>
              <Text style={styles.masterEventFactValue}>{registrationMeta.label}</Text>
            </View>
            <View style={styles.masterEventFact}>
              <Text style={styles.masterEventFactLabel}>AVAILABILITY</Text>
              <Text style={styles.masterEventFactValue}>{spotsLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.masterEventActions}>
          <ActionButton href={discovery.primaryAction.href}>{discovery.primaryAction.label}</ActionButton>
          {discovery.secondaryAction ? (
            <ActionButton href={discovery.secondaryAction.href} variant="secondary">
              {discovery.secondaryAction.label}
            </ActionButton>
          ) : null}
        </View>
      </View>

      <Text style={styles.masterEventHint}>
        {discovery.registered
          ? `You're registered. ${tournament.checkIn?.window || "Return near start time for match assignment."}`
          : bracket
          ? "The bracket is live. Your assigned match appears on the tournament page."
          : registrationMeta.value === "open"
            ? "Sign up now. Return near start time and we’ll show your match when the bracket is ready."
            : "Registration is not open. Event status will update here."}
      </Text>
    </Surface>
  );
}

const styles = StyleSheet.create({
  discoveryActions: {
    gap: 8,
    marginTop: 4,
  },
  discoveryCard: {
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    borderColor: "rgba(244, 239, 230, 0.10)",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    minWidth: 230,
    padding: 15,
  },
  discoveryCardDate: {
    color: "#D6A24E",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
  },
  discoveryCardMeta: {
    color: "#A7A29A",
    fontSize: 13,
    fontWeight: "700",
  },
  discoveryCardTitle: {
    color: "#F4EFE6",
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 25,
  },
  discoveryCardTop: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  discoveryEyebrow: {
    color: "#D6A24E",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  discoveryGame: {
    color: "#A7A29A",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  discoveryGrid: {
    alignItems: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  discoveryHeader: {
    alignItems: "flex-end",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  discoveryHeaderCopy: {
    gap: 4,
  },
  discoveryMeta: {
    color: "#A7A29A",
    fontSize: 12,
    fontWeight: "900",
  },
  discoverySection: {
    gap: 16,
    marginBottom: 24,
  },
  discoveryTitle: {
    color: "#F4EFE6",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30,
  },
  masterEventActions: {
    flexBasis: 210,
    flexGrow: 0,
    gap: 9,
    minWidth: 190,
  },
  masterEventBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  masterEventBody: {
    alignItems: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
  },
  masterEventCard: {
    backgroundColor: "rgba(12, 17, 15, 0.94)",
    borderColor: "rgba(94, 205, 158, 0.24)",
    gap: 18,
    marginBottom: 24,
    minWidth: 0,
  },
  masterEventCopy: {
    flex: 1,
    gap: 10,
    minWidth: 250,
  },
  masterEventDate: {
    color: "#D6A24E",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
  },
  masterEventFact: {
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    borderColor: "rgba(244, 239, 230, 0.10)",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minWidth: 118,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  masterEventFactLabel: {
    color: "#8F8A82",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  masterEventFacts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 3,
  },
  masterEventFactValue: {
    color: "#F4EFE6",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19,
  },
  masterEventHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  masterEventHint: {
    borderTopColor: "rgba(244, 239, 230, 0.10)",
    borderTopWidth: 1,
    color: "#B7B0A7",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
    paddingTop: 14,
  },
  masterEventSummary: {
    color: "#B7B0A7",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21,
  },
  masterEventTitle: {
    color: "#F4EFE6",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.4,
    lineHeight: 36,
  },
  scheduleNotice: {
    alignItems: "center",
    borderColor: "rgba(214, 162, 78, 0.35)",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    justifyContent: "space-between",
  },
  scheduleNoticeCopy: {
    flex: 1,
    minWidth: 220,
  },
  scheduleNoticeText: {
    color: "#A9A39A",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },
  scheduleNoticeTitle: {
    color: "#F4EFE6",
    fontSize: 15,
    fontWeight: "800",
  },
  countdownCopy: {
    flex: 1.45,
    minWidth: 280,
    width: "100%",
  },
  countdownCopyPhone: {
    flexBasis: "100%",
    minWidth: 0,
  },
  countdownLabel: {
    color: "#D6A24E",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
    textTransform: "uppercase",
  },
  countdownPanel: {
    alignItems: "flex-start",
    backgroundColor: "rgba(5, 5, 5, 0.94)",
    borderColor: "rgba(214, 162, 78, 0.22)",
    borderRadius: 18,
    borderWidth: 1,
    boxShadow:
      "0 30px 88px rgba(0, 0, 0, 0.44), 0 0 44px rgba(214, 162, 78, 0.09), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 32,
    justifyContent: "space-between",
    minWidth: 0,
    overflow: "hidden",
    padding: 40,
    width: "100%",
  },
  countdownPanelPhone: {
    gap: 24,
    padding: 24,
  },
  countdownStack: {
    alignItems: "flex-start",
    alignSelf: "stretch",
    marginTop: 12,
    minWidth: 0,
    width: "100%",
  },
  countdownDays: {
    color: "#F4EFE6",
    fontSize: "clamp(3.5rem, 10vw, 7.5rem)",
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: "clamp(3.8rem, 10.4vw, 7.85rem)",
    textShadow: "0 0 18px rgba(214, 162, 78, 0.22)",
    whiteSpace: "nowrap",
    width: "100%",
  },
  countdownDaysPhone: {
    fontSize: "clamp(3.5rem, 16vw, 5.4rem)",
    lineHeight: "clamp(3.8rem, 16.8vw, 5.8rem)",
  },
  countdownClock: {
    color: "#F4EFE6",
    fontSize: "clamp(2.7rem, 7.6vw, 5.7rem)",
    fontVariant: ["tabular-nums"],
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: "clamp(3rem, 8vw, 6rem)",
    minWidth: 0,
    textShadow: "0 0 18px rgba(214, 162, 78, 0.22)",
    whiteSpace: "nowrap",
    width: "100%",
  },
  countdownClockPhone: {
    fontSize: "clamp(2.35rem, 11.2vw, 3.9rem)",
    lineHeight: "clamp(2.7rem, 12vw, 4.25rem)",
  },
  countdownClockSolo: {
    fontSize: "clamp(3.1rem, 8.8vw, 6.35rem)",
    lineHeight: "clamp(3.45rem, 9.3vw, 6.7rem)",
  },
  countdownClockSoloPhone: {
    fontSize: "clamp(2.35rem, 11.2vw, 3.9rem)",
    lineHeight: "clamp(2.7rem, 12vw, 4.25rem)",
  },
  heroActions: {
    alignContent: "flex-start",
    flexDirection: "column",
    gap: 10,
    justifyContent: "flex-start",
  },
  heroActionsPhone: {
    flexBasis: "100%",
    justifyContent: "flex-start",
    minWidth: 0,
  },
  heroBadgeRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  heroDate: {
    color: "#D6A24E",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
    textTransform: "uppercase",
  },
  heroText: {
    color: "#A7A29A",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 24,
    marginTop: 20,
    maxWidth: 620,
  },
  heroTextPhone: {
    fontSize: 14,
    lineHeight: 21,
  },
  heroQr: {
    height: 152,
    width: 152,
  },
  heroQrCard: {
    alignItems: "center",
    backgroundColor: "rgba(214, 162, 78, 0.07)",
    borderColor: "rgba(214, 162, 78, 0.28)",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    flexBasis: 180,
    minWidth: 160,
    padding: 10,
  },
  heroQrCardApp: {
    backgroundColor: "rgba(94, 127, 163, 0.08)",
    borderColor: "rgba(94, 127, 163, 0.34)",
  },
  heroQrGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  heroQrHeader: {
    gap: 4,
  },
  heroQrLabel: {
    color: "#F4EFE6",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19,
    marginTop: 9,
    textAlign: "center",
  },
  heroQrMeta: {
    color: "#A7A29A",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15,
    marginTop: 2,
    textAlign: "center",
  },
  heroQrSection: {
    gap: 12,
  },
  heroQrSectionPhone: {
    marginTop: 18,
  },
  heroQrPhone: {
    height: 136,
    width: 136,
  },
  heroQrWrap: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 8,
  },
  heroTitle: {
    color: "#F4EFE6",
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 42,
    marginTop: 14,
  },
  heroTitlePhone: {
    fontSize: 30,
    lineHeight: 36,
  },
  heroFacts: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  heroFact: {
    color: "#D6A24E",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
    lineHeight: 17,
    textTransform: "uppercase",
  },
  heroFactDivider: {
    color: "rgba(244, 239, 230, 0.28)",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
  },
  heroExitGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },
  heroExitGridPhone: {
    gap: 8,
  },
  heroExitButton: {
    minWidth: 150,
  },
  lobbyHero: {
    backgroundColor: "rgba(17, 17, 17, 0.78)",
    borderColor: "rgba(214, 162, 78, 0.14)",
    marginBottom: 32,
    overflow: "hidden",
  },
  lobbyHeroPhone: {
    marginBottom: 18,
  },
  loadingLabel: {
    color: "#D6A24E",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
    textTransform: "uppercase",
  },
  loadingLobby: {
    borderColor: "rgba(214, 162, 78, 0.18)",
    gap: 10,
  },
  loadingText: {
    color: "#A7A29A",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 23,
  },
  loadingTitle: {
    color: "#F4EFE6",
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
  },
  lobbyBottom: {
    alignItems: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 16,
  },
  eventMetric: {
    flex: 1,
    minWidth: 110,
  },
  eventMetricRow: {
    flexDirection: "row",
    gap: 16,
  },
  eventPanel: {
    backgroundColor: "rgba(18, 18, 18, 0.88)",
    borderColor: "rgba(244, 239, 230, 0.12)",
    borderRadius: 14,
    borderWidth: 1,
    boxShadow:
      "0 20px 54px rgba(0, 0, 0, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.035)",
    flex: 0.9,
    gap: 20,
    minWidth: 304,
    padding: 24,
  },
  eventPanelHeader: {
    gap: 4,
  },
  eventPanelLabel: {
    color: "#F4EFE6",
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 26,
  },
  eventPanelMeta: {
    color: "#A7A29A",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  eventPanelPhone: {
    flexBasis: "100%",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  metricGridPhone: {
    gap: 8,
  },
  metricLabel: {
    color: "#A7A29A",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 15,
    textTransform: "uppercase",
  },
  metricLink: {
    color: "#F4EFE6",
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22,
    marginTop: 8,
  },
  metricTile: {
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    borderColor: "rgba(244, 239, 230, 0.10)",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 145,
    flexGrow: 1,
    minHeight: 84,
    padding: 16,
  },
  metricValue: {
    color: "#F4EFE6",
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
    marginTop: 8,
  },
  metricValuePhone: {
    fontSize: 24,
    lineHeight: 30,
  },
  metricWide: {
    flexBasis: 260,
  },
  matchFocus: {
    borderTopColor: "rgba(244, 239, 230, 0.10)",
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 18,
  },
  matchFocusText: {
    color: "#F4EFE6",
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24,
  },
  mobileHeroCta: {
    alignSelf: "stretch",
    marginTop: 20,
  },
  playerChip: {
    backgroundColor: "rgba(214, 162, 78, 0.12)",
    borderColor: "rgba(214, 162, 78, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 180,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  playerChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  playerChipText: {
    color: "#F4EFE6",
    fontSize: 13,
    fontWeight: "900",
  },
  playerEmpty: {
    color: "#A7A29A",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
  },
  playerMore: {
    color: "#A7A29A",
    fontSize: 13,
    fontWeight: "900",
    paddingVertical: 8,
  },
  primaryCtaMotion: {
    alignSelf: "stretch",
  },
  primaryCtaButton: {
    alignSelf: "stretch",
    boxShadow: "0 16px 36px rgba(214, 162, 78, 0.18)",
    marginBottom: 0,
    marginRight: 0,
  },
  progressFill: {
    backgroundColor: "#D6A24E",
    borderRadius: 999,
    boxShadow: "0 0 18px rgba(214, 162, 78, 0.26)",
    height: "100%",
    minWidth: 2,
  },
  progressText: {
    color: "#A7A29A",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 8,
  },
  progressTrack: {
    backgroundColor: "rgba(244, 239, 230, 0.08)",
    borderColor: "rgba(244, 239, 230, 0.10)",
    borderRadius: 999,
    borderWidth: 1,
    height: 12,
    overflow: "hidden",
  },
  lobbySideRail: {
    flexBasis: 330,
    flexGrow: 1,
    gap: 12,
  },
  rosterPreview: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(244, 239, 230, 0.10)",
    borderRadius: 14,
    borderWidth: 1,
    boxShadow: "0 18px 48px rgba(0, 0, 0, 0.20)",
    flexBasis: 360,
    flexGrow: 1.4,
    padding: 16,
  },
  rosterPreviewHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  rosterPreviewMeta: {
    color: "#D6A24E",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  rosterPreviewTitle: {
    color: "#F4EFE6",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 22,
  },
  shortcutCommand: {
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    borderColor: "rgba(244, 239, 230, 0.10)",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 96,
    flexGrow: 1,
    minHeight: 62,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  shortcutCommandLabel: {
    color: "#A7A29A",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 3,
  },
  shortcutCommands: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  shortcutCommandText: {
    color: "#D6A24E",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21,
  },
  shortcutCopy: {
    gap: 4,
  },
  shortcutLabel: {
    color: "#D6A24E",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 15,
    textTransform: "uppercase",
  },
  shortcutStrip: {
    alignItems: "stretch",
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    borderColor: "rgba(244, 239, 230, 0.10)",
    borderRadius: 14,
    borderWidth: 1,
    boxShadow: "0 18px 48px rgba(0, 0, 0, 0.20)",
    flexDirection: "column",
    gap: 12,
    padding: 14,
  },
  shortcutTitle: {
    color: "#F4EFE6",
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 23,
    marginTop: 4,
  },
  secondaryActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  secondaryCtaButton: {
    marginBottom: 0,
    marginRight: 0,
  },
  sponsorSoftwareAction: {
    marginBottom: 0,
    marginRight: 0,
  },
  sponsorSoftwareActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  sponsorSoftwareConsole: {
    backgroundColor: "rgba(5, 5, 5, 0.44)",
    borderColor: "rgba(244, 239, 230, 0.10)",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 12,
    minWidth: 280,
    padding: 16,
  },
  sponsorSoftwareConsoleLabel: {
    color: "#D6A24E",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.4,
    lineHeight: 15,
    textTransform: "uppercase",
  },
  sponsorSoftwareCopy: {
    flex: 1.4,
    minWidth: 280,
  },
  sponsorSoftwareGlow: {
    backgroundColor: "rgba(94, 205, 158, 0.10)",
    borderRadius: 999,
    height: 220,
    position: "absolute",
    right: -70,
    top: -100,
    width: 300,
  },
  sponsorSoftwareGrid: {
    alignItems: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  sponsorSoftwareNote: {
    color: "#A7A29A",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
  },
  sponsorSoftwarePanel: {
    backgroundColor: "rgba(7, 17, 15, 0.94)",
    borderColor: "rgba(94, 205, 158, 0.22)",
    marginBottom: 32,
    overflow: "hidden",
  },
  sponsorSoftwareStat: {
    backgroundColor: "rgba(214, 162, 78, 0.10)",
    borderColor: "rgba(214, 162, 78, 0.24)",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    minWidth: 86,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  sponsorSoftwareStatLabel: {
    color: "#A7A29A",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 13,
    textTransform: "uppercase",
  },
  sponsorSoftwareStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sponsorSoftwareStatValue: {
    color: "#F4EFE6",
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 23,
    marginTop: 4,
  },
  sponsorSoftwareSummary: {
    color: "#A7A29A",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 23,
    marginTop: 10,
    maxWidth: 680,
  },
  sponsorSoftwareTitle: {
    color: "#F4EFE6",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 36,
    marginTop: 10,
  },
  statusLabel: {
    color: "#A7A29A",
    flex: 1,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.2,
    lineHeight: 16,
    minWidth: 116,
    textTransform: "uppercase",
  },
  statusRow: {
    alignItems: "flex-start",
    borderBottomColor: "rgba(244, 239, 230, 0.08)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingBottom: 10,
  },
  statusRows: {
    gap: 10,
  },
  statusValue: {
    color: "#F4EFE6",
    flex: 1.2,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 20,
    textAlign: "right",
  },
  statusValueEmphasis: {
    color: "#D6A24E",
    fontSize: 16,
  },
  urgencyLabel: {
    color: "#D6A24E",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.3,
    lineHeight: 16,
    textTransform: "uppercase",
  },
  urgencyTopRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  urgencyTopRowPhone: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 4,
  },
  urgencyValue: {
    color: "#F4EFE6",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 20,
    textAlign: "right",
  },
  urgencyValuePhone: {
    textAlign: "left",
  },
  heroUrgencyCard: {
    backgroundColor: "rgba(214, 162, 78, 0.085)",
    borderColor: "rgba(214, 162, 78, 0.22)",
    borderRadius: 14,
    borderWidth: 1,
    boxShadow:
      "0 16px 44px rgba(0, 0, 0, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.035)",
    marginTop: 24,
    maxWidth: 560,
    padding: 16,
  },
  presentedBy: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(244, 239, 230, 0.045)",
    borderColor: "rgba(244, 239, 230, 0.10)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  presentedByCopy: {
    gap: 1,
    minWidth: 0,
  },
  presentedByLabel: {
    color: "#A7A29A",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 13,
    textTransform: "uppercase",
  },
  presentedByLogo: {
    borderRadius: 999,
    height: 28,
    width: 28,
  },
  presentedByName: {
    color: "#F4EFE6",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
    maxWidth: 240,
  },
  communitySection: {
    gap: 22,
    marginTop: 28,
  },
  communityHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    justifyContent: "space-between",
  },
  communityHeaderCopy: {
    flex: 1,
    minWidth: 260,
  },
  communityEyebrow: {
    color: "#D6A24E",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  communityTitle: {
    color: "#F4EFE6",
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 36,
    marginTop: 8,
  },
  communityBody: {
    color: "#A7A29A",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 23,
    marginTop: 8,
    maxWidth: 760,
  },
  competitionHierarchy: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    width: "100%",
  },
  hierarchyCard: {
    backgroundColor: "rgba(244, 239, 230, 0.035)",
    borderColor: "rgba(244, 239, 230, 0.10)",
    borderRadius: 14,
    borderWidth: 1,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 240,
    gap: 5,
    minWidth: 210,
    padding: 15,
  },
  hierarchyCardActive: {
    backgroundColor: "rgba(214, 162, 78, 0.10)",
    borderColor: "rgba(214, 162, 78, 0.34)",
  },
  hierarchyLabel: {
    color: "#D6A24E",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  hierarchyValue: {
    color: "#F4EFE6",
    fontSize: 18,
    fontWeight: "900",
  },
  hierarchyMeta: {
    color: "#A7A29A",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  communityEventCard: {
    alignItems: "center",
    backgroundColor: "rgba(12, 36, 30, 0.76)",
    borderColor: "rgba(65, 194, 116, 0.38)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
    justifyContent: "space-between",
    padding: 18,
  },
  communityEventCopy: {
    flex: 1,
    minWidth: 250,
  },
  communityBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  communityEventTitle: {
    color: "#F4EFE6",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30,
    marginTop: 10,
  },
  communityEventDate: {
    color: "#D6A24E",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 21,
    marginTop: 6,
  },
  communityEventInstructions: {
    color: "#C9C2B8",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 22,
    marginTop: 9,
  },
  communityActions: {
    gap: 10,
    minWidth: 230,
  },
  communityStatusWarning: {
    color: "#F0C86A",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
  },
  communityEmpty: {
    backgroundColor: "rgba(244, 239, 230, 0.035)",
    borderRadius: 14,
    padding: 18,
  },
  emptyStateActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
});

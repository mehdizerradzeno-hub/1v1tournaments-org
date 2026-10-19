import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import {
  ActionButton,
  Badge,
  EmptyState,
  HubScreen,
  Surface,
} from "../components/hub-ui.jsx";
import { formatDateLine } from "../lib/format.js";
import { downloadLinks } from "../lib/downloadLinks.js";
import {
  getCheckInPath,
  getTournamentPath,
  getUpcomingTournaments,
} from "../lib/siteData.js";
import {
  getNextPublicTournament,
  getPublicTournamentCatalog,
  mergeTournamentLists,
} from "../lib/tournamentCatalog.js";
import {
  findRedditSundayCommunityCup,
  getCommunityCupPrimaryAction,
  getTournamentBroadcastPath,
  getCompetitionLifecycleLabel,
  getFeaturedCompetitionAction,
} from "../lib/platformPresentation.js";
import {
  getEffectiveRegistrationStatus,
  mergeTournamentSettings,
} from "../lib/tournamentSettings.js";
import {
  fetchSignupSummary,
  fetchTournamentBracket,
  fetchTournamentEvents,
  fetchTournamentPlayerStatus,
  fetchTournamentSettings,
} from "../lib/tournamentHostingClient.js";
import { startVisibilityAwarePolling } from "../lib/visibilityPoller.js";
import { useVisibleNow } from "../lib/useVisibleNow.js";
import { theme } from "../lib/theme.js";

const DEFAULT_ROSTER_CAP = 8;
const NEXT_CHAT_COMMANDS = [
  { command: "!join", label: "Signup" },
  { command: "!match", label: "Match" },
  { command: "!rules", label: "Rules" },
  { command: "!discord", label: "Discord" },
];
const NEXT_MOTION_CSS = `
[data-countdown-clock="true"] {
  display: block;
  font-feature-settings: "tnum" 1;
  font-variant-numeric: tabular-nums;
  overflow-wrap: normal;
  white-space: nowrap;
  word-break: normal;
}

[data-next-motion="progress-fill"] {
  transition: width 200ms ease;
}

[data-next-motion="cta"] {
  border-radius: 10px;
}

@media (prefers-reduced-motion: reduce) {
  [data-next-motion="progress-fill"] {
    transition: none;
  }
}
`;

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

function getCountdownParts(tournament, nowMs, { bracket, isBracketLive }) {
  const bracketStatus = String(bracket?.status || "").trim().toLowerCase();

  if (bracketStatus === "complete" || isBracketLive) {
    return {
      label: "Tournament status",
      statusLabel: bracketStatus === "complete" ? "Completed" : "Live now",
      clockLabel: "",
      dayLabel: "",
    };
  }

  const startMs = tournament?.date
    ? new Date(tournament.date).getTime()
    : Number.NaN;

  if (!Number.isFinite(startMs)) {
    return {
      label: "Schedule",
      statusLabel: "Date TBA",
      clockLabel: "",
      dayLabel: "",
    };
  }

  if (startMs <= nowMs) {
    return {
      label: "Tournament status",
      statusLabel: "Awaiting start",
      clockLabel: "",
      dayLabel: "",
    };
  }

  const totalSeconds = Math.max(Math.ceil((startMs - nowMs) / 1000), 0);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hourLabel = String(hours).padStart(2, "0");
  const minuteLabel = String(minutes).padStart(2, "0");
  const secondLabel = String(seconds).padStart(2, "0");

  return {
    label: "Starts in",
    statusLabel: "",
    clockLabel: `${hourLabel}:${minuteLabel}:${secondLabel}`,
    dayLabel: days > 0 ? `${days}d` : "",
  };
}

function isConfirmedLiveBracket(tournament, bracket) {
  const bracketStatus = String(bracket?.status || '').trim().toLowerCase();

  return Boolean(bracket)
    && bracketStatus !== 'complete'
    && (String(tournament?.status || '').trim().toLowerCase() === 'live'
      || ['live', 'active', 'in-progress'].includes(bracketStatus));
}

function getSignupCount(signupSummary) {
  return signupSummary?.count || signupSummary?.signups?.length || 0;
}

function getRosterCap(tournament) {
  return parsePositiveInt(tournament?.rosterCap, DEFAULT_ROSTER_CAP);
}

function getRegistrationPercent(signupCount, rosterCap) {
  if (!rosterCap) {
    return 0;
  }

  return Math.min(Math.round((signupCount / rosterCap) * 100), 100);
}

function getSeatsMessage(openSeats, signupCount, rosterCap) {
  if (rosterCap && signupCount >= rosterCap) {
    return "Tournament is full";
  }

  if (openSeats === 1) {
    return "Only 1 seat left";
  }

  return `Only ${openSeats} seats left`;
}

function getDurationLabel(tournament) {
  return tournament?.duration || tournament?.durationLabel || "45-60 min";
}

function getTournamentSponsor(tournament) {
  const sponsor = tournament?.sponsor || tournament?.presentingSponsor || null;

  if (!sponsor?.name) {
    return null;
  }

  return {
    logoUrl: sponsor.logoUrl || sponsor.logo || "",
    name: sponsor.name,
  };
}

function getMotionDataSet(value) {
  return Platform.OS === "web" ? { nextMotion: value } : undefined;
}

function NextMotionStyles() {
  if (Platform.OS !== "web") {
    return null;
  }

  return <style dangerouslySetInnerHTML={{ __html: NEXT_MOTION_CSS }} />;
}

function absoluteTournamentUrl(path) {
  const origin = downloadLinks.tournaments || "https://1v1tournaments.org";

  return `${origin.replace(/\/$/, "")}${path}`;
}

function getQrUrl(value) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=${encodeURIComponent(value)}`;
}

function getNextMatchLabel(bracket) {
  const matches =
    bracket?.rounds?.flatMap((round) => round.matches || []) || [];
  const match =
    matches.find(
      (item) => item.status === "ready" || item.status === "active",
    ) ||
    matches.find((item) => item.status !== "final" && !item.winnerName) ||
    null;

  if (!match) {
    return "Players appear after seeding";
  }

  const players = match.players || [];

  if (players.length) {
    return players
      .map((player) =>
        player?.handle ? `${player.name} (${player.handle})` : player?.name,
      )
      .filter(Boolean)
      .join(" vs ");
  }

  return match.teams?.join(" vs ") || "Players appear after seeding";
}

export default function NextScreen({ showDiscovery = false }) {
  const [eventDataBySlug, setEventDataBySlug] = useState({});
  const [hostedTournaments, setHostedTournaments] = useState([]);
  const [hostedTournamentsLoaded, setHostedTournamentsLoaded] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleRequestId, setScheduleRequestId] = useState(0);
  const [communityPlayerStatus, setCommunityPlayerStatus] = useState({
    data: null,
    error: "",
    loading: false,
  });
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
  const communityTournament = findRedditSundayCommunityCup(
    hydratedPublicTournaments,
  );
  const communityEventData =
    eventDataBySlug[communityTournament?.slug || ""] || {};
  const communityRegistrationMeta = communityTournament
    ? getEffectiveRegistrationStatus(communityTournament, {
        hasLiveBracket: Boolean(communityEventData.bracket),
      })
    : null;
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
  const isBracketLive = isConfirmedLiveBracket(tournament, bracket);
  const registrationDecision = tournament
    ? getEffectiveRegistrationStatus(tournament, {
        hasLiveBracket: isBracketLive,
      })
    : { label: "Coming soon", tone: "neutral", value: "coming-soon" };
  const registrationMeta = registrationDecision.reason === "event-started" && !isBracketLive && bracket?.status !== "complete"
    ? { ...registrationDecision, label: "Registration closed", actionCopy: "The scheduled start time has passed. Registration is closed." }
    : registrationDecision;
  const tournamentPath = tournament ? getTournamentPath(tournament.slug) : "/";
  const checkInPath = tournament ? getCheckInPath(tournament.slug) : "/";
  const competitionStatus = tournament
    ? getCompetitionLifecycleLabel({
        status: tournament.status,
        hasBracket: isBracketLive,
      })
    : "UPCOMING";
  const primaryAction = tournament
    ? getFeaturedCompetitionAction({
        status: tournament.status,
        registrationStatus: registrationMeta.value,
        hasBracket: isBracketLive,
        tournamentPath,
        signupPath: checkInPath,
        matchPath: `${tournamentPath}#my-match`,
        resultsPath: "/results",
      })
    : { label: "View tournaments", href: "/tournaments" };
  const statusTone =
    competitionStatus === "LIVE"
      ? "green"
      : competitionStatus === "COMPLETE"
        ? "rose"
        : "blue";
  const joinUrl = absoluteTournamentUrl(checkInPath);
  const signupCount = getSignupCount(signupSummary);
  const rosterCap = getRosterCap(tournament);
  const openSeats = Math.max(rosterCap - signupCount, 0);
  const hasTwitch = Boolean(downloadLinks.twitch);

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

  useEffect(() => {
    if (!showDiscovery || !communityTournament?.slug) {
      return undefined;
    }

    let active = true;
    let refreshing = false;

    async function loadCommunityPlayerStatus() {
      if (refreshing) return;
      refreshing = true;

      try {
        const result = await fetchTournamentPlayerStatus({
          slug: communityTournament.slug,
        });
        if (active)
          setCommunityPlayerStatus({ data: result, error: "", loading: false });
      } catch (error) {
        if (active) {
          setCommunityPlayerStatus({
            data: null,
            error:
              error instanceof Error
                ? error.message
                : "Player status is unavailable.",
            loading: false,
          });
        }
      } finally {
        refreshing = false;
      }
    }

    const stopPolling = startVisibilityAwarePolling(loadCommunityPlayerStatus, 15000);

    return () => {
      active = false;
      stopPolling();
    };
  }, [communityTournament?.slug, showDiscovery]);

  if (!hostedTournamentsLoaded) {
    return (
      <HubScreen
        accountHref="/account"
        actions={[{ label: "Home", href: "/" }]}
        eyebrow={showDiscovery ? "Tournaments" : "Next"}
        lead="Loading the live tournament schedule."
        publicShell
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
        publicShell
        stickyActions={false}
        subtitle={scheduleUnavailable
          ? "The fallback schedule has no upcoming event"
          : "No upcoming tournament is published yet"}
        title={showDiscovery ? "Tournaments" : "Next tournament"}
      >
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
        {showDiscovery ? <CommunityCupsSection tournament={null} /> : null}
      </HubScreen>
    );
  }

  return (
    <HubScreen
      accountHref="/account"
      actions={[
        { label: primaryAction.label, href: primaryAction.href },
        {
          label: "Check Match Status",
          href: `${tournamentPath}#my-match`,
          variant: "secondary",
        },
        hasTwitch
          ? { label: "Watch", href: "/stream", variant: "secondary" }
          : null,
        { label: "Rules", href: "/rules", variant: "ghost" },
      ].filter(Boolean)}
      eyebrow={showDiscovery ? "Tournaments" : "Next event"}
      footerNote="Creating the competitive 1v1 spades category."
      heroVariant="compact"
      lead="The public lobby for guests: signup count, join link, live link, roster preview, and bracket status."
      publicShell
      showHero={false}
      subtitle={formatDateLine(
        tournament.date,
        tournament.timeZone,
        tournament.timeZoneLabel,
      )}
      stickyActions={false}
      title={showDiscovery ? "Tournaments" : tournament.title}
    >
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
      <NextLobbyHero
        bracket={bracket}
        isBracketLive={isBracketLive}
        countdownParts={getCountdownParts(tournament, nowMs, {
          bracket,
          isBracketLive,
        })}
        joinUrl={joinUrl}
        openSeats={openSeats}
        registrationMeta={registrationMeta}
        competitionStatus={competitionStatus}
        rosterCap={rosterCap}
        signupCount={signupCount}
        signupSummary={signupSummary}
        primaryAction={primaryAction}
        tournament={tournament}
        tournamentPath={tournamentPath}
        statusTone={statusTone}
      />
      {showDiscovery ? (
        <CommunityCupsSection
          bracket={communityEventData.bracket || null}
          playerStatus={communityPlayerStatus}
          registrationMeta={communityRegistrationMeta}
          tournament={communityTournament}
        />
      ) : null}
    </HubScreen>
  );
}

function NextLobbyHero({
  bracket,
  isBracketLive,
  countdownParts,
  joinUrl,
  openSeats,
  competitionStatus,
  registrationMeta,
  rosterCap,
  primaryAction,
  signupCount,
  signupSummary,
  tournament,
  tournamentPath,
  statusTone,
}) {
  const { width } = useWindowDimensions();
  const isPhone = width > 0 && width < 720;
  const signups = signupSummary.signups || [];
  const signedUpValue = signupSummary.loading
    ? "--"
    : `${signupCount}/${rosterCap}`;
  const openSeatsValue = signupSummary.loading ? "--" : openSeats;
  const registrationPercent = signupSummary.loading
    ? 0
    : getRegistrationPercent(signupCount, rosterCap);
  const urgencyCopy = signupSummary.loading
    ? "Checking available seats"
    : getSeatsMessage(openSeats, signupCount, rosterCap);
  const primaryHref = primaryAction.href;
  const primaryLabel = primaryAction.label;
  const appStoreUrl = downloadLinks.appStoreSpades;
  const sponsor = getTournamentSponsor(tournament);
  const countdownKey =
    countdownParts.statusLabel
    || `${countdownParts.dayLabel}-${countdownParts.clockLabel}`;

  return (
    <Surface style={[styles.lobbyHero, isPhone && styles.lobbyHeroPhone]}>
      <NextMotionStyles />
      <View
        dataSet={{ ...getMotionDataSet("panel"), tournamentLayout: "next-hero" }}
        style={[styles.countdownPanel, isPhone && styles.countdownPanelPhone]}
      >
        <View
          dataSet={{ tournamentLayout: "event-copy" }}
          style={[styles.countdownCopy, isPhone && styles.countdownCopyPhone]}
        >
          <Text style={styles.heroKicker}>Featured tournament</Text>
          <Text
            accessibilityRole="heading"
            aria-level={1}
            dataSet={getMotionDataSet("title")}
            style={[styles.heroTitle, isPhone && styles.heroTitlePhone]}
          >
            {tournament.title}
          </Text>
          <Text style={styles.heroDate}>
            {formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)}
          </Text>
          <PresentedBy sponsor={sponsor} />
          <Text style={styles.countdownLabel}>{countdownParts.label}</Text>
          <View
            dataSet={getMotionDataSet("countdown")}
            key={countdownKey}
            style={styles.countdownStack}
          >
            {countdownParts.statusLabel ? (
              <Text
                style={[
                  styles.eventTimingStatus,
                  isPhone && styles.eventTimingStatusPhone,
                ]}
              >
                {countdownParts.statusLabel}
              </Text>
            ) : (
              <>
                {countdownParts.dayLabel ? (
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.countdownDays,
                      isPhone && styles.countdownDaysPhone,
                    ]}
                  >
                    {countdownParts.dayLabel}
                  </Text>
                ) : null}
                <Text
                  dataSet={{ countdownClock: "true" }}
                  numberOfLines={1}
                  style={[
                    styles.countdownClock,
                    isPhone && styles.countdownClockPhone,
                    !countdownParts.dayLabel && styles.countdownClockSolo,
                    isPhone &&
                      !countdownParts.dayLabel &&
                      styles.countdownClockSoloPhone,
                  ]}
                >
                  {countdownParts.clockLabel}
                </Text>
              </>
            )}
          </View>
          <View style={styles.heroFacts}>
            <Text style={styles.heroFact}>Free Entry</Text>
            <Text style={styles.heroFactDivider}>/</Text>
            <Text style={styles.heroFact}>{tournament.format}</Text>
            <Text style={styles.heroFactDivider}>/</Text>
            <Text style={styles.heroFact}>{getDurationLabel(tournament)}</Text>
          </View>

          <View
            dataSet={{ tournamentLayout: "event-actions" }}
            style={[styles.heroExitGrid, isPhone && styles.heroExitGridPhone]}
          >
            <ActionButton href={primaryHref} style={styles.heroExitButton}>
              {primaryLabel}
            </ActionButton>
            <ActionButton
              href={`${tournamentPath}#my-match`}
              style={styles.heroExitButton}
              variant="secondary"
            >
              Check Match Status
            </ActionButton>
            <ActionButton
              href="/stream"
              style={styles.heroExitButton}
              variant="secondary"
            >
              Watch Tournament
            </ActionButton>
          </View>

          {isPhone ? null : (
            <Text style={styles.heroText}>{tournament.summary}</Text>
          )}

          <View style={styles.heroUrgencyCard}>
            <View
              style={[
                styles.urgencyTopRow,
                isPhone && styles.urgencyTopRowPhone,
              ]}
            >
              <Text style={styles.urgencyLabel}>{registrationMeta.label}</Text>
              <Text
                style={[
                  styles.urgencyValue,
                  isPhone && styles.urgencyValuePhone,
                ]}
              >
                {urgencyCopy}
              </Text>
            </View>
            <View
              accessibilityLabel={`${signupCount} of ${rosterCap} players registered`}
              accessibilityRole="progressbar"
              dataSet={getMotionDataSet("progress")}
              style={styles.progressTrack}
            >
              <View
                dataSet={getMotionDataSet("progress-fill")}
                style={[
                  styles.progressFill,
                  { width: `${registrationPercent}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {signupSummary.loading
                ? "Loading registration"
                : `${signedUpValue} players registered / ${registrationPercent}% filled`}
            </Text>
          </View>

          {isPhone ? (
            <Text style={[styles.heroText, styles.heroTextPhone]}>
              {tournament.summary}
            </Text>
          ) : null}
        </View>

        <View
          dataSet={{ ...getMotionDataSet("card"), tournamentLayout: "event-panel" }}
          style={[styles.eventPanel, isPhone && styles.eventPanelPhone]}
        >
          {isPhone ? null : (
            <StreamQrGrid
              appStoreUrl={appStoreUrl}
              isPhone={false}
              joinUrl={joinUrl}
            />
          )}

          <View style={styles.eventPanelHeader}>
            <Text style={styles.eventPanelLabel}>Tournament status</Text>
            <Text style={styles.eventPanelMeta}>{tournament.location}</Text>
          </View>

          <View style={styles.statusRows}>
            <StatusRow label="Competition" value={competitionStatus} />
            <StatusRow
              label="Status"
              value={isBracketLive ? "Bracket live" : bracket?.status === "complete" ? "Bracket complete" : bracket ? "Bracket published" : "Awaiting bracket"}
            />
            <StatusRow label="Players registered" value={signedUpValue} />
            <StatusRow
              label="Seats Open"
              value={String(openSeatsValue)}
              emphasis
            />
            <StatusRow
              label="Estimated start"
              value={formatDateLine(
                tournament.date,
                tournament.timeZone,
                tournament.timeZoneLabel,
              )}
            />
            <StatusRow label="Bracket type" value={tournament.format} />
          </View>

          <View style={styles.matchFocus}>
            <Text style={styles.metricLabel}>Next match</Text>
            <Text numberOfLines={2} style={styles.matchFocusText}>
              {getNextMatchLabel(bracket)}
            </Text>
          </View>

          <View
            style={[styles.heroActions, isPhone && styles.heroActionsPhone]}
          >
            {isPhone ? null : (
              <View
                dataSet={getMotionDataSet("cta")}
                style={styles.primaryCtaMotion}
              >
                <ActionButton
                  href={primaryHref}
                  style={styles.primaryCtaButton}
                  variant="secondary"
                >
                  {primaryLabel}
                </ActionButton>
              </View>
            )}
            <View style={styles.secondaryActionRow}>
              <ActionButton
                href={`${tournamentPath}#my-match`}
                style={styles.secondaryCtaButton}
                variant="ghost"
              >
                Check Match Status
              </ActionButton>
              <ActionButton
                href={tournamentPath}
                style={styles.secondaryCtaButton}
                variant="ghost"
              >
                Event
              </ActionButton>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.heroBadgeRow}>
        <Badge tone={statusTone}>{competitionStatus}</Badge>
        <Badge tone={registrationMeta.tone}>{registrationMeta.label}</Badge>
      </View>

      <View style={styles.lobbyBottom}>
        <View dataSet={getMotionDataSet("card")} style={styles.rosterPreview}>
          <View style={styles.rosterPreviewHead}>
            <Text style={styles.rosterPreviewTitle}>Competitors</Text>
            <Text style={styles.rosterPreviewMeta}>
              {signupSummary.loading ? "Loading" : `${signups.length} visible`}
            </Text>
          </View>
          <View style={styles.playerChips}>
            {signupSummary.loading ? (
              <Text style={styles.playerEmpty}>Loading roster...</Text>
            ) : signups.length ? (
              signups.slice(0, 10).map((signup, index) => (
                <View
                  key={signup.id || `${signup.playerName}-${index}`}
                  style={styles.playerChip}
                >
                  <Text numberOfLines={1} style={styles.playerChipText}>
                    {signup.playerName || "Player"}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.playerEmpty}>No public signups yet.</Text>
            )}
            {signups.length > 10 ? (
              <Text style={styles.playerMore}>+{signups.length - 10} more</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.lobbySideRail}>
          <View dataSet={getMotionDataSet("card")} style={styles.shortcutStrip}>
            <View style={styles.shortcutCopy}>
              <Text style={styles.shortcutLabel}>Twitch commands</Text>
              <Text style={styles.shortcutTitle}>
                Say it once on stream. Chat can handle the rest.
              </Text>
            </View>
            <View style={styles.shortcutCommands}>
              {NEXT_CHAT_COMMANDS.map((item) => (
                <View key={item.command} style={styles.shortcutCommand}>
                  <Text selectable style={styles.shortcutCommandText}>
                    {item.command}
                  </Text>
                  <Text style={styles.shortcutCommandLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
    </Surface>
  );
}

function CommunityCupsSection({
  bracket = null,
  playerStatus = null,
  registrationMeta = null,
  tournament,
}) {
  const tournamentPath = tournament
    ? getTournamentPath(tournament.slug)
    : "/tournaments";
  const signupPath = tournament
    ? getCheckInPath(tournament.slug)
    : "/tournaments";
  const bracketPath = tournament
    ? `${tournamentPath}#live-bracket`
    : "/tournaments";
  const broadcastPath = tournament
    ? getTournamentBroadcastPath(tournament.slug)
    : "/overlay/bracket";
  const primaryAction = tournament
    ? getCommunityCupPrimaryAction({
        playerStatus,
        status: tournament.status,
        registrationStatus: registrationMeta?.value,
        hasBracket: Boolean(bracket),
        tournamentPath,
        signupPath,
        matchPath: `${tournamentPath}#my-match`,
        bracketPath,
      })
    : null;

  return (
    <Surface nativeID="community-cups" style={styles.communitySection}>
      <View style={styles.communityHeader}>
        <View style={styles.communityHeaderCopy}>
          <Text style={styles.communityEyebrow}>1V1 Community Cups</Text>
          <Text style={styles.communityTitle}>
            A clear path from open cups to championships.
          </Text>
          <Text style={styles.communityBody}>
            Community competitions live under the 1V1 platform, alongside league
            seasons and the permanent results archive.
          </Text>
        </View>
        <Badge tone="accent">Community-run competition</Badge>
      </View>

      <View style={styles.competitionHierarchy}>
        <View style={styles.hierarchyCard}>
          <Text style={styles.hierarchyLabel}>Official Championships</Text>
          <Text style={styles.hierarchyValue}>Season championships</Text>
          <Text style={styles.hierarchyMeta}>Top-level 1V1 events.</Text>
        </View>
        <View style={[styles.hierarchyCard, styles.hierarchyCardActive]}>
          <Text style={styles.hierarchyLabel}>Community Cups</Text>
          <Text style={styles.hierarchyValue}>Reddit Cups</Text>
          <Text style={styles.hierarchyMeta}>
            Discord and venue cups can follow.
          </Text>
        </View>
        <View style={styles.hierarchyCard}>
          <Text style={styles.hierarchyLabel}>League Seasons</Text>
          <Text style={styles.hierarchyValue}>Recurring competition</Text>
          <Text style={styles.hierarchyMeta}>Weekly schedules and standings.</Text>
          <ActionButton href="/leagues" variant="ghost">
            Open leagues
          </ActionButton>
        </View>
        <View style={styles.hierarchyCard}>
          <Text style={styles.hierarchyLabel}>Results & Champions</Text>
          <Text style={styles.hierarchyValue}>Permanent archive</Text>
          <ActionButton href="/results" variant="ghost">
            Open results
          </ActionButton>
        </View>
      </View>

      {tournament ? (
        <View style={styles.communityEventCard}>
          <View style={styles.communityEventCopy}>
            <View style={styles.communityBadges}>
              <Badge tone="accent">Reddit Cup</Badge>
              <Badge tone="blue">Spades</Badge>
              <Badge tone="green">Free entry</Badge>
              <Badge tone={registrationMeta?.tone || "neutral"}>
                {registrationMeta?.label || "Event posted"}
              </Badge>
            </View>
            <Text style={styles.communityEventTitle}>{tournament.title}</Text>
            <Text style={styles.communityEventDate}>
              {formatDateLine(
                tournament.date,
                tournament.timeZone,
                tournament.timeZoneLabel,
              )}{" "}
              • {getRosterCap(tournament)} player cap • Single elimination
            </Text>
            <Text style={styles.communityEventInstructions}>
              Register now. Check-in opens 30 minutes before the event. The
              public bracket is generated after check-in.
            </Text>
            {playerStatus?.error ? (
              <Text style={styles.communityStatusWarning}>
                {playerStatus.error}
              </Text>
            ) : null}
          </View>
          <View style={styles.communityActions}>
            <ActionButton href={primaryAction.href}>
              {playerStatus?.loading
                ? "Checking your status..."
                : primaryAction.label}
            </ActionButton>
            <ActionButton href={broadcastPath} variant="secondary">
              Open stream bracket
            </ActionButton>
          </View>
        </View>
      ) : (
        <View style={styles.communityEmpty}>
          <Text style={styles.communityEventTitle}>
            No Community Cup is published yet.
          </Text>
          <Text style={styles.communityBody}>
            The next Reddit Cup will appear here from the authoritative
            tournament schedule.
          </Text>
        </View>
      )}
    </Surface>
  );
}

function StreamQrGrid({ appStoreUrl, isPhone, joinUrl }) {
  return (
    <View style={[styles.heroQrSection, isPhone && styles.heroQrSectionPhone]}>
      <View style={styles.heroQrHeader}>
        <Text style={styles.eventPanelLabel}>Scan from your phone</Text>
        <Text style={styles.eventPanelMeta}>
          Join the event or get the game
        </Text>
      </View>

      <View style={styles.heroQrGrid}>
        <View style={styles.heroQrCard}>
          <TournamentQrImage
            accessibilityLabel="QR code for the next tournament signup"
            actionLabel="Open registration"
            isPhone={isPhone}
            url={joinUrl}
          />
          <Text style={styles.heroQrLabel}>Scan to join</Text>
          <Text style={styles.heroQrMeta}>Registration and bracket</Text>
        </View>

        {appStoreUrl ? (
          <View style={[styles.heroQrCard, styles.heroQrCardApp]}>
            <TournamentQrImage
              accessibilityLabel="QR code for 1v1 Spades on the App Store"
              actionLabel="Get the app"
              isPhone={isPhone}
              url={appStoreUrl}
            />
            <Text style={styles.heroQrLabel}>Get 1v1 Spades</Text>
            <Text style={styles.heroQrMeta}>Apple App Store</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function TournamentQrImage({ accessibilityLabel, actionLabel, isPhone, url }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const unavailable = failedUrl === url;

  return (
    <View style={[styles.heroQrWrap, unavailable && styles.heroQrWrapUnavailable]}>
      {unavailable ? (
        <View accessibilityRole="status" style={styles.heroQrFallback}>
          <Text style={styles.heroQrFallbackText}>QR unavailable</Text>
          <ActionButton external href={url} style={styles.heroQrFallbackAction} variant="secondary">
            {actionLabel}
          </ActionButton>
        </View>
      ) : (
        <Image
          accessibilityLabel={accessibilityLabel}
          onError={() => setFailedUrl(url)}
          resizeMode="contain"
          source={{ uri: getQrUrl(url) }}
          style={[styles.heroQr, isPhone && styles.heroQrPhone]}
        />
      )}
    </View>
  );
}

function PresentedBy({ sponsor }) {
  if (!sponsor) {
    return null;
  }

  return (
    <View style={styles.presentedBy}>
      {sponsor.logoUrl ? (
        <Image
          accessibilityLabel={`${sponsor.name} sponsor logo`}
          resizeMode="contain"
          source={{ uri: sponsor.logoUrl }}
          style={styles.presentedByLogo}
        />
      ) : null}
      <View style={styles.presentedByCopy}>
        <Text style={styles.presentedByLabel}>Presented by</Text>
        <Text numberOfLines={1} style={styles.presentedByName}>
          {sponsor.name}
        </Text>
      </View>
    </View>
  );
}

function StatusRow({ label, value, emphasis = false }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text
        numberOfLines={2}
        style={[styles.statusValue, emphasis && styles.statusValueEmphasis]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },
  scheduleNoticeTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  countdownCopy: {
    flex: 1.45,
    minWidth: 0,
    width: "100%",
    flexBasis: 360,
    flexShrink: 1,
  },
  countdownCopyPhone: {
    flexBasis: "100%",
    minWidth: 0,
  },
  countdownLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginTop: 24,
  },
  countdownPanel: {
    alignItems: "flex-start",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.lineStrong,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    boxShadow: "none",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 28,
    justifyContent: "space-between",
    minWidth: 0,
    overflow: "hidden",
    padding: 32,
    width: "100%",
  },
  countdownPanelPhone: {
    gap: 24,
    padding: 20,
  },
  countdownStack: {
    alignItems: "center",
    alignSelf: "stretch",
    marginTop: 8,
    minWidth: 0,
    width: "100%",
    flexDirection: "row",
    gap: 12,
  },
  eventTimingStatus: {
    color: theme.colors.text,
    fontSize: 36,
    fontWeight: "700",
    lineHeight: 44,
    flexShrink: 1,
    minWidth: 0,
  },
  eventTimingStatusPhone: {
    fontSize: 28,
    lineHeight: 36,
  },
  countdownDays: {
    color: theme.colors.muted,
    fontSize: 36,
    fontWeight: "500",
    letterSpacing: 0,
    lineHeight: 48,
    whiteSpace: "nowrap",
    fontFamily: "monospace",
  },
  countdownDaysPhone: {
    fontSize: 28,
    lineHeight: 40,
  },
  countdownClock: {
    color: theme.colors.text,
    fontSize: 52,
    fontVariant: ["tabular-nums"],
    fontWeight: "500",
    letterSpacing: -1.5,
    lineHeight: 62,
    minWidth: 0,
    whiteSpace: "nowrap",
    fontFamily: "monospace",
  },
  countdownClockPhone: {
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: -1,
  },
  countdownClockSolo: {
    fontSize: 52,
    lineHeight: 62,
  },
  countdownClockSoloPhone: {
    fontSize: 36,
    lineHeight: 44,
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
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 22,
    marginTop: 12,
  },
  heroText: {
    color: theme.colors.muted,
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 24,
    marginTop: 18,
    maxWidth: 620,
  },
  heroTextPhone: {
    fontSize: 14,
    lineHeight: 21,
  },
  heroQr: {
    height: 112,
    width: 112,
  },
  heroQrCard: {
    alignItems: "center",
    backgroundColor: theme.colors.backgroundAlt,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    flex: 1,
    flexBasis: 142,
    minWidth: 142,
    padding: 8,
  },
  heroQrCardApp: {
    backgroundColor: theme.colors.backgroundAlt,
    borderColor: theme.colors.line,
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
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 9,
    textAlign: "center",
  },
  heroQrMeta: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "400",
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
    padding: 6,
  },
  heroQrWrapUnavailable: {
    backgroundColor: "transparent",
    padding: 0,
    width: "100%",
  },
  heroQrFallback: {
    alignItems: "stretch",
    justifyContent: "center",
    minHeight: 124,
    gap: 12,
  },
  heroQrFallbackText: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  heroQrFallbackAction: {
    marginBottom: 0,
    marginRight: 0,
    minHeight: 44,
  },
  heroKicker: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.6,
    lineHeight: 16,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 44,
    fontWeight: "400",
    letterSpacing: -0.9,
    lineHeight: 50,
    marginTop: 12,
    fontFamily: Platform.select({ web: 'Georgia, "Times New Roman", serif', ios: "Georgia", default: "serif" }),
    maxWidth: 660,
  },
  heroTitlePhone: {
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.6,
  },
  heroFacts: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 18,
  },
  heroFact: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0,
    lineHeight: 17,
  },
  heroFactDivider: {
    color: "rgba(244, 239, 230, 0.28)",
    fontSize: 12,
    fontWeight: "700",
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
    minHeight: 46,
    marginBottom: 0,
    marginRight: 0,
  },
  lobbyHero: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    marginBottom: 24,
    overflow: "visible",
    borderWidth: 0,
    borderRadius: 0,
    boxShadow: "none",
    elevation: 0,
    padding: 0,
  },
  lobbyHeroPhone: {
    marginBottom: 18,
  },
  loadingLabel: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    textTransform: "uppercase",
  },
  loadingLobby: {
    borderColor: "rgba(214, 162, 78, 0.18)",
    gap: 10,
  },
  loadingText: {
    color: theme.colors.muted,
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 23,
  },
  loadingTitle: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "700",
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
    backgroundColor: theme.colors.backgroundAlt,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    boxShadow: "none",
    flex: 0.9,
    gap: 18,
    minWidth: 340,
    padding: 20,
    flexBasis: 360,
    flexShrink: 1,
  },
  eventPanelHeader: {
    gap: 4,
  },
  eventPanelLabel: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  eventPanelMeta: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
  },
  eventPanelPhone: {
    flexBasis: "100%",
    minWidth: 0,
    padding: 16,
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
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    textTransform: "uppercase",
  },
  metricLink: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 22,
    marginTop: 8,
  },
  metricTile: {
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 145,
    flexGrow: 1,
    minHeight: 84,
    padding: 16,
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "700",
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
    borderTopColor: theme.colors.line,
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 14,
  },
  matchFocusText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 23,
  },
  mobileHeroCta: {
    alignSelf: "stretch",
    marginTop: 20,
  },
  playerChip: {
    backgroundColor: theme.colors.surfaceLift,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.sm,
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
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "500",
  },
  playerEmpty: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
  },
  playerMore: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "700",
    paddingVertical: 8,
  },
  primaryCtaMotion: {
    alignSelf: "stretch",
  },
  primaryCtaButton: {
    alignSelf: "stretch",
    marginBottom: 0,
    marginRight: 0,
  },
  progressFill: {
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    height: "100%",
    minWidth: 2,
  },
  progressText: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 17,
    marginTop: 8,
  },
  progressTrack: {
    backgroundColor: "rgba(244, 239, 230, 0.08)",
    borderColor: theme.colors.line,
    borderRadius: 999,
    borderWidth: 0,
    height: 6,
    overflow: "hidden",
  },
  lobbySideRail: {
    flexBasis: 330,
    flexGrow: 1,
    gap: 12,
  },
  rosterPreview: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    boxShadow: "none",
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
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "500",
  },
  rosterPreviewTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  shortcutCommand: {
    backgroundColor: theme.colors.backgroundAlt,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    flexBasis: 96,
    flexGrow: 1,
    minHeight: 56,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  shortcutCommandLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "400",
    marginTop: 3,
  },
  shortcutCommands: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  shortcutCommandText: {
    color: theme.colors.accent,
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 21,
    fontFamily: "monospace",
  },
  shortcutCopy: {
    gap: 4,
  },
  shortcutLabel: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    textTransform: "uppercase",
  },
  shortcutStrip: {
    alignItems: "stretch",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    boxShadow: "none",
    flexDirection: "column",
    gap: 12,
    padding: 16,
  },
  shortcutTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "700",
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
    borderColor: theme.colors.line,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 12,
    minWidth: 280,
    padding: 16,
  },
  sponsorSoftwareConsoleLabel: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "700",
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
    color: theme.colors.muted,
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
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13,
    textTransform: "uppercase",
  },
  sponsorSoftwareStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sponsorSoftwareStatValue: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 23,
    marginTop: 4,
  },
  sponsorSoftwareSummary: {
    color: theme.colors.muted,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 23,
    marginTop: 10,
    maxWidth: 680,
  },
  sponsorSoftwareTitle: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 36,
    marginTop: 10,
  },
  statusLabel: {
    color: theme.colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: "400",
    letterSpacing: 0.2,
    lineHeight: 16,
    minWidth: 116,
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
    color: theme.colors.text,
    flex: 1.2,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "right",
  },
  statusValueEmphasis: {
    color: theme.colors.accent,
    fontSize: 16,
  },
  urgencyLabel: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
    lineHeight: 16,
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
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 20,
    textAlign: "right",
  },
  urgencyValuePhone: {
    textAlign: "left",
    fontSize: 13,
  },
  heroUrgencyCard: {
    backgroundColor: "transparent",
    borderColor: theme.colors.line,
    borderRadius: 0,
    borderWidth: 0,
    boxShadow:
      "0 16px 44px rgba(0, 0, 0, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.035)",
    marginTop: 24,
    maxWidth: 560,
    padding: 0,
    borderTopWidth: 1,
    paddingTop: 16,
    gap: 12,
  },
  presentedBy: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(244, 239, 230, 0.045)",
    borderColor: theme.colors.line,
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
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13,
    textTransform: "uppercase",
  },
  presentedByLogo: {
    borderRadius: 999,
    height: 28,
    width: 28,
  },
  presentedByName: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
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
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  communityTitle: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "600",
    lineHeight: 36,
    marginTop: 8,
    letterSpacing: -0.5,
  },
  communityBody: {
    color: theme.colors.muted,
    fontSize: 15,
    fontWeight: "400",
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
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.md,
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
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  hierarchyValue: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  hierarchyMeta: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 19,
  },
  communityEventCard: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.lineStrong,
    borderRadius: theme.radius.md,
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
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 30,
    marginTop: 10,
  },
  communityEventDate: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 21,
    marginTop: 6,
  },
  communityEventInstructions: {
    color: "#C9C2B8",
    fontSize: 14,
    fontWeight: "400",
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

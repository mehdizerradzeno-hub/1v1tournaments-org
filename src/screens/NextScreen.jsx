import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  ActionButton,
  Badge,
  BulletList,
  EmptyState,
  HubScreen,
  Surface,
} from '../components/hub-ui.jsx';
import { formatDateLine } from '../lib/format.js';
import { downloadLinks } from '../lib/downloadLinks.js';
import {
  getCheckInPath,
  getSponsorSoftware,
  getTournamentPath,
  getUpcomingTournaments,
  siteData,
} from '../lib/siteData.js';
import { getNextPublicTournament, mergeTournamentLists } from '../lib/tournamentCatalog.js';
import { getEffectiveRegistrationStatus, mergeTournamentSettings } from '../lib/tournamentSettings.js';
import {
  fetchSignupSummary,
  fetchTournamentBracket,
  fetchTournamentEvents,
  fetchTournamentSettings,
} from '../lib/tournamentHostingClient.js';

const DEFAULT_ROSTER_CAP = 8;
const NEXT_CHAT_COMMANDS = [
  { command: '!join', label: 'Signup' },
  { command: '!match', label: 'Match' },
  { command: '!rules', label: 'Rules' },
  { command: '!discord', label: 'Discord' },
];
const NEXT_MOTION_CSS = `
@keyframes nextCountdownTick {
  0% { opacity: .78; filter: blur(.35px) drop-shadow(0 0 0 rgba(214, 162, 78, 0)); }
  42% { opacity: 1; filter: blur(0) drop-shadow(0 0 14px rgba(214, 162, 78, .22)); }
  100% { opacity: 1; filter: blur(0) drop-shadow(0 0 0 rgba(214, 162, 78, 0)); }
}

@keyframes nextTitleBreath {
  0%, 100% {
    text-shadow: 0 0 0 rgba(214, 162, 78, 0);
    transform: scale(1);
  }
  50% {
    text-shadow: 0 0 18px rgba(214, 162, 78, .20), 0 0 34px rgba(214, 162, 78, .08);
    transform: scale(1.024);
  }
}

@keyframes nextProgressSheen {
  0% { opacity: 0; transform: translateX(-120%); }
  16% { opacity: .46; }
  56% { opacity: .20; }
  100% { opacity: 0; transform: translateX(220%); }
}

@keyframes nextCtaBreath {
  0%, 100% { box-shadow: 0 12px 28px rgba(214, 162, 78, .14); transform: translateY(0); }
  45% { box-shadow: 0 18px 44px rgba(214, 162, 78, .24); transform: translateY(-1px); }
}

@keyframes nextCtaSweep {
  0% { opacity: 0; transform: translateX(-140%) skewX(-18deg); }
  18% { opacity: .44; }
  42% { opacity: 0; transform: translateX(160%) skewX(-18deg); }
  100% { opacity: 0; transform: translateX(160%) skewX(-18deg); }
}

[data-next-motion="countdown"] {
  animation: nextCountdownTick 440ms cubic-bezier(.2, .86, .22, 1) both;
  will-change: opacity, filter;
}

[data-countdown-clock="true"] {
  display: block;
  font-feature-settings: "tnum" 1;
  font-variant-numeric: tabular-nums;
  overflow-wrap: normal;
  white-space: nowrap;
  word-break: normal;
}

[data-next-motion="title"] {
  animation: nextTitleBreath 3.1s ease-in-out infinite;
  display: inline-block;
  transform-origin: left center;
  will-change: transform, text-shadow;
}

[data-next-motion="progress"] {
  position: relative;
}

[data-next-motion="progress"]::after {
  animation: nextProgressSheen 3.8s cubic-bezier(.2, .8, .2, 1) infinite;
  background: linear-gradient(90deg, transparent, rgba(255, 239, 184, .64), transparent);
  border-radius: 999px;
  content: "";
  inset: 0;
  pointer-events: none;
  position: absolute;
  width: 42%;
}

[data-next-motion="progress-fill"] {
  transition: width 780ms cubic-bezier(.2, .8, .2, 1);
  will-change: width;
}

[data-next-motion="cta"] {
  animation: nextCtaBreath 4.8s ease-in-out infinite;
  border-radius: 12px;
  overflow: hidden;
  position: relative;
  transition: filter 180ms ease, transform 180ms ease;
}

[data-next-motion="cta"]::after {
  animation: nextCtaSweep 5.6s ease-in-out infinite;
  background: linear-gradient(90deg, transparent, rgba(255, 247, 214, .38), transparent);
  content: "";
  inset: 0;
  pointer-events: none;
  position: absolute;
  width: 52%;
  z-index: 2;
}

[data-next-motion="cta"] a > div,
[data-next-motion="cta"] [role="link"] > div,
[data-next-motion="cta"] [role="button"] > div {
  background: linear-gradient(135deg, #F0C86A 0%, #D6A24E 46%, #9F6B24 100%);
  border-color: rgba(255, 236, 181, .56);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .28);
}

[data-next-motion="cta"]:hover {
  filter: saturate(1.05);
  transform: translateY(-2px);
}

[data-next-motion="cta"]:active {
  filter: saturate(.98);
  transform: translateY(1px);
}

[data-next-motion="panel"],
[data-next-motion="card"] {
  transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease, background-color 180ms ease;
}

[data-next-motion="panel"]:hover,
[data-next-motion="card"]:hover {
  border-color: rgba(214, 162, 78, .24);
  box-shadow: 0 24px 62px rgba(0, 0, 0, .30), 0 0 34px rgba(214, 162, 78, .07);
  transform: translateY(-1px);
}
`;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sortTournamentsByDate(tournaments) {
  return [...tournaments].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
}

function getCountdownParts(tournament, nowMs) {
  const startMs = new Date(tournament?.date).getTime();

  if (!Number.isFinite(startMs)) {
    return {
      clockLabel: 'Date TBA',
      dayLabel: '',
    };
  }

  const totalSeconds = Math.max(Math.ceil((startMs - nowMs) / 1000), 0);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hourLabel = String(hours).padStart(2, '0');
  const minuteLabel = String(minutes).padStart(2, '0');
  const secondLabel = String(seconds).padStart(2, '0');

  return {
    clockLabel: `${hourLabel}:${minuteLabel}:${secondLabel}`,
    dayLabel: days > 0 ? `${days}d` : '',
  };
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
    return 'Tournament is full';
  }

  if (openSeats === 1) {
    return 'Only 1 seat left';
  }

  return `Only ${openSeats} seats left`;
}

function getDurationLabel(tournament) {
  return tournament?.duration || tournament?.durationLabel || '45-60 min';
}

function getTournamentSponsor(tournament) {
  const sponsor = tournament?.sponsor || tournament?.presentingSponsor || null;

  if (!sponsor?.name) {
    return null;
  }

  return {
    logoUrl: sponsor.logoUrl || sponsor.logo || '',
    name: sponsor.name,
  };
}

function getMotionDataSet(value) {
  return Platform.OS === 'web' ? { nextMotion: value } : undefined;
}

function NextMotionStyles() {
  if (Platform.OS !== 'web') {
    return null;
  }

  return <style dangerouslySetInnerHTML={{ __html: NEXT_MOTION_CSS }} />;
}

function absoluteTournamentUrl(path) {
  const origin = downloadLinks.tournaments || 'https://1v1tournaments.org';

  return `${origin.replace(/\/$/, '')}${path}`;
}

function getQrUrl(value) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(value)}`;
}

function getNextMatchLabel(bracket) {
  const matches = bracket?.rounds?.flatMap((round) => round.matches || []) || [];
  const match = matches.find((item) => item.status === 'ready' || item.status === 'active')
    || matches.find((item) => item.status !== 'final' && !item.winnerName)
    || null;

  if (!match) {
    return 'Players appear after seeding';
  }

  const players = match.players || [];

  if (players.length) {
    return players.map((player) => player?.handle ? `${player.name} (${player.handle})` : player?.name).filter(Boolean).join(' vs ');
  }

  return match.teams?.join(' vs ') || 'Players appear after seeding';
}

export default function NextScreen() {
  const [eventDataBySlug, setEventDataBySlug] = useState({});
  const [hostedTournaments, setHostedTournaments] = useState([]);
  const [hostedTournamentsLoaded, setHostedTournamentsLoaded] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const upcoming = useMemo(
    () => hostedTournamentsLoaded
      ? mergeTournamentLists(getUpcomingTournaments(), hostedTournaments).filter((tournament) => tournament.status === 'upcoming')
      : [],
    [hostedTournaments, hostedTournamentsLoaded],
  );
  const upcomingSlugs = upcoming.map((tournament) => tournament.slug).join('|');
  const hydratedUpcoming = sortTournamentsByDate(
    upcoming.map((tournament) => mergeTournamentSettings(tournament, eventDataBySlug[tournament.slug]?.settings || null)),
  );
  const tournament = getNextPublicTournament(hydratedUpcoming, eventDataBySlug, nowMs);
  const eventData = eventDataBySlug[tournament?.slug || ''] || {};
  const signupSummary = eventData.signupSummary || { count: 0, signups: [], loading: Boolean(tournament) };
  const bracket = eventData.bracket || null;
  const registrationMeta = tournament
    ? getEffectiveRegistrationStatus(tournament, { hasLiveBracket: Boolean(bracket) })
    : { label: 'Coming soon', tone: 'neutral', value: 'coming-soon' };
  const tournamentPath = tournament ? getTournamentPath(tournament.slug) : '/';
  const checkInPath = tournament ? getCheckInPath(tournament.slug) : '/';
  const joinUrl = absoluteTournamentUrl(checkInPath);
  const signupCount = getSignupCount(signupSummary);
  const rosterCap = getRosterCap(tournament);
  const openSeats = Math.max(rosterCap - signupCount, 0);
  const hasTwitch = Boolean(downloadLinks.twitch);

  useEffect(() => {
    let active = true;

    async function loadHostedTournaments() {
      try {
        const result = await fetchTournamentEvents();

        if (active) {
          setHostedTournaments(result.tournaments || []);
          setHostedTournamentsLoaded(true);
        }
      } catch {
        if (active) {
          setHostedTournaments([]);
          setHostedTournamentsLoaded(true);
        }
      }
    }

    loadHostedTournaments();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!upcoming.length) {
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
        upcoming.map(async (item) => {
          const [settingsResult, bracketResult, signupResult] = await Promise.allSettled([
            fetchTournamentSettings({ slug: item.slug }),
            fetchTournamentBracket({ slug: item.slug }),
            fetchSignupSummary({ slug: item.slug }),
          ]);

          return {
            slug: item.slug,
            settings: settingsResult.status === 'fulfilled' ? settingsResult.value.settings || null : null,
            bracket: bracketResult.status === 'fulfilled' ? bracketResult.value.bracket || null : null,
            signupSummary: {
              count: signupResult.status === 'fulfilled' ? signupResult.value.signupCount || 0 : 0,
              signups: signupResult.status === 'fulfilled' ? signupResult.value.signups || [] : [],
              loading: false,
              unavailable: signupResult.status !== 'fulfilled',
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
            .filter((result) => result.status === 'fulfilled')
            .map((result) => [result.value.slug, result.value]),
        ),
      );

      refreshing = false;
    }

    loadEventData();
    const refreshTimer = setInterval(loadEventData, 15000);

    return () => {
      active = false;
      clearInterval(refreshTimer);
    };
  }, [upcoming, upcomingSlugs]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  if (!hostedTournamentsLoaded) {
    return (
      <HubScreen
        actions={[{ label: 'Home', href: '/' }]}
        eyebrow="Next"
        lead="Loading the live tournament schedule."
        showHeader={false}
        showNavigation={false}
        stickyActions={false}
        subtitle="Checking events"
        title="Next tournament">
        <Surface style={styles.loadingLobby}>
          <Text style={styles.loadingLabel}>Checking schedule</Text>
          <Text style={styles.loadingTitle}>Finding the next live event...</Text>
          <Text style={styles.loadingText}>One moment while the current tournament list loads.</Text>
        </Surface>
      </HubScreen>
    );
  }

  if (!tournament) {
    return (
      <HubScreen
        actions={[{ label: 'Home', href: '/' }]}
        eyebrow="Next"
        lead="The next public event will appear here when it is scheduled."
        showHeader={false}
        showNavigation={false}
        stickyActions={false}
        subtitle="No upcoming tournament is published yet"
        title="Next tournament">
        <EmptyState
          action={<ActionButton href="/">Back home</ActionButton>}
          body="Add or publish a tournament and this page becomes the public lobby."
          title="No event ready"
        />
      </HubScreen>
    );
  }

  return (
    <HubScreen
      actions={[
        { label: registrationMeta.value === 'open' ? 'Join' : 'Event', href: registrationMeta.value === 'open' ? checkInPath : tournamentPath },
        { label: 'Event', href: tournamentPath, variant: 'secondary' },
        hasTwitch ? { label: 'Watch', href: '/stream', variant: 'secondary' } : null,
        { label: 'Rules', href: '/rules', variant: 'ghost' },
      ].filter(Boolean)}
      eyebrow="Next event"
      footerNote={siteData.site.adminNote}
      heroVariant="compact"
      lead="The public lobby for guests: signup count, join link, live link, roster preview, and bracket status."
      showHero={false}
      showHeader={false}
      showNavigation={false}
      subtitle={formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)}
      stickyActions={false}
      title={tournament.title}>
      <NextLobbyHero
        bracket={bracket}
        checkInPath={checkInPath}
        countdownParts={getCountdownParts(tournament, nowMs)}
        joinUrl={joinUrl}
        openSeats={openSeats}
        registrationMeta={registrationMeta}
        rosterCap={rosterCap}
        signupCount={signupCount}
        signupSummary={signupSummary}
        tournament={tournament}
        tournamentPath={tournamentPath}
      />
      <SponsorSoftwareShowcase />
    </HubScreen>
  );
}

function NextLobbyHero({
  bracket,
  checkInPath,
  countdownParts,
  joinUrl,
  openSeats,
  registrationMeta,
  rosterCap,
  signupCount,
  signupSummary,
  tournament,
  tournamentPath,
}) {
  const { width } = useWindowDimensions();
  const isPhone = width > 0 && width < 420;
  const signups = signupSummary.signups || [];
  const signedUpValue = signupSummary.loading ? '--' : `${signupCount}/${rosterCap}`;
  const openSeatsValue = signupSummary.loading ? '--' : openSeats;
  const registrationPercent = signupSummary.loading ? 0 : getRegistrationPercent(signupCount, rosterCap);
  const urgencyCopy = signupSummary.loading
    ? 'Checking available seats'
    : getSeatsMessage(openSeats, signupCount, rosterCap);
  const primaryHref = registrationMeta.value === 'open' ? checkInPath : tournamentPath;
  const primaryLabel = registrationMeta.value === 'open' ? 'Join Tournament' : 'View Event';
  const sponsor = getTournamentSponsor(tournament);
  const countdownKey = `${countdownParts.dayLabel}-${countdownParts.clockLabel}`;

  return (
    <Surface style={[styles.lobbyHero, isPhone && styles.lobbyHeroPhone]}>
      <NextMotionStyles />
      <View
        dataSet={getMotionDataSet('panel')}
        style={[styles.countdownPanel, isPhone && styles.countdownPanelPhone]}>
        <View style={[styles.countdownCopy, isPhone && styles.countdownCopyPhone]}>
          <Text style={styles.countdownLabel}>Starts in</Text>
          <View
            dataSet={getMotionDataSet('countdown')}
            key={countdownKey}
            style={styles.countdownStack}>
            {countdownParts.dayLabel ? (
              <Text
                numberOfLines={1}
                style={[styles.countdownDays, isPhone && styles.countdownDaysPhone]}>
                {countdownParts.dayLabel}
              </Text>
            ) : null}
            <Text
              dataSet={{ countdownClock: 'true' }}
              numberOfLines={1}
              style={[
                styles.countdownClock,
                isPhone && styles.countdownClockPhone,
                !countdownParts.dayLabel && styles.countdownClockSolo,
                isPhone && !countdownParts.dayLabel && styles.countdownClockSoloPhone,
              ]}>
              {countdownParts.clockLabel}
            </Text>
          </View>
          <Text
            dataSet={getMotionDataSet('title')}
            style={[styles.heroTitle, isPhone && styles.heroTitlePhone]}>
            {tournament.title}
          </Text>
          <PresentedBy sponsor={sponsor} />
          <View style={styles.heroFacts}>
            <Text style={styles.heroFact}>Free Entry</Text>
            <Text style={styles.heroFactDivider}>/</Text>
            <Text style={styles.heroFact}>{tournament.format}</Text>
            <Text style={styles.heroFactDivider}>/</Text>
            <Text style={styles.heroFact}>{getDurationLabel(tournament)}</Text>
          </View>

          <View style={[styles.heroExitGrid, isPhone && styles.heroExitGridPhone]}>
            <ActionButton href={primaryHref} style={styles.heroExitButton}>{primaryLabel}</ActionButton>
            <ActionButton href={`${tournamentPath}#my-match`} style={styles.heroExitButton} variant="secondary">
              Find My Match
            </ActionButton>
            <ActionButton href="/stream" style={styles.heroExitButton} variant="secondary">
              Watch Live
            </ActionButton>
            <ActionButton href="/admin" style={styles.heroExitButton} variant="ghost">
              Host Admin
            </ActionButton>
          </View>

          {isPhone ? null : <Text style={styles.heroText}>{tournament.summary}</Text>}

          <View style={styles.heroUrgencyCard}>
            <View style={[styles.urgencyTopRow, isPhone && styles.urgencyTopRowPhone]}>
              <Text style={styles.urgencyLabel}>{registrationMeta.label}</Text>
              <Text style={[styles.urgencyValue, isPhone && styles.urgencyValuePhone]}>{urgencyCopy}</Text>
            </View>
            <View
              accessibilityLabel={`${signupCount} of ${rosterCap} players registered`}
              accessibilityRole="progressbar"
              dataSet={getMotionDataSet('progress')}
              style={styles.progressTrack}>
              <View
                dataSet={getMotionDataSet('progress-fill')}
                style={[styles.progressFill, { width: `${registrationPercent}%` }]}
              />
            </View>
            <Text style={styles.progressText}>
              {signupSummary.loading ? 'Loading registration' : `${signedUpValue} players registered / ${registrationPercent}% filled`}
            </Text>
          </View>

          {isPhone ? <Text style={[styles.heroText, styles.heroTextPhone]}>{tournament.summary}</Text> : null}
        </View>

        <View dataSet={getMotionDataSet('card')} style={[styles.eventPanel, isPhone && styles.eventPanelPhone]}>
          <View style={styles.eventPanelHeader}>
            <Text style={styles.eventPanelLabel}>Tournament status</Text>
            <Text style={styles.eventPanelMeta}>{tournament.location}</Text>
          </View>

          <View style={styles.statusRows}>
            <StatusRow label="Status" value={bracket ? 'Bracket live' : 'Online'} />
            <StatusRow label="Players registered" value={signedUpValue} />
            <StatusRow label="Open seats" value={String(openSeatsValue)} emphasis />
            <StatusRow label="Estimated start" value={formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)} />
            <StatusRow label="Bracket type" value={tournament.format} />
          </View>

          <View style={styles.matchFocus}>
            <Text style={styles.metricLabel}>Next match</Text>
            <Text numberOfLines={2} style={styles.matchFocusText}>{getNextMatchLabel(bracket)}</Text>
          </View>

          <View style={[styles.heroActions, isPhone && styles.heroActionsPhone]}>
            {isPhone ? null : (
              <View dataSet={getMotionDataSet('cta')} style={styles.primaryCtaMotion}>
                <ActionButton href={primaryHref} style={styles.primaryCtaButton}>{primaryLabel}</ActionButton>
              </View>
            )}
            <View style={styles.secondaryActionRow}>
              <ActionButton href={`${tournamentPath}#my-match`} style={styles.secondaryCtaButton} variant="ghost">My Match</ActionButton>
              <ActionButton href={tournamentPath} style={styles.secondaryCtaButton} variant="ghost">Event</ActionButton>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.heroBadgeRow}>
        <Badge tone={bracket ? 'green' : registrationMeta.tone}>
          {bracket ? 'Bracket live' : registrationMeta.label}
        </Badge>
        <Text style={styles.heroDate}>{formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)}</Text>
      </View>

      <View style={styles.lobbyBottom}>
        <View dataSet={getMotionDataSet('card')} style={styles.rosterPreview}>
          <View style={styles.rosterPreviewHead}>
            <Text style={styles.rosterPreviewTitle}>Signed up players</Text>
            <Text style={styles.rosterPreviewMeta}>{signupSummary.loading ? 'Loading' : `${signups.length} visible`}</Text>
          </View>
          <View style={styles.playerChips}>
            {signupSummary.loading ? (
              <Text style={styles.playerEmpty}>Loading roster...</Text>
            ) : signups.length ? (
              signups.slice(0, 10).map((signup, index) => (
                <View key={signup.id || `${signup.playerName}-${index}`} style={styles.playerChip}>
                  <Text numberOfLines={1} style={styles.playerChipText}>{signup.playerName || 'Player'}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.playerEmpty}>No public signups yet.</Text>
            )}
            {signups.length > 10 ? <Text style={styles.playerMore}>+{signups.length - 10} more</Text> : null}
          </View>
        </View>

        <View style={styles.lobbySideRail}>
          <View dataSet={getMotionDataSet('card')} style={styles.shortcutStrip}>
            <View style={styles.shortcutCopy}>
              <Text style={styles.shortcutLabel}>Twitch commands</Text>
              <Text style={styles.shortcutTitle}>Say it once on stream. Chat can handle the rest.</Text>
            </View>
            <View style={styles.shortcutCommands}>
              {NEXT_CHAT_COMMANDS.map((item) => (
                <View key={item.command} style={styles.shortcutCommand}>
                  <Text selectable style={styles.shortcutCommandText}>{item.command}</Text>
                  <Text style={styles.shortcutCommandLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View dataSet={getMotionDataSet('card')} style={styles.qrPanel}>
            <View style={styles.qrCopy}>
              <Text style={styles.qrLabel}>Scan to join</Text>
              <Text numberOfLines={1} style={styles.qrUrl}>{joinUrl}</Text>
            </View>
            <View style={styles.qrWrap}>
              <Image
                accessibilityLabel="QR code for the next tournament signup"
                resizeMode="contain"
                source={{ uri: getQrUrl(joinUrl) }}
                style={styles.qr}
              />
            </View>
          </View>
        </View>
      </View>
    </Surface>
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
        <Text numberOfLines={1} style={styles.presentedByName}>{sponsor.name}</Text>
      </View>
    </View>
  );
}

function SponsorSoftwareShowcase() {
  const software = getSponsorSoftware();

  if (!software) {
    return null;
  }

  return (
    <Surface style={styles.sponsorSoftwarePanel}>
      <View style={styles.sponsorSoftwareGlow} pointerEvents="none" />
      <View style={styles.sponsorSoftwareGrid}>
        <View style={styles.sponsorSoftwareCopy}>
          <Badge tone="accent">{software.eyebrow}</Badge>
          <Text style={styles.sponsorSoftwareTitle}>{software.title}</Text>
          <Text style={styles.sponsorSoftwareSummary}>{software.summary}</Text>
          <BulletList compact items={software.highlights} tone="green" />
        </View>
        <View style={styles.sponsorSoftwareConsole}>
          <Text style={styles.sponsorSoftwareConsoleLabel}>Sponsor stack</Text>
          <View style={styles.sponsorSoftwareStats}>
            {software.stats.map((stat) => (
              <View key={stat.label} style={styles.sponsorSoftwareStat}>
                <Text style={styles.sponsorSoftwareStatLabel}>{stat.label}</Text>
                <Text style={styles.sponsorSoftwareStatValue}>{stat.value}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.sponsorSoftwareNote}>{software.note}</Text>
          <View style={styles.sponsorSoftwareActions}>
            {software.links.filter((link) => !link.href.startsWith('/admin')).map((link, index) => (
              <ActionButton
                key={link.href}
                href={link.href === '/sponsors' ? '/sponsors#sponsor-inquiry' : link.href}
                style={styles.sponsorSoftwareAction}
                variant={index === 0 ? 'primary' : 'secondary'}>
                {link.href === '/sponsors' ? 'Sponsor inquiry' : link.label}
              </ActionButton>
            ))}
          </View>
        </View>
      </View>
    </Surface>
  );
}

function StatusRow({ label, value, emphasis = false }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text numberOfLines={2} style={[styles.statusValue, emphasis && styles.statusValueEmphasis]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  countdownCopy: {
    flex: 1.45,
    minWidth: 280,
    width: '100%',
  },
  countdownCopyPhone: {
    flexBasis: '100%',
    minWidth: 0,
  },
  countdownLabel: {
    color: '#D6A24E',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  countdownPanel: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(5, 5, 5, 0.94)',
    borderColor: 'rgba(214, 162, 78, 0.22)',
    borderRadius: 18,
    borderWidth: 1,
    boxShadow: '0 30px 88px rgba(0, 0, 0, 0.44), 0 0 44px rgba(214, 162, 78, 0.09), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 32,
    justifyContent: 'space-between',
    minWidth: 0,
    overflow: 'hidden',
    padding: 40,
    width: '100%',
  },
  countdownPanelPhone: {
    gap: 24,
    padding: 24,
  },
  countdownStack: {
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    marginTop: 12,
    minWidth: 0,
    width: '100%',
  },
  countdownDays: {
    color: '#F4EFE6',
    fontSize: 'clamp(3.5rem, 10vw, 7.5rem)',
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 'clamp(3.8rem, 10.4vw, 7.85rem)',
    textShadowColor: 'rgba(214, 162, 78, 0.22)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
    whiteSpace: 'nowrap',
    width: '100%',
  },
  countdownDaysPhone: {
    fontSize: 'clamp(3.5rem, 16vw, 5.4rem)',
    lineHeight: 'clamp(3.8rem, 16.8vw, 5.8rem)',
  },
  countdownClock: {
    color: '#F4EFE6',
    fontSize: 'clamp(2.7rem, 7.6vw, 5.7rem)',
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 'clamp(3rem, 8vw, 6rem)',
    minWidth: 0,
    textShadowColor: 'rgba(214, 162, 78, 0.22)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
    whiteSpace: 'nowrap',
    width: '100%',
  },
  countdownClockPhone: {
    fontSize: 'clamp(2.35rem, 11.2vw, 3.9rem)',
    lineHeight: 'clamp(2.7rem, 12vw, 4.25rem)',
  },
  countdownClockSolo: {
    fontSize: 'clamp(3.1rem, 8.8vw, 6.35rem)',
    lineHeight: 'clamp(3.45rem, 9.3vw, 6.7rem)',
  },
  countdownClockSoloPhone: {
    fontSize: 'clamp(2.35rem, 11.2vw, 3.9rem)',
    lineHeight: 'clamp(2.7rem, 12vw, 4.25rem)',
  },
  heroActions: {
    alignContent: 'flex-start',
    flexDirection: 'column',
    gap: 10,
    justifyContent: 'flex-start',
  },
  heroActionsPhone: {
    flexBasis: '100%',
    justifyContent: 'flex-start',
    minWidth: 0,
  },
  heroBadgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  heroDate: {
    color: '#D6A24E',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
    textTransform: 'uppercase',
  },
  heroText: {
    color: '#A7A29A',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 24,
    marginTop: 20,
    maxWidth: 620,
  },
  heroTextPhone: {
    fontSize: 14,
    lineHeight: 21,
  },
  heroTitle: {
    color: '#F4EFE6',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 42,
    marginTop: 14,
  },
  heroTitlePhone: {
    fontSize: 30,
    lineHeight: 36,
  },
  heroFacts: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  heroFact: {
    color: '#D6A24E',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
    lineHeight: 17,
    textTransform: 'uppercase',
  },
  heroFactDivider: {
    color: 'rgba(244, 239, 230, 0.28)',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
  },
  heroExitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    backgroundColor: 'rgba(17, 17, 17, 0.78)',
    borderColor: 'rgba(214, 162, 78, 0.14)',
    marginBottom: 32,
    overflow: 'hidden',
  },
  lobbyHeroPhone: {
    marginBottom: 18,
  },
  loadingLabel: {
    color: '#D6A24E',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  loadingLobby: {
    borderColor: 'rgba(214, 162, 78, 0.18)',
    gap: 10,
  },
  loadingText: {
    color: '#A7A29A',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 23,
  },
  loadingTitle: {
    color: '#F4EFE6',
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
  },
  lobbyBottom: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 16,
  },
  eventMetric: {
    flex: 1,
    minWidth: 110,
  },
  eventMetricRow: {
    flexDirection: 'row',
    gap: 16,
  },
  eventPanel: {
    backgroundColor: 'rgba(18, 18, 18, 0.88)',
    borderColor: 'rgba(244, 239, 230, 0.12)',
    borderRadius: 14,
    borderWidth: 1,
    boxShadow: '0 20px 54px rgba(0, 0, 0, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.035)',
    flex: 0.9,
    gap: 20,
    minWidth: 304,
    padding: 24,
  },
  eventPanelHeader: {
    gap: 4,
  },
  eventPanelLabel: {
    color: '#F4EFE6',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
  },
  eventPanelMeta: {
    color: '#A7A29A',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  eventPanelPhone: {
    flexBasis: '100%',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  metricGridPhone: {
    gap: 8,
  },
  metricLabel: {
    color: '#A7A29A',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  metricLink: {
    color: '#F4EFE6',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
    marginTop: 8,
  },
  metricTile: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 145,
    flexGrow: 1,
    minHeight: 84,
    padding: 16,
  },
  metricValue: {
    color: '#F4EFE6',
    fontSize: 28,
    fontWeight: '900',
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
    borderTopColor: 'rgba(244, 239, 230, 0.10)',
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 18,
  },
  matchFocusText: {
    color: '#F4EFE6',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
  },
  mobileHeroCta: {
    alignSelf: 'stretch',
    marginTop: 20,
  },
  playerChip: {
    backgroundColor: 'rgba(214, 162, 78, 0.12)',
    borderColor: 'rgba(214, 162, 78, 0.24)',
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 180,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  playerChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  playerChipText: {
    color: '#F4EFE6',
    fontSize: 13,
    fontWeight: '900',
  },
  playerEmpty: {
    color: '#A7A29A',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  playerMore: {
    color: '#A7A29A',
    fontSize: 13,
    fontWeight: '900',
    paddingVertical: 8,
  },
  primaryCtaMotion: {
    alignSelf: 'stretch',
  },
  primaryCtaButton: {
    alignSelf: 'stretch',
    boxShadow: '0 16px 36px rgba(214, 162, 78, 0.18)',
    marginBottom: 0,
    marginRight: 0,
  },
  progressFill: {
    backgroundColor: '#D6A24E',
    borderRadius: 999,
    boxShadow: '0 0 18px rgba(214, 162, 78, 0.26)',
    height: '100%',
    minWidth: 2,
  },
  progressText: {
    color: '#A7A29A',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 8,
  },
  progressTrack: {
    backgroundColor: 'rgba(244, 239, 230, 0.08)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 999,
    borderWidth: 1,
    height: 12,
    overflow: 'hidden',
  },
  qr: {
    height: 96,
    width: 96,
  },
  qrCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  qrLabel: {
    color: '#F4EFE6',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  qrPanel: {
    alignItems: 'center',
    backgroundColor: 'rgba(244, 239, 230, 0.04)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 16,
    padding: 12,
  },
  qrUrl: {
    color: '#A7A29A',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  qrWrap: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
  },
  lobbySideRail: {
    flexBasis: 330,
    flexGrow: 1,
    gap: 12,
  },
  rosterPreview: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 14,
    borderWidth: 1,
    boxShadow: '0 18px 48px rgba(0, 0, 0, 0.20)',
    flexBasis: 360,
    flexGrow: 1.4,
    padding: 16,
  },
  rosterPreviewHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  rosterPreviewMeta: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  rosterPreviewTitle: {
    color: '#F4EFE6',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 22,
  },
  shortcutCommand: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 96,
    flexGrow: 1,
    minHeight: 62,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  shortcutCommandLabel: {
    color: '#A7A29A',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 3,
  },
  shortcutCommands: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  shortcutCommandText: {
    color: '#D6A24E',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
  },
  shortcutCopy: {
    gap: 4,
  },
  shortcutLabel: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  shortcutStrip: {
    alignItems: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 14,
    borderWidth: 1,
    boxShadow: '0 18px 48px rgba(0, 0, 0, 0.20)',
    flexDirection: 'column',
    gap: 12,
    padding: 14,
  },
  shortcutTitle: {
    color: '#F4EFE6',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 23,
    marginTop: 4,
  },
  secondaryActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  sponsorSoftwareConsole: {
    backgroundColor: 'rgba(5, 5, 5, 0.44)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 12,
    minWidth: 280,
    padding: 16,
  },
  sponsorSoftwareConsoleLabel: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  sponsorSoftwareCopy: {
    flex: 1.4,
    minWidth: 280,
  },
  sponsorSoftwareGlow: {
    backgroundColor: 'rgba(94, 205, 158, 0.10)',
    borderRadius: 999,
    height: 220,
    position: 'absolute',
    right: -70,
    top: -100,
    width: 300,
  },
  sponsorSoftwareGrid: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  sponsorSoftwareNote: {
    color: '#A7A29A',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  sponsorSoftwarePanel: {
    backgroundColor: 'rgba(7, 17, 15, 0.94)',
    borderColor: 'rgba(94, 205, 158, 0.22)',
    marginBottom: 32,
    overflow: 'hidden',
  },
  sponsorSoftwareStat: {
    backgroundColor: 'rgba(214, 162, 78, 0.10)',
    borderColor: 'rgba(214, 162, 78, 0.24)',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    minWidth: 86,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  sponsorSoftwareStatLabel: {
    color: '#A7A29A',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 13,
    textTransform: 'uppercase',
  },
  sponsorSoftwareStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sponsorSoftwareStatValue: {
    color: '#F4EFE6',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
    marginTop: 4,
  },
  sponsorSoftwareSummary: {
    color: '#A7A29A',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 23,
    marginTop: 10,
    maxWidth: 680,
  },
  sponsorSoftwareTitle: {
    color: '#F4EFE6',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 36,
    marginTop: 10,
  },
  statusLabel: {
    color: '#A7A29A',
    flex: 1,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
    lineHeight: 16,
    minWidth: 116,
    textTransform: 'uppercase',
  },
  statusRow: {
    alignItems: 'flex-start',
    borderBottomColor: 'rgba(244, 239, 230, 0.08)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 10,
  },
  statusRows: {
    gap: 10,
  },
  statusValue: {
    color: '#F4EFE6',
    flex: 1.2,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 20,
    textAlign: 'right',
  },
  statusValueEmphasis: {
    color: '#D6A24E',
    fontSize: 16,
  },
  urgencyLabel: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.3,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  urgencyTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  urgencyTopRowPhone: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: 4,
  },
  urgencyValue: {
    color: '#F4EFE6',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 20,
    textAlign: 'right',
  },
  urgencyValuePhone: {
    textAlign: 'left',
  },
  heroUrgencyCard: {
    backgroundColor: 'rgba(214, 162, 78, 0.085)',
    borderColor: 'rgba(214, 162, 78, 0.22)',
    borderRadius: 14,
    borderWidth: 1,
    boxShadow: '0 16px 44px rgba(0, 0, 0, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.035)',
    marginTop: 24,
    maxWidth: 560,
    padding: 16,
  },
  presentedBy: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(244, 239, 230, 0.045)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
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
    color: '#A7A29A',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 13,
    textTransform: 'uppercase',
  },
  presentedByLogo: {
    borderRadius: 999,
    height: 28,
    width: 28,
  },
  presentedByName: {
    color: '#F4EFE6',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 17,
    maxWidth: 240,
  },
});

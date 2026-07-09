import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  Badge,
  EmptyState,
  HubScreen,
  Surface,
} from '../components/hub-ui.jsx';
import { formatDateLine } from '../lib/format.js';
import { downloadLinks } from '../lib/downloadLinks.js';
import {
  getCheckInPath,
  getTournamentPath,
  getUpcomingTournaments,
  siteData,
} from '../lib/siteData.js';
import { mergeTournamentLists } from '../lib/tournamentCatalog.js';
import { getEffectiveRegistrationStatus, mergeTournamentSettings } from '../lib/tournamentSettings.js';
import {
  fetchSignupSummary,
  fetchTournamentBracket,
  fetchTournamentEvents,
  fetchTournamentSettings,
} from '../lib/tournamentHostingClient.js';

const DEFAULT_ROSTER_CAP = 8;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sortTournamentsByDate(tournaments) {
  return [...tournaments].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
}

function getNextUpcomingTournament(tournaments, nowMs) {
  const datedTournaments = tournaments
    .map((tournament) => ({ tournament, startMs: new Date(tournament?.date).getTime() }))
    .filter((item) => Number.isFinite(item.startMs))
    .sort((left, right) => left.startMs - right.startMs);

  return datedTournaments.find((item) => item.startMs > nowMs)?.tournament
    || datedTournaments[0]?.tournament
    || tournaments[0]
    || null;
}

function getCountdownLabel(tournament, nowMs) {
  const startMs = new Date(tournament?.date).getTime();

  if (!Number.isFinite(startMs)) {
    return 'Date TBA';
  }

  const remainingMinutes = Math.max(Math.floor((startMs - nowMs) / 60000), 0);
  const days = Math.floor(remainingMinutes / 1440);
  const hours = Math.floor((remainingMinutes % 1440) / 60);
  const minutes = remainingMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getSignupCount(signupSummary) {
  return signupSummary?.count || signupSummary?.signups?.length || 0;
}

function getRosterCap(tournament) {
  return parsePositiveInt(tournament?.rosterCap, DEFAULT_ROSTER_CAP);
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const upcoming = useMemo(
    () => mergeTournamentLists(getUpcomingTournaments(), hostedTournaments).filter((tournament) => tournament.status === 'upcoming'),
    [hostedTournaments],
  );
  const upcomingSlugs = upcoming.map((tournament) => tournament.slug).join('|');
  const hydratedUpcoming = sortTournamentsByDate(
    upcoming.map((tournament) => mergeTournamentSettings(tournament, eventDataBySlug[tournament.slug]?.settings || null)),
  );
  const tournament = getNextUpcomingTournament(hydratedUpcoming, nowMs);
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
        }
      } catch {
        if (active) {
          setHostedTournaments([]);
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
    }, 15000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  if (!tournament) {
    return (
      <HubScreen
        actions={[{ label: 'Home', href: '/' }]}
        eyebrow="Next"
        lead="The next public event will appear here when it is scheduled."
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
        { label: registrationMeta.value === 'open' ? 'Join now' : 'View event', href: checkInPath },
        { label: 'Tournament page', href: tournamentPath, variant: 'secondary' },
        hasTwitch ? { label: 'Watch live', href: '/live', variant: 'secondary' } : null,
        { label: 'Rules', href: '/rules', variant: 'ghost' },
      ].filter(Boolean)}
      eyebrow="Next event"
      footerNote={siteData.site.adminNote}
      heroVariant="compact"
      lead="The public lobby for guests: signup count, join link, live link, roster preview, and bracket status."
      subtitle={formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)}
      stickyActions={false}
      title={tournament.title}>
      <NextLobbyHero
        bracket={bracket}
        checkInPath={checkInPath}
        countdownLabel={getCountdownLabel(tournament, nowMs)}
        joinUrl={joinUrl}
        openSeats={openSeats}
        registrationMeta={registrationMeta}
        rosterCap={rosterCap}
        signupCount={signupCount}
        signupSummary={signupSummary}
        tournament={tournament}
        tournamentPath={tournamentPath}
      />
    </HubScreen>
  );
}

function NextLobbyHero({
  bracket,
  checkInPath,
  countdownLabel,
  joinUrl,
  openSeats,
  registrationMeta,
  rosterCap,
  signupCount,
  signupSummary,
  tournament,
  tournamentPath,
}) {
  const signups = signupSummary.signups || [];

  return (
    <Surface style={styles.lobbyHero}>
      <View pointerEvents="none" style={styles.heroGlow} />
      <View style={styles.heroTop}>
        <View style={styles.heroCopy}>
          <View style={styles.heroBadgeRow}>
            <Badge tone={bracket ? 'green' : registrationMeta.tone}>
              {bracket ? 'Bracket live' : registrationMeta.label}
            </Badge>
            <Text style={styles.heroDate}>{formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)}</Text>
          </View>
          <Text style={styles.heroTitle}>Next tournament lobby</Text>
          <Text style={styles.heroText}>{tournament.summary}</Text>
        </View>
        <View style={styles.heroActions}>
          <ActionButton href={checkInPath}>{registrationMeta.value === 'open' ? 'Join now' : 'Open signup'}</ActionButton>
          <ActionButton href={`${tournamentPath}#my-match`} variant="secondary">My match</ActionButton>
          <ActionButton href={tournamentPath} variant="secondary">Tournament page</ActionButton>
          <ActionButton href="/live" variant="secondary">Watch live</ActionButton>
        </View>
      </View>

      <View style={styles.metricGrid}>
        <View style={styles.metricTile}>
          <Text style={styles.metricLabel}>Starts in</Text>
          <Text style={styles.metricValue}>{countdownLabel}</Text>
        </View>
        <View style={styles.metricTile}>
          <Text style={styles.metricLabel}>Signed up</Text>
          <Text style={styles.metricValue}>{signupSummary.loading ? '--' : `${signupCount}/${rosterCap}`}</Text>
        </View>
        <View style={styles.metricTile}>
          <Text style={styles.metricLabel}>Open seats</Text>
          <Text style={styles.metricValue}>{signupSummary.loading ? '--' : openSeats}</Text>
        </View>
        <View style={[styles.metricTile, styles.metricWide]}>
          <Text style={styles.metricLabel}>Next match</Text>
          <Text numberOfLines={1} style={styles.metricLink}>{getNextMatchLabel(bracket)}</Text>
        </View>
      </View>

      <View style={styles.lobbyBottom}>
        <View style={styles.rosterPreview}>
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
        <View style={styles.qrWrap}>
          <Image
            accessibilityLabel="QR code for the next tournament signup"
            resizeMode="contain"
            source={{ uri: getQrUrl(joinUrl) }}
            style={styles.qr}
          />
        </View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  heroActions: {
    alignContent: 'flex-start',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    minWidth: 235,
  },
  heroBadgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  heroCopy: {
    flex: 1.4,
    minWidth: 260,
  },
  heroDate: {
    color: '#D6A24E',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
    textTransform: 'uppercase',
  },
  heroGlow: {
    backgroundColor: 'rgba(214, 162, 78, 0.16)',
    borderRadius: 180,
    height: 260,
    position: 'absolute',
    right: -110,
    top: -130,
    width: 260,
  },
  heroText: {
    color: '#AAB4AE',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 23,
    marginTop: 8,
  },
  heroTitle: {
    color: '#F4EFE6',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 39,
  },
  heroTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  lobbyHero: {
    borderColor: 'rgba(214, 162, 78, 0.42)',
    marginBottom: 24,
    overflow: 'hidden',
  },
  lobbyBottom: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 14,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  metricLabel: {
    color: '#AAB4AE',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  metricLink: {
    color: '#D6A24E',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
    marginTop: 8,
  },
  metricTile: {
    backgroundColor: 'rgba(5, 11, 10, 0.58)',
    borderColor: 'rgba(244, 239, 230, 0.12)',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 145,
    flexGrow: 1,
    minHeight: 88,
    padding: 14,
  },
  metricValue: {
    color: '#F4EFE6',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
    marginTop: 6,
  },
  metricWide: {
    flexBasis: 260,
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
    color: '#AAB4AE',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  playerMore: {
    color: '#AAB4AE',
    fontSize: 13,
    fontWeight: '900',
    paddingVertical: 8,
  },
  qr: {
    height: 118,
    width: 118,
  },
  qrWrap: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
  },
  rosterPreview: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 285,
    flexGrow: 1,
    padding: 14,
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
});

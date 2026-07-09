import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { formatDateLine } from '../lib/format.js';
import {
  getCheckInPath,
  getTournamentPath,
  getUpcomingTournaments,
} from '../lib/siteData.js';
import { downloadLinks } from '../lib/downloadLinks.js';
import { mergeTournamentLists } from '../lib/tournamentCatalog.js';
import { getEffectiveRegistrationStatus, mergeTournamentSettings } from '../lib/tournamentSettings.js';
import {
  fetchSignupSummary,
  fetchTournamentBracket,
  fetchTournamentEvents,
  fetchTournamentSettings,
} from '../lib/tournamentHostingClient.js';
import { theme } from '../lib/theme.js';

const DEFAULT_ROSTER_CAP = 8;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRosterCap(tournament) {
  return parsePositiveInt(tournament?.rosterCap, DEFAULT_ROSTER_CAP);
}

function sortTournamentsByDate(tournaments) {
  return [...tournaments].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
}

function getNextUpcomingTournament(tournaments, nowMs) {
  const datedTournaments = tournaments
    .map((tournament) => ({
      tournament,
      startMs: new Date(tournament?.date).getTime(),
    }))
    .filter((item) => Number.isFinite(item.startMs))
    .sort((left, right) => left.startMs - right.startMs);
  const futureTournament = datedTournaments.find((item) => item.startMs > nowMs);

  return futureTournament?.tournament || datedTournaments[0]?.tournament || tournaments[0] || null;
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

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function getSignupCount(signupSummary) {
  return signupSummary?.count || signupSummary?.signups?.length || 0;
}

function absoluteTournamentUrl(path) {
  const origin = downloadLinks.tournaments || 'https://1v1tournaments.org';

  return `${origin.replace(/\/$/, '')}${path}`;
}

function getQrUrl(value) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent(value)}`;
}

function getNextMatch(bracket) {
  const rounds = bracket?.rounds || [];
  const matches = rounds.flatMap((round) => round.matches || []);

  return matches.find((match) => !match.winner) || matches[0] || null;
}

export default function OverlayScreen() {
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
  const featuredTournament = getNextUpcomingTournament(hydratedUpcoming, nowMs);
  const featuredSlug = featuredTournament?.slug || '';
  const featuredData = eventDataBySlug[featuredSlug] || {};
  const signupSummary = featuredData.signupSummary || { count: 0, signups: [], loading: Boolean(featuredTournament) };
  const bracket = featuredData.bracket || null;
  const registrationMeta = featuredTournament
    ? getEffectiveRegistrationStatus(featuredTournament, { hasLiveBracket: Boolean(bracket) })
    : { label: 'Coming soon', tone: 'neutral' };
  const signupPath = featuredTournament ? getCheckInPath(featuredTournament.slug) : '/next';
  const tournamentPath = featuredTournament ? getTournamentPath(featuredTournament.slug) : '/';
  const joinUrl = absoluteTournamentUrl('/next');
  const count = getSignupCount(signupSummary);
  const cap = getRosterCap(featuredTournament);
  const nextMatch = getNextMatch(bracket);
  const signups = signupSummary.signups || [];

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

    async function loadEventData() {
      const settled = await Promise.allSettled(
        upcoming.map(async (tournament) => {
          const [settingsResult, bracketResult, signupResult] = await Promise.allSettled([
            fetchTournamentSettings({ slug: tournament.slug }),
            fetchTournamentBracket({ slug: tournament.slug }),
            fetchSignupSummary({ slug: tournament.slug }),
          ]);

          return {
            slug: tournament.slug,
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
    }

    loadEventData();

    return () => {
      active = false;
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

  if (!featuredTournament) {
    return (
      <View style={styles.overlayRoot}>
        <View style={styles.overlayShell}>
          <Text style={styles.kicker}>1v1 TOURNAMENTS</Text>
          <Text style={styles.title}>Next event loading</Text>
          <Text style={styles.joinText}>Join: 1v1tournaments.org/next</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.overlayRoot}>
      <View style={styles.overlayShell}>
        <View style={styles.topRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.kicker}>NEXT TOURNAMENT</Text>
            <Text numberOfLines={1} style={styles.title}>{featuredTournament.title}</Text>
            <Text numberOfLines={1} style={styles.dateLine}>
              {formatDateLine(featuredTournament.date, featuredTournament.timeZone, featuredTournament.timeZoneLabel)}
            </Text>
          </View>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{bracket ? 'BRACKET LIVE' : registrationMeta.label.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.middleRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Signed up</Text>
            <Text style={styles.metricValue}>{signupSummary.loading ? '--' : `${count}/${cap}`}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Starts in</Text>
            <Text style={styles.metricValue}>{getCountdownLabel(featuredTournament, nowMs)}</Text>
          </View>
          <View style={styles.matchCard}>
            <Text style={styles.metricLabel}>{nextMatch ? nextMatch.label || 'Up next' : 'Match focus'}</Text>
            <Text numberOfLines={1} style={styles.matchText}>
              {nextMatch?.teams?.join(' vs ') || 'Players appear after seeding'}
            </Text>
          </View>
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.rosterStrip}>
            {signups.length ? signups.slice(0, 6).map((signup, index) => (
              <View key={signup.id || `${signup.playerName}-${index}`} style={styles.playerChip}>
                <Text numberOfLines={1} style={styles.playerChipText}>{signup.playerName || 'Player'}</Text>
              </View>
            )) : (
              <Text style={styles.emptyRoster}>No signups yet</Text>
            )}
          </View>
          <View style={styles.qrWrap}>
            <Image
              accessibilityLabel="QR code for 1v1 tournament signup"
              resizeMode="contain"
              source={{ uri: getQrUrl(joinUrl) }}
              style={styles.qr}
            />
          </View>
          <View style={styles.joinBlock}>
            <Text style={styles.joinLabel}>Join</Text>
            <Text numberOfLines={1} style={styles.joinText}>1v1tournaments.org/next</Text>
            <Text numberOfLines={1} style={styles.smallLink}>{absoluteTournamentUrl(signupPath).replace(/^https?:\/\//, '')}</Text>
          </View>
        </View>

        <Text style={styles.hiddenLink}>{tournamentPath}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    backgroundColor: 'transparent',
    minHeight: '100%',
    padding: 18,
  },
  overlayShell: {
    backgroundColor: 'rgba(5, 11, 10, 0.92)',
    borderColor: 'rgba(214, 162, 78, 0.55)',
    borderRadius: 8,
    borderWidth: 2,
    overflow: 'hidden',
    padding: 18,
    width: '100%',
  },
  topRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 4,
  },
  title: {
    color: theme.colors.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 38,
  },
  dateLine: {
    color: theme.colors.muted,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  statusPill: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: 'rgba(214, 162, 78, 0.42)',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  statusText: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '900',
  },
  middleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  metricCard: {
    backgroundColor: 'rgba(244, 239, 230, 0.07)',
    borderColor: 'rgba(244, 239, 230, 0.14)',
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 126,
    padding: 12,
  },
  matchCard: {
    backgroundColor: 'rgba(97, 210, 145, 0.10)',
    borderColor: 'rgba(97, 210, 145, 0.26)',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minWidth: 0,
    padding: 12,
  },
  metricLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 32,
  },
  matchText: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
  },
  bottomRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  rosterStrip: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
  },
  playerChip: {
    backgroundColor: 'rgba(214, 162, 78, 0.14)',
    borderColor: 'rgba(214, 162, 78, 0.24)',
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 180,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  playerChipText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  emptyRoster: {
    color: theme.colors.muted,
    fontSize: 15,
    fontWeight: '800',
  },
  qrWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 7,
  },
  qr: {
    height: 96,
    width: 96,
  },
  joinBlock: {
    minWidth: 235,
  },
  joinLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  joinText: {
    color: theme.colors.accent,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 27,
  },
  smallLink: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  hiddenLink: {
    color: 'transparent',
    fontSize: 1,
    height: 1,
  },
});

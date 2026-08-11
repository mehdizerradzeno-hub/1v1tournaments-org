import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { formatDateLine } from '../lib/format.js';
import {
  getCheckInPath,
  getTournamentPath,
  getUpcomingTournaments,
} from '../lib/siteData.js';
import { downloadLinks } from '../lib/downloadLinks.js';
import {
  getNextPublicTournament,
  getPublicTournamentCatalog,
  getPublicTournamentFeedStatus,
} from '../lib/tournamentCatalog.js';
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

  return matches.find((match) => match.status === 'ready' || match.status === 'active')
    || matches.find((match) => match.status !== 'final' && !match.winnerName)
    || matches[0]
    || null;
}

function getMatchPlayerLabel(match) {
  const players = match?.players || [];

  if (players.length) {
    return players
      .map((player) => player?.handle ? `${player.name} (${player.handle})` : player?.name)
      .filter(Boolean)
      .join(' vs ');
  }

  if (Array.isArray(match?.teams) && match.teams.length) {
    return match.teams.join(' vs ');
  }

  return 'Players appear after seeding';
}

function getOverlayStatusLabel(bracket, registrationMeta) {
  if (bracket?.status === 'complete') return 'FINAL';
  if (bracket) return 'LIVE';
  return registrationMeta.label.toUpperCase();
}

function getMatchWinnerName(match) {
  return match?.winnerName || match?.winner?.name || match?.winner?.playerName || '';
}

function getMatchBroadcastStatus(match) {
  if (getMatchWinnerName(match) || match?.status === 'final') return 'Final';
  if (match?.status === 'active') return 'Playing';
  if (match?.status === 'ready') return 'Ready';
  if ((match?.players || []).filter(Boolean).length === 1) return 'Bye';
  return 'Pending';
}

function StreamBracketBoard({ bracket, tournament }) {
  const rounds = bracket?.rounds || [];
  const champion = bracket?.winner?.name || bracket?.winner?.playerName || bracket?.championName || '';
  const gameName = String(tournament?.gameSlug || tournament?.game || 'spades').toLowerCase() === 'euchre'
    ? 'Euchre'
    : 'Spades';

  return (
    <View style={styles.broadcastBoard}>
      <View style={styles.broadcastHeader}>
        <View style={styles.broadcastTitleBlock}>
          <Text style={styles.broadcastEyebrow}>1V1 STREAM BRACKET • {gameName.toUpperCase()}</Text>
          <Text style={styles.broadcastTitle}>{tournament.title}</Text>
          <Text style={styles.broadcastMeta}>
            {formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)} • Auto-refreshes every 15 seconds
          </Text>
        </View>
        <View style={[styles.statusPill, bracket && styles.broadcastStatusPill]}>
          <View style={[styles.statusDot, bracket && styles.statusDotLive]} />
          <Text style={styles.statusText}>{bracket?.status === 'complete' ? 'COMPLETE' : bracket ? 'BRACKET LIVE' : 'AWAITING BRACKET'}</Text>
        </View>
      </View>

      {!bracket ? (
        <View style={styles.broadcastEmpty}>
          <Text style={styles.broadcastEmptyTitle}>Bracket appears after check-in.</Text>
          <Text style={styles.broadcastEmptyBody}>Registered players and seeded rounds will populate here automatically.</Text>
        </View>
      ) : (
        <View style={styles.broadcastRounds}>
          {rounds.map((round, roundIndex) => (
            <View key={round.id || round.title || `round-${roundIndex}`} style={styles.broadcastRound}>
              <Text style={styles.broadcastRoundLabel}>{round.title || `Round ${roundIndex + 1}`}</Text>
              <View style={styles.broadcastMatches}>
                {(round.matches || []).map((match, matchIndex) => {
                  const winnerName = getMatchWinnerName(match);
                  const playerLabel = getMatchPlayerLabel(match);
                  const status = getMatchBroadcastStatus(match);

                  return (
                    <View key={match.id || match.label || `match-${matchIndex}`} style={styles.broadcastMatch}>
                      <View style={styles.broadcastMatchTop}>
                        <Text style={styles.broadcastMatchLabel}>{match.label || `Match ${matchIndex + 1}`}</Text>
                        <Text style={[styles.broadcastMatchStatus, status === 'Final' && styles.broadcastMatchStatusFinal]}>{status}</Text>
                      </View>
                      <Text style={styles.broadcastPlayers}>{playerLabel}</Text>
                      {winnerName ? <Text style={styles.broadcastWinner}>Winner: {winnerName}</Text> : null}
                      {status === 'Bye' ? <Text style={styles.broadcastWinner}>Advances by bye</Text> : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      )}

      {champion ? (
        <View style={styles.broadcastChampion}>
          <Text style={styles.broadcastChampionLabel}>Champion</Text>
          <Text style={styles.broadcastChampionName}>{champion}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function OverlayScreen({ tournamentSlug = '', variant = 'full' }) {
  const [eventDataBySlug, setEventDataBySlug] = useState({});
  const [hostedTournaments, setHostedTournaments] = useState([]);
  const [hostedTournamentState, setHostedTournamentState] = useState({ error: '', loaded: false });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const upcoming = useMemo(
    () => hostedTournamentState.loaded
      ? getPublicTournamentCatalog(getUpcomingTournaments(), hostedTournaments)
      : [],
    [hostedTournaments, hostedTournamentState.loaded],
  );
  const upcomingSlugs = upcoming.map((tournament) => tournament.slug).join('|');
  const hydratedUpcoming = sortTournamentsByDate(
    upcoming.map((tournament) => mergeTournamentSettings(tournament, eventDataBySlug[tournament.slug]?.settings || null)),
  );
  const featuredTournament = tournamentSlug
    ? hydratedUpcoming.find((tournament) => tournament.slug === tournamentSlug) || null
    : getNextPublicTournament(hydratedUpcoming, eventDataBySlug, nowMs);
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
  const liveCount = hydratedUpcoming.filter((tournament) => eventDataBySlug[tournament.slug]?.bracket).length;
  const eventCount = hydratedUpcoming.length;
  const feedStatus = getPublicTournamentFeedStatus({
    error: hostedTournamentState.error,
    loaded: hostedTournamentState.loaded,
    tournament: featuredTournament,
  });

  useEffect(() => {
    let active = true;
    let refreshing = false;

    async function loadHostedTournaments() {
      if (refreshing) {
        return;
      }

      refreshing = true;

      try {
        const result = await fetchTournamentEvents();

        if (active) {
          setHostedTournaments(result.tournaments || []);
          setHostedTournamentState({ error: '', loaded: true });
        }
      } catch (error) {
        if (active) {
          setHostedTournamentState({
            error: error instanceof Error ? error.message : 'Tournament schedule could not be loaded.',
            loaded: true,
          });
        }
      } finally {
        refreshing = false;
      }
    }

    loadHostedTournaments();
    const refreshTimer = setInterval(loadHostedTournaments, 15000);

    return () => {
      active = false;
      clearInterval(refreshTimer);
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
        upcoming.map(async (tournament) => {
          const [settingsResult, bracketResult, signupResult] = await Promise.allSettled([
            fetchTournamentSettings({ slug: tournament.slug }),
            fetchTournamentBracket({ slug: tournament.slug }),
            fetchSignupSummary({ slug: tournament.slug }),
          ]);

          return {
            slug: tournament.slug,
            settingsResult,
            bracketResult,
            signupResult,
          };
        }),
      );

      if (!active) {
        return;
      }

      setEventDataBySlug((previous) => Object.fromEntries(
        settled
          .filter((result) => result.status === 'fulfilled')
          .map((result) => {
            const {
              bracketResult,
              settingsResult,
              signupResult,
              slug,
            } = result.value;
            const prior = previous[slug] || {};

            return [slug, {
              settings: settingsResult.status === 'fulfilled'
                ? settingsResult.value.settings || null
                : prior.settings || null,
              bracket: bracketResult.status === 'fulfilled'
                ? bracketResult.value.bracket || null
                : prior.bracket || null,
              signupSummary: signupResult.status === 'fulfilled'
                ? {
                    count: signupResult.value.signupCount || 0,
                    signups: signupResult.value.signups || [],
                    loading: false,
                    unavailable: false,
                  }
                : prior.signupSummary || {
                    count: 0,
                    signups: [],
                    loading: false,
                    unavailable: true,
                  },
            }];
          }),
      ));

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

  if (!featuredTournament) {
    const emptyTitle = feedStatus === 'loading'
      ? 'Checking tournament feed'
      : feedStatus === 'error'
        ? 'Tournament feed unavailable'
        : 'Next event loading';

    return (
      <View style={styles.overlayRoot}>
        <View style={[styles.overlayShell, variant === 'compact' && styles.compactShell]}>
          <Text style={styles.kicker}>1v1 TOURNAMENTS</Text>
          <Text style={styles.title}>{emptyTitle}</Text>
          <Text style={styles.joinText}>Join: 1v1tournaments.org/next</Text>
        </View>
      </View>
    );
  }

  if (variant === 'compact') {
    return (
      <View style={[styles.overlayRoot, styles.compactRoot]}>
        <View style={[styles.overlayShell, styles.compactShell]}>
          <View style={styles.compactMain}>
            <View style={styles.compactLiveGroup}>
              <View style={[styles.statusDot, bracket && styles.statusDotLive]} />
              <Text style={styles.compactKicker}>{getOverlayStatusLabel(bracket, registrationMeta)}</Text>
            </View>
            <Text numberOfLines={1} style={styles.compactTitle}>{featuredTournament.title}</Text>
            <Text numberOfLines={1} style={styles.compactMatch}>{getMatchPlayerLabel(nextMatch)}</Text>
          </View>
          <View style={styles.compactStats}>
            <Text style={styles.compactStatLabel}>Signed up</Text>
            <Text style={styles.compactStatValue}>{signupSummary.loading ? '--' : `${count}/${cap}`}</Text>
          </View>
          <View style={styles.compactJoin}>
            <Text style={styles.compactStatLabel}>Join</Text>
            <Text numberOfLines={1} style={styles.compactJoinText}>1v1tournaments.org/next</Text>
          </View>
        </View>
      </View>
    );
  }

  if (variant === 'bracket') {
    return (
      <View style={[styles.overlayRoot, styles.bracketRoot]}>
        <View style={[styles.overlayShell, styles.bracketShell]}>
          <StreamBracketBoard bracket={bracket} tournament={featuredTournament} />
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
            <View style={[styles.statusDot, bracket && styles.statusDotLive]} />
            <Text style={styles.statusText}>{getOverlayStatusLabel(bracket, registrationMeta)}</Text>
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
              {getMatchPlayerLabel(nextMatch)}
            </Text>
            <Text numberOfLines={1} style={styles.matchMeta}>
              {nextMatch?.status === 'final' ? 'Match complete' : bracket ? 'Open the live page for table links' : 'Seeded near start time'}
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Tourneys</Text>
            <Text style={styles.metricValue}>{liveCount}/{eventCount}</Text>
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
  compactRoot: {
    justifyContent: 'flex-end',
    minHeight: 150,
  },
  compactShell: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  compactMain: {
    flex: 1,
    minWidth: 0,
  },
  compactLiveGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 2,
  },
  compactKicker: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  compactTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 27,
  },
  compactMatch: {
    color: theme.colors.green,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
    marginTop: 2,
  },
  compactStats: {
    backgroundColor: 'rgba(244, 239, 230, 0.07)',
    borderColor: 'rgba(244, 239, 230, 0.14)',
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 104,
    padding: 10,
  },
  compactStatLabel: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  compactStatValue: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
  },
  compactJoin: {
    minWidth: 220,
  },
  compactJoinText: {
    color: theme.colors.accent,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
  },
  bracketRoot: {
    minHeight: 250,
  },
  bracketShell: {
    aspectRatio: 16 / 9,
    maxWidth: 1600,
    minHeight: 520,
  },
  bracketInfoRow: {
    flexDirection: 'row',
    gap: 10,
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
    alignItems: 'center',
    backgroundColor: theme.colors.accentSoft,
    borderColor: 'rgba(214, 162, 78, 0.42)',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  statusDot: {
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    height: 8,
    opacity: 0.75,
    width: 8,
  },
  statusDotLive: {
    backgroundColor: '#F05252',
    opacity: 1,
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
    backgroundColor: 'rgba(214, 162, 78, 0.10)',
    borderColor: 'rgba(214, 162, 78, 0.26)',
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
  matchMeta: {
    color: theme.colors.green,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 4,
    textTransform: 'uppercase',
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
  broadcastBoard: {
    flex: 1,
    gap: 18,
  },
  broadcastHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
  },
  broadcastTitleBlock: {
    flex: 1,
    minWidth: 250,
  },
  broadcastEyebrow: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '900',
  },
  broadcastTitle: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 38,
    marginTop: 4,
  },
  broadcastMeta: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 5,
  },
  broadcastStatusPill: {
    backgroundColor: 'rgba(65, 194, 116, 0.10)',
    borderColor: 'rgba(65, 194, 116, 0.34)',
  },
  broadcastRounds: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flex: 1,
    flexWrap: 'wrap',
    gap: 12,
  },
  broadcastRound: {
    backgroundColor: 'rgba(244, 239, 230, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minWidth: 220,
    padding: 12,
  },
  broadcastRoundLabel: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  broadcastMatches: {
    gap: 9,
  },
  broadcastMatch: {
    backgroundColor: 'rgba(5, 11, 10, 0.78)',
    borderColor: 'rgba(214, 162, 78, 0.20)',
    borderRadius: 7,
    borderWidth: 1,
    padding: 10,
  },
  broadcastMatchTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  broadcastMatchLabel: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  broadcastMatchStatus: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  broadcastMatchStatusFinal: {
    color: theme.colors.green,
  },
  broadcastPlayers: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
    marginTop: 6,
  },
  broadcastWinner: {
    color: theme.colors.green,
    fontSize: 11,
    fontWeight: '900',
    marginTop: 5,
  },
  broadcastChampion: {
    alignItems: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.13)',
    borderColor: 'rgba(214, 162, 78, 0.40)',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  broadcastChampionLabel: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  broadcastChampionName: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  broadcastEmpty: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 30,
  },
  broadcastEmptyTitle: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
  },
  broadcastEmptyBody: {
    color: theme.colors.muted,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
});

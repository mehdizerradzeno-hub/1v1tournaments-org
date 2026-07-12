import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import {
  ActionButton,
  Badge,
  EmptyState,
  HubScreen,
  Section,
  Surface,
} from '../components/hub-ui.jsx';
import { formatDateLine, formatShortDate } from '../lib/format.js';
import {
  getCheckInPath,
  getTournamentPath,
  getUpcomingTournaments,
} from '../lib/siteData.js';
import { downloadLinks } from '../lib/downloadLinks.js';
import { getNextPublicTournament, mergeTournamentLists } from '../lib/tournamentCatalog.js';
import { getEffectiveRegistrationStatus, mergeTournamentSettings } from '../lib/tournamentSettings.js';
import {
  fetchSignupSummary,
  fetchTournamentBracket,
  fetchTournamentEvents,
  fetchTournamentSettings,
} from '../lib/tournamentHostingClient.js';
import { theme } from '../lib/theme.js';

const DEFAULT_ROSTER_CAP = 8;
const DEFAULT_MINIMUM_PLAYERS = 2;
const VIEWER_COMMANDS = [
  { command: '!join', label: 'Join the bracket' },
  { command: '!next', label: 'Next tournament' },
  { command: '!match', label: 'Find your match' },
  { command: '!rules', label: 'Tournament rules' },
  { command: '!discord', label: 'Discord invite' },
  { command: '!live', label: 'Live hub' },
];

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRosterCap(tournament) {
  return parsePositiveInt(tournament?.rosterCap, DEFAULT_ROSTER_CAP);
}

function getMinimumPlayers(tournament) {
  return parsePositiveInt(tournament?.minimumPlayers, DEFAULT_MINIMUM_PLAYERS);
}

function sortTournamentsByDate(tournaments) {
  return [...tournaments].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
}

function getCountdownParts(tournament, nowMs) {
  const startMs = new Date(tournament?.date).getTime();

  if (!Number.isFinite(startMs)) {
    return [
      { label: 'Days', value: '--' },
      { label: 'Hours', value: '--' },
      { label: 'Minutes', value: '--' },
    ];
  }

  const remainingMs = Math.max(startMs - nowMs, 0);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return [
    { label: 'Days', value: String(days) },
    { label: 'Hours', value: String(hours).padStart(2, '0') },
    { label: 'Minutes', value: String(minutes).padStart(2, '0') },
  ];
}

function getSignupCount(signupSummary) {
  return signupSummary?.count || signupSummary?.signups?.length || 0;
}

function absoluteTournamentUrl(path) {
  const origin = downloadLinks.tournaments || 'https://1v1tournaments.org';

  return `${origin.replace(/\/$/, '')}${path}`;
}

function getQrUrl(value) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(value)}`;
}

function getSignupStatusMeta(signup, bracket) {
  const status = String(signup?.status || 'registered').toLowerCase();
  const playerName = signup?.playerName || signup?.playerHandle || '';
  const rounds = bracket?.rounds || [];
  const matches = rounds.flatMap((round) => round.matches || []);
  const playerMatches = matches.filter((match) => (match.teams || []).some((name) => name === playerName));
  const wonMatch = playerMatches.some((match) => match.winnerName === playerName || match.winner === playerName);
  const lostFinalMatch = playerMatches.some((match) => match.status === 'final' && (match.winnerName || match.winner) && match.winnerName !== playerName && match.winner !== playerName);

  if (wonMatch) {
    return { label: 'Winner', tone: 'green' };
  }

  if (lostFinalMatch || status === 'eliminated') {
    return { label: 'Eliminated', tone: 'neutral' };
  }

  if (playerMatches.some((match) => match.status === 'live' || match.status === 'active')) {
    return { label: 'In match', tone: 'rose' };
  }

  if (status === 'checked-in' || status === 'checked in') {
    return { label: 'Checked in', tone: 'blue' };
  }

  return { label: 'Registered', tone: 'accent' };
}

function getRosterLabel(signupSummary, tournament) {
  if (signupSummary?.loading) {
    return 'Loading';
  }

  if (signupSummary?.unavailable) {
    return `Open / ${getRosterCap(tournament)}`;
  }

  return `${getSignupCount(signupSummary)} / ${getRosterCap(tournament)}`;
}

function getBracketMatchSummary(bracket) {
  const rounds = bracket?.rounds || [];
  const matches = rounds.flatMap((round) => round.matches || []);
  const nextMatch = matches.find((match) => !match.winner) || matches[0] || null;

  if (!nextMatch) {
    return null;
  }

  return {
    label: nextMatch.label || 'Next match',
    teams: nextMatch.teams?.join(' vs ') || 'Players appear after seeding',
    note: nextMatch.note || '',
  };
}

function getViewerNextSteps(registrationMeta, featuredBracket) {
  if (featuredBracket) {
    return [
      { label: 'Playing', title: 'Check match status', body: 'Open Match Status or use !match in Twitch chat.' },
      { label: 'Watching', title: 'Follow the bracket', body: 'Use the tournament page for the live bracket and roster.' },
      { label: 'Chat', title: 'Ask for links', body: 'Type !live, !rules, or !discord in Twitch chat.' },
    ];
  }

  if (registrationMeta.value === 'open') {
    return [
      { label: 'Step 1', title: 'Join the bracket', body: 'Use the join button or type !join in Twitch chat.' },
      { label: 'Step 2', title: 'Watch the roster', body: 'Your public player name appears in the signup list.' },
      { label: 'Step 3', title: 'Come back for match time', body: 'Use Match Status when the host publishes the bracket.' },
    ];
  }

  return [
    { label: 'Now', title: 'View tournament', body: 'Registration is not open, but event details are visible.' },
    { label: 'Later', title: 'Watch for the bracket', body: 'The page updates when the host starts the event.' },
    { label: 'Chat', title: 'Use commands', body: 'Type !next or !live for the public links.' },
  ];
}

export default function StreamModeScreen() {
  const { width } = useWindowDimensions();
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
  const featuredTournament = getNextPublicTournament(hydratedUpcoming, eventDataBySlug, nowMs);
  const featuredSlug = featuredTournament?.slug || '';
  const featuredEventData = eventDataBySlug[featuredSlug] || {};
  const featuredSignupSummary = featuredEventData.signupSummary || { count: 0, signups: [], loading: Boolean(featuredTournament) };
  const featuredBracket = featuredEventData.bracket || null;
  const registrationMeta = featuredTournament
    ? getEffectiveRegistrationStatus(featuredTournament, { hasLiveBracket: Boolean(featuredBracket) })
    : { label: 'Coming soon', tone: 'neutral', value: 'coming-soon' };
  const tournamentPath = featuredTournament ? getTournamentPath(featuredTournament.slug) : '/';
  const signupPath = featuredTournament ? getCheckInPath(featuredTournament.slug) : '/';
  const matchStatusPath = featuredTournament ? `${tournamentPath}#my-match` : tournamentPath;
  const joinUrl = absoluteTournamentUrl(signupPath);
  const signups = featuredSignupSummary.signups || [];
  const cap = getRosterCap(featuredTournament);
  const openSeats = Math.max(cap - getSignupCount(featuredSignupSummary), 0);
  const bracketMatchSummary = getBracketMatchSummary(featuredBracket);
  const countdownParts = getCountdownParts(featuredTournament, nowMs);
  const viewerNextSteps = getViewerNextSteps(registrationMeta, featuredBracket);
  const isWide = Platform.OS === 'web' && width >= 920;

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

  return (
    <HubScreen
      actions={[
        { label: 'Home', href: '/', variant: 'secondary' },
        { label: 'Tournament', href: tournamentPath, variant: 'secondary' },
        { label: 'Overlay', href: '/overlay', variant: 'secondary' },
        { label: 'Live links', href: '/live', variant: 'ghost' },
      ]}
      eyebrow="Twitch mode"
      footerNote="Stream mode is public and read-only. Admin tools stay separate."
      forceTopNav
      lead="A clean guest-facing board for Twitch viewers, OBS browser sources, and tournament-day sharing."
      subtitle="Next tournament, signup count, public roster, and match links in one place."
      title="Stream board">
      {!featuredTournament ? (
        <EmptyState
          body="Add an upcoming public tournament and this page will turn into the stream board automatically."
          title="No upcoming tournament is scheduled"
        />
      ) : (
        <>
          <View style={[styles.heroGrid, isWide && styles.heroGridWide]}>
            <Surface style={styles.nextCard}>
              <View pointerEvents="none" style={styles.glow} />
              <View style={styles.eventTopRow}>
                <Badge tone={featuredBracket ? 'green' : registrationMeta.tone}>
                  {featuredBracket ? 'Bracket live' : registrationMeta.label}
                </Badge>
                <Text style={styles.eventMeta}>Next tournament</Text>
              </View>
              <Text style={styles.eventTitle}>{featuredTournament.title}</Text>
              <Text style={styles.eventDate}>
                {formatDateLine(featuredTournament.date, featuredTournament.timeZone, featuredTournament.timeZoneLabel)}
              </Text>
              <Text style={styles.eventSummary}>
                {featuredTournament.format} • {featuredTournament.location} • {featuredTournament.entryLine}
              </Text>

              <View style={styles.countdownRow}>
                {countdownParts.map((part) => (
                  <View key={part.label} style={styles.countdownTile}>
                    <Text style={styles.countdownValue}>{part.value}</Text>
                    <Text style={styles.countdownLabel}>{part.label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.actionRow}>
                <ActionButton href={registrationMeta.value === 'open' ? signupPath : tournamentPath}>
                  {registrationMeta.value === 'open' ? 'Join tournament' : 'View tournament'}
                </ActionButton>
                <ActionButton href={matchStatusPath} variant="secondary">
                  My Match
                </ActionButton>
                <ActionButton href="/stream" variant="secondary">
                  Watch
                </ActionButton>
              </View>
            </Surface>

            <View style={styles.scoreColumn}>
              <Surface style={styles.scoreCard}>
                <Text style={styles.scoreLabel}>Signed up</Text>
                <Text style={styles.scoreValue}>{getRosterLabel(featuredSignupSummary, featuredTournament)}</Text>
              </Surface>
              <Surface style={styles.scoreCard}>
                <Text style={styles.scoreLabel}>Open seats</Text>
                <Text style={styles.scoreValue}>{featuredSignupSummary.loading ? '--' : openSeats}</Text>
              </Surface>
              <Surface style={styles.scoreCard}>
                <Text style={styles.scoreLabel}>Runs with</Text>
                <Text style={styles.scoreValue}>{getMinimumPlayers(featuredTournament)}+</Text>
              </Surface>
            </View>
          </View>

          <View style={[styles.priorityGrid, isWide && styles.priorityGridWide]}>
            <Surface style={styles.nextStepCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>What to do next</Text>
                <Text style={styles.cardMeta}>{featuredBracket ? 'Bracket live' : registrationMeta.label}</Text>
              </View>
              <View style={styles.nextStepGrid}>
                {viewerNextSteps.map((item) => (
                  <View key={item.title} style={styles.nextStepItem}>
                    <Text style={styles.nextStepLabel}>{item.label}</Text>
                    <Text style={styles.nextStepTitle}>{item.title}</Text>
                    <Text style={styles.nextStepBody}>{item.body}</Text>
                  </View>
                ))}
              </View>
            </Surface>

            <Surface style={styles.chatCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Twitch chat commands</Text>
                <Text style={styles.cardMeta}>Bot live</Text>
              </View>
              <View style={styles.viewerCommandGrid}>
                {VIEWER_COMMANDS.map((item) => (
                  <View key={item.command} style={styles.viewerCommandChip}>
                    <Text style={styles.viewerCommand}>{item.command}</Text>
                    <Text style={styles.viewerCommandLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </Surface>
          </View>

          <View style={[styles.detailGrid, isWide && styles.detailGridWide]}>
            <Surface style={styles.rosterCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Public signup roster</Text>
                <Text style={styles.cardMeta}>
                  {featuredSignupSummary.unavailable
                    ? 'Unavailable'
                    : featuredSignupSummary.loading
                      ? 'Loading'
                      : `${signups.length} visible`}
                </Text>
              </View>
              {featuredSignupSummary.loading ? (
                <Text style={styles.emptyCopy}>Loading registered players...</Text>
              ) : signups.length ? (
                <View style={styles.rosterGrid}>
                  {signups.slice(0, 16).map((signup, index) => (
                    <RosterRow
                      bracket={featuredBracket}
                      index={index}
                      key={signup.id || `${signup.playerName}-${index}`}
                      signup={signup}
                    />
                  ))}
                  {signups.length > 16 ? (
                    <Text style={styles.morePlayers}>+{signups.length - 16} more players</Text>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.emptyCopy}>No public signups yet. Keep the join link visible on stream.</Text>
              )}
            </Surface>

            <Surface style={styles.matchCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Match focus</Text>
                <Text style={styles.cardMeta}>{featuredBracket ? 'Live bracket' : 'Waiting for seeding'}</Text>
              </View>
              {bracketMatchSummary ? (
                <View style={styles.matchFocus}>
                  <Text style={styles.matchLabel}>{bracketMatchSummary.label}</Text>
                  <Text style={styles.matchTeams}>{bracketMatchSummary.teams}</Text>
                  {bracketMatchSummary.note ? <Text style={styles.matchNote}>{bracketMatchSummary.note}</Text> : null}
                </View>
              ) : (
                <Text style={styles.emptyCopy}>Player matchups appear here after the bracket is generated.</Text>
              )}
              <View style={styles.streamChecklist}>
                <Text style={styles.checkItem}>Signup link visible</Text>
                <Text style={styles.checkItem}>Roster visible to guests</Text>
                <Text style={styles.checkItem}>Watch links one tap away</Text>
              </View>
            </Surface>
          </View>

          <Section
            description="Put this on stream when you want viewers to join from a phone."
            title="QR join card">
            <Surface style={[styles.qrCard, isWide && styles.qrCardWide]}>
              <View style={styles.qrImageShell}>
                <Image
                  accessibilityLabel="QR code for tournament signup"
                  resizeMode="contain"
                  source={{ uri: getQrUrl(joinUrl) }}
                  style={styles.qrImage}
                />
              </View>
              <View style={styles.qrCopy}>
                <Badge tone="accent">Scan to join</Badge>
                <Text style={styles.qrTitle}>Join the next tournament</Text>
                <Text style={styles.qrUrl}>{joinUrl}</Text>
                <View style={styles.qrActions}>
                  <ActionButton href={signupPath}>Join</ActionButton>
                  <ActionButton href="/next" variant="secondary">Short link</ActionButton>
                </View>
              </View>
            </Surface>
          </Section>

          <Section
            description="Small cards for guests who scroll below the main stream board."
            title="Upcoming queue">
            <View style={styles.queueList}>
              {hydratedUpcoming.slice(0, 4).map((tournament) => {
                const eventData = eventDataBySlug[tournament.slug] || {};
                const signupSummary = eventData.signupSummary || { count: 0, signups: [], loading: true };

                return (
                  <Surface key={tournament.slug} style={styles.queueCard}>
                    <View style={styles.queueDate}>
                      <Text style={styles.queueMonth}>{formatShortDate(tournament.date, tournament.timeZone).split(' ')[0]}</Text>
                      <Text style={styles.queueDay}>{formatShortDate(tournament.date, tournament.timeZone).split(' ')[1] || ''}</Text>
                    </View>
                    <View style={styles.queueCopy}>
                      <Text style={styles.queueTitle}>{tournament.title}</Text>
                      <Text style={styles.queueMeta}>{formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)}</Text>
                      <Text style={styles.queueRoster}>{getRosterLabel(signupSummary, tournament)} signed up</Text>
                    </View>
                    <ActionButton href={getTournamentPath(tournament.slug)} variant="secondary" style={styles.queueButton}>
                      Open
                    </ActionButton>
                  </Surface>
                );
              })}
            </View>
          </Section>
        </>
      )}
    </HubScreen>
  );
}

function RosterRow({ signup, index, bracket }) {
  const statusMeta = getSignupStatusMeta(signup, bracket);

  return (
    <View style={styles.rosterRow}>
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>{index + 1}</Text>
      </View>
      <View style={styles.playerCopy}>
        <Text numberOfLines={1} style={styles.playerName}>
          {signup.playerName || 'Unnamed player'}
        </Text>
        <Text numberOfLines={1} style={styles.playerStatus}>
          {signup.playerHandle || 'No handle added'}
        </Text>
      </View>
      <View style={[styles.statusChip, styles[`statusChip${statusMeta.tone[0].toUpperCase()}${statusMeta.tone.slice(1)}`]]}>
        <Text style={styles.statusChipText}>{statusMeta.label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroGrid: {
    gap: 14,
    marginBottom: 18,
  },
  heroGridWide: {
    alignItems: 'stretch',
    flexDirection: 'row',
  },
  nextCard: {
    borderColor: 'rgba(214, 162, 78, 0.34)',
    overflow: 'hidden',
    flex: 1,
  },
  glow: {
    backgroundColor: 'rgba(214, 162, 78, 0.18)',
    borderRadius: 180,
    height: 220,
    position: 'absolute',
    right: -84,
    top: -92,
    width: 220,
  },
  eventTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  eventMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  eventTitle: {
    color: theme.colors.text,
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 47,
    marginBottom: 10,
  },
  eventDate: {
    color: theme.colors.accent,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 25,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  eventSummary: {
    color: theme.colors.muted,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 18,
  },
  countdownRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  countdownTile: {
    backgroundColor: 'rgba(5, 11, 10, 0.72)',
    borderColor: theme.colors.lineStrong,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 86,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  countdownValue: {
    color: theme.colors.text,
    fontSize: 29,
    fontWeight: '900',
    lineHeight: 35,
  },
  countdownLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  scoreColumn: {
    gap: 14,
    minWidth: 230,
  },
  scoreCard: {
    borderColor: 'rgba(244, 239, 230, 0.14)',
    minHeight: 122,
    justifyContent: 'center',
  },
  scoreLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  scoreValue: {
    color: theme.colors.text,
    fontSize: 35,
    fontWeight: '900',
    lineHeight: 40,
  },
  detailGrid: {
    gap: 14,
    marginBottom: 18,
  },
  detailGridWide: {
    alignItems: 'stretch',
    flexDirection: 'row',
  },
  rosterCard: {
    flex: 1.15,
  },
  matchCard: {
    flex: 0.85,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 25,
  },
  cardMeta: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  chatCard: {
    borderColor: 'rgba(94, 127, 163, 0.28)',
    flex: 0.92,
  },
  nextStepBody: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  nextStepCard: {
    borderColor: 'rgba(214, 162, 78, 0.28)',
    flex: 1.08,
  },
  nextStepGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  nextStepItem: {
    backgroundColor: 'rgba(214, 162, 78, 0.08)',
    borderColor: 'rgba(214, 162, 78, 0.16)',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 190,
    flexGrow: 1,
    minHeight: 124,
    padding: 12,
  },
  nextStepLabel: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  nextStepTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
    marginTop: 7,
  },
  priorityGrid: {
    gap: 14,
    marginBottom: 18,
  },
  priorityGridWide: {
    alignItems: 'stretch',
    flexDirection: 'row',
  },
  rosterGrid: {
    gap: 10,
  },
  rosterRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(5, 11, 10, 0.58)',
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    padding: 10,
  },
  statusChip: {
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  statusChipAccent: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: 'rgba(214, 162, 78, 0.24)',
  },
  statusChipBlue: {
    backgroundColor: theme.colors.blueSoft,
    borderColor: 'rgba(94, 127, 163, 0.28)',
  },
  statusChipGreen: {
    backgroundColor: theme.colors.greenSoft,
    borderColor: 'rgba(214, 162, 78, 0.28)',
  },
  statusChipNeutral: {
    backgroundColor: 'rgba(244, 239, 230, 0.08)',
    borderColor: theme.colors.lineStrong,
  },
  statusChipRose: {
    backgroundColor: theme.colors.roseSoft,
    borderColor: 'rgba(143, 29, 44, 0.32)',
  },
  statusChipText: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  rankBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentSoft,
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  rankText: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '900',
  },
  playerCopy: {
    flex: 1,
    minWidth: 0,
  },
  playerName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  playerStatus: {
    color: theme.colors.muted,
    fontSize: 12,
    marginTop: 3,
    textTransform: 'uppercase',
  },
  morePlayers: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  emptyCopy: {
    color: theme.colors.muted,
    fontSize: 15,
    lineHeight: 23,
  },
  matchFocus: {
    backgroundColor: 'rgba(214, 162, 78, 0.10)',
    borderColor: 'rgba(214, 162, 78, 0.22)',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  matchLabel: {
    color: theme.colors.green,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  matchTeams: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
  },
  matchNote: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  streamChecklist: {
    gap: 9,
  },
  checkItem: {
    backgroundColor: 'rgba(214, 162, 78, 0.10)',
    borderColor: 'rgba(214, 162, 78, 0.18)',
    borderRadius: 8,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  qrCard: {
    borderColor: 'rgba(214, 162, 78, 0.34)',
    gap: 16,
  },
  qrCardWide: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  qrImageShell: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    justifyContent: 'center',
    padding: 12,
    width: 244,
  },
  qrImage: {
    height: 220,
    width: 220,
  },
  qrCopy: {
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  qrTitle: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 31,
  },
  qrUrl: {
    color: theme.colors.accent,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 24,
  },
  qrActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  queueList: {
    gap: 12,
  },
  queueCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  queueDate: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentSoft,
    borderColor: 'rgba(214, 162, 78, 0.24)',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 58,
    justifyContent: 'center',
    width: 58,
  },
  queueMonth: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  queueDay: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  queueCopy: {
    flex: 1,
    minWidth: 0,
  },
  queueTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  queueMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  queueRoster: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 5,
    textTransform: 'uppercase',
  },
  queueButton: {
    flexShrink: 0,
  },
  viewerCommand: {
    color: theme.colors.blue,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
  },
  viewerCommandChip: {
    backgroundColor: 'rgba(94, 127, 163, 0.08)',
    borderColor: 'rgba(94, 127, 163, 0.20)',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 142,
    flexGrow: 1,
    minHeight: 76,
    padding: 11,
  },
  viewerCommandGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  viewerCommandLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 4,
  },
});

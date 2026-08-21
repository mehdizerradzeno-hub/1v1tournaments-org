import { startTransition, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  ActionButton,
  Badge,
  EmptyState,
  HubScreen,
  Section,
  Surface,
} from '../components/hub-ui.jsx';
import { getGameBySlug } from '../lib/siteData.js';
import { buildLeagueRecord, nextLeagueMatch, leagueWeekLabel } from '../lib/leagueCatalog.js';
import { formatShortDate } from '../lib/format.js';
import { useHydrated } from '../lib/useHydrated.js';
import { openSharedAccountGame } from '../lib/sharedAccountLaunch.js';
import {
  archiveLeague,
  exportLeagueStandingsAction,
  fetchLeague,
  fetchLeagues,
  generateLeagueScheduleAction,
  joinLeague,
  launchLeagueMatch,
  leaveLeague,
  promoteLeagueWaitlist,
  removeLeaguePlayer,
  reportLeagueResult,
  saveLeague,
  setRegistrationOpen,
} from '../lib/leagueHostingClient.js';

const EMPTY_MSG = 'No leagues are currently active.';

const LEAGUE_VIEWS = [
  { id: 'overview', label: 'Overview' },
  { id: 'standings', label: 'Standings' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'players', label: 'Players' },
];

function humanizeFormat(value, fallback = 'Weekly head-to-head') {
  const normalized = String(value || '').trim();

  if (!normalized) return fallback;

  return normalized
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function seasonDateLabel(league) {
  const start = formatShortDate(league?.season?.startDate || league?.startDate);
  const end = formatShortDate(league?.season?.endDate || league?.endDate);

  if (start && end) return `${start} - ${end}`;
  if (start) return `Starts ${start}`;
  if (end) return `Ends ${end}`;
  return '';
}

function normalizeMessage(error) {
  return error instanceof Error ? error.message : String(error || 'An unknown error happened.');
}

function leagueLabel(league) {
  return league?.name || league?.id || 'League';
}

function displayCount(participants = [], status) {
  return participants.filter((player) => player.status === status).length;
}

function parsePlayerStatus(league, account) {
  if (!league || !account) {
    return { participant: null, enrolled: false, waitlisted: false, displayName: 'You' };
  }

  const canonical = String(account.canonicalAccountId || account.id || '').trim();
  const accountId = String(account.id || '').trim();
  const email = String(account.email || '').trim().toLowerCase();

  const participant = (league.participants || []).find((entry) => (
    Boolean(canonical && entry.canonicalAccountId === canonical)
    || (accountId && entry.accountId === accountId)
    || (email && entry.accountEmail === email)
  ));

  return {
    participant,
    displayName: account.playerName || account.playerHandle || account.email || 'You',
    enrolled: Boolean(participant && participant.status === 'enrolled'),
    waitlisted: Boolean(participant && participant.status === 'waitlist'),
  };
}

function matchPreviewText(match = null) {
  if (!match) return 'No scheduled match.';
  const date = match.scheduledFor ? formatShortDate(match.scheduledFor) || 'TBD' : 'TBD';
  const home = match.homeTeam?.displayName || 'TBD';
  const away = match.awayTeam?.displayName || 'TBD';
  return `${leagueWeekLabel(match.scheduledFor)} · ${home} vs ${away} · ${date}`;
}

function findMyStanding(league, account) {
  if (!league || !account) return null;

  const canonical = String(account.canonicalAccountId || '').trim();
  const accountId = String(account.id || '').trim();
  const email = String(account.email || '').trim().toLowerCase();
  const displayName = String(account.playerName || account.playerHandle || '').trim().toLowerCase();

  return (league.standings || []).find((entry) => (
    Boolean(canonical && entry.canonicalAccountId === canonical)
    || Boolean(accountId && entry.accountId === accountId)
    || Boolean(email && String(entry.accountEmail || '').toLowerCase() === email)
    || Boolean(displayName && String(entry.displayName || '').toLowerCase() === displayName)
  )) || null;
}

export default function LeaguesScreen() {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith('/admin/leagues');
  const isHydrated = useHydrated();
  const [league, setLeague] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionBusyType, setActionBusyType] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [newLeagueName, setNewLeagueName] = useState('');
  const [newLeagueGame] = useState('spades');
  const [newLeagueCap, setNewLeagueCap] = useState('16');
  const [newLeagueDay, setNewLeagueDay] = useState('Sunday');
  const [newLeagueTime, setNewLeagueTime] = useState('18:00');
  const [standingsCSV, setStandingsCSV] = useState('');
  const [adminToast, setAdminToast] = useState('');
  const [account, setAccount] = useState(null);
  const [resultText, setResultText] = useState('');
  const [resultMatchId, setResultMatchId] = useState('');
  const [activeView, setActiveView] = useState('overview');

  useEffect(() => {
    if (!isHydrated) {
      return undefined;
    }

    let active = true;

    async function loadAccount() {
      try {
        const response = await fetch('/.netlify/functions/player-account', { credentials: 'include' });
        const text = await response.text();
        const result = text ? JSON.parse(text) : null;
        if (active) {
          startTransition(() => {
            setAccount(result?.account || null);
          });
        }
      } catch {
        if (active) {
          startTransition(() => {
            setAccount(null);
          });
        }
      }
    }

    async function loadLeagues() {
      try {
        const response = await fetchLeagues();
        const records = (response.leagues || []).map((item) => buildLeagueRecord(item));
        if (active) {
          startTransition(() => {
            setLeagues(records);
            setLeague((previous) => previous ? records.find((item) => item.id === previous.id) || records[0] || null : records[0] || null);
            setError('');
          });
        }
      } catch (nextError) {
        if (active) {
          startTransition(() => {
            setError(normalizeMessage(nextError));
          });
        }
      } finally {
        if (active) {
          startTransition(() => {
            setLoading(false);
          });
        }
      }
    }

    Promise.all([loadAccount(), loadLeagues()]);

    return () => {
      active = false;
    };
  }, [isHydrated]);

  const membership = useMemo(() => parsePlayerStatus(league, account), [league, account]);
  const nextMatch = useMemo(() => {
    if (!league || !account) return null;
    return nextLeagueMatch(league, account);
  }, [league, account]);

  const myStanding = useMemo(
    () => findMyStanding(league, account),
    [league, account],
  );
  const canManageLeague = Boolean(isAdminRoute && account?.hostApproved);
  const enrolledCount = displayCount(league?.participants, 'enrolled');
  const waitlistCount = displayCount(league?.participants, 'waitlist');
  const leagueAtCapacity = Boolean(league && enrolledCount >= (league.playerCap || 0));
  const playerCap = league?.playerCap || 0;
  const openSeats = Math.max(playerCap - enrolledCount, 0);
  const capacityPercent = playerCap
    ? Math.min(Math.round((enrolledCount / playerCap) * 100), 100)
    : 0;
  const registrationSummary = !league?.registrationOpen
    ? 'Registration is closed for this league.'
    : leagueAtCapacity
      ? waitlistCount
        ? `League full • ${waitlistCount} ${waitlistCount === 1 ? 'player' : 'players'} waiting`
        : 'League full • New players can join the waitlist'
      : `${openSeats} ${openSeats === 1 ? 'seat' : 'seats'} open`;

  const viewCounts = {
    standings: league?.standings?.length || 0,
    schedule: league?.matches?.length || 0,
    players: enrolledCount + waitlistCount,
  };
  const seasonDates = seasonDateLabel(league);
  const scheduleFormat = humanizeFormat(league?.seasonConfig?.scheduleFormat);
  const playoffLabel = league?.seasonConfig?.playoffEnabled
    ? `${league.seasonConfig.playoffSize ? `Top ${league.seasonConfig.playoffSize}` : 'Qualifying players'} • ${humanizeFormat(league.seasonConfig.playoffFormat, 'Playoff')}`
    : 'Final standings';

  async function refreshLeagues() {
    const next = await fetchLeagues();
    const records = (next.leagues || []).map((item) => buildLeagueRecord(item));
    setLeagues(records);
    return records;
  }

  async function handleSelectLeague(targetLeague) {
    setActionBusy(true);
    setActionBusyType(`league-${targetLeague.id}`);
    setError('');
    try {
      const next = buildLeagueRecord(await fetchLeague(targetLeague.id).then((payload) => payload.league || payload));
      setLeague(next);
      setActiveView('overview');
    } catch (selectError) {
      setError(normalizeMessage(selectError));
    } finally {
      setActionBusy(false);
      setActionBusyType('');
    }
  }

  async function handleCreateLeague() {
    if (!newLeagueName.trim()) return;

    setAdminBusy(true);
    try {
      const game = getGameBySlug(newLeagueGame);
      const response = await saveLeague({
        token: adminToken,
        league: {
          name: newLeagueName,
          id: newLeagueName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          gameSlug: game?.slug || newLeagueGame,
          status: 'active',
          visibility: 'public',
          playerCap: Number(newLeagueCap) || 16,
          weeklyPlayDay: newLeagueDay,
          weeklyPlayTime: newLeagueTime,
          venue: {
            mode: 'online',
            venueId: '',
            table: '',
            name: 'Online',
          },
        },
      });

      const next = await fetchLeagues();
      const records = (next.leagues || []).map((item) => buildLeagueRecord(item));
      setLeague(buildLeagueRecord(response.league || records[0]));
      setLeagues(records);
      setNewLeagueName('');
      setAdminToast('League created.');
    } catch (createError) {
      setError(normalizeMessage(createError));
    } finally {
      setAdminBusy(false);
    }
  }

  async function handleArchive() {
    if (!league?.id) return;

    setAdminBusy(true);
    try {
      await archiveLeague({ token: adminToken, leagueId: league.id });
      const refreshed = await refreshLeagues();
      setLeague(refreshed.find((item) => item.id === league.id) || null);
      setAdminToast('League archived.');
    } catch (archiveError) {
      setAdminToast(normalizeMessage(archiveError));
    } finally {
      setAdminBusy(false);
    }
  }

  async function handleGenerateSchedule() {
    if (!league?.id) return;

    setAdminBusy(true);
    try {
      const result = await generateLeagueScheduleAction({
        token: adminToken,
        leagueId: league.id,
        weekCount: 4,
      });
      setLeague(buildLeagueRecord(result.league || result));
      setAdminToast('Weekly schedule generated.');
    } catch (scheduleError) {
      setAdminToast(normalizeMessage(scheduleError));
    } finally {
      setAdminBusy(false);
    }
  }

  async function handleRegistrationToggle() {
    if (!league?.id) return;

    setAdminBusy(true);
    try {
      const response = await setRegistrationOpen({
        token: adminToken,
        leagueId: league.id,
        registrationOpen: !league.registrationOpen,
      });
      setLeague(buildLeagueRecord(response.league || response));
      setAdminToast(`Registration is now ${response.league?.registrationOpen ? 'open' : 'closed'}.`);
    } catch (registrationError) {
      setAdminToast(normalizeMessage(registrationError));
    } finally {
      setAdminBusy(false);
    }
  }

  async function handleJoin() {
    if (!league?.id) return;
    setActionBusy(true);
    setActionBusyType('join');
    setError('');

    try {
      const result = await joinLeague({ leagueId: league.id });
      setLeague(buildLeagueRecord(result.league || result));
      await refreshLeagues();
      setAdminToast(result.waitlisted ? 'Added to the league waitlist.' : 'Joined league.');
    } catch (joinError) {
      setError(normalizeMessage(joinError));
    } finally {
      setActionBusy(false);
      setActionBusyType('');
    }
  }

  async function handleLeave() {
    if (!league?.id) return;
    setActionBusy(true);
    setActionBusyType('leave');
    setError('');

    try {
      const result = await leaveLeague(league.id);
      setLeague(buildLeagueRecord(result.league || result));
      await refreshLeagues();
      setAdminToast(membership.waitlisted ? 'Left the league waitlist.' : 'Left league.');
    } catch (leaveError) {
      setError(normalizeMessage(leaveError));
    } finally {
      setActionBusy(false);
      setActionBusyType('');
    }
  }

  async function handleLaunchMatch(matchId, existingRoom = '') {
    if (!league?.id || !matchId) return;

    try {
      const result = await launchLeagueMatch({ token: adminToken, leagueId: league.id, matchId, roomUrl: existingRoom });
      setLeague(buildLeagueRecord(result.league || result));
      setAdminToast('Match room saved.');
    } catch (error) {
      setAdminToast(normalizeMessage(error));
    }
  }

  async function handleOpenAssignedMatch(match) {
    if (!account || !match?.roomUrl) return;

    setActionBusy(true);
    setActionBusyType(`launch-${match.id}`);
    setError('');
    try {
      await openSharedAccountGame({
        audience: league?.gameSlug,
        destinationUrl: match.roomUrl,
        openUrl: (url) => Linking.openURL(url),
        requireAccount: true,
      });
    } catch (launchError) {
      setError(normalizeMessage(launchError));
    } finally {
      setActionBusy(false);
      setActionBusyType('');
    }
  }

  async function handleSubmitResult(matchId) {
    if (!league?.id || !matchId || !resultText) return;

    const pieces = resultText.split('-').map((piece) => piece.trim()).filter(Boolean);
    const [left, right] = pieces;
    const values = {
      homeScore: left,
      awayScore: right,
      winnerId: undefined,
      winner: undefined,
    };

    const asNumLeft = Number.parseInt(left, 10);
    const asNumRight = Number.parseInt(right, 10);
    if (Number.isFinite(asNumLeft) && Number.isFinite(asNumRight)) {
      values.winner = asNumLeft >= asNumRight ? 'home' : 'away';
      const match = league.matches.find((item) => item.id === matchId);
      if (match) {
        const matchWinner = asNumLeft >= asNumRight
          ? match.homeTeam?.canonicalAccountId || match.homePlayerId
          : match.awayTeam?.canonicalAccountId || match.awayPlayerId;
        values.winnerId = matchWinner || '';
      }
    }

    try {
      const result = await reportLeagueResult({
        token: adminToken,
        leagueId: league.id,
        matchId,
        result: values,
      });
      setLeague(buildLeagueRecord(result.league?.league || result.league || result));
      setResultText('');
      setResultMatchId('');
      setAdminToast('Result updated.');
    } catch (reportError) {
      setAdminToast(normalizeMessage(reportError));
    }
  }

  async function handleExportStandings() {
    if (!league?.id) return;

    try {
      const result = await exportLeagueStandingsAction({ token: adminToken, leagueId: league.id });
      setStandingsCSV(result.csv || '');
    } catch (error) {
      setAdminToast(normalizeMessage(error));
    }
  }

  async function handleRemovePlayer(target) {
    if (!league?.id) return;
    try {
      const result = await removeLeaguePlayer({
        token: adminToken,
        leagueId: league.id,
        canonicalAccountId: target.canonicalAccountId,
        accountId: target.accountId,
      });
      setLeague(buildLeagueRecord(result.league || result));
      setAdminToast('Player removed.');
    } catch (removeError) {
      setAdminToast(normalizeMessage(removeError));
    }
  }

  if (loading) {
    return (
      <HubScreen
        title={isAdminRoute ? 'League operations' : 'Leagues'}
        subtitle="Loading league data.">
        <EmptyState title="Loading" body="Please wait while leagues load." />
      </HubScreen>
    );
  }

  return (
    <HubScreen
      accountHref="/account"
      title={isAdminRoute ? 'League operations' : 'Leagues'}
      subtitle={isAdminRoute
        ? 'Private tools for schedules, registration, rooms, results, and competitors.'
        : 'Competitive weekly leagues. Join, track your standing, and play your scheduled matches.'}
      actions={isAdminRoute
        ? [
            { label: 'Public leagues', href: '/leagues', variant: 'secondary' },
            { label: 'Admin home', href: '/admin', variant: 'ghost' },
          ]
        : [
            { label: 'Tournaments', href: '/tournaments', variant: 'secondary' },
            { label: 'Results', href: '/results', variant: 'ghost' },
            account?.hostApproved
              ? { label: 'Host operations', href: '/admin/leagues', variant: 'ghost' }
              : null,
          ].filter(Boolean)}
      heroVariant="compact"
      stickyActions={false}>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {adminToast ? <Text style={styles.infoText}>{adminToast}</Text> : null}

      {!leagues.length ? (
        <Section>
          <EmptyState title="No leagues found" body={EMPTY_MSG} />
        </Section>
      ) : (
        <>
          <Section
            title={membership.enrolled || membership.waitlisted ? 'My league' : 'Featured league'}
            description={league
              ? membership.enrolled
                ? `Competing in: ${leagueLabel(league)}`
                : membership.waitlisted
                  ? `Waitlisted for: ${leagueLabel(league)}`
                  : `Open competition: ${leagueLabel(league)}`
              : 'Choose a league to view'}>
            {league ? (
              <Surface style={styles.leagueCard}>
                <View style={styles.titleRow}>
                  <Text style={styles.leagueName}>{leagueLabel(league)}</Text>
                  <Badge tone={league.status === 'active' ? 'green' : 'rose'}>{league.status || 'unknown'}</Badge>
                </View>
                <Text style={styles.leagueMeta}>
                  {(league.gameSlug || 'spades').toUpperCase()} • {league.season?.name || 'Season 1'} • {league.weeklyPlayDay || 'Sunday'} {league.weeklyPlayTime || ''}
                </Text>

                <View style={styles.competitionStats}>
                  <View style={styles.competitionStat}>
                    <Text style={styles.competitionStatValue}>
                      {myStanding?.rank ? `#${myStanding.rank}` : '—'}
                    </Text>
                    <Text style={styles.competitionStatLabel}>Rank</Text>
                  </View>
                  <View style={styles.competitionStat}>
                    <Text style={styles.competitionStatValue}>
                      {myStanding ? `${myStanding.wins || 0}-${myStanding.losses || 0}${myStanding.ties ? `-${myStanding.ties}` : ''}` : '0-0'}
                    </Text>
                    <Text style={styles.competitionStatLabel}>Record</Text>
                  </View>
                  <View style={styles.competitionStat}>
                    <Text style={styles.competitionStatValue}>
                      {myStanding?.currentStreak || membership.participant?.currentStreak || 0}
                    </Text>
                    <Text style={styles.competitionStatLabel}>Streak</Text>
                  </View>
                </View>

                <View style={styles.competitionStatusRow}>
                  <Badge tone={league.registrationOpen ? 'green' : 'rose'}>
                    Registration {league.registrationOpen ? 'Open' : 'Closed'}
                  </Badge>
                  <Text style={styles.leagueMeta}>
                    {enrolledCount} / {league.playerCap || 0} players
                    {waitlistCount ? ` • ${waitlistCount} waiting` : ''}
                  </Text>
                </View>

                <View
                  accessibilityLabel={`${enrolledCount} of ${playerCap} league seats filled`}
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: playerCap, now: enrolledCount }}
                  style={styles.capacityTrack}>
                  <View style={[styles.capacityFill, { width: `${capacityPercent}%` }]} />
                </View>
                <Text style={styles.capacitySummary}>{registrationSummary}</Text>

                <Surface style={styles.nextMatchCard}>
                  <Text style={styles.nextMatchEyebrow}>NEXT MATCH</Text>
                  <Text style={styles.nextMatchText}>{matchPreviewText(nextMatch)}</Text>
                </Surface>

                {!account ? (
                  <ActionButton href="/account">Sign In to Join</ActionButton>
                ) : nextMatch?.roomUrl && membership.enrolled ? (
                  <ActionButton
                    disabled={actionBusy}
                    onPress={() => handleOpenAssignedMatch(nextMatch)}>
                    {actionBusyType === `launch-${nextMatch.id}` ? 'Opening...' : 'Open Match'}
                  </ActionButton>
                ) : membership.enrolled ? (
                  <ActionButton disabled={actionBusy} onPress={handleLeave} variant="secondary">
                    {actionBusyType === 'leave' ? 'Leaving...' : 'Leave League'}
                  </ActionButton>
                ) : membership.waitlisted ? (
                  <ActionButton disabled={actionBusy} onPress={handleLeave} variant="secondary">
                    {actionBusyType === 'leave' ? 'Leaving...' : 'Leave Waitlist'}
                  </ActionButton>
                ) : !league.registrationOpen ? (
                  <ActionButton disabled>Registration Closed</ActionButton>
                ) : (
                  <ActionButton disabled={actionBusy} onPress={handleJoin}>
                    {actionBusyType === 'join'
                      ? 'Joining...'
                      : leagueAtCapacity
                        ? 'Join Waitlist'
                        : 'Join League'}
                  </ActionButton>
                )}
              </Surface>
            ) : null}
          </Section>

          <View accessibilityRole="tablist" style={styles.viewTabs}>
            {LEAGUE_VIEWS.map((view) => {
              const selected = activeView === view.id;
              return (
                <Pressable
                  aria-controls={`league-panel-${view.id}`}
                  aria-selected={selected}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  key={view.id}
                  nativeID={`league-tab-${view.id}`}
                  onPress={() => setActiveView(view.id)}
                  style={[styles.viewTab, selected && styles.viewTabSelected]}>
                  <Text style={[styles.viewTabLabel, selected && styles.viewTabLabelSelected]}>
                    {view.label}
                  </Text>
                  {view.id === 'overview' ? null : (
                    <Text style={[styles.viewTabCount, selected && styles.viewTabCountSelected]}>
                      {viewCounts[view.id]}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          {activeView === 'overview' ? (
            <View
              accessibilityRole="tabpanel"
              aria-labelledby="league-tab-overview"
              nativeID="league-panel-overview">
            <Section title="Season overview" description="Format, cadence, registration, and the path to a league finish.">
              <Surface style={styles.overviewCard}>
                <View style={styles.overviewHeader}>
                  <View style={styles.overviewHeaderCopy}>
                    <Text style={styles.overviewEyebrow}>{league.season?.name || 'Current season'}</Text>
                    <Text style={styles.overviewTitle}>{league.description || 'Weekly head-to-head league play with published matchups and standings.'}</Text>
                    {seasonDates ? <Text style={styles.overviewMeta}>{seasonDates}</Text> : null}
                  </View>
                  <Badge tone={league.registrationOpen ? 'green' : 'rose'}>
                    {league.registrationOpen ? 'Registration open' : 'Registration closed'}
                  </Badge>
                </View>

                <View style={styles.overviewFacts}>
                  <View style={styles.overviewFact}>
                    <Text style={styles.overviewFactLabel}>Format</Text>
                    <Text style={styles.overviewFactValue}>{scheduleFormat}</Text>
                  </View>
                  <View style={styles.overviewFact}>
                    <Text style={styles.overviewFactLabel}>Play night</Text>
                    <Text style={styles.overviewFactValue}>{league.weeklyPlayDay || 'Sunday'} {league.weeklyPlayTime || ''}</Text>
                  </View>
                  <View style={styles.overviewFact}>
                    <Text style={styles.overviewFactLabel}>Season finish</Text>
                    <Text style={styles.overviewFactValue}>{playoffLabel}</Text>
                  </View>
                  <View style={styles.overviewFact}>
                    <Text style={styles.overviewFactLabel}>Field</Text>
                    <Text style={styles.overviewFactValue}>{enrolledCount}/{playerCap} players</Text>
                  </View>
                </View>

                <View style={styles.seasonPath}>
                  <View style={styles.seasonStep}>
                    <Text style={styles.seasonStepNumber}>1</Text>
                    <View style={styles.seasonStepCopy}>
                      <Text style={styles.seasonStepLabel}>Register</Text>
                      <Text style={styles.seasonStepValue}>{league.registrationOpen ? registrationSummary : 'Registration closed'}</Text>
                    </View>
                  </View>
                  <View style={styles.seasonStep}>
                    <Text style={styles.seasonStepNumber}>2</Text>
                    <View style={styles.seasonStepCopy}>
                      <Text style={styles.seasonStepLabel}>Weekly matches</Text>
                      <Text style={styles.seasonStepValue}>{league.weeklyPlayDay || 'Sunday'} at {league.weeklyPlayTime || '18:00'}</Text>
                    </View>
                  </View>
                  <View style={styles.seasonStep}>
                    <Text style={styles.seasonStepNumber}>3</Text>
                    <View style={styles.seasonStepCopy}>
                      <Text style={styles.seasonStepLabel}>Finish</Text>
                      <Text style={styles.seasonStepValue}>{playoffLabel}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.actionRow}>
                  <ActionButton href="/rules" variant="secondary">Competition rules</ActionButton>
                  <ActionButton href="/tournaments" variant="ghost">Tournament play</ActionButton>
                </View>
              </Surface>
            </Section>
            </View>
          ) : null}

          {activeView === 'standings' ? (
            <View
              accessibilityRole="tabpanel"
              aria-labelledby="league-tab-standings"
              nativeID="league-panel-standings">
            <Section title="Standings" description="Record, win rate, point totals, and rank.">
              {(league?.standings || []).length ? (
                <View style={styles.standingsTable}>
                  {(league.standings || []).map((entry) => (
                    <Surface key={entry.canonicalAccountId || entry.accountId || entry.displayName} style={styles.standingsRow}>
                      <Text style={styles.standingsName}>{entry.rank}. {entry.displayName}</Text>
                      <Text style={styles.standingsStat}>{entry.wins}-{entry.losses}-{entry.ties} • Win % {entry.winPercent || 0}%</Text>
                      <Text style={styles.standingsMeta}>PF {entry.pointsFor || 0} • PA {entry.pointsAgainst || 0} • Diff {entry.pointDifferential || 0} • Streak {entry.currentStreak || 0}</Text>
                    </Surface>
                  ))}
                </View>
              ) : <EmptyState title="No standings yet" body="Standings appear after the first results are recorded." />}

              {standingsCSV ? (
                <Section title="Export preview" description="Standings CSV payload for admin workflows.">
                  <Text style={styles.codeBlock}>{standingsCSV}</Text>
                </Section>
              ) : null}
            </Section>
            </View>
          ) : null}

          {activeView === 'schedule' ? (
            <View
              accessibilityRole="tabpanel"
              aria-labelledby="league-tab-schedule"
              nativeID="league-panel-schedule">
            <Section title="Match Schedule" description="Your weekly matchups, match status, and completed results.">
              {(league?.matches || []).length ? (
                league.matches.map((match) => {
                  const isHome = account?.canonicalAccountId === match.homeTeam?.canonicalAccountId;
                  const isAway = account?.canonicalAccountId === match.awayTeam?.canonicalAccountId;
                  const meSeat = isHome || isAway ? (isHome ? 'Home' : 'Away') : null;
                  const homeName = match.homeTeam?.displayName || 'TBD';
                  const awayName = match.awayTeam?.displayName || 'TBD';
                  return (
                    <Surface key={match.id} style={styles.listRow}>
                      <View style={styles.listRowTop}>
                        <Text style={styles.listName}>{homeName} vs {awayName}</Text>
                        <Badge tone={match.status === 'complete' ? 'green' : 'blue'}>{match.status || 'scheduled'}</Badge>
                      </View>
                      <Text style={styles.listMeta}>{match.seasonWeek ? `Week ${match.seasonWeek}` : 'Match'} • {formatShortDate(match.scheduledFor) || 'TBD'} • {match.status}</Text>
                      {canManageLeague ? <Text style={styles.listMeta}>Match ID: {match.id} • Room: {match.roomUrl || 'Not assigned'}</Text> : null}
                      {meSeat ? <Text style={styles.listMeta}>Your seat: {meSeat} • {match.roomUrl ? 'Match room ready' : 'Room not assigned yet'}</Text> : null}
                      <Text style={styles.listMeta}>Result: {match.result ? `${match.result.homeScore}-${match.result.awayScore}` : 'not reported'}</Text>
                      <View style={styles.actionRow}>
                        {meSeat && match.roomUrl && match.status !== 'complete' ? (
                          <ActionButton
                            disabled={actionBusy}
                            onPress={() => handleOpenAssignedMatch(match)}>
                            {actionBusyType === `launch-${match.id}` ? 'Opening...' : 'Open Match'}
                          </ActionButton>
                        ) : null}
                        {canManageLeague ? (
                          <>
                            <ActionButton disabled={adminBusy} onPress={() => handleLaunchMatch(match.id, match.roomUrl)} variant="secondary">Set room URL</ActionButton>
                            <ActionButton disabled={adminBusy} onPress={() => {
                              setResultMatchId(match.id);
                            }} variant="secondary">Report result</ActionButton>
                          </>
                        ) : null}
                      </View>
                    </Surface>
                  );
                })
              ) : <EmptyState title="No schedule" body="Weekly matchups will appear here when the schedule is published." />}

              {canManageLeague && resultMatchId ? (
                <Surface style={styles.formCard}>
                  <Text style={styles.fieldLabel}>Result entry for {resultMatchId}</Text>
                  <TextInput
                    value={resultText}
                    onChangeText={setResultText}
                    placeholder="home-away e.g. 11-9"
                    placeholderTextColor="#6b7280"
                    style={styles.input}
                  />
                  <ActionButton onPress={() => handleSubmitResult(resultMatchId)} variant="secondary">
                    Save result
                  </ActionButton>
                </Surface>
              ) : null}
            </Section>
            </View>
          ) : null}

          {activeView === 'players' ? (
            <View
              accessibilityRole="tabpanel"
              aria-labelledby="league-tab-players"
              nativeID="league-panel-players">
            <Section title="Players" description="League competitors, enrollment status, and available seats.">
              {(league?.participants || []).length ? (league?.participants || []).map((player) => (
                <Surface key={player.canonicalAccountId || player.accountId || player.displayName} style={styles.listRow}>
                  <View style={styles.listRowTop}>
                    <Text style={styles.listName}>{player.displayName || 'Player'}</Text>
                    <Badge tone={player.status === 'enrolled' ? 'green' : 'rose'}>{player.status || 'enrolled'}</Badge>
                  </View>
                  <Text style={styles.listMeta}>
                    {canManageLeague
                      ? `${player.accountEmail || player.accountId || 'Guest account'} • ${player.division || 'Open'}`
                      : player.division || 'Open division'}
                  </Text>
                  {canManageLeague ? (
                    <View style={styles.actionRow}>
                      <ActionButton disabled={adminBusy} onPress={() => handleRemovePlayer(player)} variant="danger">Remove</ActionButton>
                      {player.status === 'waitlist' ? (
                        <ActionButton
                          disabled={adminBusy}
                          onPress={() => promoteLeagueWaitlist({
                            token: adminToken,
                            leagueId: league.id,
                            canonicalAccountId: player.canonicalAccountId,
                            accountId: player.accountId,
                          }).then(async (result) => {
                            setLeague(buildLeagueRecord(result.league || result));
                          }).catch((error) => {
                            setAdminToast(normalizeMessage(error));
                          })}
                          variant="secondary">
                          Promote
                        </ActionButton>
                      ) : null}
                    </View>
                  ) : null}
                </Surface>
              )) : <EmptyState title="No players yet" body="Registration is open for the first competitors." />}
            </Section>
            </View>
          ) : null}

          {leagues.length > 1 ? (
            <Section title="Other Leagues" description="Switch to another active competition.">
              {leagues.filter((leagueItem) => leagueItem.id !== league?.id).map((leagueItem) => (
                <Surface key={leagueItem.id} style={styles.listRow}>
                  <View style={styles.listRowTop}>
                    <Text style={styles.listName}>{leagueItem.name}</Text>
                    <Badge tone="blue">{leagueItem.status || 'active'}</Badge>
                  </View>
                  <Text style={styles.listMeta}>{formatShortDate(leagueItem.startDate) || 'Open'} • {leagueItem.participants?.length || 0} players</Text>
                  <ActionButton
                    disabled={actionBusy}
                    onPress={() => handleSelectLeague(leagueItem)}
                    variant="secondary">
                    {actionBusyType === `league-${leagueItem.id}` ? 'Opening...' : 'View League'}
                  </ActionButton>
                </Surface>
              ))}
            </Section>
          ) : null}
        </>
      )}

      {canManageLeague ? (
        <Section title="Host Operations" description="Private league administration and competition management.">
        <Surface style={styles.formCard}>
          <Text style={styles.fieldLabel}>Admin token</Text>
          <TextInput
            autoCapitalize="none"
            value={adminToken}
            onChangeText={setAdminToken}
            placeholder="Optional host token"
            placeholderTextColor="#6b7280"
            style={styles.input}
          />
          <Text style={styles.fieldLabel}>Create a league</Text>
          <TextInput
            value={newLeagueName}
            onChangeText={setNewLeagueName}
            placeholder="League name"
            placeholderTextColor="#6b7280"
            style={styles.input}
          />
          <TextInput
            value={newLeagueCap}
            onChangeText={setNewLeagueCap}
            placeholder="Player cap"
            placeholderTextColor="#6b7280"
            keyboardType="numeric"
            style={styles.input}
          />
          <TextInput
            value={newLeagueDay}
            onChangeText={setNewLeagueDay}
            placeholder="Weekly day (Sunday)"
            placeholderTextColor="#6b7280"
            style={styles.input}
          />
          <TextInput
            value={newLeagueTime}
            onChangeText={setNewLeagueTime}
            placeholder="Weekly time (18:00)"
            placeholderTextColor="#6b7280"
            style={styles.input}
          />
          <ActionButton disabled={adminBusy || !newLeagueName.trim()} onPress={handleCreateLeague} variant="secondary">
            {adminBusy ? 'Saving league...' : 'Create league'}
          </ActionButton>
        </Surface>

        {!league ? null : (
          <View style={styles.actionRow}>
            <ActionButton disabled={adminBusy} onPress={handleGenerateSchedule} variant="secondary">
              {adminBusy ? 'Generating...' : 'Generate weekly schedule'}
            </ActionButton>
            <ActionButton disabled={adminBusy} onPress={handleArchive} variant="danger">
              Archive league
            </ActionButton>
            <ActionButton disabled={adminBusy} onPress={handleRegistrationToggle} variant="secondary">
              {league.registrationOpen ? 'Close Registration' : 'Open Registration'}
            </ActionButton>
            <ActionButton disabled={adminBusy} onPress={handleExportStandings} variant="secondary">
              Export standings
            </ActionButton>
          </View>
        )}
        </Section>
      ) : null}

    </HubScreen>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  infoText: {
    color: '#60a5fa',
    fontSize: 13,
    marginBottom: 12,
  },
  fieldLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#0f1526',
    borderColor: '#243249',
    borderRadius: 10,
    borderWidth: 1,
    color: '#e5e7eb',
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  formCard: {
    gap: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  viewTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 22,
  },
  viewTab: {
    alignItems: 'center',
    backgroundColor: '#0f1526',
    borderColor: '#243249',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 8,
    justifyContent: 'center',
    minHeight: 46,
    minWidth: 108,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  viewTabSelected: {
    backgroundColor: '#16233a',
    borderColor: '#60a5fa',
  },
  viewTabLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '800',
  },
  viewTabLabelSelected: {
    color: '#f8fafc',
  },
  viewTabCount: {
    backgroundColor: '#1e293b',
    borderRadius: 999,
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '900',
    minWidth: 22,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
    textAlign: 'center',
  },
  viewTabCountSelected: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
  },
  overviewCard: {
    borderColor: '#2c3f5f',
    gap: 18,
  },
  overviewHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
  },
  overviewHeaderCopy: {
    flex: 1,
    minWidth: 240,
  },
  overviewEyebrow: {
    color: '#60a5fa',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 7,
    textTransform: 'uppercase',
  },
  overviewTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 27,
  },
  overviewMeta: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 7,
  },
  overviewFacts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  overviewFact: {
    backgroundColor: '#0f1526',
    borderColor: '#243249',
    borderRadius: 10,
    borderWidth: 1,
    flexBasis: 150,
    flexGrow: 1,
    minHeight: 82,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  overviewFactLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  overviewFactValue: {
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 6,
  },
  seasonPath: {
    backgroundColor: '#0f1526',
    borderColor: '#243249',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 12,
  },
  seasonStep: {
    alignItems: 'center',
    flexDirection: 'row',
    flexBasis: 190,
    flexGrow: 1,
    gap: 10,
    minWidth: 0,
  },
  seasonStepNumber: {
    backgroundColor: '#1d4ed8',
    borderRadius: 999,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    height: 28,
    lineHeight: 28,
    overflow: 'hidden',
    textAlign: 'center',
    width: 28,
  },
  seasonStepCopy: {
    flex: 1,
  },
  seasonStepLabel: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '900',
  },
  seasonStepValue: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  listRow: {
    borderColor: '#23304a',
    marginBottom: 10,
  },
  listRowTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  listName: {
    color: '#e5e7eb',
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
  },
  listMeta: {
    color: '#9ca3af',
    marginBottom: 10,
  },
  leagueCard: {
    borderColor: '#2c3f5f',
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6,
  },
  leagueName: {
    color: '#e5e7eb',
    flex: 1,
    fontSize: 24,
    fontWeight: '900',
  },
  leagueMeta: {
    color: '#9ca3af',
    marginBottom: 6,
  },
  competitionStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
    marginTop: 10,
  },
  competitionStat: {
    backgroundColor: '#0f1526',
    borderColor: '#2c3f5f',
    borderRadius: 10,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 88,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  competitionStatValue: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '900',
  },
  competitionStatLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
    textTransform: 'uppercase',
  },
  competitionStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  capacityTrack: {
    backgroundColor: '#1e293b',
    borderRadius: 999,
    height: 8,
    marginTop: 2,
    overflow: 'hidden',
    width: '100%',
  },
  capacityFill: {
    backgroundColor: '#60a5fa',
    borderRadius: 999,
    height: '100%',
  },
  capacitySummary: {
    color: '#b6c2d5',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 7,
  },
  nextMatchCard: {
    backgroundColor: '#0f1526',
    borderColor: '#324565',
    marginBottom: 12,
    marginTop: 4,
  },
  nextMatchEyebrow: {
    color: '#60a5fa',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 5,
  },
  nextMatchText: {
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '700',
  },
  standingsTable: {
    gap: 8,
  },
  standingsRow: {
    borderColor: '#324565',
    gap: 6,
    paddingVertical: 12,
  },
  standingsName: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '700',
  },
  standingsStat: {
    color: '#9ca3af',
    fontSize: 13,
  },
  standingsMeta: {
    color: '#b6c2d5',
    fontSize: 12,
  },
  codeBlock: {
    color: '#9ca3af',
    fontFamily: 'Courier',
    fontSize: 11,
    flexWrap: 'wrap',
  },
});

import { startTransition, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  ActionButton,
  Badge,
  EmptyState,
  HubScreen,
  PlayerRouteStrip,
  Section,
  Surface,
} from '../components/hub-ui.jsx';
import { getGameBySlug } from '../lib/siteData.js';
import { buildLeagueRecord, nextLeagueMatch, leagueWeekLabel } from '../lib/leagueCatalog.js';
import { formatDateLine, formatShortDate } from '../lib/format.js';
import { useHydrated } from '../lib/useHydrated.js';
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
  const date = match.scheduledFor ? formatShortDate(match.scheduledFor) : 'TBD';
  const home = match.homeTeam?.displayName || 'TBD';
  const away = match.awayTeam?.displayName || 'TBD';
  return `${leagueWeekLabel(match.scheduledFor)} · ${home} vs ${away} · ${date}`;
}

export default function LeaguesScreen() {
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

  async function refreshLeagues() {
    const next = await fetchLeagues();
    const records = (next.leagues || []).map((item) => buildLeagueRecord(item));
    setLeagues(records);
    return records;
  }

  async function handleSelectLeague(targetLeague) {
    const next = buildLeagueRecord(await fetchLeague(targetLeague.id).then((payload) => payload.league || payload));
    setLeague(next);
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

    try {
      const result = await joinLeague({ leagueId: league.id });
      setLeague(buildLeagueRecord(result.league || result));
      await refreshLeagues();
      setAdminToast('Joined league.');
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

    try {
      const result = await leaveLeague(league.id);
      setLeague(buildLeagueRecord(result.league || result));
      await refreshLeagues();
      setAdminToast('Left league.');
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
      const room = existingRoom || `${window?.location?.origin || 'https://1v1spades.com'}/match/${matchId}`;
      const result = await launchLeagueMatch({ token: adminToken, leagueId: league.id, matchId, roomUrl: room });
      setLeague(buildLeagueRecord(result.league || result));
      setAdminToast('Match room saved.');
    } catch (error) {
      setAdminToast(normalizeMessage(error));
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
      <HubScreen title="Leagues" subtitle="Loading league data.">
        <EmptyState title="Loading" body="Please wait while leagues load." />
      </HubScreen>
    );
  }

  return (
    <HubScreen
      title="Leagues"
      subtitle="Venue-owned weekly leagues with registration, schedules, standings, and match workflows."
      actions={[{ label: 'Home', href: '/next', variant: 'ghost' }]}
      heroVariant="compact"
      stickyActions={false}>

      <PlayerRouteStrip title="Player path" body="Join a league, view your next scheduled match, then launch from match history." />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {adminToast ? <Text style={styles.infoText}>{adminToast}</Text> : null}

      <Section title="Admin tools" description="Create and maintain leagues from here.">
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

      {!leagues.length ? (
        <Section>
          <EmptyState title="No leagues found" body={EMPTY_MSG} />
        </Section>
      ) : (
        <>
          <Section title="My league" description={league ? `Selected: ${leagueLabel(league)}` : 'Choose a league to manage'}>
            {league ? (
              <Surface style={styles.leagueCard}>
                <View style={styles.titleRow}>
                  <Text style={styles.leagueName}>{leagueLabel(league)}</Text>
                  <Badge tone={league.status === 'active' ? 'green' : 'rose'}>{league.status || 'unknown'}</Badge>
                </View>
                <Text style={styles.leagueMeta}>Game: {league.gameSlug || 'spades'} • Day: {league.weeklyPlayDay || 'Sunday'} • Cap: {league.playerCap || 0}</Text>
                <Text style={styles.leagueMeta}>Start date: {formatDateLine(league.startDate || league.season?.startDate || '') || 'Open'}</Text>
                <Text style={styles.leagueMeta}>Roster: {(league.participants || []).length} / {league.playerCap || 0}</Text>
                <Text style={styles.leagueMeta}>Enrolled: {displayCount(league.participants, 'enrolled')} Waitlisted: {displayCount(league.participants, 'waitlist')}</Text>

                <Text style={styles.leagueMeta}>Registration: {league.registrationOpen ? 'open' : 'closed'}</Text>
                {!account ? (
                  <ActionButton href="/next#account-access" variant="secondary">Sign in to join</ActionButton>
                ) : membership.enrolled ? (
                  <ActionButton disabled={actionBusy} onPress={handleLeave} variant="secondary">
                    {actionBusyType === 'leave' ? 'Leaving...' : 'Leave league'}
                  </ActionButton>
                ) : (
                  <ActionButton disabled={actionBusy} onPress={handleJoin} variant="secondary">
                    {actionBusyType === 'join' ? 'Joining...' : 'Join league'}
                  </ActionButton>
                )}

                <Text style={styles.leagueMeta}>My next match: {matchPreviewText(nextMatch)}</Text>
                <Text style={styles.leagueMeta}>Current streak: {membership.participant?.currentStreak || 0}</Text>
              </Surface>
            ) : null}

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
              ) : <EmptyState title="No standings yet" body="Schedule and report results to populate standings." />}
            </Section>

            {standingsCSV ? (
              <Section title="Export preview" description="Standings CSV payload for admin workflows.">
                <Text style={styles.codeBlock}>{standingsCSV}</Text>
              </Section>
            ) : null}
          </Section>

          <Section title="Schedule & results" description="Manual round editing, room launch, and result entry for matches.">
            {(league?.matches || []).length ? (
              league.matches.map((match) => {
                const isHome = account?.canonicalAccountId === match.homeTeam?.canonicalAccountId;
                const isAway = account?.canonicalAccountId === match.awayTeam?.canonicalAccountId;
                const meSeat = isHome || isAway ? (isHome ? 'Home' : 'Away') : null;
                return (
                  <Surface key={match.id} style={styles.listRow}>
                    <Text style={styles.listName}>{match.id}</Text>
                    <Text style={styles.listMeta}>{match.seasonWeek ? `Week ${match.seasonWeek}` : 'Match'} • {formatShortDate(match.scheduledFor)} • {match.status}</Text>
                    <Text style={styles.listMeta}>{match.homeTeam?.displayName || 'TBD'} vs {match.awayTeam?.displayName || 'TBD'}</Text>
                    <Text style={styles.listMeta}>Room: {match.roomUrl || 'No room assigned'}</Text>
                    {meSeat ? <Text style={styles.listMeta}>You are assigned as {meSeat}</Text> : null}
                    <Text style={styles.listMeta}>Result: {match.result ? `${match.result.homeScore}-${match.result.awayScore}` : 'not reported'}</Text>
                    <View style={styles.actionRow}>
                      <ActionButton disabled={adminBusy} onPress={() => handleLaunchMatch(match.id, match.roomUrl)} variant="secondary">Set room URL</ActionButton>
                      <ActionButton disabled={adminBusy} onPress={() => {
                        setResultMatchId(match.id);
                      }} variant="secondary">Report result</ActionButton>
                    </View>
                  </Surface>
                );
              })
            ) : <EmptyState title="No schedule" body="Generate the schedule to create weekly matches." />}

            {resultMatchId ? (
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

          <Section title="Roster" description="Participant status, leaves, and waitlist promotions.">
            {(league?.participants || []).map((player) => (
              <Surface key={player.canonicalAccountId || player.accountId || player.displayName} style={styles.listRow}>
                <View style={styles.listRowTop}>
                  <Text style={styles.listName}>{player.displayName || 'Player'}</Text>
                  <Badge tone={player.status === 'enrolled' ? 'green' : 'rose'}>{player.status || 'enrolled'}</Badge>
                </View>
                <Text style={styles.listMeta}>{player.accountEmail || player.accountId || 'Guest account'} • {player.division || 'Open'}</Text>
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
                      variant="secondary"
                    >
                      Promote
                    </ActionButton>
                  ) : null}
                </View>
              </Surface>
            ))}
          </Section>

          <Section title="All leagues">
            {leagues.map((leagueItem) => (
              <Surface key={leagueItem.id} style={[styles.listRow, league?.id === leagueItem.id ? styles.selectedRow : null]}>
                <View style={styles.listRowTop}>
                  <Text style={styles.listName}>{leagueItem.name}</Text>
                  <Badge tone="blue">{leagueItem.status || 'active'}</Badge>
                </View>
                <Text style={styles.listMeta}>{formatShortDate(leagueItem.startDate) || 'Open'} • {leagueItem.participants?.length || 0} players</Text>
                <ActionButton onPress={() => handleSelectLeague(leagueItem)} variant="secondary">Open</ActionButton>
              </Surface>
            ))}
          </Section>
        </>
      )}
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
  selectedRow: {
    borderColor: '#60a5fa',
    borderWidth: 1,
  },
  codeBlock: {
    color: '#9ca3af',
    fontFamily: 'Courier',
    fontSize: 11,
    flexWrap: 'wrap',
  },
});

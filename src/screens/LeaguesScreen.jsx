import { useEffect, useMemo, useState } from 'react';
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
import { buildLeagueRecord } from '../lib/leagueCatalog.js';
import { formatDateLine, formatShortDate } from '../lib/format.js';
import {
  archiveLeague,
  fetchLeague,
  fetchLeagues,
  generateLeagueScheduleAction,
  joinLeague,
  leaveLeague,
  saveLeague,
} from '../lib/leagueHostingClient.js';

const EMPTY_MSG = 'No leagues are currently active.';

const DEFAULT_ADMIN_TOKEN = '';

function normalizeMessage(error) {
  return error instanceof Error ? error.message : String(error || 'An unknown error happened.');
}

function leagueLabel(league) {
  return league?.name || league?.id || 'League';
}

function waitlistedLabel(participants = []) {
  const count = participants.filter((player) => player.status === 'waitlist').length;
  return `${count} waitlisted`;
}

function parsePlayerStatus(league, account) {
  if (!league || !account) {
    return { participant: null, enrolled: false, waitlisted: false };
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
    enrolled: Boolean(participant && participant.status !== 'waitlist' && participant.status !== 'removed'),
    waitlisted: Boolean(participant && participant.status === 'waitlist'),
  };
}

export default function LeaguesScreen() {
  const [league, setLeague] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adminToken, setAdminToken] = useState(DEFAULT_ADMIN_TOKEN);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [account, setAccount] = useState(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [myStandingsError, setMyStandingsError] = useState('');

  const [actionBusy, setActionBusy] = useState(false);
  const [actionBusyType, setActionBusyType] = useState('');

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      try {
        const response = await fetch('/.netlify/functions/player-account', {
          credentials: 'include',
        });
        const text = await response.text();
        const result = text ? JSON.parse(text) : null;

        if (active) {
          setAccount(result?.account || null);
        }
      } catch {
        if (active) {
          setAccount(null);
        }
      }
    }

    async function loadLeagues() {
      try {
        const response = await fetchLeagues();
        const records = (response.leagues || []).map((item) => buildLeagueRecord(item));

        if (active) {
          setLeagues(records);
          setLeague(records[0] || null);
          setError('');
        }
      } catch (nextError) {
        if (active) {
          setError(normalizeMessage(nextError));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    Promise.all([loadAccount(), loadLeagues()]);

    return () => {
      active = false;
    };
  }, []);

  const membership = useMemo(() => parsePlayerStatus(league, account), [league, account]);

  async function handleJoin() {
    if (!league?.id) return;
    setActionBusy(true);
    setActionBusyType('join');
    try {
      const result = await joinLeague({ leagueId: league.id });
      setLeague(buildLeagueRecord(result.league || result));
      const next = await fetchLeagues();
      setLeagues((next.leagues || []).map((item) => buildLeagueRecord(item)));
      setError('');
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
      const next = await fetchLeagues();
      setLeagues((next.leagues || []).map((item) => buildLeagueRecord(item)));
      setError('');
    } catch (leaveError) {
      setError(normalizeMessage(leaveError));
    } finally {
      setActionBusy(false);
      setActionBusyType('');
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
      setMyStandingsError('');
    } catch (scheduleError) {
      setMyStandingsError(normalizeMessage(scheduleError));
    } finally {
      setAdminBusy(false);
    }
  }

  async function handleCreateLeague() {
    if (!newLeagueName.trim()) return;
    setAdminBusy(true);
    try {
      const game = getGameBySlug('spades');
      const response = await saveLeague({
        token: adminToken,
        league: {
          id: newLeagueName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: newLeagueName,
          gameSlug: game?.slug || 'spades',
          status: 'active',
          venue: { mode: 'online', venueId: '', table: '' },
          playerCap: 16,
          weeklyPlayDay: 'Sunday',
          scheduleFormat: 'weekly-rounds',
          playoffFormat: 'single-elimination',
        },
      });
      const next = await fetchLeague(response.league.id);
      setLeague(buildLeagueRecord(next.league || response.league));
      const updated = await fetchLeagues();
      setLeagues((updated.leagues || []).map((item) => buildLeagueRecord(item)));
      setNewLeagueName('');
      setError('');
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
      const result = await archiveLeague({ token: adminToken, leagueId: league.id });
      setLeague(buildLeagueRecord(result.league || result));
      const updated = await fetchLeagues();
      setLeagues((updated.leagues || []).map((item) => buildLeagueRecord(item)));
    } catch (archiveError) {
      setMyStandingsError(normalizeMessage(archiveError));
    } finally {
      setAdminBusy(false);
    }
  }

  if (loading) {
    return (
      <HubScreen title="Leagues" subtitle="Loading league data.">
        <EmptyState title="Loading" body="Please wait for league records." />
      </HubScreen>
    );
  }

  return (
    <HubScreen
      title="Leagues"
      subtitle="Venue-owned weekly leagues with account registration, schedule, standings, and match administration."
      actions={[
        { label: 'Home', href: '/next', variant: 'ghost' },
      ]}
      heroVariant="compact"
      stickyActions={false}>
      <PlayerRouteStrip
        title="Player path"
        body="Join a league to track history, check the next match date, and view current standings."
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Section title="Admin tools" description="Create, save, archive, and generate a schedule here.">
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
          <ActionButton disabled={adminBusy || !newLeagueName.trim()} onPress={handleCreateLeague} variant="secondary">
            {adminBusy ? 'Saving league...' : 'Create league'}
          </ActionButton>
        </Surface>
        {league ? (
          <View style={styles.actionRow}>
            <ActionButton
              disabled={adminBusy}
              onPress={handleGenerateSchedule}
              variant="secondary">
              {adminBusy ? 'Generating...' : 'Generate weekly schedule'}
            </ActionButton>
            <ActionButton
              disabled={adminBusy}
              onPress={handleArchive}
              variant="danger">
              Archive this league
            </ActionButton>
          </View>
        ) : null}
      </Section>

      {myStandingsError ? <Text style={styles.errorText}>{myStandingsError}</Text> : null}

      {!leagues.length ? (
        <Section>
          <EmptyState title="No leagues found" body={EMPTY_MSG} />
        </Section>
      ) : (
        <Section title="My league" description="The first active league selected by default for participation actions.">
          <Surface style={styles.leagueCard}>
            <View style={styles.titleRow}>
              <Text style={styles.leagueName}>{leagueLabel(league)}</Text>
              <Badge tone={league?.status === 'active' ? 'green' : 'rose'}>{league?.status || 'unknown'}</Badge>
            </View>
            <Text style={styles.leagueMeta}>Game: {league?.gameSlug || 'spades'} • Day: {league?.weeklyPlayDay || 'Sunday'} • Cap: {league?.playerCap || 0}</Text>
            <Text style={styles.leagueMeta}>Start date: {formatDateLine(league?.startDate || league?.season?.startDate || '') || 'Open'}</Text>
            <Text style={styles.leagueMeta}>Current roster: {(league?.participants || []).length} / {league?.playerCap || 0}</Text>
            <Text style={styles.leagueMeta}>{waitlistedLabel(league?.participants || [])}</Text>

            {!account ? (
              <ActionButton href="/next#account-access" variant="secondary">Sign in to join</ActionButton>
            ) : membership.enrolled ? (
              <ActionButton disabled={actionBusy} onPress={handleLeave} variant="secondary">
                {actionBusyType === 'leave' ? 'Leaving...' : 'Leave league'}
              </ActionButton>
            ) : (
              <ActionButton disabled={actionBusy} onPress={handleJoin} variant="secondary">
                {actionBusyType === 'join' ? 'Joining...' : (membership.waitlisted ? 'Join waitlist' : 'Join league')}
              </ActionButton>
            )}
          </Surface>

          <Section title="Standings" description="Current league record by wins, losses, and point differential.">
            {(league?.standings || []).length ? (
              <View style={styles.standingsTable}>
                {(league.standings || []).map((entry) => (
                  <Surface key={entry.canonicalAccountId || entry.accountId || entry.displayName} style={styles.standingsRow}>
                    <Text style={styles.standingsName}>
                      {entry.rank}. {entry.displayName}
                    </Text>
                    <Text style={styles.standingsStat}>
                      {entry.wins}-{entry.losses} • Win % {entry.winPercent || 0}% • PF {entry.pointsFor || 0} • PA {entry.pointsAgainst || 0} • Diff {entry.pointDifferential || 0}
                    </Text>
                    <Text style={styles.standingsMeta}>
                      Streak {entry.currentStreak || 0} • {entry.status || 'enrolled'}
                    </Text>
                  </Surface>
                ))}
              </View>
            ) : (
              <EmptyState title="No standings yet" body="Matches and results will update standings." />
            )}
          </Section>
        </Section>
      )}

      <Section title="All leagues">
        {leagues.map((leagueItem) => (
          <Surface
            key={leagueItem.id}
            style={[
              styles.listRow,
              league?.id === leagueItem.id ? styles.selectedRow : null,
            ]}
            >
            <View style={styles.listRowTop}>
              <Text style={styles.listName}>{leagueItem.name}</Text>
              <Badge tone="blue">{leagueItem.status || 'active'}</Badge>
            </View>
            <Text style={styles.listMeta}>
              {formatShortDate(leagueItem.startDate) || 'Open'} • {leagueItem.participants?.length || 0} players
            </Text>
            <ActionButton onPress={() => setLeague(leagueItem)} variant="secondary">Open</ActionButton>
          </Surface>
        ))}
      </Section>
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
});

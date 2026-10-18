import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton, Badge, HubScreen, Section, Surface } from '../components/hub-ui.jsx';
import { theme } from '../lib/theme.js';
import { requestEuchreLeagues, selectEuchreLeagueSchedule } from '../lib/euchreLeagueClient.js';
import { openSharedAccountGame } from '../lib/sharedAccountLaunch.js';

const DEFAULT_FORM = { id: '', name: '', seasonName: 'Season 1', description: '', playerCap: '32', divisionCount: '4', playoffSize: '8',
  firstRoundDate: '', weeklyPlayTime: '18:00', timeZone: 'America/New_York', visibility: 'public' };
const ACCOUNT_CHANGED_EVENT = 'one-v-one-tournaments-player-account-changed';
const dateLabel = (value, timeZone) => value ? new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone, timeZoneName: 'short',
}).format(new Date(value)) : 'Time not assigned';
const phaseLabel = league => league.status === 'paused' ? 'Paused' : league.status === 'archived' ? 'Archived'
  : ({ registration: 'Registration', 'regular-season': 'Regular season', playoffs: 'Championship', complete: 'Season complete' }[league.phase] || league.phase);

function Field({ label, value, onChangeText, ...props }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} value={String(value ?? '')} onChangeText={onChangeText}
      placeholderTextColor={theme.colors.muted} style={styles.input} {...props} /></View>;
}

function SeasonForm({ initial = DEFAULT_FORM, busy, onSave, editing = false, locked = false }) {
  const [form, setForm] = useState(initial);
  const update = key => value => setForm(previous => ({ ...previous, [key]: value }));
  const submit = () => {
    const values = { name: form.name, description: form.description };
    if (!locked) Object.assign(values, { playerCap: Number(form.playerCap), divisionCount: Number(form.divisionCount),
      playoffSize: Number(form.playoffSize), firstRoundDate: form.firstRoundDate, weeklyPlayTime: form.weeklyPlayTime,
      timeZone: form.timeZone, visibility: form.visibility });
    onSave(editing ? values : { ...values, id: form.id, seasonName: form.seasonName });
  };
  return <View style={styles.stack}>
    {!editing && <Field label="League URL ID" value={form.id} onChangeText={update('id')} placeholder="euchre-autumn-2026" autoCapitalize="none" />}
    {!editing && <Field label="Season name" value={form.seasonName} onChangeText={update('seasonName')} maxLength={100} />}
    <Field label="League name" value={form.name} onChangeText={update('name')} maxLength={100} />
    <Field label="Description" value={form.description} onChangeText={update('description')} maxLength={500} multiline />
    {!locked && <>
      <View style={styles.row}>
        <Field label="Player capacity (8–128)" value={form.playerCap} onChangeText={update('playerCap')} keyboardType="number-pad" />
        <Field label="Divisions" value={form.divisionCount} onChangeText={update('divisionCount')} keyboardType="number-pad" />
        <Field label="Playoff places" value={form.playoffSize} onChangeText={update('playoffSize')} keyboardType="number-pad" />
      </View>
      <Text style={styles.muted}>Use 1, 2, 4, 8 or 16 divisions. Playoff places must be a power of two, split equally across divisions.</Text>
      <View style={styles.row}>
        <Field label="First round date (YYYY-MM-DD)" value={form.firstRoundDate} onChangeText={update('firstRoundDate')} placeholder="2026-11-01" autoCapitalize="none" />
        <Field label="Weekly time (24-hour)" value={form.weeklyPlayTime} onChangeText={update('weeklyPlayTime')} placeholder="18:00" />
      </View>
      <Field label="IANA time zone" value={form.timeZone} onChangeText={update('timeZone')} autoCapitalize="none" />
      <View style={styles.row}>{['public', 'private'].map(visibility => <ActionButton key={visibility} variant={form.visibility === visibility ? 'primary' : 'secondary'}
        onPress={() => update('visibility')(visibility)}>{visibility === 'public' ? 'Public league' : 'Private / organizer only'}</ActionButton>)}</View>
      <Text style={styles.muted}>Private drafts are visible only to the organizer. Set Public to allow account registration.</Text>
    </>}
    <ActionButton disabled={busy} onPress={submit}>{busy ? 'Saving…' : editing ? 'Save settings' : 'Create Euchre league'}</ActionButton>
  </View>;
}

function Standings({ league }) {
  return <View style={styles.grid}>{league.divisions.map(division => <Surface key={division.id} style={styles.division}>
    <Text accessibilityRole="header" aria-level={3} style={styles.title}>{division.name}</Text>
    <View style={styles.tableRow}><Text style={[styles.tableName, styles.muted]}>Player</Text><Text style={styles.stat}>W–L</Text><Text style={styles.stat}>GD</Text><Text style={styles.stat}>PD</Text></View>
    {division.standings.map(row => <View key={row.username} style={styles.tableRow}>
      <Text style={styles.tableName}>{row.rank}. {row.username}</Text><Text style={styles.stat}>{row.wins}–{row.losses}</Text>
      <Text style={styles.stat}>{row.gameDifferential > 0 ? '+' : ''}{row.gameDifferential}</Text><Text style={styles.stat}>{row.pointDifferential > 0 ? '+' : ''}{row.pointDifferential}</Text>
    </View>)}
  </Surface>)}</View>;
}

function FixtureCard({ match, league, access, busy, onOpen, onReschedule }) {
  const [newDate, setNewDate] = useState('');
  const [editing, setEditing] = useState(false);
  const assigned = ['playing', 'complete'].includes(match.status) || match.games.length > 0;
  return <Surface style={styles.fixture}>
    <View style={styles.row}><Badge tone={match.status === 'complete' ? 'green' : 'neutral'}>{match.status}</Badge>
      <Text style={styles.muted}>{match.phase === 'playoff' ? `Playoff round ${match.week - league.regularRounds}` : `Week ${match.week}`} · {dateLabel(match.scheduledFor, league.timeZone)}</Text></View>
    <Text style={styles.fixtureTitle}>{match.home || 'Awaiting qualifier'} <Text style={styles.muted}>vs</Text> {match.away || 'Awaiting qualifier'}</Text>
    <Text style={styles.score}>{match.homeWins} – {match.awayWins} <Text style={styles.muted}>games · Best of 3</Text></Text>
    {match.winner && <Text style={styles.success}>Series won by {match.winner}</Text>}
    {match.games.length > 0 && <Text style={styles.muted}>{match.games.map(game => `Game ${game.gameNumber}: ${game.homeScore}–${game.awayScore}${game.forfeit ? ' (forfeit)' : ''}`).join('  ·  ')}</Text>}
    {access && <ActionButton disabled={busy || !access.canOpen} onPress={() => onOpen(match.id)}>
      {access.canOpen ? `Play game ${access.gameNumber}` : league.status === 'paused' ? 'League paused' : 'Opens at scheduled time'}</ActionButton>}
    {onReschedule && !assigned && match.home && match.away && <>
      <ActionButton variant="ghost" onPress={() => setEditing(value => !value)}>Reschedule series</ActionButton>
      {editing && <><Field label={`New UTC date/time for ${match.home} vs ${match.away}`} value={newDate} onChangeText={setNewDate} placeholder="2026-11-01T23:00:00Z" />
        <ActionButton disabled={busy} variant="secondary" onPress={() => onReschedule(match.id, newDate)}>Save match time</ActionButton></>}
    </>}
  </Surface>;
}

export default function EuchreLeaguesScreen({ organizer = false }) {
  const query = useLocalSearchParams();
  const requestedId = typeof query.league === 'string' ? query.league : '';
  const [records, setRecords] = useState([]);
  const [viewers, setViewers] = useState({});
  const [selectedId, setSelectedId] = useState(requestedId);
  const [tokenInput, setTokenInput] = useState('');
  const [token, setToken] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState('standings');
  const [week, setWeek] = useState('all');
  const [division, setDivision] = useState('all');
  const [limit, setLimit] = useState(24);
  const [confirm, setConfirm] = useState('');
  const [csv, setCsv] = useState(null);
  const requestSequence = useRef(0);
  const accessGeneration = useRef(0);
  const clearLeagueAccess = useCallback(() => {
    requestSequence.current += 1;
    accessGeneration.current += 1;
    setAuthorized(false); setRecords([]); setViewers({}); setConfirm(''); setCsv(null);
  }, []);
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const result = await requestEuchreLeagues({ admin: organizer, token });
      if (sequence !== requestSequence.current) return;
      setRecords(result.leagues || []); setViewers(result.viewerByLeagueId || {});
      setAuthorized(Boolean(result.canManage)); setError('');
      setSelectedId(previous => previous || result.leagues?.[0]?.id || '');
    } catch (failure) {
      if (sequence === requestSequence.current) {
        // A failed authorization/read must not leave a previous host's private data visible.
        clearLeagueAccess(); setError(failure.message); setLoading(false);
      }
    }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [organizer, token, clearLeagueAccess]);
  useEffect(() => {
    const initial = setTimeout(load, 0);
    const timer = setInterval(load, 30000);
    return () => { clearTimeout(initial); clearInterval(timer); requestSequence.current += 1; };
  }, [load]);
  useEffect(() => {
    const accountChanged = () => { clearLeagueAccess(); setLoading(true); load(); };
    globalThis.addEventListener?.(ACCOUNT_CHANGED_EVENT, accountChanged);
    return () => globalThis.removeEventListener?.(ACCOUNT_CHANGED_EVENT, accountChanged);
  }, [clearLeagueAccess, load]);
  useEffect(() => { if (requestedId) startTransition(() => setSelectedId(requestedId)); }, [requestedId]);
  const league = records.find(item => item.id === selectedId) || null;
  const viewer = viewers[selectedId];
  const currentCsv = csv?.leagueId === selectedId ? csv.content : '';
  const filteredMatches = useMemo(() => selectEuchreLeagueSchedule(league?.matches || [], {
    phase: view === 'playoffs' ? 'playoff' : 'regular', week, division,
  }), [league, view, week, division]);
  const act = async (action, payload = {}) => {
    if (busy) return;
    const generation = accessGeneration.current;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await requestEuchreLeagues({ admin: organizer, token, action, leagueId: selectedId, ...payload });
      if (generation !== accessGeneration.current) return;
      if (action === 'open-match') {
        await openSharedAccountGame({ audience: 'euchre', destinationUrl: result.roomUrl, requireAccount: true,
          openUrl: url => generation === accessGeneration.current ? Linking.openURL(url) : undefined });
      } else {
        if (result.csv) setCsv({ leagueId: selectedId, content: result.csv });
        if (result.league) setSelectedId(result.league.id);
        setNotice(action === 'export-standings' ? 'Standings CSV is ready below.' : 'League updated.');
        setConfirm(''); await load();
      }
    } catch (failure) { if (generation === accessGeneration.current) setError(failure.message); }
    finally { setBusy(false); }
  };
  const selectView = next => { setView(next); setWeek('all'); setDivision('all'); setLimit(24); };
  return <HubScreen title={organizer ? 'Euchre league operations' : 'Euchre 1V1 Leagues'} eyebrow="Weekly competition"
    subtitle="Your division. Your season. One champion."
    lead="Best of three. Every game first to 10. Verified results, weekly division play, and a seeded championship."
    actions={[{ label: organizer ? 'Public Euchre leagues' : 'Organizer dashboard', href: organizer ? '/leagues/euchre' : '/admin/euchre-leagues', variant: 'secondary' },
      { label: 'All leagues', href: '/leagues', variant: 'ghost' }, { label: 'Account', href: '/account', variant: 'ghost' }]}
    stickyActions={false} heroVariant="compact">
    {organizer && <Surface style={styles.stack}><Text style={styles.title}>Existing host access</Text>
      <Text style={styles.muted}>Sign in with your approved host account, or use the existing operator key. Only your leagues are shown. No new subscription or billing.</Text>
      <Field label="Operator key (optional)" value={tokenInput} onChangeText={setTokenInput} secureTextEntry autoCapitalize="none" autoComplete="off" />
      <ActionButton variant="secondary" disabled={busy} onPress={() => { clearLeagueAccess(); setLoading(true); if (tokenInput === token) load(); else setToken(tokenInput); }}>Verify access</ActionButton>
      <ActionButton href="/account?mode=signin" variant="ghost">Sign in to host account</ActionButton>
    </Surface>}
    {error && <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}><Text style={styles.text}>{error}</Text>
      <ActionButton variant="secondary" onPress={load}>Try again</ActionButton></View>}
    {notice && <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text>}
    {loading && <Text accessibilityLiveRegion="polite" style={styles.muted}>Loading Euchre leagues…</Text>}
    {organizer && authorized && <Section eyebrow="Host tools" title="Create a season" description="8–128 claimed accounts. Settings and rosters lock when the season starts.">
      <Surface><SeasonForm busy={busy} onSave={values => act('create', { league: values })} /></Surface>
    </Section>}
    <Section title={organizer ? 'Your seasons' : 'Find your season'} description="Choose a league to view its schedule and standings. Results refresh every 30 seconds."
      action={<ActionButton variant="ghost" onPress={load} disabled={busy}>Refresh</ActionButton>}>
      {!loading && records.length === 0 && <Surface><Text style={styles.muted}>{organizer ? 'No managed Euchre seasons yet.' : 'No public Euchre leagues yet. Check back for the next season.'}</Text></Surface>}
      <View style={styles.row}>{records.map(record => <ActionButton key={record.id} variant={record.id === selectedId ? 'primary' : 'secondary'}
        onPress={() => { setSelectedId(record.id); setConfirm(''); setCsv(null); setWeek('all'); setDivision('all'); }}>{record.name}</ActionButton>)}</View>
      {!loading && requestedId && !league && <Text style={styles.muted}>This league is unavailable or requires organizer access.</Text>}
    </Section>
    {league && <>
      <Surface style={styles.stack}><View style={styles.row}><Badge>{phaseLabel(league)}</Badge><Badge tone="blue">{league.players}/{league.playerCap} players</Badge></View>
        <Text accessibilityRole="header" aria-level={2} style={styles.heading}>{league.name}</Text>
        {!!league.description && <Text style={styles.text}>{league.description}</Text>}
        <Text style={styles.muted}>{league.seasonName} · {league.divisionCount} {league.divisionCount === 1 ? 'division' : 'divisions'} · {league.regularRounds ? `${league.regularRounds} weekly rounds` : 'Weekly round-robin'} · {league.playoffSize} playoff places</Text>
        <Text style={styles.muted}>{league.weeklyPlayDay} at {league.weeklyPlayTime} · {league.timeZone}</Text>
        <View style={styles.row}><ActionButton href={`/leagues/euchre?league=${league.id}`} variant="ghost">Public league link</ActionButton>
          {!organizer && league.phase === 'registration' && (viewer?.membership
            ? <ActionButton disabled={busy} variant="secondary" onPress={() => act('leave')}>Leave registration</ActionButton>
            : <ActionButton disabled={busy || !league.registrationOpen || league.players >= league.playerCap} onPress={() => act('join')}>
              {league.players >= league.playerCap ? 'League full' : league.registrationOpen ? 'Join with my username' : 'Registration closed'}</ActionButton>)}</View>
        {!organizer && !viewer && <Text style={styles.muted}>Sign in to your shared 1v1 account and claim a username to register or play. Guest names are not accepted.</Text>}
        {viewer?.membership && <Text style={styles.success}>Registered as {viewer.membership.username}{viewer.membership.divisionId ? ` · ${viewer.membership.divisionId.replace('division-', 'Division ')}` : ''}</Text>}
        {league.championship?.champion && <Text style={styles.champion}>Champion · {league.championship.champion.username}</Text>}
      </Surface>
      {!organizer && viewer?.matchAccess?.length > 0 && <Section title="Your matches" description="Finish the current game before starting another series. Return here after each game to open the next one.">
        <View style={styles.grid}>{viewer.matchAccess.slice(0, 3).map(access => <FixtureCard key={access.matchId} match={league.matches.find(match => match.id === access.matchId)}
          league={league} access={access} busy={busy} onOpen={matchId => act('open-match', { matchId })} />)}</View>
      </Section>}
      <View style={styles.row}>{['standings', 'schedule', 'playoffs', 'players'].map(tab => <ActionButton key={tab}
        variant={view === tab ? 'primary' : 'secondary'} onPress={() => selectView(tab)} accessibilityState={{ selected: view === tab }}>{tab[0].toUpperCase() + tab.slice(1)}</ActionButton>)}</View>
      {view === 'standings' && <Section title="Division standings" description="Series win percentage → tied-group head-to-head → game differential (GD) → point differential (PD) → canonical account ID. Playoffs do not alter regular-season standings.">
        {league.divisions.length ? <Standings league={league} /> : <Surface><Text style={styles.muted}>Divisions and standings appear when the organizer starts the season.</Text></Surface>}
      </Section>}
      {(view === 'schedule' || view === 'playoffs') && <Section title={view === 'playoffs' ? 'Seeded championship' : 'Weekly schedule'}
        description={view === 'playoffs' ? 'Equal qualifiers from every division. Division winners seed ahead of runners-up; then series win percentage, game differential, point differential, and canonical ID. Winners advance automatically.' : 'Every player meets each division opponent once. Odd divisions receive a bye. Times below use the league’s time zone.'}>
        {view === 'playoffs' && league.championship && <Surface><Text style={styles.text}>{league.championship.qualifiers.map(player => `#${player.seed} ${player.username}`).join('  ·  ')}</Text></Surface>}
        <View style={styles.row}><Field label="Week filter (all or number)" value={week} onChangeText={value => { setWeek(value || 'all'); setLimit(24); }} />
          {view === 'schedule' && <Field label="Division filter (all or division-1, etc.)" value={division} onChangeText={value => { setDivision(value || 'all'); setLimit(24); }} />}</View>
        {!filteredMatches.length && <Surface><Text style={styles.muted}>{view === 'playoffs' && !league.championship ? 'The championship is seeded automatically after all regular-season series finish.' : 'No matches match these filters.'}</Text></Surface>}
        <View style={styles.grid}>{filteredMatches.slice(0, limit).map(match => <FixtureCard key={match.id} match={match} league={league} busy={busy}
          access={!organizer ? viewer?.matchAccess?.find(item => item.matchId === match.id) : null} onOpen={matchId => act('open-match', { matchId })}
          onReschedule={organizer && authorized && league.status !== 'archived' ? (matchId, scheduledFor) => act('reschedule', { matchId, scheduledFor }) : null} />)}</View>
        {filteredMatches.length > limit && <ActionButton variant="secondary" onPress={() => setLimit(value => value + 24)}>Show more matches ({filteredMatches.length - limit} remaining)</ActionButton>}
      </Section>}
      {view === 'players' && <Section title="Registered players"><Surface style={styles.stack}>
        {league.participants.length ? league.participants.map(player => <View key={player.username} style={styles.row}>
          <Text style={styles.tableName}>{player.username}</Text><Text style={styles.muted}>{player.divisionId || 'Division assigned at season start'}</Text>
          {organizer && authorized && league.phase === 'registration' && league.status !== 'archived' && <ActionButton variant="ghost" disabled={busy}
            onPress={() => setConfirm(`remove:${player.username}`)}>Remove</ActionButton>}
        </View>) : <Text style={styles.muted}>No players registered yet.</Text>}
      </Surface></Section>}
      {organizer && authorized && league.status !== 'archived' && <Section title="Manage this season" description="Results are game-server verified. There is no manual winner override.">
        <Surface style={styles.stack}><View style={styles.row}>
          {league.phase === 'registration' && <><ActionButton variant="secondary" disabled={busy} onPress={() => act('set-registration', { registrationOpen: !league.registrationOpen })}>{league.registrationOpen ? 'Close registration' : 'Open registration'}</ActionButton>
            <ActionButton disabled={busy || league.players < 8} onPress={() => setConfirm('start')}>Start season</ActionButton></>}
          {['regular-season', 'playoffs'].includes(league.phase) && <ActionButton disabled={busy} variant="secondary" onPress={() => act(league.status === 'paused' ? 'resume' : 'pause')}>{league.status === 'paused' ? 'Resume season' : 'Pause new games'}</ActionButton>}
          <ActionButton variant="secondary" disabled={busy} onPress={() => act('export-standings')}>Export standings CSV</ActionButton>
          <ActionButton variant="ghost" disabled={busy} onPress={() => setConfirm('archive')}>Archive season</ActionButton>
        </View>
        {confirm && <View style={styles.confirm}><Text style={styles.text}>{confirm === 'start' ? 'Start now? This freezes the roster and competition settings, assigns divisions, and generates the full weekly schedule.' : confirm === 'archive' ? 'Archive this season? It becomes read-only and leaves public discovery. Assigned games must finish first.' : `Remove ${confirm.slice(7)} from registration?`}</Text>
          <View style={styles.row}><ActionButton disabled={busy} onPress={() => confirm.startsWith('remove:') ? act('remove-player', { canonicalAccountId: league.roster.find(player => player.username === confirm.slice(7))?.canonicalAccountId }) : act(confirm)}>Confirm</ActionButton>
            <ActionButton variant="secondary" onPress={() => setConfirm('')}>Cancel</ActionButton></View></View>}
        <SeasonForm key={`${league.id}-${league.phase}`} initial={league} editing locked={league.phase !== 'registration'} busy={busy} onSave={patch => act('update', { patch })} />
        {!!currentCsv && <Field label="Standings CSV (copy to save)" value={currentCsv} multiline editable={false} />}
        </Surface>
      </Section>}
    </>}
  </HubScreen>;
}

const styles = StyleSheet.create({
  stack: { gap: 16 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  division: { flexGrow: 1, flexShrink: 1, flexBasis: 350, minWidth: 0, gap: 12 }, fixture: { flexGrow: 1, flexShrink: 1, flexBasis: 350, minWidth: 0, gap: 12 },
  field: { gap: 8, flexGrow: 1, minWidth: 160 }, label: { color: theme.colors.muted, fontSize: 13 },
  input: { color: theme.colors.text, backgroundColor: theme.colors.background, borderColor: theme.colors.lineStrong, borderWidth: 1,
    borderRadius: 12, padding: 14, minHeight: 48, fontSize: 16 },
  text: { color: theme.colors.text, fontSize: 15, lineHeight: 23 }, muted: { color: theme.colors.muted, fontSize: 13, lineHeight: 20 },
  title: { color: theme.colors.text, fontSize: 22, fontWeight: '700' }, heading: { color: theme.colors.text, fontSize: 28, fontWeight: '700' },
  fixtureTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '600' }, score: { color: theme.colors.accent, fontSize: 24, fontWeight: '700' },
  tableRow: { flexDirection: 'row', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderColor: theme.colors.line, alignItems: 'center' },
  tableName: { color: theme.colors.text, flex: 1, fontSize: 14 }, stat: { color: theme.colors.text, width: 42, textAlign: 'right', fontSize: 13 },
  success: { color: theme.colors.success, fontSize: 15, lineHeight: 23 }, champion: { color: theme.colors.accent, fontSize: 26, fontWeight: '700' },
  error: { padding: 20, borderWidth: 1, borderColor: theme.colors.rose, borderRadius: 18, gap: 12 },
  confirm: { padding: 18, borderWidth: 1, borderColor: theme.colors.accent, borderRadius: 14, gap: 14 },
});

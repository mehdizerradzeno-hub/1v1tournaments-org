import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { buildBroadcastBracketModel, formatBroadcastDate } from '../lib/broadcastBracketPresentation';
import { fetchTournamentBracket, fetchTournamentEvents } from '../lib/tournamentHostingClient';
import { useHydrated } from '../lib/useHydrated';
import { startVisibilityAwarePolling } from '../lib/visibilityPoller';

const COLORS = {
  black: '#050505',
  raised: '#0B0B0B',
  ivory: '#F4EFE6',
  gold: '#D6A24E',
  blue: '#5E7FA3',
  green: '#40B56F',
  muted: '#A9A39A',
  line: '#2B2925',
  error: '#C95E5E',
};

function PlayerRow({ player }) {
  return (
    <View style={[styles.playerRow, player.winner && styles.winnerRow]}>
      <View style={styles.playerIdentity}>
        <Text style={styles.seed}>{player.seed ? String(player.seed).padStart(2, '0') : '--'}</Text>
        <Text numberOfLines={1} style={[styles.playerName, player.winner && styles.winnerText]}>{player.name}</Text>
      </View>
      {player.winner ? <Text accessibilityLabel="Winner" style={styles.winnerMark}>WIN</Text> : null}
      {player.score !== null ? <Text style={styles.score}>{player.score}</Text> : null}
    </View>
  );
}

function MatchCard({ match }) {
  return (
    <View style={[styles.matchCard, match.winnerName && styles.finalMatchCard]}>
      <View style={styles.matchMeta}>
        <Text style={styles.matchLabel}>{match.label}</Text>
        <Text style={styles.matchStatus}>{match.isBye ? 'BYE' : match.status.toUpperCase()}</Text>
      </View>
      {match.players.map((player, index) => <PlayerRow key={`${match.key}-${index}`} player={player} />)}
    </View>
  );
}

function RoundColumn({ round, compact, stacked }) {
  return (
    <View style={[styles.roundColumn, compact && styles.roundColumnCompact]}>
      <View style={styles.roundHeader}>
        <Text style={styles.roundKicker}>ROUND {round.key}</Text>
        <Text style={styles.roundTitle}>{round.title}</Text>
      </View>
      <View style={[styles.matchStack, stacked && styles.matchStackStacked]}>
        {round.matches.length
          ? round.matches.map((match) => <MatchCard key={match.key} match={match} />)
          : <Text style={styles.emptyRound}>Matchups pending</Text>}
      </View>
    </View>
  );
}

function FeaturedPanel({ model }) {
  const featured = model.featured;
  const isChampion = featured.kind === 'champion';
  return (
    <View style={[styles.featurePanel, isChampion && styles.championPanel]}>
      <View style={styles.featureIcon}>
        <Text style={styles.featureSuit}>{isChampion ? '1V1' : model.gameSlug === 'euchre' ? 'D' : 'S'}</Text>
      </View>
      <Text style={styles.featureEyebrow}>{featured.eyebrow}</Text>
      <Text style={[styles.featureTitle, isChampion && styles.championTitle]}>{featured.title}</Text>
      <Text style={styles.featureDetail}>{featured.detail}</Text>
      {featured.kind === 'pre-bracket' ? (
        <View style={styles.registrationMetric}>
          <Text style={styles.metricValue}>{featured.registered}{featured.cap ? ` / ${featured.cap}` : ''}</Text>
          <Text style={styles.metricLabel}>REGISTERED / CHECKED IN</Text>
        </View>
      ) : null}
      {featured.match ? (
        <View style={styles.featureMatch}>
          {featured.match.players.map((player, index) => <PlayerRow key={`feature-${index}`} player={player} />)}
        </View>
      ) : null}
      <View style={styles.featureRule} />
      <Text style={styles.featureFooter}>{model.currentRound}</Text>
    </View>
  );
}

function BroadcastContent({ model, width }) {
  const compact = width < 680;
  const stacked = width < 980;
  const [selectedRound, setSelectedRound] = useState(Math.max(0, model.rounds.length - 1));
  const activeRound = Math.min(selectedRound, Math.max(0, model.rounds.length - 1));
  const visibleRounds = compact ? model.rounds.slice(activeRound, activeRound + 1) : model.rounds;
  const eventDate = formatBroadcastDate(model.date, model.timeZoneLabel);

  return (
    <View style={styles.broadcastCanvas}>
      <View style={[styles.topBar, compact && styles.topBarCompact]}>
        <View style={styles.brandLockup}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>1V1</Text></View>
          <View style={styles.brandCopy}>
            <View style={styles.badgeRow}>
              <Text style={styles.gameBadge}>{model.gameName}</Text>
              {model.series ? <Text style={styles.seriesBadge}>{model.series}</Text> : null}
            </View>
            <Text numberOfLines={compact ? 3 : 2} style={[styles.eventTitle, compact && styles.eventTitleCompact]}>{model.title}</Text>
          </View>
        </View>
        <View style={styles.liveLockup}>
          <Text style={[styles.statusBadge, model.status === 'complete' && styles.completeBadge]}>{model.statusLabel}</Text>
          <Text style={styles.currentRound}>{model.currentRound}</Text>
          {eventDate ? <Text style={styles.eventDate}>{eventDate}</Text> : null}
        </View>
      </View>

      {compact && model.rounds.length > 1 ? (
        <View accessibilityLabel="Broadcast bracket rounds" style={styles.mobileRoundTabs}>
          {model.rounds.map((round, index) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: index === activeRound }}
              key={round.key}
              onPress={() => setSelectedRound(index)}
              style={[styles.roundTab, index === activeRound && styles.roundTabActive]}
            >
              <Text style={[styles.roundTabText, index === activeRound && styles.roundTabTextActive]}>{round.title}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={[styles.mainStage, stacked && styles.mainStageStacked]}>
        {stacked ? <FeaturedPanel model={model} /> : null}
        <View style={[styles.bracketPanel, stacked && styles.bracketPanelStacked]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionKicker}>AUTHORITATIVE BRACKET</Text>
            <Text style={styles.refreshLabel}>LIVE DATA / 15S REFRESH</Text>
          </View>
          {visibleRounds.length ? (
            <View style={[styles.rounds, stacked && styles.roundsStacked, compact && styles.roundsCompact]}>
              {visibleRounds.map((round) => <RoundColumn compact={compact} key={round.key} round={round} stacked={stacked} />)}
            </View>
          ) : (
            <View style={styles.emptyBracket}>
              <Text style={styles.emptyTitle}>Bracket not generated</Text>
              <Text style={styles.emptyCopy}>Registered players appear here after check-in and official seeding.</Text>
            </View>
          )}
        </View>
        {!stacked ? <FeaturedPanel model={model} /> : null}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerUrl}>1v1tournaments.org</Text>
        <Text style={styles.footerStatement}>{model.freeEntry ? 'FREE ENTRY / ' : ''}POWERED BY 1V1</Text>
      </View>
    </View>
  );
}

export default function BroadcastBracketScreen({ tournamentSlug = '' }) {
  const { width, height } = useWindowDimensions();
  const isHydrated = useHydrated();
  const [state, setState] = useState({ event: null, bracket: null, loading: true, error: '' });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        if (!tournamentSlug) throw new Error('Choose a tournament to open its broadcast bracket.');
        const [eventsResult, bracketResult] = await Promise.all([
          fetchTournamentEvents({ slug: tournamentSlug }),
          fetchTournamentBracket({ slug: tournamentSlug }),
        ]);
        const event = eventsResult?.tournament
          || eventsResult?.event
          || eventsResult?.events?.find((item) => item.slug === tournamentSlug)
          || eventsResult?.tournaments?.find((item) => item.slug === tournamentSlug)
          || null;
        if (!event) throw new Error('Tournament not found.');
        if (active) setState({ event, bracket: bracketResult?.bracket || null, loading: false, error: '' });
      } catch (error) {
        if (active) setState((current) => ({ ...current, loading: false, error: error?.message || 'Broadcast data could not be loaded.' }));
      }
    };

    const stopPolling = startVisibilityAwarePolling(load, 15_000);
    return () => {
      active = false;
      stopPolling();
    };
  }, [tournamentSlug]);

  const model = useMemo(() => buildBroadcastBracketModel(state), [state]);
  const compact = width < 680;
  const shouldScroll = !isHydrated || compact || height < 760;
  const frame = state.loading ? (
    <View style={styles.statePanel}><Text style={styles.stateEyebrow}>1V1 LIVE</Text><Text style={styles.stateTitle}>Loading broadcast bracket</Text></View>
  ) : state.error || !model ? (
    <View style={[styles.statePanel, styles.errorPanel]}><Text style={styles.stateEyebrow}>BROADCAST UNAVAILABLE</Text><Text style={styles.stateTitle}>{state.error || 'Tournament not found.'}</Text><Text style={styles.stateCopy}>No bracket state has been invented. Try this public link again shortly.</Text></View>
  ) : <BroadcastContent model={model} width={width} />;

  if (shouldScroll) {
    return <ScrollView contentContainerStyle={styles.scrollContent} style={styles.page}>{frame}</ScrollView>;
  }
  return <View style={styles.page}>{frame}</View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, width: '100%', minWidth: 0, minHeight: '100vh', backgroundColor: COLORS.black },
  scrollContent: { flexGrow: 1, backgroundColor: COLORS.black },
  broadcastCanvas: { flex: 1, width: '100%', minWidth: 0, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 14, backgroundColor: COLORS.black },
  topBar: { minHeight: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 24, paddingHorizontal: 24, paddingVertical: 16, borderWidth: 1, borderColor: '#3B3020', backgroundColor: '#080B09' },
  topBarCompact: { alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 16, gap: 14 },
  brandLockup: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 18 },
  brandMark: { width: 68, height: 68, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.gold, backgroundColor: '#14110C', transform: [{ rotate: '-4deg' }] },
  brandMarkText: { color: COLORS.gold, fontSize: 20, fontWeight: '900', fontFamily: 'monospace' },
  brandCopy: { flex: 1, minWidth: 0, gap: 7 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gameBadge: { color: COLORS.black, backgroundColor: COLORS.gold, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12, fontWeight: '900', fontFamily: 'monospace', textTransform: 'uppercase' },
  seriesBadge: { color: COLORS.ivory, borderWidth: 1, borderColor: COLORS.blue, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12, fontWeight: '800', fontFamily: 'monospace', textTransform: 'uppercase' },
  eventTitle: { color: COLORS.ivory, fontSize: 34, lineHeight: 38, fontWeight: '900', fontFamily: 'Georgia' },
  eventTitleCompact: { fontSize: 24, lineHeight: 28 },
  liveLockup: { flexShrink: 0, maxWidth: 300, alignItems: 'flex-end', gap: 6 },
  statusBadge: { color: COLORS.black, backgroundColor: COLORS.green, paddingHorizontal: 12, paddingVertical: 6, fontSize: 12, fontWeight: '900', fontFamily: 'monospace', textTransform: 'uppercase' },
  completeBadge: { backgroundColor: COLORS.gold },
  currentRound: { color: COLORS.ivory, fontSize: 17, fontWeight: '800' },
  eventDate: { color: COLORS.muted, fontSize: 12, fontFamily: 'monospace' },
  mainStage: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 22, paddingVertical: 22 },
  mainStageStacked: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', flexDirection: 'column' },
  bracketPanel: { flex: 2, minWidth: 0, padding: 20, borderWidth: 1, borderColor: '#302A20', backgroundColor: COLORS.raised },
  bracketPanelStacked: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  sectionKicker: { color: COLORS.gold, fontSize: 12, fontWeight: '900', fontFamily: 'monospace' },
  refreshLabel: { color: COLORS.muted, fontSize: 10, fontFamily: 'monospace' },
  rounds: { flex: 1, minHeight: 0, flexDirection: 'row', alignItems: 'stretch', gap: 16, paddingTop: 16 },
  roundsStacked: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  roundsCompact: { flexDirection: 'column' },
  roundColumn: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 12 },
  roundColumnCompact: { width: '100%' },
  roundHeader: { gap: 3 },
  roundKicker: { color: COLORS.blue, fontSize: 10, fontWeight: '900', fontFamily: 'monospace' },
  roundTitle: { color: COLORS.ivory, fontSize: 18, fontWeight: '900' },
  matchStack: { flex: 1, justifyContent: 'space-around', gap: 10 },
  matchStackStacked: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  matchCard: { minWidth: 0, padding: 10, borderLeftWidth: 3, borderLeftColor: COLORS.blue, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#101210' },
  finalMatchCard: { borderLeftColor: COLORS.gold, backgroundColor: '#15130E' },
  matchMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  matchLabel: { color: COLORS.muted, fontSize: 10, fontFamily: 'monospace', fontWeight: '700' },
  matchStatus: { color: COLORS.gold, fontSize: 9, fontFamily: 'monospace', fontWeight: '900' },
  playerRow: { minHeight: 38, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: '#252722' },
  winnerRow: { backgroundColor: '#13271B' },
  playerIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  seed: { width: 22, color: COLORS.muted, fontSize: 11, fontFamily: 'monospace' },
  playerName: { flex: 1, minWidth: 0, color: COLORS.ivory, fontSize: 14, fontWeight: '800' },
  winnerText: { color: '#C9F4D8' },
  winnerMark: { color: COLORS.green, fontSize: 9, fontWeight: '900', fontFamily: 'monospace' },
  score: { color: COLORS.ivory, fontSize: 16, fontWeight: '900', fontFamily: 'monospace' },
  featurePanel: { flex: 0.9, minWidth: 250, maxWidth: 430, justifyContent: 'center', padding: 24, borderWidth: 1, borderColor: COLORS.blue, backgroundColor: '#0A1014' },
  championPanel: { borderColor: COLORS.gold, backgroundColor: '#151109' },
  featureIcon: { width: 84, height: 84, marginBottom: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 42, borderWidth: 2, borderColor: COLORS.gold, backgroundColor: '#090909' },
  featureSuit: { color: COLORS.gold, fontSize: 21, fontWeight: '900', fontFamily: 'monospace' },
  featureEyebrow: { color: COLORS.gold, fontSize: 12, fontWeight: '900', fontFamily: 'monospace', textTransform: 'uppercase' },
  featureTitle: { marginTop: 10, color: COLORS.ivory, fontSize: 30, lineHeight: 34, fontWeight: '900', fontFamily: 'Georgia' },
  championTitle: { fontSize: 44, lineHeight: 48 },
  featureDetail: { marginTop: 12, color: COLORS.muted, fontSize: 15, lineHeight: 21 },
  featureMatch: { marginTop: 22, borderWidth: 1, borderColor: COLORS.line },
  featureRule: { height: 1, marginTop: 24, backgroundColor: '#4A3B22' },
  featureFooter: { marginTop: 12, color: COLORS.ivory, fontSize: 13, fontWeight: '800' },
  registrationMetric: { marginTop: 26, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.line },
  metricValue: { color: COLORS.ivory, fontSize: 32, fontWeight: '900', fontFamily: 'monospace' },
  metricLabel: { marginTop: 4, color: COLORS.blue, fontSize: 10, fontWeight: '900', fontFamily: 'monospace' },
  emptyBracket: { flex: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center', padding: 28 },
  emptyTitle: { color: COLORS.ivory, fontSize: 26, fontWeight: '900', fontFamily: 'Georgia' },
  emptyCopy: { maxWidth: 480, marginTop: 10, color: COLORS.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  emptyRound: { color: COLORS.muted, fontSize: 14 },
  footer: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: '#302A20' },
  footerUrl: { color: COLORS.ivory, fontSize: 13, fontWeight: '800' },
  footerStatement: { color: COLORS.gold, fontSize: 11, fontWeight: '900', fontFamily: 'monospace' },
  mobileRoundTabs: { minWidth: 0, flexDirection: 'row', gap: 8, paddingTop: 14 },
  roundTab: { minHeight: 44, flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.raised },
  roundTabActive: { borderColor: COLORS.gold, backgroundColor: '#241C0E' },
  roundTabText: { color: COLORS.muted, fontSize: 11, fontWeight: '800' },
  roundTabTextActive: { color: COLORS.ivory },
  statePanel: { flex: 1, minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: COLORS.black },
  errorPanel: { borderWidth: 1, borderColor: COLORS.error },
  stateEyebrow: { color: COLORS.gold, fontSize: 12, fontWeight: '900', fontFamily: 'monospace' },
  stateTitle: { maxWidth: 720, marginTop: 12, color: COLORS.ivory, fontSize: 36, lineHeight: 42, fontWeight: '900', fontFamily: 'Georgia', textAlign: 'center' },
  stateCopy: { maxWidth: 540, marginTop: 12, color: COLORS.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
});

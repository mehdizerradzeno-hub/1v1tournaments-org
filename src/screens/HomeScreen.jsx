import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, EmptyState, HubScreen, ResultCard, Section, Surface } from '../components/hub-ui.jsx';
import { theme } from '../lib/theme.js';
import { formatDateLine } from '../lib/format.js';
import { getResults, siteData } from '../lib/siteData.js';
import { fetchTournamentEvents } from '../lib/tournamentHostingClient.js';
import {
  filterPublicEventsByGame,
  getAwaitingStartPublicEvent,
  getCountdownParts,
  getLivePublicEvent,
  getNextEligiblePublicEvent,
  getPublicEventAction,
  getPublicGamePresentation,
  getPublicGames,
  getPublicPresentationEvents,
} from '../lib/publicPresentationCatalog.js';
import { usePublicGameFilter } from '../lib/usePublicGameFilter.js';
import { useVisibleNow } from '../lib/useVisibleNow.js';

const SCHEDULE_REFRESH_MS = 5 * 60 * 1000;
function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(true);
  useEffect(() => {
    if (Platform.OS !== 'web' || !globalThis.document) return undefined;
    const update = () => setIsVisible(globalThis.document.visibilityState !== 'hidden');
    update();
    globalThis.document.addEventListener('visibilitychange', update);
    return () => globalThis.document.removeEventListener('visibilitychange', update);
  }, []);
  return isVisible;
}

function usePublicSchedule() {
  const pageVisible = usePageVisibility();
  const mounted = useRef(true);
  const [feed, setFeed] = useState({ status: 'loading', events: [], error: '' });
  const loadSchedule = useCallback(async () => {
    setFeed((current) => ({ ...current, status: current.events.length ? 'refreshing' : 'loading', error: '' }));
    try {
      const result = await fetchTournamentEvents();
      if (mounted.current) setFeed({ status: 'ready', events: Array.isArray(result.tournaments) ? result.tournaments : [], error: '' });
    } catch (error) {
      if (!mounted.current) return;
      setFeed((current) => current.events.length
        ? { ...current, status: 'stale', error: error instanceof Error ? error.message : 'Schedule refresh failed.' }
        : { status: 'error', events: [], error: error instanceof Error ? error.message : 'Schedule refresh failed.' });
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!pageVisible) return undefined;
    void loadSchedule();
    const timer = globalThis.setInterval(() => { void loadSchedule(); }, SCHEDULE_REFRESH_MS);
    return () => globalThis.clearInterval(timer);
  }, [loadSchedule, pageVisible]);
  return [feed, loadSchedule, pageVisible];
}

function PublicCountdownStrip({ event, feedStatus, onDeadline, onRetry }) {
  const nowMs = useVisibleNow(1000);
  const eventMs = new Date(event?.date || '').getTime();
  const game = getPublicGamePresentation(event?.gameSlug);
  useEffect(() => {
    if (!Number.isFinite(eventMs) || eventMs <= Date.now()) return undefined;
    const timer = globalThis.setTimeout(onDeadline, Math.max(0, eventMs - Date.now()) + 80);
    return () => globalThis.clearTimeout(timer);
  }, [eventMs, onDeadline]);
  if (feedStatus === 'loading') return <Surface style={styles.countdownStrip}><Text style={styles.stripLabel}>NEXT TOURNAMENT</Text><Text style={styles.stripTitle}>Loading public schedule…</Text></Surface>;
  if (feedStatus === 'error') return <Surface style={styles.countdownStrip}><Text style={styles.stripLabel}>NEXT TOURNAMENT</Text><Text style={styles.stripTitle}>Schedule temporarily unavailable</Text><ActionButton onPress={onRetry} variant="secondary">Retry</ActionButton></Surface>;
  if (!event) return <Surface style={styles.countdownStrip}><Text style={styles.stripLabel}>NEXT TOURNAMENT</Text><Text style={styles.stripTitle}>Next tournament announcement coming soon</Text><ActionButton href="/games" variant="secondary">Browse games</ActionButton></Surface>;
  if (nowMs >= eventMs) return <Surface style={styles.countdownStrip}><View style={styles.countdownCopy}><Text style={styles.stripLabel}>NEXT TOURNAMENT · {game?.shortName || event.gameName}</Text><Text style={styles.stripTitle}>Awaiting start confirmation</Text><Text style={styles.stripMeta}>{event.title} · {formatDateLine(event.date, event.timeZone, event.timeZoneLabel)}</Text>{feedStatus === 'stale' ? <Text style={styles.stripMeta}>Schedule update unavailable; showing the last confirmed event.</Text> : null}</View><ActionButton href={'/tournaments/' + event.slug} variant="secondary">View event</ActionButton></Surface>;
  return <Surface style={styles.countdownStrip}><View style={styles.countdownCopy}><Text style={styles.stripLabel}>NEXT TOURNAMENT · {game?.shortName || event.gameName}</Text><Text style={styles.stripTitle}>{event.title}</Text><Text style={styles.stripMeta}>{formatDateLine(event.date, event.timeZone, event.timeZoneLabel)}</Text>{feedStatus === 'stale' ? <Text style={styles.stripMeta}>Schedule update unavailable; showing the last confirmed time.</Text> : null}</View><View accessibilityLabel="Time until next tournament" style={styles.countdownUnits}>{getCountdownParts(event.date, nowMs).map((part) => <View key={part.label} style={styles.countdownUnit}><Text style={styles.countdownValue}>{part.value}</Text><Text style={styles.countdownLabel}>{part.label}</Text></View>)}</View><ActionButton href={'/tournaments/' + event.slug} variant="secondary">View event</ActionButton></Surface>;
}

function CardArtwork({ art }) {
  if (art === 'spade') return <View dataSet={{ artStage: 'true' }}><View dataSet={{ crownShape: 'true' }} /><View dataSet={{ spadeShape: 'true' }}><View dataSet={{ spadeLobe: 'left' }} /><View dataSet={{ spadeLobe: 'right' }} /><View dataSet={{ spadePoint: 'true' }} /><View dataSet={{ spadeStem: 'true' }} /><View dataSet={{ spadeBase: 'true' }} /></View></View>;
  if (art === 'euchre') return <View dataSet={{ euchreCrest: 'true' }}><View dataSet={{ euchreLaurel: 'true' }} /><View dataSet={{ euchreSaber: 'left' }} /><View dataSet={{ euchreSaber: 'right' }} /><View dataSet={{ euchreShield: 'true' }} /><Text dataSet={{ euchreBower: 'true' }}>J</Text></View>;
  if (art === 'gin') return <View dataSet={{ ginHand: 'true' }}>{[['7', 'one'], ['8', 'two'], ['9', 'three'], ['10', 'four']].map(([rank, position]) => <View dataSet={{ ginCard: position }} key={rank}><Text dataSet={{ ginRank: 'true' }}>{rank}</Text><Text dataSet={{ ginPip: 'true' }}>♣</Text></View>)}</View>;
  const holes = Array.from({ length: 8 }, (_, index) => (8 + index * 11) + '%');
  return <View dataSet={{ cribbageBoard: 'true' }}>{['first', 'second'].map((track) => <View dataSet={{ cribbageTrack: 'true' }} key={track}>{holes.map((left) => <View dataSet={{ cribbageHole: 'true' }} key={left} style={{ left }} />)}<View dataSet={{ cribbagePeg: track === 'first' ? 'red' : 'ivory' }} /></View>)}</View>;
}

function PhysicalGameCard({ game, pageVisible, selected, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const [returning, setReturning] = useState(false);
  const [turn, setTurn] = useState(0);
  const hoveringRef = useRef(false);
  const returnTimerRef = useRef(null);
  const motionAllowed = pageVisible && Platform.OS === 'web' && globalThis.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  const pip = game.art === 'spade' ? '♠' : game.art === 'euchre' ? '♣' : game.art === 'gin' ? '♦' : '●';
  const backLabel = { spade: 'CROWNED SPADES', euchre: 'BOWER COURT', gin: 'MELD TABLE', cribbage: 'PEG TRACK' }[game.art];
  const isDirectGameLaunch = game.webReady && Boolean(game.playPath);
  const isComingSoon = !game.webReady;
  const cardTurning = pageVisible && hovered;
  useEffect(() => () => {
    if (returnTimerRef.current) globalThis.clearTimeout(returnTimerRef.current);
  }, []);
  function startTurn() {
    if (!motionAllowed) return;
    if (returnTimerRef.current) globalThis.clearTimeout(returnTimerRef.current);
    hoveringRef.current = true;
    setReturning(false);
    setHovered(true);
    setTurn((current) => current + 1);
  }
  function stopTurn() {
    if (!motionAllowed) return;
    hoveringRef.current = false;
    setHovered(false);
    setReturning(true);
    setTurn(0);
    if (returnTimerRef.current) globalThis.clearTimeout(returnTimerRef.current);
    returnTimerRef.current = globalThis.setTimeout(() => {
      if (!hoveringRef.current) setReturning(false);
    }, 480);
  }
  function continueTurn(event) {
    if (event.target !== event.currentTarget) return;
    if (hoveringRef.current && motionAllowed) {
      setTurn((current) => current + 1);
    } else {
      setReturning(false);
    }
  }
  return <View style={[styles.physicalGameCard, selected && styles.physicalGameCardSelected]}><Pressable accessibilityHint="Selects this game and updates the public schedule below." accessibilityLabel={'Select ' + game.name} accessibilityRole="radio" accessibilityState={{ selected }} dataSet={{ physicalCardHit: 'true', hovered: cardTurning ? 'true' : 'false' }} onHoverIn={startTurn} onHoverOut={stopTurn} onKeyDown={(event) => { if (event?.key === 'Enter' || event?.key === ' ') { event.preventDefault?.(); onSelect(game.slug); } }} onPress={() => onSelect(game.slug)}><View dataSet={{ physicalCardScene: 'true' }}><View dataSet={{ physicalCardRotor: 'true', pageVisible: pageVisible ? 'true' : 'false', returning: returning ? 'true' : 'false', turning: cardTurning ? 'true' : 'false' }} onTransitionEnd={continueTurn} style={{ transform: [{ rotateY: (turn * 360) + 'deg' }] }}><View dataSet={{ physicalCardFace: 'true', physicalCardFront: 'true', cardArt: game.art }}><View dataSet={{ cardOrnament: 'true' }} /><Text dataSet={{ cardCorner: 'true' }}>A{'\n'}{pip}</Text><Text dataSet={{ cardCorner: 'true', cardCornerBottom: 'true' }}>A{'\n'}{pip}</Text><View dataSet={{ cardCenter: 'true' }}><View><CardArtwork art={game.art} /><Text dataSet={{ cardTitle: 'true' }}>1V1</Text><Text dataSet={{ cardTitle: 'true' }}>{game.cardName}</Text><Text dataSet={{ cardKicker: 'true' }}>No partner. No excuses.</Text></View></View></View><View dataSet={{ physicalCardFace: 'true', physicalCardBack: 'true', cardArt: game.art }}><View dataSet={{ cardOrnament: 'true' }} /><View dataSet={{ cardCenter: 'true' }}><View><View dataSet={{ cardBackSeal: 'true' }}><Text dataSet={{ cardBackWord: 'true' }}>{backLabel}</Text></View><Text dataSet={{ cardTitle: 'true' }}>1V1</Text><Text dataSet={{ cardKicker: 'true' }}>Tournaments</Text></View></View></View></View></View></Pressable><View style={styles.cardInfo}><View style={styles.cardLabelRow}><Text style={styles.cardName}>{game.name}</Text>{selected ? <Text accessibilityLiveRegion="polite" style={styles.selectedMark}>SELECTED</Text> : null}</View><Text style={styles.cardSummary}>{game.summary}</Text><ActionButton disabled={isComingSoon} href={isDirectGameLaunch ? game.playPath : isComingSoon ? undefined : game.infoPath} variant={selected ? 'primary' : 'secondary'}>{isDirectGameLaunch ? 'Play ' + game.shortName : isComingSoon ? 'Coming soon' : 'Explore ' + game.shortName}</ActionButton></View></View>;
}

function PublicEventCard({ event }) {
  const game = getPublicGamePresentation(event.gameSlug);
  const action = getPublicEventAction(event, game);
  const counts = event.registeredCount !== null && event.rosterCap !== null ? event.registeredCount + ' / ' + event.rosterCap + ' registered' : null;
  return <Surface style={[styles.eventCard, { borderTopColor: game?.accent || theme.colors.accent }]}>{event.status === 'live' ? <Text style={styles.eventLive}>Live now</Text> : null}<Text style={styles.eventGame}>{game?.name || event.gameName}</Text><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.eventMeta}>{formatDateLine(event.date, event.timeZone, event.timeZoneLabel)}</Text>{[event.format, event.location, counts].filter(Boolean).map((detail) => <Text key={detail} style={styles.eventDetail}>{detail}</Text>)}<ActionButton href={action.href} variant={action.variant}>{action.label}</ActionButton></Surface>;
}

function UpcomingSchedule({ activeGame, events, feedStatus, onRetry }) {
  const activeGameName = activeGame === 'all' ? 'All games' : getPublicGamePresentation(activeGame)?.name || 'Selected game';
  if (feedStatus === 'loading') return <EmptyState body="Finding the next events. Please wait a moment." title="Loading schedule" />;
  if (feedStatus === 'error') return <EmptyState action={<ActionButton onPress={onRetry} variant="secondary">Retry schedule</ActionButton>} body="We could not load the event schedule. Try again in a moment." title="Schedule temporarily unavailable" />;
  if (!events.length) return <EmptyState action={<ActionButton href="/games" variant="secondary">Explore games</ActionButton>} body={activeGame === 'all' ? 'The next events will appear here as soon as they are announced.' : 'No public ' + activeGameName + ' tournaments are scheduled.'} title="No upcoming events" />;
  return <View dataSet={{ homeEvents: 'true' }} style={styles.eventGrid}>{events.map((event) => <PublicEventCard event={event} key={event.slug} />)}</View>;
}

export default function HomeScreen() {
  const [activeGame, selectGame] = usePublicGameFilter();
  const [feed, loadSchedule, pageVisible] = usePublicSchedule();
  const scheduleNow = useVisibleNow(1000);
  const games = useMemo(() => getPublicGames(), []);
  const publicEvents = useMemo(() => getPublicPresentationEvents(siteData.tournaments, feed.events), [feed.events]);
  const selectedEvents = useMemo(() => filterPublicEventsByGame(publicEvents, activeGame), [activeGame, publicEvents]);
  const liveEvent = useMemo(() => getLivePublicEvent(selectedEvents), [selectedEvents]);
  const nextFutureEvent = useMemo(() => getNextEligiblePublicEvent(publicEvents, scheduleNow), [publicEvents, scheduleNow]);
  const awaitingEvent = useMemo(() => getAwaitingStartPublicEvent(publicEvents, scheduleNow), [publicEvents, scheduleNow]);
  const nextEvent = nextFutureEvent || awaitingEvent;
  const visibleEvents = useMemo(() => selectedEvents.filter((event) => event.status !== 'live' && new Date(event.date).getTime() > scheduleNow), [scheduleNow, selectedEvents]);
  const results = useMemo(() => {
    const allResults = getResults();
    return activeGame === 'all' ? allResults : allResults.filter((result) => result.gameSlug === activeGame);
  }, [activeGame]);
  const scheduleDescription = activeGame === 'all' ? 'Find your next competition across the 1V1 platform.' : 'The next events for ' + (getPublicGamePresentation(activeGame)?.name || 'this game') + '.';
  return (
    <HubScreen
      accountHref="/account"
      footerNote="No partner. No excuses."
      lead="Your home for head-to-head card competition. Games, tournaments, leagues, and results in one place."
      publicShell
      showHero={false}
      stickyActions={false}
      subtitle="No partner. No excuses."
      title="1v1 Tournaments">
      <View dataSet={{ homeFeature: 'true' }} style={styles.homeHero}>
        <View style={styles.heroCopy}>
          <View style={styles.heroEyebrowRow}>
            <View style={styles.heroRule} />
            <Text style={styles.heroEyebrow}>THE 1V1 COMPETITION PLATFORM</Text>
          </View>
          <Text accessibilityRole="header" aria-level={1} dataSet={{ homeHeroTitle: 'true' }} style={styles.heroTitle}>YOUR GAME. YOUR BRACKET.</Text>
          <Text style={styles.heroTagline}>No partner. No excuses.</Text>
          <Text style={styles.heroBody}>Head-to-head card competition. Find your game, enter the next event, and follow every round.</Text>
          <View style={styles.heroActions}>
            <ActionButton href="/tournaments">Explore tournaments</ActionButton>
            <ActionButton href="/stream" variant="secondary">Watch competition</ActionButton>
          </View>
        </View>
        <PublicCountdownStrip event={nextEvent} feedStatus={feed.status} onDeadline={loadSchedule} onRetry={loadSchedule} />
      </View>
      <Section description="Pick your game. Find your competition." eyebrow="THE GAMES" title="Choose your table">
        <View accessibilityLabel="Choose a game" accessibilityRole="radiogroup" dataSet={{ publicCardGrid: 'true' }}>
          {games.map((game) => <PhysicalGameCard game={game} key={game.slug} pageVisible={pageVisible} selected={activeGame === game.slug} onSelect={selectGame} />)}
        </View>
        {activeGame !== 'all' ? <View style={styles.clearFilter}><ActionButton onPress={() => selectGame('all')} variant="ghost">Show all games</ActionButton></View> : null}
      </Section>
      {liveEvent ? (
        <Section description="The competition is on. Follow the event and every result." eyebrow="ON THE TABLE" title="Live now">
          <View dataSet={{ homeEvents: 'true' }} style={styles.eventGrid}><PublicEventCard event={liveEvent} /></View>
        </Section>
      ) : null}
      <Section description={scheduleDescription} eyebrow="THE SCHEDULE" title="Upcoming tournaments">
        {feed.status === 'stale' ? <Text style={styles.staleNote}>Showing the last confirmed schedule while a refresh is unavailable.</Text> : null}
        <UpcomingSchedule activeGame={activeGame} events={visibleEvents} feedStatus={feed.status} onRetry={loadSchedule} />
      </Section>
      <Section action={<ActionButton href="/results" variant="secondary">View results</ActionButton>} description="The latest completed competitions and their final results." eyebrow="THE RECORD" title="Recent results">
        {results.length ? (
          <View style={styles.resultsGrid}>{results.slice(0, 3).map((result) => <ResultCard href={result.tournamentSlug ? '/tournaments/' + result.tournamentSlug : undefined} key={result.slug} result={result} />)}</View>
        ) : (
          <EmptyState body="Completed event results will appear here once they are posted." title="The next chapter is still being played" />
        )}
      </Section>
      <Section description="From your first game to the final round." eyebrow="STEP UP TO THE TABLE" title="Your path to competition">
        <View style={styles.steps}>
          <View style={styles.step}><Text style={styles.stepNumber}>01 / CHOOSE</Text><Text style={styles.stepTitle}>Find your game</Text><Text style={styles.stepBody}>Select a game to explore its upcoming competitions.</Text></View>
          <View style={styles.step}><Text style={styles.stepNumber}>02 / ENTER</Text><Text style={styles.stepTitle}>Join an event</Text><Text style={styles.stepBody}>Check the schedule and format, then register with your 1V1 account.</Text></View>
          <View style={styles.step}><Text style={styles.stepNumber}>03 / COMPETE</Text><Text style={styles.stepTitle}>Take your seat</Text><Text style={styles.stepBody}>When your match is ready, open My Match and meet your opponent.</Text></View>
        </View>
      </Section>
    </HubScreen>
  );
}

const styles = StyleSheet.create({
  countdownStrip: { backgroundColor: theme.colors.surface, borderColor: theme.colors.lineStrong, borderTopColor: theme.colors.accent, borderTopWidth: 2, flexDirection: 'column', gap: 20, justifyContent: 'space-between', padding: 24 },
  countdownCopy: { minWidth: 0 },
  stripLabel: { color: theme.colors.accent, fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: '600', letterSpacing: 1.5 },
  stripTitle: { color: theme.colors.text, fontFamily: 'DM Sans, Arial, sans-serif', fontSize: 25, fontWeight: '700', letterSpacing: -0.5, lineHeight: 31, marginTop: 12 },
  stripMeta: { color: theme.colors.muted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  countdownUnits: { flexDirection: 'row', gap: 8 },
  countdownUnit: { alignItems: 'center', backgroundColor: theme.colors.backgroundAlt, borderColor: theme.colors.line, borderRadius: theme.radius.sm, borderWidth: 1, flex: 1, minWidth: 44, paddingHorizontal: 8, paddingVertical: 12 },
  countdownValue: { color: theme.colors.text, fontFamily: 'DM Mono, monospace', fontSize: 26, fontWeight: '500', fontVariant: ['tabular-nums'] },
  countdownLabel: { color: theme.colors.muted, fontSize: 8, fontWeight: '600', letterSpacing: 0.8, marginTop: 4, textTransform: 'uppercase' },
  homeHero: { marginBottom: 46, paddingVertical: 22 },
  heroCopy: { justifyContent: 'center', minWidth: 0, paddingVertical: 10 },
  heroEyebrowRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 20 },
  heroRule: { backgroundColor: theme.colors.accent, height: 2, width: 28 },
  heroEyebrow: { color: theme.colors.accent, flexShrink: 1, fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: '500', letterSpacing: 1.6 },
  heroTitle: { color: theme.colors.text, fontFamily: 'DM Sans, Arial, sans-serif', fontSize: 62, fontWeight: '900', letterSpacing: -2.6, lineHeight: 65, maxWidth: 650 },
  heroTagline: { color: theme.colors.accent, fontSize: 20, fontWeight: '600', letterSpacing: -0.25, marginTop: 16 },
  heroBody: { color: theme.colors.muted, fontSize: 16, lineHeight: 26, marginBottom: 22, marginTop: 12, maxWidth: 480 },
  heroActions: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  physicalGameCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.line, borderRadius: theme.radius.md, borderWidth: 1, minWidth: 0, overflow: 'hidden', padding: 10 },
  physicalGameCardSelected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.surfaceLift },
  cardInfo: { flex: 1, paddingHorizontal: 6, paddingBottom: 6, paddingTop: 16 },
  cardLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  cardName: { color: theme.colors.text, flex: 1, fontFamily: 'DM Sans, Arial, sans-serif', fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  selectedMark: { color: theme.colors.accent, fontFamily: 'DM Mono, monospace', fontSize: 9, fontWeight: '500', letterSpacing: 0.5 },
  cardSummary: { color: theme.colors.muted, fontSize: 13, lineHeight: 20, marginBottom: 16, marginTop: 8, minHeight: 60 },
  clearFilter: { alignItems: 'center', marginTop: 18 },
  staleNote: { color: theme.colors.accent, fontSize: 13, lineHeight: 20, marginBottom: 12 },
  eventGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  eventCard: { borderTopWidth: 2, flexGrow: 1, flexShrink: 1, gap: 6, minWidth: 0, padding: 22 },
  eventLive: { color: theme.colors.success, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  eventGame: { color: theme.colors.accent, fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase' },
  eventTitle: { color: theme.colors.text, fontFamily: 'DM Sans, Arial, sans-serif', fontSize: 21, fontWeight: '700', letterSpacing: -0.4, lineHeight: 28, marginTop: 6 },
  eventMeta: { color: theme.colors.text, fontSize: 13, lineHeight: 20, marginTop: 8 },
  eventDetail: { color: theme.colors.muted, fontSize: 13, lineHeight: 20 },
  resultsGrid: { gap: 16 },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
  step: { borderTopColor: theme.colors.lineStrong, borderTopWidth: 1, flex: 1, minWidth: 210, paddingTop: 20, paddingBottom: 10 },
  stepNumber: { color: theme.colors.accent, fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: '500', letterSpacing: 1.2 },
  stepTitle: { color: theme.colors.text, fontFamily: 'DM Sans, Arial, sans-serif', fontSize: 21, fontWeight: '700', letterSpacing: -0.4, marginTop: 14 },
  stepBody: { color: theme.colors.muted, fontSize: 14, lineHeight: 23, marginTop: 8 },
});

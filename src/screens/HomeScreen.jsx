import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, EmptyState, HubScreen, ResultCard, Section, Surface } from '../components/hub-ui.jsx';
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
  const isDirectSpadesLaunch = game.slug === 'spades' && game.webReady && Boolean(game.playPath);
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
  function openDirectGame() {
    Linking.openURL(game.playPath).catch(() => {});
  }
  function handleCardPress() {
    if (isDirectSpadesLaunch) {
      openDirectGame();
      return;
    }
    onSelect(game.slug);
  }
  function handleCardKeyDown(event) {
    if (event?.key === 'Enter' || event?.key === ' ') {
      event.preventDefault?.();
      handleCardPress();
    }
  }
  const cardIsDirectLaunch = isDirectSpadesLaunch;
  return <View style={[styles.physicalGameCard, selected && styles.physicalGameCardSelected]}><Pressable accessibilityHint={cardIsDirectLaunch ? 'Opens the 1V1 Spades website.' : 'Selects this game and updates the public schedule below.'} accessibilityLabel={cardIsDirectLaunch ? 'Open ' + game.name : 'Select ' + game.name} accessibilityRole={cardIsDirectLaunch ? 'link' : 'radio'} accessibilityState={cardIsDirectLaunch ? undefined : { selected }} dataSet={{ physicalCardHit: 'true', directLaunch: cardIsDirectLaunch ? 'true' : 'false', hovered: cardTurning ? 'true' : 'false' }} onHoverIn={startTurn} onHoverOut={stopTurn} onKeyDown={handleCardKeyDown} onPress={handleCardPress}><View dataSet={{ physicalCardScene: 'true' }}><View dataSet={{ physicalCardRotor: 'true', pageVisible: pageVisible ? 'true' : 'false', returning: returning ? 'true' : 'false', turning: cardTurning ? 'true' : 'false' }} onTransitionEnd={continueTurn} style={{ transform: [{ rotateY: (turn * 360) + 'deg' }] }}><View dataSet={{ physicalCardFace: 'true', physicalCardFront: 'true', cardArt: game.art }}><View dataSet={{ cardOrnament: 'true' }} /><Text dataSet={{ cardCorner: 'true' }}>A{pip}</Text><Text dataSet={{ cardCorner: 'true', cardCornerBottom: 'true' }}>A{pip}</Text><View dataSet={{ cardCenter: 'true' }}><View><CardArtwork art={game.art} /><Text dataSet={{ cardTitle: 'true' }}>1V1</Text><Text dataSet={{ cardTitle: 'true' }}>{game.cardName}</Text><Text dataSet={{ cardKicker: 'true' }}>No partner. No excuses.</Text></View></View></View><View dataSet={{ physicalCardFace: 'true', physicalCardBack: 'true', cardArt: game.art }}><View dataSet={{ cardOrnament: 'true' }} /><View dataSet={{ cardCenter: 'true' }}><View><View dataSet={{ cardBackSeal: 'true' }}><Text dataSet={{ cardBackWord: 'true' }}>{backLabel}</Text></View><Text dataSet={{ cardTitle: 'true' }}>1V1</Text><Text dataSet={{ cardKicker: 'true' }}>Tournaments</Text></View></View></View></View></View></Pressable><View style={styles.cardInfo}><View style={styles.cardLabelRow}><Text style={styles.cardName}>{game.name}</Text>{selected ? <Text accessibilityLiveRegion="polite" style={styles.selectedMark}>SELECTED</Text> : null}</View><Text style={styles.cardSummary}>{game.summary}</Text><ActionButton disabled={isComingSoon} href={isDirectSpadesLaunch ? game.playPath : isComingSoon ? undefined : game.infoPath} variant={selected ? 'primary' : 'secondary'}>{isDirectSpadesLaunch ? 'Play Spades' : isComingSoon ? 'Coming soon' : 'Explore ' + game.shortName}</ActionButton></View></View>;
}

function PublicEventCard({ event }) {
  const game = getPublicGamePresentation(event.gameSlug);
  const action = getPublicEventAction(event, game);
  const counts = event.registeredCount !== null && event.rosterCap !== null ? event.registeredCount + ' / ' + event.rosterCap + ' registered' : null;
  return <Surface style={[styles.eventCard, { borderColor: game?.accent || '#D6A24E' }]}>{event.status === 'live' ? <Text style={styles.eventLive}>Live now</Text> : null}<Text style={styles.eventGame}>{game?.name || event.gameName}</Text><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.eventMeta}>{formatDateLine(event.date, event.timeZone, event.timeZoneLabel)}</Text>{[event.format, event.location, counts].filter(Boolean).map((detail) => <Text key={detail} style={styles.eventDetail}>{detail}</Text>)}<ActionButton href={action.href} variant={action.variant}>{action.label}</ActionButton></Surface>;
}

function UpcomingSchedule({ activeGame, events, feedStatus, onRetry }) {
  const activeGameName = activeGame === 'all' ? 'All games' : getPublicGamePresentation(activeGame)?.name || 'Selected game';
  if (feedStatus === 'loading') return <EmptyState body="The public schedule is loading. Existing event information will appear when the read completes." title="Loading schedule" />;
  if (feedStatus === 'error') return <EmptyState action={<ActionButton onPress={onRetry} variant="secondary">Retry schedule</ActionButton>} body="The schedule could not be confirmed right now. Please retry before relying on event availability." title="Schedule temporarily unavailable" />;
  if (!events.length) return <EmptyState action={<ActionButton href="/games" variant="secondary">Explore games</ActionButton>} body={activeGame === 'all' ? 'No eligible future public tournaments are scheduled.' : 'No public ' + activeGameName + ' tournaments are scheduled.'} title="No upcoming events" />;
  return <View style={styles.eventGrid}>{events.map((event) => <PublicEventCard event={event} key={event.slug} />)}</View>;
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
  const scheduleDescription = activeGame === 'all' ? 'Eligible published public events across every game.' : 'Eligible published public events for ' + (getPublicGamePresentation(activeGame)?.name || 'this game') + '.';
  return <HubScreen accountHref="/account" footerNote="Creating the competitive 1v1 spades category." lead="Competitive head-to-head card games, with availability shown honestly." publicShell showHero={false} stickyActions={false} subtitle="No partner. No excuses." title="1v1 Tournaments"><PublicCountdownStrip event={nextEvent} feedStatus={feed.status} onDeadline={loadSchedule} onRetry={loadSchedule} /><Surface style={styles.homeHero}><Text accessibilityRole="header" aria-level={1} style={styles.heroTitle}>YOUR GAME. YOUR BRACKET.</Text><Text style={styles.heroTagline}>No partner. No excuses.</Text><Text style={styles.heroBody}>Pick a table to focus the schedule. The next-tournament strip always stays global.</Text><ActionButton href="/tournaments">Explore tournaments</ActionButton></Surface><Section description="Each card is still at rest. On a mouse or trackpad, only the card under the pointer turns; touch and keyboard selection remain direct." eyebrow="ALL GAMES" title="Choose your table"><View accessibilityLabel="Game cards" dataSet={{ publicCardGrid: 'true' }}>{games.map((game) => <PhysicalGameCard game={game} key={game.slug} pageVisible={pageVisible} selected={activeGame === game.slug} onSelect={selectGame} />)}</View>{activeGame !== 'all' ? <View style={styles.clearFilter}><ActionButton onPress={() => selectGame('all')} variant="ghost">Show all games</ActionButton></View> : null}</Section>{liveEvent ? <Section description="Current play is shown only for an event with a verified public live state." title="Live now"><View style={styles.eventGrid}><PublicEventCard event={liveEvent} /></View></Section> : null}<Section description={scheduleDescription} title="Upcoming tournaments">{feed.status === 'stale' ? <Text style={styles.staleNote}>Showing the last confirmed schedule while a refresh is unavailable.</Text> : null}<UpcomingSchedule activeGame={activeGame} events={visibleEvents} feedStatus={feed.status} onRetry={loadSchedule} /></Section><Section action={<ActionButton href="/results" variant="secondary">View results</ActionButton>} description="Completed events appear here only after a public result record is posted." title="Recent results">{results.length ? <View style={styles.resultsGrid}>{results.slice(0, 3).map((result) => <ResultCard href={result.tournamentSlug ? '/tournaments/' + result.tournamentSlug : undefined} key={result.slug} result={result} />)}</View> : <EmptyState action={<ActionButton href="/results" variant="secondary">Open results</ActionButton>} body="Results will appear after verified event records are published." title="No posted results yet" />}</Section><Section description="A clear route from selecting a game to event details and your existing match path." title="How it works"><View style={styles.steps}><View style={styles.step}><Text style={styles.stepNumber}>01</Text><Text style={styles.stepTitle}>Choose your game</Text><Text style={styles.stepBody}>Select any card to focus the public schedule.</Text></View><View style={styles.step}><Text style={styles.stepNumber}>02</Text><Text style={styles.stepTitle}>Find an event</Text><Text style={styles.stepBody}>Open posted details and use registration only when it is offered.</Text></View><View style={styles.step}><Text style={styles.stepNumber}>03</Text><Text style={styles.stepTitle}>Play your match</Text><Text style={styles.stepBody}>Use the established account, check-in, and match paths when eligible.</Text></View></View></Section></HubScreen>;
}

const styles = StyleSheet.create({
  countdownStrip: { alignItems: 'center', backgroundColor: '#10151c', borderColor: 'rgba(225,174,79,.46)', flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between', marginBottom: 16, paddingVertical: 13 },
  countdownCopy: { flex: 1, minWidth: 210 },
  stripLabel: { color: '#e3ad4f', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  stripTitle: { color: '#F8F5ED', fontSize: 18, fontWeight: '900', lineHeight: 23, marginTop: 3 },
  stripMeta: { color: '#B9C2CD', fontSize: 12, lineHeight: 18, marginTop: 2 },
  countdownUnits: { flexDirection: 'row', gap: 6 },
  countdownUnit: { alignItems: 'center', backgroundColor: '#090d12', borderColor: 'rgba(255,255,255,.14)', borderRadius: 8, borderWidth: 1, minWidth: 43, paddingHorizontal: 5, paddingVertical: 5 },
  countdownValue: { color: '#f4c566', fontFamily: 'monospace', fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  countdownLabel: { color: '#b8c1cb', fontSize: 8, fontWeight: '800', letterSpacing: .3, textTransform: 'uppercase' },
  homeHero: { alignItems: 'center', backgroundColor: '#0f141b', borderColor: 'rgba(225,174,79,.34)', marginBottom: 26, overflow: 'hidden', paddingVertical: 25, textAlign: 'center' },
  heroTitle: { color: '#F8F5ED', fontFamily: 'Georgia', fontSize: 34, fontWeight: '900', letterSpacing: .3, lineHeight: 39, textAlign: 'center' },
  heroTagline: { color: '#e3ad4f', fontSize: 18, fontWeight: '800', marginTop: 6, textAlign: 'center' },
  heroBody: { color: '#BBC3CF', fontSize: 14, lineHeight: 21, marginBottom: 16, marginTop: 8, maxWidth: 570, textAlign: 'center' },
  physicalGameCard: { backgroundColor: '#0d1117', borderColor: 'rgba(255,255,255,.14)', borderRadius: 19, borderWidth: 1, minWidth: 0, overflow: 'hidden', padding: 10 },
  physicalGameCardSelected: { borderColor: '#e3ad4f', shadowColor: '#e3ad4f', shadowOpacity: .22, shadowRadius: 15 },
  cardInfo: { paddingHorizontal: 4, paddingTop: 12 },
  cardLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 5, justifyContent: 'space-between' },
  cardName: { color: '#F6F1E7', flex: 1, fontSize: 16, fontWeight: '900' },
  selectedMark: { color: '#f0c66c', fontFamily: 'monospace', fontSize: 9, fontWeight: '900', letterSpacing: .5 },
  cardSummary: { color: '#B6C0CC', fontSize: 12, lineHeight: 18, marginBottom: 11, marginTop: 5, minHeight: 54 },
  clearFilter: { alignItems: 'center', marginTop: 14 },
  staleNote: { color: '#e5c176', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  eventGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  eventCard: { flexGrow: 1, flexShrink: 1, minWidth: 235, padding: 17 },
  eventLive: { color: '#8DCAA9', fontSize: 10, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase' },
  eventGame: { color: '#e3ad4f', fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  eventTitle: { color: '#F6F1E7', fontSize: 20, fontWeight: '900', lineHeight: 25, marginTop: 4 },
  eventMeta: { color: '#BEC7D1', fontSize: 13, lineHeight: 19, marginTop: 6 },
  eventDetail: { color: '#9DA9B6', fontSize: 12, lineHeight: 18, marginTop: 2 },
  resultsGrid: { gap: 12 },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  step: { backgroundColor: '#10151c', borderColor: 'rgba(255,255,255,.11)', borderRadius: 12, borderWidth: 1, flex: 1, minWidth: 210, padding: 16 },
  stepNumber: { color: '#e3ad4f', fontFamily: 'monospace', fontSize: 13, fontWeight: '900' },
  stepTitle: { color: '#F6F1E7', fontSize: 17, fontWeight: '900', marginTop: 6 },
  stepBody: { color: '#B6C0CC', fontSize: 13, lineHeight: 19, marginTop: 5 },
});

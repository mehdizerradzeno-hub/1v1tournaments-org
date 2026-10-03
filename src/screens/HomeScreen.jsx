import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, EmptyState, HubScreen, ResultCard, Section, Surface } from '../components/hub-ui.jsx';
import { formatDateLine } from '../lib/format.js';
import { getResults, siteData } from '../lib/siteData.js';
import { fetchTournamentEvents } from '../lib/tournamentHostingClient.js';
import {
  filterPublicEventsByGame,
  getAwaitingStartPublicEvent,
  getCountdownParts,
  getNextEligiblePublicEvent,
  getPublicEventAction,
  getPublicGamePresentation,
  getPublicGames,
  getPublicPresentationEvents,
} from '../lib/publicPresentationCatalog.js';
import { usePublicGameFilter } from '../lib/usePublicGameFilter.js';
import { useVisibleNow } from '../lib/useVisibleNow.js';

const SCHEDULE_REFRESH_MS = 5 * 60 * 1000;
const CARD_CSS = [
  '[data-public-card-grid=true]{display:grid;gap:18px;grid-template-columns:repeat(4,minmax(0,1fr))}',
  '[data-physical-card-hit=true]{appearance:none;background:transparent;border:0;cursor:pointer;display:block;min-height:344px;padding:0;perspective:1100px;position:relative;text-align:left;width:100%}',
  '[data-physical-card-hit=true]:focus-visible{border-radius:20px;outline:3px solid #fff0bd;outline-offset:4px}',
  '[data-physical-card-scene=true]{height:100%;transform:rotateY(-2deg) rotateX(1.2deg);transform-style:preserve-3d;transition:transform 260ms cubic-bezier(.2,.8,.2,1)}',
  '[data-physical-card-hit=true][data-hovered=true] [data-physical-card-scene=true]{transform:translateY(-9px) rotateY(-2deg) rotateX(1.2deg)}',
  '[data-physical-card-rotor=true]{height:100%;position:relative;transform-style:preserve-3d;transition:transform 2750ms linear;width:100%}[data-physical-card-rotor=true][data-turning=true]{will-change:transform}[data-physical-card-rotor=true][data-returning=true]{transition:transform 440ms cubic-bezier(.2,.8,.2,1)}',
  '[data-physical-card-rotor=true][data-page-visible=false]{transition:none!important;transform:rotateY(0deg)!important}',
  '[data-physical-card-face=true]{backface-visibility:hidden;border:1px solid rgba(255,230,153,.9);border-radius:17px;box-shadow:inset 0 0 0 3px rgba(12,10,9,.82),inset 0 0 0 5px rgba(255,222,141,.42),inset 0 0 28px rgba(255,228,157,.12),0 20px 24px rgba(0,0,0,.42),9px 10px 0 rgba(0,0,0,.36),14px 15px 0 rgba(0,0,0,.18);box-sizing:border-box;height:100%;left:0;overflow:hidden;position:absolute;top:0;transform:translateZ(1px);width:100%}[data-physical-card-back=true]{transform:rotateY(180deg) translateZ(1px)}',
  '[data-physical-card-face=true]::before{background:linear-gradient(108deg,rgba(255,255,255,.16),transparent 20%,transparent 72%,rgba(255,255,255,.08));content:"";inset:6px;pointer-events:none;position:absolute;z-index:8}',
  '[data-card-art=spade]{background:radial-gradient(circle at 50% 38%,rgba(146,10,24,.86),transparent 28%),linear-gradient(145deg,#160f13,#420b12 48%,#0b0d12)}[data-card-art=euchre]{background:radial-gradient(circle at 50% 38%,rgba(44,118,178,.55),transparent 32%),linear-gradient(145deg,#071726,#102d51 52%,#080f1c);border-color:#b9d4e4}[data-card-art=gin]{background:radial-gradient(circle at 50% 40%,rgba(46,143,78,.58),transparent 33%),linear-gradient(145deg,#062a1f,#11623c 55%,#07170f);border-color:#e2c760}[data-card-art=cribbage]{background:radial-gradient(circle at 50% 43%,rgba(178,98,35,.6),transparent 34%),linear-gradient(145deg,#2d160d,#75401d 52%,#1e100c);border-color:#e4b864}',
  '[data-card-ornament=true]{border:1px solid rgba(255,226,145,.58);border-radius:12px;inset:14px;position:absolute}[data-card-ornament=true]::before,[data-card-ornament=true]::after{border-color:#f0c362;border-style:solid;content:"";height:19px;position:absolute;width:19px}[data-card-ornament=true]::before{border-width:2px 0 0 2px;left:5px;top:5px}[data-card-ornament=true]::after{border-width:0 2px 2px 0;bottom:5px;right:5px}',
  '[data-card-corner=true]{color:#ffe4a1;font-family:Georgia,serif;font-size:20px;font-weight:900;left:17px;line-height:.88;position:absolute;text-align:center;top:17px;z-index:9}[data-card-corner-bottom=true]{bottom:17px;left:auto;right:17px;top:auto;transform:rotate(180deg)}',
  '[data-card-center=true]{align-items:center;display:flex;height:100%;justify-content:center;padding:50px 19px 28px;position:relative;text-align:center;z-index:2}[data-card-title=true]{color:#fff2c5;font-family:Georgia,serif;font-size:clamp(21px,2vw,30px);font-weight:900;letter-spacing:.04em;line-height:.94;margin:0;text-shadow:0 2px 1px #000,0 0 16px rgba(255,196,65,.35)}[data-card-kicker=true]{color:#f3c766;font-family:ui-monospace,Menlo,monospace;font-size:9px;font-weight:900;letter-spacing:.17em;margin-top:9px;text-transform:uppercase}',
  '[data-art-stage=true]{height:126px;margin:0 auto 17px;position:relative;width:132px}[data-crown-shape=true]{height:28px;left:50%;position:absolute;top:0;transform:translateX(-50%);width:72px}[data-crown-shape=true]::before{background:linear-gradient(135deg,transparent 47%,#f8d678 48%) 0 0/24px 24px,linear-gradient(225deg,transparent 47%,#f8d678 48%) 24px 0/24px 24px,linear-gradient(135deg,transparent 47%,#f8d678 48%) 48px 0/24px 24px;content:"";inset:0;position:absolute}[data-crown-shape=true]::after{background:#d59d39;bottom:0;box-shadow:0 0 10px rgba(251,211,109,.65);content:"";height:5px;left:3px;position:absolute;right:3px}',
  '[data-spade-shape=true]{background:linear-gradient(135deg,#f9e4a0,#9b661d);clip-path:polygon(50% 100%,42% 75%,26% 75%,13% 70%,4% 56%,4% 39%,11% 22%,24% 13%,38% 16%,50% 31%,62% 16%,76% 13%,89% 22%,96% 39%,96% 56%,87% 70%,74% 75%,58% 75%);height:76px;left:50%;position:absolute;top:23px;transform:translateX(-50%);width:90px}[data-spade-lobe],[data-spade-point=true]{display:none}[data-spade-stem=true]{background:#e8c36b;border-radius:0 0 12px 12px;bottom:0;height:25px;left:42px;position:absolute;transform:skewX(-14deg);width:11px;z-index:3}[data-spade-base=true]{background:#e8c36b;border-radius:50% 50% 6px 6px;bottom:0;height:10px;left:28px;position:absolute;width:40px;z-index:3}',
  '[data-euchre-crest=true]{height:114px;margin:0 auto 12px;position:relative;width:124px}[data-euchre-shield=true]{background:linear-gradient(145deg,#ecf1f0,#7289a1 52%,#202c43);border:2px solid #e7d490;clip-path:polygon(50% 0,89% 15%,85% 69%,50% 100%,15% 69%,11% 15%);height:93px;left:19px;position:absolute;top:10px;width:86px}[data-euchre-bower=true]{color:#0d2948;font-family:Georgia,serif;font-size:64px;font-weight:900;left:45px;line-height:1;position:absolute;top:19px;text-shadow:0 1px #fff}[data-euchre-saber]{background:linear-gradient(90deg,#8e9ead,#f1e4a4,#8e9ead);height:6px;left:8px;position:absolute;top:58px;transform:rotate(42deg);width:108px}[data-euchre-saber=right]{transform:rotate(-42deg)}[data-euchre-laurel=true]{border:2px solid rgba(224,204,131,.86);border-radius:50%;height:108px;left:8px;position:absolute;top:3px;width:108px}',
  '[data-gin-hand=true]{height:116px;margin:0 auto 11px;position:relative;width:140px}[data-gin-card]{background:linear-gradient(145deg,#fff7d7,#e8d9a2);border:2px solid #d7b753;border-radius:8px;box-shadow:2px 4px 6px rgba(0,0,0,.36);height:78px;padding:5px;position:absolute;top:19px;width:48px}[data-gin-card=one]{left:5px;transform:rotate(-24deg)}[data-gin-card=two]{left:28px;transform:rotate(-11deg)}[data-gin-card=three]{left:53px;transform:rotate(4deg)}[data-gin-card=four]{left:78px;transform:rotate(17deg)}[data-gin-rank=true]{color:#102a1b;font-family:Georgia,serif;font-size:17px;font-weight:900;line-height:.85;text-align:left}[data-gin-pip=true]{color:#102a1b;font-size:23px;line-height:1.2;text-align:center}',
  '[data-cribbage-board=true]{background:linear-gradient(145deg,#bb7a37,#5e2e15);border:3px solid #e5bc69;border-radius:42px;box-shadow:inset 0 0 0 4px rgba(47,20,8,.56);height:108px;margin:0 auto 11px;padding:17px 13px;position:relative;width:130px}[data-cribbage-track=true]{border:2px solid rgba(255,223,145,.78);border-radius:30px;height:30px;margin-bottom:9px;position:relative}[data-cribbage-hole=true]{background:#1c100b;border:1px solid #e4bb67;border-radius:50%;height:5px;position:absolute;top:11px;width:5px}[data-cribbage-peg]{background:#e4d2a0;border:1px solid #30130c;border-radius:4px 4px 2px 2px;box-shadow:0 0 7px rgba(255,232,162,.7);height:19px;position:absolute;top:4px;width:7px}[data-cribbage-peg=red]{background:#b41e20;left:62%}[data-cribbage-peg=ivory]{left:38%}',
  '[data-card-back-seal=true]{align-items:center;border:2px solid rgba(255,226,145,.8);box-shadow:0 0 0 6px rgba(0,0,0,.18),inset 0 0 20px rgba(255,210,105,.2);display:flex;height:126px;justify-content:center;margin:0 auto 17px;position:relative;transform:rotate(-4deg);width:126px}[data-card-back-seal=true]::before,[data-card-back-seal=true]::after{border:1px solid rgba(255,226,145,.55);content:"";height:88px;position:absolute;transform:rotate(45deg);width:88px}[data-card-back-seal=true]::after{transform:rotate(0deg)}[data-card-back-word=true]{color:#ffe5a8;font-family:Georgia,serif;font-size:19px;font-weight:900;letter-spacing:.09em;line-height:1.05;max-width:100px;position:relative;text-align:center;text-shadow:0 2px #000;z-index:2}',
  '@media(max-width:760px){[data-public-card-grid=true]{gap:13px;grid-template-columns:repeat(2,minmax(0,1fr))}[data-physical-card-hit=true]{min-height:252px}[data-card-center=true]{padding:39px 11px 20px}[data-art-stage=true]{height:86px;margin-bottom:10px;transform:scale(.72);transform-origin:top center;width:96px}[data-euchre-crest=true],[data-gin-hand=true],[data-cribbage-board=true]{transform:scale(.72);transform-origin:top center}[data-card-title=true]{font-size:19px}[data-card-kicker=true]{font-size:7px;letter-spacing:.1em;margin-top:6px}[data-card-corner=true]{font-size:15px;left:11px;top:12px}[data-card-corner-bottom=true]{bottom:12px;right:11px}[data-card-back-seal=true]{height:83px;margin-bottom:10px;transform:rotate(-4deg) scale(.72);width:83px}}',
  '@media(max-width:370px){[data-public-card-grid=true]{gap:9px}[data-physical-card-hit=true]{min-height:225px}[data-card-title=true]{font-size:16px}[data-card-center=true]{padding-left:7px;padding-right:7px}}',
  '@media(prefers-reduced-motion:reduce){[data-physical-card-scene=true],[data-physical-card-rotor=true]{transition:none!important}}',
  '@supports not (transform-style:preserve-3d){[data-physical-card-back=true]{display:none}}',
].join('\n');

function PublicCardStyles() {
  return Platform.OS === 'web' ? <style dangerouslySetInnerHTML={{ __html: CARD_CSS }} /> : null;
}

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
  return <View style={[styles.physicalGameCard, selected && styles.physicalGameCardSelected]}><Pressable accessibilityHint="Selects this game and updates the public schedule below." accessibilityLabel={'Select ' + game.name} accessibilityRole="radio" accessibilityState={{ selected }} dataSet={{ physicalCardHit: 'true', hovered: cardTurning ? 'true' : 'false' }} onHoverIn={startTurn} onHoverOut={stopTurn} onKeyDown={(event) => { if (event?.key === 'Enter' || event?.key === ' ') { event.preventDefault?.(); onSelect(game.slug); } }} onPress={() => onSelect(game.slug)}><View dataSet={{ physicalCardScene: 'true' }}><View dataSet={{ physicalCardRotor: 'true', pageVisible: pageVisible ? 'true' : 'false', returning: returning ? 'true' : 'false', turning: cardTurning ? 'true' : 'false' }} onTransitionEnd={continueTurn} style={{ transform: [{ rotateY: (turn * 360) + 'deg' }] }}><View dataSet={{ physicalCardFace: 'true', physicalCardFront: 'true', cardArt: game.art }}><View dataSet={{ cardOrnament: 'true' }} /><Text dataSet={{ cardCorner: 'true' }}>A{pip}</Text><Text dataSet={{ cardCorner: 'true', cardCornerBottom: 'true' }}>A{pip}</Text><View dataSet={{ cardCenter: 'true' }}><View><CardArtwork art={game.art} /><Text dataSet={{ cardTitle: 'true' }}>1V1</Text><Text dataSet={{ cardTitle: 'true' }}>{game.cardName}</Text><Text dataSet={{ cardKicker: 'true' }}>No partner. No excuses.</Text></View></View></View><View dataSet={{ physicalCardFace: 'true', physicalCardBack: 'true', cardArt: game.art }}><View dataSet={{ cardOrnament: 'true' }} /><View dataSet={{ cardCenter: 'true' }}><View><View dataSet={{ cardBackSeal: 'true' }}><Text dataSet={{ cardBackWord: 'true' }}>{backLabel}</Text></View><Text dataSet={{ cardTitle: 'true' }}>1V1</Text><Text dataSet={{ cardKicker: 'true' }}>Tournaments</Text></View></View></View></View></View></Pressable><View style={styles.cardInfo}><View style={styles.cardLabelRow}><Text style={styles.cardName}>{game.name}</Text>{selected ? <Text accessibilityLiveRegion="polite" style={styles.selectedMark}>SELECTED</Text> : null}</View><Text style={styles.cardSummary}>{game.summary}</Text><ActionButton href={game.infoPath} variant={selected ? 'primary' : 'secondary'}>Explore {game.shortName}</ActionButton></View></View>;
}

function PublicEventCard({ event }) {
  const game = getPublicGamePresentation(event.gameSlug);
  const action = getPublicEventAction(event, game);
  const counts = event.registeredCount !== null && event.rosterCap !== null ? event.registeredCount + ' / ' + event.rosterCap + ' registered' : null;
  return <Surface style={[styles.eventCard, { borderColor: game?.accent || '#D6A24E' }]}><Text style={styles.eventGame}>{game?.name || event.gameName}</Text><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.eventMeta}>{formatDateLine(event.date, event.timeZone, event.timeZoneLabel)}</Text>{[event.format, event.location, counts].filter(Boolean).map((detail) => <Text key={detail} style={styles.eventDetail}>{detail}</Text>)}<ActionButton href={action.href} variant={action.variant}>{action.label}</ActionButton></Surface>;
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
  const scheduleNow = useVisibleNow(60000);
  const games = useMemo(() => getPublicGames(), []);
  const publicEvents = useMemo(() => getPublicPresentationEvents(siteData.tournaments, feed.events), [feed.events]);
  const nextFutureEvent = useMemo(() => getNextEligiblePublicEvent(publicEvents, scheduleNow), [publicEvents, scheduleNow]);
  const awaitingEvent = useMemo(() => getAwaitingStartPublicEvent(publicEvents, scheduleNow), [publicEvents, scheduleNow]);
  const nextEvent = nextFutureEvent || awaitingEvent;
  const visibleEvents = useMemo(() => filterPublicEventsByGame(publicEvents, activeGame).filter((event) => new Date(event.date).getTime() > scheduleNow), [activeGame, publicEvents, scheduleNow]);
  const results = useMemo(() => {
    const allResults = getResults();
    return activeGame === 'all' ? allResults : allResults.filter((result) => result.gameSlug === activeGame);
  }, [activeGame]);
  const scheduleDescription = activeGame === 'all' ? 'Eligible published public events across every game.' : 'Eligible published public events for ' + (getPublicGamePresentation(activeGame)?.name || 'this game') + '.';
  return <HubScreen accountHref="/account" footerNote="Creating the competitive 1v1 spades category." lead="Competitive head-to-head card games, with availability shown honestly." publicShell showHero={false} stickyActions={false} subtitle="No partner. No excuses." title="1v1 Tournaments"><PublicCardStyles /><PublicCountdownStrip event={nextEvent} feedStatus={feed.status} onDeadline={loadSchedule} onRetry={loadSchedule} /><Surface style={styles.homeHero}><Text accessibilityRole="header" aria-level={1} style={styles.heroTitle}>YOUR GAME. YOUR BRACKET.</Text><Text style={styles.heroTagline}>No partner. No excuses.</Text><Text style={styles.heroBody}>Pick a table to focus the schedule. The next-tournament strip always stays global.</Text><ActionButton href="/tournaments">Explore tournaments</ActionButton></Surface><Section description="Each card is still at rest. On a mouse or trackpad, only the card under the pointer turns; touch and keyboard selection remain direct." eyebrow="ALL GAMES" title="Choose your table"><View accessibilityLabel="Choose a game" accessibilityRole="radiogroup" dataSet={{ publicCardGrid: 'true' }}>{games.map((game) => <PhysicalGameCard game={game} key={game.slug} pageVisible={pageVisible} selected={activeGame === game.slug} onSelect={selectGame} />)}</View>{activeGame !== 'all' ? <View style={styles.clearFilter}><ActionButton onPress={() => selectGame('all')} variant="ghost">Show all games</ActionButton></View> : null}</Section><Section description={scheduleDescription} title="Upcoming tournaments">{feed.status === 'stale' ? <Text style={styles.staleNote}>Showing the last confirmed schedule while a refresh is unavailable.</Text> : null}<UpcomingSchedule activeGame={activeGame} events={visibleEvents} feedStatus={feed.status} onRetry={loadSchedule} /></Section><Section action={<ActionButton href="/results" variant="secondary">View results</ActionButton>} description="Completed events appear here only after a public result record is posted." title="Recent results">{results.length ? <View style={styles.resultsGrid}>{results.slice(0, 3).map((result) => <ResultCard href={result.tournamentSlug ? '/tournaments/' + result.tournamentSlug : undefined} key={result.slug} result={result} />)}</View> : <EmptyState action={<ActionButton href="/results" variant="secondary">Open results</ActionButton>} body="Results will appear after verified event records are published." title="No posted results yet" />}</Section><Section description="A clear route from selecting a game to event details and your existing match path." title="How it works"><View style={styles.steps}><View style={styles.step}><Text style={styles.stepNumber}>01</Text><Text style={styles.stepTitle}>Choose your game</Text><Text style={styles.stepBody}>Select any card to focus the public schedule.</Text></View><View style={styles.step}><Text style={styles.stepNumber}>02</Text><Text style={styles.stepTitle}>Find an event</Text><Text style={styles.stepBody}>Open posted details and use registration only when it is offered.</Text></View><View style={styles.step}><Text style={styles.stepNumber}>03</Text><Text style={styles.stepTitle}>Play your match</Text><Text style={styles.stepBody}>Use the established account, check-in, and match paths when eligible.</Text></View></View></Section></HubScreen>;
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

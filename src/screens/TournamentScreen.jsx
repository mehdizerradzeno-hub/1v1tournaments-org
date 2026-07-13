import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  ActionButton,
  AgendaList,
  BracketBoard,
  BulletList,
  Badge,
  CheckInPanel,
  EmptyState,
  HubScreen,
  QuickActionCard,
  ResultCard,
  RuleBlock,
  Section,
  StreamCard,
  Surface,
} from '../components/hub-ui.jsx';
import { formatDateLine } from '../lib/format.js';
import {
  buildResultFromTournamentBracket,
  getGameBySlug,
  getGamePath,
  getCheckInPath,
  getSponsorSoftware,
  getResultByTournamentSlug,
  getResultsForGame,
  getStreamBySlug,
  getTournamentBySlug,
  getTournamentPath,
  siteData,
} from '../lib/siteData.js';
import { getEffectiveRegistrationStatus, mergeTournamentSettings } from '../lib/tournamentSettings.js';
import { getTournamentMode } from '../lib/tournamentModes.js';
import {
  fetchTournamentPlayerStatus,
  fetchSignupSummary,
  fetchTournamentBracket,
  fetchTournamentEvent,
  issueTournamentMatchTicket,
} from '../lib/tournamentHostingClient.js';
import { downloadLinks } from '../lib/downloadLinks.js';

function signupCountLabel(count, loading = false) {
  if (loading) return 'Loading';
  return `${count} signed up`;
}

const DEFAULT_ROSTER_CAP = 8;
const DEFAULT_MINIMUM_PLAYERS = 2;
const TOURNAMENT_TABS = [
  { id: 'play', label: 'Play', body: 'Player status, live path, and main action.' },
  { id: 'roster', label: 'Roster', body: 'Who is signed up and bracket-ready.' },
  { id: 'bracket', label: 'Bracket', body: 'Current match flow and table access.' },
  { id: 'info', label: 'Info', body: 'Rules, agenda, links, and results.' },
];
const TWITCH_VIEWER_COMMANDS = ['!join', '!next', '!match', '!bracket', '!rules', '!discord'];

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getAdvertisedRosterCap(tournament) {
  return positiveInteger(tournament?.rosterCap, DEFAULT_ROSTER_CAP);
}

function getMinimumPlayers(tournament) {
  return positiveInteger(tournament?.minimumPlayers, DEFAULT_MINIMUM_PLAYERS);
}

function nextPowerOfTwo(value) {
  let size = 2;
  const target = Math.max(Number(value) || 0, 2);

  while (size < target) {
    size *= 2;
  }

  return size;
}

function bracketSizeFromBracket(bracket, fallbackCount = 0) {
  const firstRoundMatchCount = bracket?.rounds?.[0]?.matches?.length || 0;

  if (firstRoundMatchCount) {
    return firstRoundMatchCount * 2;
  }

  return nextPowerOfTwo(fallbackCount);
}

function bracketSizeLabel(size) {
  return `${size}-player`;
}

function actualBracketSizeFromSignups(count, minimumPlayers = DEFAULT_MINIMUM_PLAYERS) {
  return nextPowerOfTwo(Math.max(count, minimumPlayers));
}

function playerCapacityLabel(count, size, loading = false) {
  if (loading) return 'Loading';
  return `${count}/${size}`;
}

function openSlotLabel(count, size, minimumPlayers = DEFAULT_MINIMUM_PLAYERS, loading = false) {
  if (loading) return 'Checking open seats';
  const openSlots = Math.max(size - count, 0);

  if (count < minimumPlayers) return `Need ${minimumPlayers} players to generate a bracket`;
  if (count > size) return `${count - size} over advertised size; actual bracket can expand`;
  if (openSlots === 0) return 'Current bracket size is full';
  return `${openSlots} open bracket seat${openSlots === 1 ? '' : 's'}`;
}

function rosterPolicyCopy(tournament, advertisedRosterCap, minimumPlayers) {
  return tournament?.bracketFlexPolicy
    || `Advertised ${advertisedRosterCap}-player bracket. Runs with ${minimumPlayers}+ players and fills open seats with byes.`;
}

function getTournamentFormatDetails(tournament) {
  const mode = getTournamentMode(tournament?.mode);

  if (mode.value === 'four-player-double-elimination') {
    return {
      mode,
      bullets: [
        'Exactly 4 players enter the bracket.',
        'Lose once and move to the losers bracket.',
        'Lose twice and you are eliminated.',
        'Grand final can create a reset final if the losers-side finalist wins.',
      ],
      requirement: 'Exactly 4 players',
      rhythm: 'Second-chance bracket',
    };
  }

  if (mode.value === 'three-player-two-life') {
    return {
      mode,
      bullets: [
        'Exactly 3 players enter the rotation.',
        'Every player starts with two lives.',
        'Each match loss removes one life.',
        'The last player with lives remaining wins.',
      ],
      requirement: 'Exactly 3 players',
      rhythm: 'Two-life rotation',
    };
  }

  if (mode.value === 'single-elimination') {
    return {
      mode,
      bullets: [
        'One loss knocks a player out.',
        'Open seats become byes when the bracket is seeded.',
        'Winners advance until one champion remains.',
      ],
      requirement: `${mode.minimumPlayers}+ players`,
      rhythm: 'Fast bracket',
    };
  }

  return {
    mode,
    bullets: [
      mode.summary,
      'The host will announce this format before the bracket is published.',
      'Registered players should watch the tournament page for match status.',
    ],
    requirement: `${mode.minimumPlayers}+ players`,
    rhythm: mode.generation === 'live' ? 'Live format' : 'Planned format',
  };
}

function seatLabel(count, advertisedRosterCap, loading = false) {
  if (loading) return `Loading / ${advertisedRosterCap}`;
  return `${count} / ${advertisedRosterCap}`;
}

function actualBracketPreviewLabel(count, minimumPlayers, loading = false) {
  if (loading) return 'Checking';
  if (count < minimumPlayers) return `${minimumPlayers}-player minimum`;
  return `${bracketSizeLabel(actualBracketSizeFromSignups(count, minimumPlayers))} actual`;
}

function heroSignupAction(status, checkInPath, tournamentPath) {
  if (status.reason === 'bracket-live') {
    return { label: 'View Bracket', href: `${tournamentPath}#live-bracket` };
  }

  if (status.value === 'open') {
    return { label: 'Join', href: checkInPath };
  }

  return { label: 'Roster', href: `${tournamentPath}#registered-players` };
}

function getSignInPath(checkInPath) {
  return `${checkInPath}?mode=signin`;
}

function getPlayerAccountState(playerStatus) {
  const data = playerStatus?.data || null;

  return {
    account: data?.account || null,
    currentMatch: data?.currentMatch || null,
    loading: Boolean(playerStatus?.loading),
    signup: data?.signup || null,
  };
}

function getPlayerPrimaryAction({
  checkInPath,
  isBracketLive,
  matchStatusPath,
  playerStatus,
  registrationMeta,
  signInPath,
  tournamentPath,
}) {
  const { account, currentMatch, loading, signup } = getPlayerAccountState(playerStatus);

  if (currentMatch) {
    return { label: 'Open My Match', href: matchStatusPath };
  }

  if (signup) {
    return { label: 'My Match', href: matchStatusPath };
  }

  if (isBracketLive) {
    return account
      ? { label: 'My Match', href: matchStatusPath }
      : { label: 'Sign in for Match', href: signInPath };
  }

  if (registrationMeta.value === 'open') {
    if (loading) {
      return { label: 'Join Tournament', href: checkInPath };
    }

    return account
      ? { label: 'Join Tournament', href: checkInPath }
      : { label: 'Sign in to Join', href: signInPath };
  }

  return { label: 'Roster', href: `${tournamentPath}#registered-players` };
}

function getSecondarySignInAction(playerStatus, signInPath) {
  const { account, loading } = getPlayerAccountState(playerStatus);

  return !loading && !account ? { label: 'Sign in', href: signInPath, variant: 'secondary' } : null;
}

function tabFromHash(hash) {
  switch (String(hash || '').replace(/^#/, '')) {
    case 'my-match':
      return 'play';
    case 'registered-players':
      return 'roster';
    case 'live-bracket':
      return 'bracket';
    default:
      return '';
  }
}

function getOpenSeats(count, size) {
  return Math.max(size - count, 0);
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

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getNextPublicMatch(bracket) {
  const rounds = bracket?.rounds || [];
  const matches = rounds.flatMap((round) => round.matches || []);

  return matches.find((match) => match.status === 'ready' || match.status === 'active')
    || matches.find((match) => !match.winnerName && match.status !== 'final')
    || matches[0]
    || null;
}

function getBracketMatches(bracket) {
  return bracket?.rounds?.flatMap((round) => round.matches || []) || [];
}

function getMatchTone(match) {
  if (match?.status === 'final') return 'green';
  if (match?.status === 'ready' || match?.status === 'active') return 'accent';
  return 'blue';
}

function getMatchStatusLabel(match) {
  if (!match) return 'Waiting';
  if (match.status === 'final') return 'Final';
  if (match.status === 'ready') return 'Up next';
  if (match.status === 'active') return 'Live now';
  return 'Waiting';
}

function getMatchPlayerRows(match) {
  const players = match?.players || [];

  if (players.length) {
    return players.map((player, index) => ({
      key: player?.id || `${match.id}-player-${index}`,
      label: playerLabel(player),
      isWinner: Boolean(match.winnerId && player?.id === match.winnerId) || playerLabel(player) === match.winnerName,
      seed: player?.seed || index + 1,
    }));
  }

  return [
    { key: `${match?.id || 'match'}-slot-1`, label: 'TBD', isWinner: false, seed: 1 },
    { key: `${match?.id || 'match'}-slot-2`, label: 'TBD', isWinner: false, seed: 2 },
  ];
}

function buildTournamentTimeline({ isBracketLive, liveBracket, registrationMeta, playerHasReadyMatch, result }) {
  return [
    {
      key: 'signup',
      label: 'Signups',
      value: registrationMeta.value === 'open' ? 'Open' : registrationMeta.label,
      state: registrationMeta.value === 'open' && !isBracketLive ? 'active' : 'done',
    },
    {
      key: 'check-in',
      label: 'Check-in',
      value: isBracketLive || liveBracket ? 'Locked' : 'Roster building',
      state: isBracketLive || liveBracket ? 'done' : 'active',
    },
    {
      key: 'bracket',
      label: 'Bracket',
      value: liveBracket ? 'Live' : 'Pending',
      state: liveBracket ? 'active' : 'waiting',
    },
    {
      key: 'match',
      label: 'Match links',
      value: playerHasReadyMatch ? 'Ready' : liveBracket ? 'Watch page' : 'After seed',
      state: playerHasReadyMatch ? 'active' : liveBracket ? 'done' : 'waiting',
    },
    {
      key: 'results',
      label: 'Results',
      value: result ? 'Posted' : 'After final',
      state: result ? 'done' : 'waiting',
    },
  ];
}

function getArrivalSteps({ isBracketLive, playerHasReadyMatch, registrationMeta }) {
  if (playerHasReadyMatch) {
    return [
      { label: 'Now', title: 'Play your match', body: 'Your account has an assigned table ready.' },
      { label: 'Then', title: 'Report result', body: 'Winner advances from the tournament page.' },
      { label: 'Watch', title: 'Keep Twitch open', body: 'Chat commands stay live for links.' },
    ];
  }

  if (isBracketLive) {
    return [
      { label: 'Now', title: 'Check match status', body: 'Sign in and open your tournament status for table access.' },
      { label: 'View', title: 'Follow bracket', body: 'Bracket cards show current and completed matches.' },
      { label: 'Chat', title: 'Use !match', body: 'Twitch chat can send players back here.' },
    ];
  }

  if (registrationMeta.value === 'open') {
    return [
      { label: 'Step 1', title: 'Join tournament', body: 'Create or open your account and reserve your seat.' },
      { label: 'Step 2', title: 'Confirm name', body: 'Your public player name appears in the roster.' },
      { label: 'Step 3', title: 'Wait for bracket', body: 'Match links appear after the host seeds.' },
    ];
  }

  return [
    { label: 'Now', title: 'Review event', body: 'Check rules, format, and current roster status.' },
    { label: 'Later', title: 'Watch for updates', body: 'The bracket appears here after the host starts.' },
    { label: 'Chat', title: 'Use !next', body: 'Twitch commands point viewers to this page.' },
  ];
}

function normalizeSignupStatus(status) {
  return String(status || 'registered').trim().toLowerCase();
}

function getRosterGroups(signups, liveBracket) {
  const seededNames = new Set(
    getBracketMatches(liveBracket)
      .flatMap((match) => match.players || [])
      .map((player) => String(player?.name || '').trim().toLowerCase())
      .filter(Boolean),
  );
  const groups = [
    { key: 'checked-in', title: 'Checked in', tone: 'green', players: [] },
    { key: 'registered', title: 'Registered', tone: 'blue', players: [] },
    { key: 'waiting', title: 'Waiting', tone: 'accent', players: [] },
  ];

  signups.forEach((signup) => {
    const status = normalizeSignupStatus(signup.status);
    const playerName = String(signup.playerName || '').trim().toLowerCase();

    if (signup.currentPlayer || status.includes('checked') || seededNames.has(playerName)) {
      groups[0].players.push(signup);
      return;
    }

    if (status.includes('wait') || status.includes('pending')) {
      groups[2].players.push(signup);
      return;
    }

    groups[1].players.push(signup);
  });

  return groups.filter((group) => group.players.length);
}

function matchPlayersLabel(match) {
  const players = match?.players?.map(playerLabel).filter(Boolean) || [];

  if (players.length) {
    return players.join(' vs ');
  }

  const teams = match?.teams || [];

  return teams.length ? teams.join(' vs ') : 'Players appear after seeding';
}

export default function TournamentScreen({ slug }) {
  const [activeTab, setActiveTab] = useState('play');
  const [liveBracket, setLiveBracket] = useState(null);
  const [bracketState, setBracketState] = useState({ loading: true, error: '' });
  const [playerStatus, setPlayerStatus] = useState({ loading: true, error: '', data: null });
  const [signupSummary, setSignupSummary] = useState({ count: 0, signups: [], loading: true, error: '' });
  const [tournamentSettings, setTournamentSettings] = useState(null);
  const [hostedTournament, setHostedTournament] = useState(null);
  const [tournamentLookup, setTournamentLookup] = useState({ loading: true, error: '' });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const seededTournament = getTournamentBySlug(slug);
  const tournament = useMemo(
    () => (hostedTournament ? { ...(seededTournament || {}), ...hostedTournament } : seededTournament),
    [hostedTournament, seededTournament],
  );
  const liveTournament = useMemo(
    () => mergeTournamentSettings(tournament, tournamentSettings),
    [tournament, tournamentSettings],
  );

  useEffect(() => {
    let active = true;

    async function loadTournamentRecord() {
      if (!slug) {
        setTournamentLookup({ loading: false, error: '' });
        setHostedTournament(null);
        return;
      }

      setTournamentLookup({ loading: !seededTournament, error: '' });

      try {
        const result = await fetchTournamentEvent({ slug });

        if (active) {
          setHostedTournament(result.tournament || null);
          setTournamentLookup({ loading: false, error: '' });
        }
      } catch (error) {
        if (active) {
          setHostedTournament(null);
          setTournamentLookup({
            loading: false,
            error: error instanceof Error ? error.message : 'Tournament record could not be loaded.',
          });
        }
      }
    }

    loadTournamentRecord();

    async function loadBracket({ silent = false } = {}) {
      if (!slug) {
        return;
      }

      if (!silent) {
        setBracketState({ loading: true, error: '' });
      }

      try {
        const result = await fetchTournamentBracket({ slug });

        if (active) {
          setLiveBracket(result.bracket || null);
          setBracketState({ loading: false, error: '' });
        }
      } catch (error) {
        if (active) {
          setLiveBracket(null);
          setBracketState({
            loading: false,
            error: error instanceof Error ? error.message : 'Could not load the live bracket.',
          });
        }
      }
    }

    loadBracket();

    async function loadSignupSummary({ silent = false } = {}) {
      if (!silent) {
        setSignupSummary((current) => ({ ...current, loading: true, error: '' }));
      }

      try {
        const result = await fetchSignupSummary({ slug });

        if (active) {
          setTournamentSettings(result.settings || null);
          setSignupSummary({
            count: result.signupCount || 0,
            signups: result.signups || [],
            loading: false,
            error: '',
          });
        }
      } catch (error) {
        if (active) {
          setTournamentSettings(null);
          setSignupSummary({
            count: 0,
            signups: [],
            loading: false,
            error: error instanceof Error ? error.message : 'Signup count could not be loaded.',
          });
        }
      }
    }

    loadSignupSummary();

    async function loadPlayerStatus({ silent = false } = {}) {
      if (!silent) {
        setPlayerStatus((current) => ({ ...current, loading: true, error: '' }));
      }

      try {
        const result = await fetchTournamentPlayerStatus({ slug });

        if (active) {
          setPlayerStatus({ loading: false, error: '', data: result });
        }
      } catch (error) {
        if (active) {
          setPlayerStatus({
            loading: false,
            error: error instanceof Error ? error.message : 'Player tournament status could not be loaded.',
            data: null,
          });
        }
      }
    }

    loadPlayerStatus();
    const refreshTimer = setInterval(() => {
      loadBracket({ silent: true });
      loadSignupSummary({ silent: true });
      loadPlayerStatus({ silent: true });
    }, 15000);

    return () => {
      active = false;
      clearInterval(refreshTimer);
    };
  }, [slug, seededTournament]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 15000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    function syncTabToHash() {
      const nextTab = tabFromHash(globalThis.location?.hash);

      if (nextTab) {
        setActiveTab(nextTab);
      }
    }

    syncTabToHash();

    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('hashchange', syncTabToHash);
    }

    return () => {
      if (typeof globalThis.removeEventListener === 'function') {
        globalThis.removeEventListener('hashchange', syncTabToHash);
      }
    };
  }, [slug]);

  if (!tournament) {
    if (tournamentLookup.loading) {
      return (
        <HubScreen
          actions={[{ label: 'Home', href: '/' }]}
          eyebrow="Loading tournament"
          lead="Looking up this hosted tournament."
          subtitle="Host-posted events load from the tournament catalog."
          title="Loading event">
          <EmptyState
            body="One moment while the event details load."
            title="Checking tournament"
          />
        </HubScreen>
      );
    }

    return (
      <HubScreen
        actions={[{ label: 'Home', href: '/' }]}
        eyebrow="Tournament not found"
        lead="That tournament page is not available."
        subtitle="Add the event record or check the route."
        title="Unknown tournament">
        <EmptyState
          action={<ActionButton href="/">Back home</ActionButton>}
          body={tournamentLookup.error || 'The detail route is ready, but the matching tournament record still needs to be added.'}
          title="Nothing to display"
        />
      </HubScreen>
    );
  }

  const visibleTournament = liveTournament || tournament;
  const game = getGameBySlug(visibleTournament.gameSlug);
  const isPrimaryGame = game?.slug === siteData.site.primaryGameSlug;
  const gamePath = game ? getGamePath(game.slug) : null;
  const streams = (visibleTournament.streamSlugs || [])
    .map((streamSlug) => getStreamBySlug(streamSlug))
    .filter(Boolean);
  const checkInPath = getCheckInPath(visibleTournament.slug);
  const signInPath = getSignInPath(checkInPath);
  const tournamentPath = getTournamentPath(visibleTournament.slug);
  const registrationMeta = getEffectiveRegistrationStatus(visibleTournament, { hasLiveBracket: Boolean(liveBracket) });
  const matchStatusPath = `${tournamentPath}#my-match`;
  const result = getResultByTournamentSlug(visibleTournament.slug)
    || buildResultFromTournamentBracket(visibleTournament, liveBracket)
    || (visibleTournament.status === 'complete' ? getResultsForGame(visibleTournament.gameSlug)[0] || null : null);
  const playerHasReadyMatch = Boolean(playerStatus.data?.currentMatch);
  const isBracketLive = registrationMeta.reason === 'bracket-live' || Boolean(liveBracket);
  const showSignupSection = !isBracketLive;
  const bracketSectionTitle = liveBracket
    ? liveBracket.status === 'complete'
      ? 'Final bracket'
      : 'Live bracket'
    : 'Bracket preview';

  const primaryPlayerAction = getPlayerPrimaryAction({
    checkInPath,
    isBracketLive,
    matchStatusPath,
    playerStatus,
    registrationMeta,
    signInPath,
    tournamentPath,
  });
  const secondarySignInAction = getSecondarySignInAction(playerStatus, signInPath);
  const playerMatchAction = {
    label: playerHasReadyMatch ? 'Open My Match' : 'My Match',
    href: matchStatusPath,
    variant: primaryPlayerAction.href === matchStatusPath ? 'primary' : 'secondary',
  };
  const tournamentAction = isBracketLive
    ? { label: 'View Bracket', href: `${tournamentPath}#live-bracket`, variant: 'secondary' }
    : heroSignupAction(registrationMeta, checkInPath, tournamentPath);

  const heroActions = [
    primaryPlayerAction,
    primaryPlayerAction.href !== playerMatchAction.href ? (isBracketLive ? tournamentAction : playerMatchAction) : null,
    secondarySignInAction,
    streams.length ? { label: 'Watch', href: '/stream', variant: 'secondary' } : null,
    { label: 'Rules', href: '/rules', variant: 'secondary' },
  ].filter(Boolean);

  const quickLinks = (visibleTournament.links || []).filter((link) => link.href !== `/tournaments/${visibleTournament.slug}`);
  const advertisedRosterCap = getAdvertisedRosterCap(visibleTournament);
  const minimumPlayers = getMinimumPlayers(visibleTournament);
  const formatDetails = getTournamentFormatDetails(visibleTournament);
  const liveBracketSize = bracketSizeFromBracket(liveBracket, liveBracket?.participantCount || 0);
  const rosterBracketSize = actualBracketSizeFromSignups(signupSummary.count, minimumPlayers);

  return (
    <HubScreen
      actions={heroActions}
      eyebrow={game?.badge || 'Tournament'}
      footerNote={siteData.site.adminNote}
      heroVariant="compact"
      lead={visibleTournament.detail}
      subtitle={
        isPrimaryGame
          ? `Spades launch event • ${formatDateLine(visibleTournament.date, visibleTournament.timeZone, visibleTournament.timeZoneLabel)}`
          : formatDateLine(visibleTournament.date, visibleTournament.timeZone, visibleTournament.timeZoneLabel)
      }
      stickyActions
      showHero={false}
      showNavigation
      title={visibleTournament.title}>
      <TournamentLobbyHero
        advertisedRosterCap={advertisedRosterCap}
        checkInPath={checkInPath}
        countdownLabel={getCountdownLabel(visibleTournament, nowMs)}
        isBracketLive={isBracketLive}
        liveBracket={liveBracket}
        matchStatusPath={matchStatusPath}
        playerStatus={playerStatus}
        registrationMeta={registrationMeta}
        signInPath={signInPath}
        signupSummary={signupSummary}
        streams={streams}
        tournament={visibleTournament}
        tournamentPath={tournamentPath}
      />

      <PlayerStatusSpotlight
        isBracketLive={isBracketLive}
        liveBracket={liveBracket}
        playerStatus={playerStatus}
        primaryAction={primaryPlayerAction}
        registrationMeta={registrationMeta}
        result={result}
      />

      <TournamentArrivalRail
        checkInPath={checkInPath}
        isBracketLive={isBracketLive}
        matchStatusPath={matchStatusPath}
        playerHasReadyMatch={playerHasReadyMatch}
        playerStatus={playerStatus}
        registrationMeta={registrationMeta}
        signInPath={signInPath}
        tournamentPath={tournamentPath}
      />

      <TournamentEventConsole
        activeTab={activeTab}
        advertisedRosterCap={advertisedRosterCap}
        isBracketLive={isBracketLive}
        liveBracket={liveBracket}
        onSelectTab={setActiveTab}
        playerHasReadyMatch={playerHasReadyMatch}
        registrationMeta={registrationMeta}
        result={result}
        signupSummary={signupSummary}
      />

      <SponsorSoftwareStrip />

      {activeTab === 'play' ? (
        <>
          <LiveBroadcastStrip
            isBracketLive={isBracketLive}
            nextMatch={getNextPublicMatch(liveBracket)}
            streams={streams}
          />

          <TournamentTimeline
            steps={buildTournamentTimeline({
              isBracketLive,
              liveBracket,
              playerHasReadyMatch,
              registrationMeta,
              result,
            })}
          />

          <Section
            description="Account status, table access, roster size, and bracket state in one scan."
            nativeID="my-match"
            title="Player command center">
            <View style={styles.playerCommandGrid}>
              <View style={styles.playerCommandStatus}>
                <PlayerTournamentStatus
                  checkInPath={checkInPath}
                  playerStatus={playerStatus}
                  signInPath={signInPath}
                  slug={visibleTournament.slug}
                />
              </View>
              <View style={styles.playerCommandDashboard}>
                <TournamentDashboard
                  advertisedRosterCap={advertisedRosterCap}
                  checkInPath={checkInPath}
                  isBracketLive={isBracketLive}
                  liveBracket={liveBracket}
                  matchStatusPath={matchStatusPath}
                  minimumPlayers={minimumPlayers}
                  playerStatus={playerStatus}
                  registrationMeta={registrationMeta}
                  signInPath={signInPath}
                  signupSummary={signupSummary}
                  streams={streams}
                  tournament={visibleTournament}
                />
              </View>
            </View>
          </Section>

          <Section
            description="Format, player requirement, and bracket expectations before you join."
            title="Tournament format">
            <TournamentFormatCard
              advertisedRosterCap={advertisedRosterCap}
              formatDetails={formatDetails}
              isBracketLive={isBracketLive}
              liveBracket={liveBracket}
              minimumPlayers={minimumPlayers}
              signupSummary={signupSummary}
              tournament={visibleTournament}
            />
          </Section>
        </>
      ) : null}

      {activeTab === 'roster' ? (
        <>
          <TournamentTabCommandCard
            body={
              isBracketLive
                ? 'Confirm who made the published bracket, then jump to your match or the live view.'
                : 'Use this roster to confirm signups before the host seeds the bracket.'
            }
            primary={primaryPlayerAction}
            secondary={{ label: 'My Match', href: matchStatusPath }}
            stats={[
              { label: 'Registered', value: seatLabel(signupSummary.count, advertisedRosterCap, signupSummary.loading) },
              { label: 'Bracket', value: liveBracket ? `${liveBracket.participantCount || 0} seeded` : bracketSizeLabel(rosterBracketSize) },
              { label: 'Status', value: liveBracket ? 'Published' : registrationMeta.label },
            ]}
            title="Roster control"
          />

          <Section
            description={
              isBracketLive
                ? 'Players can confirm they are in the published bracket before opening the table.'
                : 'Players can confirm their name is on the signup roster before the host seeds the bracket.'
            }
            nativeID="registered-players"
            title="Current roster">
            <RegisteredPlayersPanel
              advertisedRosterCap={advertisedRosterCap}
              liveBracket={liveBracket}
              liveBracketSize={liveBracketSize}
              minimumPlayers={minimumPlayers}
              rosterBracketSize={rosterBracketSize}
              signupSummary={signupSummary}
              tournament={visibleTournament}
            />
          </Section>

          {showSignupSection ? (
            <Section
              description={registrationMeta.actionCopy}
              title="Registration">
              <CheckInPanel
                checkIn={visibleTournament.checkIn}
                checkInPath={checkInPath}
                registrationMeta={registrationMeta}
                signupCount={signupSummary.count}
                signupEnabled={registrationMeta.value === 'open'}
                signupError={signupSummary.error}
                signupLoading={signupSummary.loading}
              />
            </Section>
          ) : null}
        </>
      ) : null}

      {activeTab === 'bracket' ? (
        <>
          <TournamentTabCommandCard
            body={
              isBracketLive
                ? 'Follow the active match flow, table links, winners, and bracket status.'
                : 'Bracket preview is ready. Live table links appear after the host publishes the bracket.'
            }
            primary={primaryPlayerAction.href === matchStatusPath ? primaryPlayerAction : { label: 'My Match', href: matchStatusPath }}
            secondary={streams.length ? { label: 'Watch', href: '/stream' } : { label: 'Roster', href: `${tournamentPath}#registered-players` }}
            stats={[
              { label: 'Bracket', value: liveBracket ? 'Live' : 'Preview' },
              { label: 'Players', value: liveBracket ? String(liveBracket.participantCount || 0) : seatLabel(signupSummary.count, advertisedRosterCap, signupSummary.loading) },
              { label: 'Next', value: getNextPublicMatch(liveBracket)?.label || 'After seed' },
            ]}
            title="Bracket control"
          />

          {liveBracket ? (
            <Section
              description="Match cards show assigned players, winners, and Spades room links."
              nativeID="live-bracket"
              title={bracketSectionTitle}>
              <LiveBracketBoard bracket={liveBracket} />
            </Section>
          ) : null}

          {!liveBracket ? (
            <Section
              description="After the host generates a bracket, match cards show the assigned players and Spades room links."
              nativeID="live-bracket"
              title={bracketSectionTitle}>
              <BracketBoard bracket={visibleTournament.bracket} />
              {bracketState.error ? <Text style={styles.bracketLoadNote}>{bracketState.error}</Text> : null}
              {!bracketState.loading && !bracketState.error ? (
                <Text style={styles.bracketLoadNote}>No live bracket has been published yet.</Text>
              ) : null}
            </Section>
          ) : null}

          <Section description="Quick paths for players and viewers." title="Event links">
            <View style={styles.quickGrid}>
              {!isBracketLive ? (
                <QuickActionCard
                  actionLabel={primaryPlayerAction.label}
                  body="Use this before the bracket is seeded."
                  href={primaryPlayerAction.href}
                  meta={signupCountLabel(signupSummary.count, signupSummary.loading)}
                  title="Player signup"
                  tone="green"
                />
              ) : null}
              <QuickActionCard
                actionLabel={playerHasReadyMatch ? 'Open My Match' : 'My Match'}
                body={
                  isBracketLive
                    ? 'Open your assigned table from your signed-in tournament account.'
                    : 'Jump to your account-linked status card and current match once the bracket is live.'
                }
                href={matchStatusPath}
                meta="Player"
                title="Match status"
                tone="green"
              />
              {streams.length ? (
                <QuickActionCard
                  actionLabel="Watch table"
                  body="Open the spectator table for the current match."
                  href="/stream"
                  meta="Spectator"
                  title="Watch Tournament"
                  tone="blue"
                />
              ) : null}
            </View>
          </Section>
        </>
      ) : null}

      {activeTab === 'info' ? (
        <>
          <Section description="Format, entry rules, and event notes." title="Event snapshot">
            <Surface style={styles.snapshotCard}>
              <Text style={styles.snapshotLabel}>{visibleTournament.summary}</Text>
              <Text style={styles.snapshotCopy}>{visibleTournament.entryLine}</Text>
              {visibleTournament.callout ? <Text style={styles.snapshotCallout}>{visibleTournament.callout}</Text> : null}
              <BulletList items={visibleTournament.highlights} />
            </Surface>
          </Section>

          <Section description="How this event will be seeded and played." title="Tournament format">
            <TournamentFormatCard
              advertisedRosterCap={advertisedRosterCap}
              formatDetails={formatDetails}
              isBracketLive={isBracketLive}
              liveBracket={liveBracket}
              minimumPlayers={minimumPlayers}
              signupSummary={signupSummary}
              tournament={visibleTournament}
            />
          </Section>

          {isPrimaryGame && gamePath ? (
            <Section
              description="Use the account-linked match card once the bracket is live."
              title="Match access">
              <Surface style={styles.launchCard}>
                <View style={styles.launchTopRow}>
                  <Badge tone="accent">Ticket path</Badge>
                  <Text style={styles.launchPath}>Match status</Text>
                </View>
                <Text style={styles.launchTitle}>Open gameplay from your tournament seat</Text>
                <Text style={styles.launchCopy}>
                  The hub checks your player account, creates the match ticket, and then sends you to the Spades table.
                </Text>
                <View style={styles.launchActions}>
                  <ActionButton href={matchStatusPath}>My Match</ActionButton>
                  <ActionButton href="/stream" variant="secondary">
                    Watch
                  </ActionButton>
                </View>
              </Surface>
            </Section>
          ) : null}

          {quickLinks.length ? (
            <Section description="Useful tournament paths in one place." title="Quick links">
              <View style={styles.linkRow}>
                {quickLinks.map((link) => (
                  <View key={link.href} style={styles.linkButton}>
                    <ActionButton href={link.href} variant="secondary">
                      {link.label}
                    </ActionButton>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          <Section description="Agenda items are shown in order so check-in and start times are easy to scan." title="Agenda">
            <AgendaList items={visibleTournament.agenda} />
          </Section>

          <Section description="Use this section for the active live table and the replay archive." title="Watch and replay">
            {streams.map((stream) => (
              <StreamCard key={stream.slug} stream={stream} />
            ))}
            {!streams.length ? (
              <EmptyState
                action={<ActionButton href="/stream">Watch</ActionButton>}
                body="Add a stream slug to the tournament record and the cards will appear here."
                title="No live links are assigned yet"
              />
            ) : null}
          </Section>

          <Section description="Rules stay close to the event so admins can update one record at a time." title="Game rules">
            {game?.ruleSections?.map((section) => (
              <View key={section.title} style={styles.block}>
                <RuleBlock section={section} />
              </View>
            ))}
          </Section>

          <Section description="Completed events show final standings here." title="Results">
            {result ? (
              <ResultCard result={result} />
            ) : (
              <EmptyState
                action={<ActionButton href="/results">Open results page</ActionButton>}
                body="Results will appear here once the tournament closes and the result record is added."
                title="Results are not posted yet"
              />
            )}
          </Section>
        </>
      ) : null}
    </HubScreen>
  );
}

function SponsorSoftwareStrip() {
  const software = getSponsorSoftware();

  if (!software) {
    return null;
  }

  return (
    <Surface style={styles.sponsorSoftwareStrip}>
      <View style={styles.sponsorSoftwareCopy}>
        <Badge tone="accent">{software.eyebrow}</Badge>
        <Text style={styles.sponsorSoftwareTitle}>{software.title}</Text>
        <Text style={styles.sponsorSoftwareBody}>{software.summary}</Text>
      </View>
      <View style={styles.sponsorSoftwareActions}>
        <ActionButton href="/sponsors">Sponsor page</ActionButton>
        <ActionButton href="/media-kit" variant="secondary">Media kit</ActionButton>
        <ActionButton href="/admin/sponsors" variant="secondary">Host CRM</ActionButton>
      </View>
    </Surface>
  );
}

function LiveBroadcastStrip({ isBracketLive, nextMatch, streams }) {
  const liveStream = streams.find((stream) => stream.kind === 'live') || streams[0];
  const twitchHref = liveStream?.href || downloadLinks.twitch || '/live';
  const discordHref = downloadLinks.discord || '/live';

  return (
    <Surface style={styles.broadcastStrip}>
      <View style={styles.broadcastStatus}>
        <View style={[styles.broadcastDot, isBracketLive && styles.broadcastDotLive]} />
        <View style={styles.broadcastCopy}>
          <Text style={styles.broadcastEyebrow}>{isBracketLive ? 'Live tournament hub' : 'Stream-day hub'}</Text>
          <Text style={styles.broadcastTitle}>
            {nextMatch ? `Next: ${matchPlayersLabel(nextMatch)}` : 'Twitch, Discord, bracket, and signups stay one tap away.'}
          </Text>
        </View>
      </View>
      <View style={styles.broadcastActions}>
        <ActionButton external href={twitchHref} variant="secondary">Twitch</ActionButton>
        <ActionButton external={Boolean(downloadLinks.discord)} href={discordHref} variant="secondary">
          Discord
        </ActionButton>
        <ActionButton href="/stream">Watch</ActionButton>
      </View>
    </Surface>
  );
}

function getConsolePhase({ isBracketLive, registrationMeta, result }) {
  if (result) return { label: 'Results posted', tone: 'green' };
  if (isBracketLive) return { label: 'Bracket live', tone: 'accent' };
  return { label: registrationMeta.label, tone: registrationMeta.tone };
}

function TournamentEventConsole({
  activeTab,
  advertisedRosterCap,
  isBracketLive,
  liveBracket,
  onSelectTab,
  playerHasReadyMatch,
  registrationMeta,
  result,
  signupSummary,
}) {
  const active = TOURNAMENT_TABS.find((tab) => tab.id === activeTab) || TOURNAMENT_TABS[0];
  const phase = getConsolePhase({ isBracketLive, registrationMeta, result });
  const rosterValue = signupSummary.loading ? '--' : `${signupSummary.count}/${advertisedRosterCap}`;
  const bracketValue = liveBracket ? `${liveBracket.participantCount || 0} seeded` : 'Pending';
  const matchValue = playerHasReadyMatch ? 'Ready' : isBracketLive ? 'Check' : 'After seed';

  return (
    <Surface style={styles.eventConsole}>
      <View style={styles.eventConsoleTopRow}>
        <View style={styles.eventConsoleCopy}>
          <View style={styles.eventConsoleBadgeRow}>
            <Badge tone={phase.tone}>{phase.label}</Badge>
            <Text style={styles.eventConsoleMeta}>Event console</Text>
          </View>
          <Text style={styles.eventConsoleTitle}>{active.label}</Text>
          <Text style={styles.eventConsoleBody}>{active.body}</Text>
        </View>
      </View>
      <TournamentTabs activeTab={activeTab} onSelectTab={onSelectTab} />
      <View style={styles.eventConsoleSignals}>
        <View style={styles.eventSignal}>
          <Text style={styles.eventSignalLabel}>Roster</Text>
          <Text style={styles.eventSignalValue}>{rosterValue}</Text>
        </View>
        <View style={styles.eventSignal}>
          <Text style={styles.eventSignalLabel}>Bracket</Text>
          <Text style={styles.eventSignalValue}>{bracketValue}</Text>
        </View>
        <View style={[styles.eventSignal, playerHasReadyMatch && styles.eventSignalReady]}>
          <Text style={styles.eventSignalLabel}>Match</Text>
          <Text style={[styles.eventSignalValue, playerHasReadyMatch && styles.eventSignalValueReady]}>{matchValue}</Text>
        </View>
      </View>
    </Surface>
  );
}

function TournamentTabs({ activeTab, onSelectTab }) {
  return (
    <View style={styles.tournamentTabBar}>
      {TOURNAMENT_TABS.map((tab) => {
        const selected = activeTab === tab.id;

        return (
          <ActionButton
            key={tab.id}
            onPress={() => onSelectTab(tab.id)}
            style={styles.tournamentTabButton}
            variant={selected ? 'primary' : 'secondary'}>
            {tab.label}
          </ActionButton>
        );
      })}
    </View>
  );
}

function TournamentTimeline({ steps }) {
  return (
    <Surface style={styles.timelineCard}>
      <View style={styles.timelineTrack}>
        {steps.map((step, index) => (
          <View key={step.key} style={styles.timelineStep}>
            <View style={[
              styles.timelineMarker,
              step.state === 'done' && styles.timelineMarkerDone,
              step.state === 'active' && styles.timelineMarkerActive,
            ]}>
              <Text style={[
                styles.timelineMarkerText,
                step.state === 'active' && styles.timelineMarkerTextActive,
              ]}>
                {index + 1}
              </Text>
            </View>
            <View style={styles.timelineCopy}>
              <Text style={styles.timelineLabel}>{step.label}</Text>
              <Text style={[
                styles.timelineValue,
                step.state === 'active' && styles.timelineValueActive,
                step.state === 'done' && styles.timelineValueDone,
              ]}>
                {step.value}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Surface>
  );
}

function TournamentArrivalRail({
  checkInPath,
  isBracketLive,
  matchStatusPath,
  playerHasReadyMatch,
  playerStatus,
  registrationMeta,
  signInPath,
  tournamentPath,
}) {
  const steps = getArrivalSteps({ isBracketLive, playerHasReadyMatch, registrationMeta });
  const primaryAction = getPlayerPrimaryAction({
    checkInPath,
    isBracketLive,
    matchStatusPath,
    playerStatus,
    registrationMeta,
    signInPath,
    tournamentPath,
  });
  const signInAction = getSecondarySignInAction(playerStatus, signInPath);

  return (
    <Surface style={styles.arrivalRail}>
      <View style={styles.arrivalHeader}>
        <View style={styles.arrivalHeaderCopy}>
          <Text style={styles.arrivalEyebrow}>Arriving from Twitch</Text>
          <Text style={styles.arrivalTitle}>Start here</Text>
        </View>
        <View style={styles.arrivalActions}>
          <ActionButton href={primaryAction.href}>{primaryAction.label}</ActionButton>
          {signInAction ? <ActionButton href={signInAction.href} variant="secondary">{signInAction.label}</ActionButton> : null}
          <ActionButton href="/stream" variant="secondary">Watch</ActionButton>
        </View>
      </View>

      <View style={styles.arrivalGrid}>
        {steps.map((step) => (
          <View key={step.title} style={styles.arrivalStep}>
            <Text style={styles.arrivalStepLabel}>{step.label}</Text>
            <Text style={styles.arrivalStepTitle}>{step.title}</Text>
            <Text style={styles.arrivalStepBody}>{step.body}</Text>
          </View>
        ))}
      </View>

      <View style={styles.arrivalCommandRow}>
        <Text style={styles.arrivalCommandLabel}>Twitch commands</Text>
        {TWITCH_VIEWER_COMMANDS.map((command) => (
          <Text key={command} selectable style={styles.arrivalCommandChip}>{command}</Text>
        ))}
      </View>
    </Surface>
  );
}

function TournamentLobbyHero({
  advertisedRosterCap,
  checkInPath,
  countdownLabel,
  isBracketLive,
  liveBracket,
  matchStatusPath,
  playerStatus,
  registrationMeta,
  signInPath,
  signupSummary,
  streams,
  tournament,
  tournamentPath,
}) {
  const { width } = useWindowDimensions();
  const isPhone = width > 0 && width < 420;
  const signups = signupSummary.signups || [];
  const signupCount = signupSummary.loading ? '--' : `${signupSummary.count}/${advertisedRosterCap}`;
  const openSeats = signupSummary.loading ? '--' : String(getOpenSeats(signupSummary.count, advertisedRosterCap));
  const nextMatch = getNextPublicMatch(liveBracket);
  const primaryAction = getPlayerPrimaryAction({
    checkInPath,
    isBracketLive,
    matchStatusPath,
    playerStatus,
    registrationMeta,
    signInPath,
    tournamentPath,
  });
  const signInAction = getSecondarySignInAction(playerStatus, signInPath);

  return (
    <Surface style={styles.lobbyCard}>
      <View style={styles.lobbyBadgeRow}>
        <Badge tone={liveBracket ? 'green' : registrationMeta.tone}>
          {liveBracket ? 'Bracket live' : registrationMeta.label}
        </Badge>
        <Text style={styles.lobbyDate}>
          {formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)}
        </Text>
      </View>

      <View style={[styles.lobbyCountdownPanel, isPhone && styles.lobbyCountdownPanelPhone]}>
        <View style={styles.lobbyCopy}>
          <Text style={styles.lobbyCountdownLabel}>Starts in</Text>
          <Text style={[styles.lobbyCountdownValue, isPhone && styles.lobbyCountdownValuePhone]}>{countdownLabel}</Text>
          <Text style={styles.lobbyTitle}>Tournament lobby</Text>
          <Text style={styles.lobbySummary}>
            {tournament.format} | {tournament.location} | {tournament.entryLine}
          </Text>
        </View>
        <View style={[styles.lobbyActions, isPhone && styles.lobbyActionsPhone]}>
          <ActionButton href={primaryAction.href}>{primaryAction.label}</ActionButton>
          {primaryAction.href !== matchStatusPath ? <ActionButton href={matchStatusPath} variant="secondary">My Match</ActionButton> : null}
          {signInAction ? <ActionButton href={signInAction.href} variant="secondary">{signInAction.label}</ActionButton> : null}
          {streams.length ? <ActionButton href="/stream" variant="secondary">Watch</ActionButton> : null}
        </View>
      </View>

      <View style={styles.lobbyGrid}>
        <View style={styles.lobbyMetric}>
          <Text style={styles.lobbyMetricLabel}>Signed up</Text>
          <Text style={styles.lobbyMetricValue}>
            {signupCount}
          </Text>
        </View>
        <View style={styles.lobbyMetric}>
          <Text style={styles.lobbyMetricLabel}>Open seats</Text>
          <Text style={styles.lobbyMetricValue}>{openSeats}</Text>
        </View>
        <View style={[styles.lobbyMetric, styles.lobbyMatchMetric]}>
          <Text style={styles.lobbyMetricLabel}>{nextMatch ? nextMatch.label || 'Up next' : 'Match focus'}</Text>
          <Text numberOfLines={1} style={styles.lobbyMatchText}>
            {nextMatch ? matchPlayersLabel(nextMatch) : 'Waiting for seeding'}
          </Text>
        </View>
      </View>

      <View style={styles.lobbyRosterPreview}>
        <View style={styles.lobbyRosterHeader}>
          <Text style={styles.lobbyRosterTitle}>Who is in</Text>
          <Text style={styles.lobbyRosterMeta}>
            {signupSummary.loading ? 'Loading roster' : `${signups.length} visible`}
          </Text>
        </View>
        <View style={styles.lobbyRosterChips}>
          {signupSummary.loading ? (
            <Text style={styles.lobbyEmpty}>Loading players...</Text>
          ) : signups.length ? (
            signups.slice(0, 8).map((signup, index) => (
              <View key={signup.id || `${signup.playerName}-${index}`} style={styles.lobbyPlayerChip}>
                <Text numberOfLines={1} style={styles.lobbyPlayerText}>{signup.playerName || 'Player'}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.lobbyEmpty}>No public signups yet. Keep the join link visible.</Text>
          )}
          {signups.length > 8 ? <Text style={styles.lobbyMore}>+{signups.length - 8} more</Text> : null}
        </View>
      </View>
    </Surface>
  );
}

function dashboardStatusCopy({ isBracketLive, playerStatus, registrationMeta }) {
  const data = playerStatus.data;

  if (playerStatus.loading) {
    return 'Checking your player account and current match...';
  }

  if (data?.currentMatch) {
    return 'Your match is ready. Open it from this page, then return here for bracket and result status.';
  }

  if (isBracketLive) {
    return data?.signup
      ? 'You are in the tournament. Watch this page for your assigned table.'
      : 'The bracket is live. Sign in with the account used for signup to find your match.';
  }

  if (registrationMeta.value === 'open') {
    return data?.signup
      ? 'You are already on the roster. The host will publish match links when the bracket is ready.'
      : 'Create or sign in to an account, then join the roster before the bracket is seeded.';
  }

  return registrationMeta.actionCopy;
}

function dashboardTitleCopy({ currentMatch, isBracketLive, playerStatus }) {
  const { account, signup } = getPlayerAccountState(playerStatus);

  if (currentMatch) return 'Your table is ready.';
  if (signup) return 'You are on the roster.';
  if (!account) return 'Sign in to reserve your seat.';
  if (isBracketLive) return 'Find your assigned match.';
  return 'Join before the bracket is seeded.';
}

function TournamentDashboard({
  advertisedRosterCap,
  checkInPath,
  isBracketLive,
  liveBracket,
  matchStatusPath,
  minimumPlayers,
  playerStatus,
  registrationMeta,
  signInPath,
  signupSummary,
  streams,
  tournament,
}) {
  const data = playerStatus.data;
  const currentMatch = data?.currentMatch || null;
  const tournamentPath = getTournamentPath(tournament.slug);
  const registeredLabel = seatLabel(signupSummary.count, advertisedRosterCap, signupSummary.loading);
  const bracketLabel = liveBracket
    ? `${liveBracket.participantCount || 0} seeded`
    : actualBracketPreviewLabel(signupSummary.count, minimumPlayers, signupSummary.loading);
  const primaryAction = getPlayerPrimaryAction({
    checkInPath,
    isBracketLive,
    matchStatusPath,
    playerStatus,
    registrationMeta,
    signInPath,
    tournamentPath,
  });
  const signInAction = getSecondarySignInAction(playerStatus, signInPath);

  return (
    <Surface style={styles.dashboardCard}>
      <View style={styles.dashboardTopRow}>
        <View style={styles.dashboardCopy}>
          <Badge tone={currentMatch ? 'green' : isBracketLive ? 'accent' : registrationMeta.tone}>
            {currentMatch ? 'Match ready' : isBracketLive ? 'Bracket live' : registrationMeta.label}
          </Badge>
          <Text style={styles.dashboardTitle}>
            {dashboardTitleCopy({ currentMatch, isBracketLive, playerStatus })}
          </Text>
          <Text style={styles.dashboardText}>
            {dashboardStatusCopy({ isBracketLive, playerStatus, registrationMeta })}
          </Text>
        </View>

        <View style={styles.dashboardActions}>
          <ActionButton href={primaryAction.href}>{primaryAction.label}</ActionButton>
          {signInAction ? <ActionButton href={signInAction.href} variant="secondary">{signInAction.label}</ActionButton> : null}
          <ActionButton href={`${tournamentPath}${isBracketLive ? '#live-bracket' : '#registered-players'}`} variant="secondary">
            {isBracketLive ? 'Bracket' : 'Roster'}
          </ActionButton>
          {streams.length ? (
            <ActionButton href="/stream" variant="secondary">
              Watch
            </ActionButton>
          ) : null}
        </View>
      </View>

      <View style={styles.dashboardGrid}>
        <View style={styles.dashboardTile}>
          <Text style={styles.dashboardTileLabel}>Registered</Text>
          <Text style={styles.dashboardTileValue}>{registeredLabel}</Text>
          <Text style={styles.dashboardTileMeta}>advertised seats</Text>
        </View>
        <View style={styles.dashboardTile}>
          <Text style={styles.dashboardTileLabel}>Bracket</Text>
          <Text style={styles.dashboardTileValue}>{bracketLabel}</Text>
          <Text style={styles.dashboardTileMeta}>{liveBracket ? 'live bracket' : 'actual if seeded now'}</Text>
        </View>
        <View style={styles.dashboardTile}>
          <Text style={styles.dashboardTileLabel}>Minimum</Text>
          <Text style={styles.dashboardTileValue}>{minimumPlayers}</Text>
          <Text style={styles.dashboardTileMeta}>players to run</Text>
        </View>
      </View>

      <View style={styles.dashboardPolicy}>
        <Text style={styles.dashboardPolicyText}>
          {rosterPolicyCopy(tournament, advertisedRosterCap, minimumPlayers)}
        </Text>
      </View>
    </Surface>
  );
}

function TournamentFormatCard({
  advertisedRosterCap,
  formatDetails,
  isBracketLive,
  liveBracket,
  minimumPlayers,
  signupSummary,
  tournament,
}) {
  const signupValue = signupSummary.loading ? 'Loading' : `${signupSummary.count}/${advertisedRosterCap}`;
  const bracketValue = liveBracket
    ? `${liveBracket.participantCount || 0} seeded`
    : actualBracketPreviewLabel(signupSummary.count, minimumPlayers, signupSummary.loading);
  const statusLabel = isBracketLive ? 'Bracket live' : 'Before seeding';

  return (
    <Surface style={styles.formatCard}>
      <View style={styles.formatTopRow}>
        <View style={styles.formatCopy}>
          <Badge tone={isBracketLive ? 'green' : 'accent'}>{formatDetails.rhythm}</Badge>
          <Text style={styles.formatTitle}>{formatDetails.mode.label}</Text>
          <Text style={styles.formatBody}>{formatDetails.mode.summary}</Text>
        </View>
        <View style={styles.formatStats}>
          <View style={styles.formatStat}>
            <Text style={styles.formatStatLabel}>Requirement</Text>
            <Text style={styles.formatStatValue}>{formatDetails.requirement}</Text>
          </View>
          <View style={styles.formatStat}>
            <Text style={styles.formatStatLabel}>Signed up</Text>
            <Text style={styles.formatStatValue}>{signupValue}</Text>
          </View>
          <View style={styles.formatStat}>
            <Text style={styles.formatStatLabel}>Bracket</Text>
            <Text style={styles.formatStatValue}>{bracketValue}</Text>
          </View>
        </View>
      </View>

      <View style={styles.formatRules}>
        {formatDetails.bullets.map((item) => (
          <View key={item} style={styles.formatRule}>
            <Text style={styles.formatRuleMarker}>•</Text>
            <Text style={styles.formatRuleText}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.formatFooter}>
        <Badge tone={isBracketLive ? 'green' : 'blue'}>{statusLabel}</Badge>
        <Text style={styles.formatFooterText}>
          {rosterPolicyCopy(tournament, advertisedRosterCap, minimumPlayers)}
        </Text>
      </View>
    </Surface>
  );
}

function TournamentTabCommandCard({ body, primary, secondary, stats, title }) {
  return (
    <Surface style={styles.tabCommandCard}>
      <View style={styles.tabCommandTopRow}>
        <View style={styles.tabCommandCopy}>
          <Text style={styles.tabCommandLabel}>Player path</Text>
          <Text style={styles.tabCommandTitle}>{title}</Text>
          <Text style={styles.tabCommandBody}>{body}</Text>
        </View>
        <View style={styles.tabCommandActions}>
          {primary ? <ActionButton href={primary.href}>{primary.label}</ActionButton> : null}
          {secondary ? <ActionButton href={secondary.href} variant="secondary">{secondary.label}</ActionButton> : null}
        </View>
      </View>
      <View style={styles.tabCommandStats}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.tabCommandStat}>
            <Text style={styles.tabCommandStatLabel}>{stat.label}</Text>
            <Text numberOfLines={1} style={styles.tabCommandStatValue}>{stat.value}</Text>
          </View>
        ))}
      </View>
    </Surface>
  );
}

function playerLabel(player) {
  if (!player) return 'TBD';
  return player.handle ? `${player.name} (${player.handle})` : player.name;
}

function statusTone(nextStep) {
  if (nextStep === 'ready-match' || nextStep === 'champion') return 'green';
  if (nextStep === 'sign-in' || nextStep === 'sign-up') return 'accent';
  if (nextStep === 'eliminated' || nextStep === 'complete') return 'neutral';
  return 'blue';
}

function statusBadgeLabel(nextStep) {
  switch (nextStep) {
    case 'sign-in':
      return 'Sign in needed';
    case 'sign-up':
      return 'Not registered';
    case 'ready-match':
      return 'Match ready';
    case 'wait-opponent':
      return 'Waiting';
    case 'eliminated':
      return 'Finished';
    case 'champion':
      return 'Champion';
    case 'complete':
      return 'Complete';
    default:
      return 'Checking';
  }
}

function playerSpotlightTitle(playerStatus, result) {
  const data = playerStatus.data;

  if (playerStatus.loading) return 'Checking your tournament status...';
  if (data?.currentMatch) return 'Your match is ready.';
  if (data?.nextStep === 'champion') return 'You are the champion.';
  if (result || data?.nextStep === 'complete') return 'Tournament results are posted.';
  if (data?.signup) return 'You are signed up.';
  if (data?.account) return 'Join the roster to play.';
  return 'Create an account to join.';
}

function playerSpotlightBody(playerStatus, isBracketLive, registrationMeta) {
  const data = playerStatus.data;
  const accountName = data?.account?.playerName || '';
  const signupName = data?.signup?.playerName || '';

  if (playerStatus.loading) return 'One moment while we check this browser for a player account and roster seat.';
  if (data?.currentMatch) return 'Open your assigned Spades table from My Match, then return here after the game.';
  if (data?.nextStep === 'champion') return 'Nice. The bracket has you marked as tournament winner.';
  if (data?.nextStep === 'complete') return 'This event is complete. You can review the final bracket and results.';
  if (signupName) return `${signupName} is on the roster. The host will publish match links when the bracket is ready.`;
  if (accountName && registrationMeta.value === 'open') return `${accountName} is signed in. Join this tournament to reserve a roster seat.`;
  if (accountName && isBracketLive) return `${accountName} is signed in, but this bracket is already live. Check with the host if you expected a seat.`;
  if (registrationMeta.value === 'open') return 'Sign in or create an account, then reserve your spot on the tournament roster.';
  return registrationMeta.actionCopy || 'Registration is not open right now.';
}

function PlayerStatusSpotlight({
  isBracketLive,
  liveBracket,
  playerStatus,
  primaryAction,
  registrationMeta,
  result,
}) {
  const data = playerStatus.data || {};
  const currentMatch = data.currentMatch || null;
  const accountName = data.account?.playerName || '';
  const signupName = data.signup?.playerName || '';
  const steps = [
    {
      label: 'Account',
      value: accountName || 'Needed',
      tone: accountName ? 'green' : 'accent',
      done: Boolean(accountName),
    },
    {
      label: 'Roster',
      value: signupName ? 'Signed up' : 'Not joined',
      tone: signupName ? 'green' : accountName ? 'accent' : 'blue',
      done: Boolean(signupName),
    },
    {
      label: 'Bracket',
      value: liveBracket ? 'Live' : 'Waiting',
      tone: liveBracket ? 'green' : signupName ? 'accent' : 'blue',
      done: Boolean(liveBracket),
    },
    {
      label: 'Match',
      value: currentMatch ? 'Ready' : 'Waiting',
      tone: currentMatch ? 'green' : liveBracket ? 'accent' : 'blue',
      done: Boolean(currentMatch),
    },
    {
      label: 'Results',
      value: result ? 'Posted' : 'After final',
      tone: result ? 'green' : 'blue',
      done: Boolean(result),
    },
  ];
  const actionLabel = currentMatch ? 'Play My Match' : primaryAction?.label || 'Next Step';
  const matchPlayers = currentMatch?.players?.map(playerLabel).filter(Boolean).join(' vs ') || 'Assigned players';

  return (
    <Surface style={[styles.statusSpotlight, currentMatch && styles.statusSpotlightReady]}>
      <View style={styles.statusSpotlightTopRow}>
        <View style={styles.statusSpotlightCopy}>
          <Badge tone={statusTone(data.nextStep)}>{statusBadgeLabel(data.nextStep)}</Badge>
          <Text style={styles.statusSpotlightTitle}>{playerSpotlightTitle(playerStatus, result)}</Text>
          <Text style={styles.statusSpotlightBody}>
            {playerSpotlightBody(playerStatus, isBracketLive, registrationMeta)}
          </Text>
        </View>
        <View style={styles.statusSpotlightAction}>
          {!currentMatch && primaryAction?.href ? <ActionButton href={primaryAction.href}>{actionLabel}</ActionButton> : null}
          <ActionButton href="/rules" variant="secondary">Rules</ActionButton>
        </View>
      </View>
      {currentMatch && primaryAction?.href ? (
        <View style={styles.statusSpotlightMatchCallout}>
          <View style={styles.statusSpotlightMatchCopy}>
            <Text style={styles.statusSpotlightMatchLabel}>Ready now</Text>
            <Text style={styles.statusSpotlightMatchTitle}>
              {currentMatch.round.title} • {currentMatch.label}
            </Text>
            <Text style={styles.statusSpotlightMatchPlayers}>{matchPlayers}</Text>
          </View>
          <ActionButton href={primaryAction.href} style={styles.statusSpotlightPlayButton}>
            Play My Match
          </ActionButton>
        </View>
      ) : null}
      <View style={styles.statusSpotlightSteps}>
        {steps.map((step, index) => (
          <View
            key={step.label}
            style={[
              styles.statusSpotlightStep,
              step.done && styles.statusSpotlightStepDone,
              currentMatch && step.label === 'Match' && styles.statusSpotlightStepReady,
            ]}>
            <Text style={[styles.statusSpotlightStepNumber, step.done && styles.statusSpotlightStepNumberDone]}>
              {index + 1}
            </Text>
            <View style={styles.statusSpotlightStepCopy}>
              <Text style={styles.statusSpotlightStepLabel}>{step.label}</Text>
              <Text numberOfLines={1} style={styles.statusSpotlightStepValue}>{step.value}</Text>
            </View>
          </View>
        ))}
      </View>
    </Surface>
  );
}

function playerStatusActionLabel(data, currentMatch) {
  if (currentMatch) return 'Open My Match';
  if (!data?.account) return 'Sign in to Join';
  if (!data?.signup) return 'Join Tournament';
  return 'My Match';
}

function PlayerTournamentStatus({ checkInPath, playerStatus, signInPath, slug }) {
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const data = playerStatus.data;
  const currentMatch = data?.currentMatch || null;
  const signedInName = data?.account?.playerName || '';
  const signupName = data?.signup?.playerName || '';

  async function handlePlayMyMatch() {
    if (!currentMatch) return;
    setOpenError('');
    setOpening(true);

    try {
      const result = await issueTournamentMatchTicket({
        slug,
        matchId: currentMatch.id,
      });

      if (result.roomUrl && globalThis.location?.assign) {
        globalThis.location.assign(result.roomUrl);
      }
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : 'Match access could not be opened.');
    } finally {
      setOpening(false);
    }
  }

  return (
    <Surface style={[styles.playerStatusCard, currentMatch && styles.playerStatusCardReady]}>
      <View style={styles.playerStatusTopRow}>
        <Badge tone={statusTone(data?.nextStep)}>{statusBadgeLabel(data?.nextStep)}</Badge>
        <Text style={styles.playerStatusMeta}>
          {playerStatus.loading
            ? 'Checking account'
            : signedInName
              ? `Signed in as ${signedInName}`
              : 'No player account signed in'}
        </Text>
      </View>

      <Text style={styles.playerStatusTitle}>
        {playerStatus.loading ? 'Checking your tournament status...' : data?.statusLabel || 'Status unavailable'}
      </Text>

      {playerStatus.error ? <Text style={styles.playerStatusWarning}>{playerStatus.error}</Text> : null}
      {openError ? <Text style={styles.playerStatusWarning}>{openError}</Text> : null}

      {data?.signup ? (
        <Text style={styles.playerStatusCopy}>
          Tournament seat confirmed for {playerLabel({ name: data.signup.playerName, handle: data.signup.playerHandle })}.
        </Text>
      ) : signedInName ? (
        <Text style={styles.playerStatusCopy}>
          {signedInName} is signed in, but not on this tournament roster yet.
        </Text>
      ) : null}

      <View style={styles.playerStatusSteps}>
        <View style={[styles.playerStatusStep, signedInName && styles.playerStatusStepDone]}>
          <Text style={[styles.playerStatusStepLabel, signedInName && styles.playerStatusStepLabelDone]}>Account</Text>
          <Text style={styles.playerStatusStepValue}>{signedInName || 'Needed'}</Text>
        </View>
        <View style={[styles.playerStatusStep, signupName && styles.playerStatusStepDone]}>
          <Text style={[styles.playerStatusStepLabel, signupName && styles.playerStatusStepLabelDone]}>Roster</Text>
          <Text style={styles.playerStatusStepValue}>{signupName ? 'Registered' : 'Not yet'}</Text>
        </View>
        <View style={[styles.playerStatusStep, currentMatch && styles.playerStatusStepReady]}>
          <Text style={[styles.playerStatusStepLabel, currentMatch && styles.playerStatusStepLabelReady]}>Match</Text>
          <Text style={styles.playerStatusStepValue}>{currentMatch ? 'Ready' : 'Waiting'}</Text>
        </View>
      </View>

      {currentMatch ? (
        <View style={styles.playerMatchBox}>
          <Text style={styles.playerMatchLabel}>
            {currentMatch.round.title} • {currentMatch.label}
          </Text>
          <Text style={styles.playerMatchPlayers}>{currentMatch.players.map(playerLabel).join(' vs ')}</Text>
        </View>
      ) : null}

      {data?.waitingMatch ? (
        <View style={styles.playerMatchBox}>
          <Text style={styles.playerMatchLabel}>
            {data.waitingMatch.round.title} • {data.waitingMatch.label}
          </Text>
          <Text style={styles.playerMatchPlayers}>{data.waitingMatch.players.map(playerLabel).join(' vs ')}</Text>
        </View>
      ) : null}

      <View style={styles.playerStatusActions}>
        {currentMatch ? (
          <ActionButton onPress={handlePlayMyMatch}>{opening ? 'Opening...' : 'Open My Match'}</ActionButton>
        ) : !data?.account ? (
          <ActionButton href={signInPath}>Sign in</ActionButton>
        ) : (
          <ActionButton href={checkInPath}>{playerStatusActionLabel(data, currentMatch)}</ActionButton>
        )}
        <ActionButton href="/rules" variant="secondary">
          Rules
        </ActionButton>
      </View>
    </Surface>
  );
}

function RegisteredPlayersPanel({
  advertisedRosterCap,
  liveBracket,
  liveBracketSize,
  minimumPlayers,
  rosterBracketSize,
  signupSummary,
  tournament,
}) {
  const signups = signupSummary.signups || [];
  const seededCount = liveBracket?.participantCount || 0;
  const extraSignupCount = liveBracket ? Math.max(signupSummary.count - seededCount, 0) : 0;
  const rosterCapacityCopy = liveBracket
    ? `${seededCount}/${liveBracketSize} seeded in the live bracket • advertised ${advertisedRosterCap} seats`
    : `${playerCapacityLabel(signupSummary.count, advertisedRosterCap, signupSummary.loading)} advertised seats • ${openSlotLabel(signupSummary.count, advertisedRosterCap, minimumPlayers, signupSummary.loading)}`;
  const bracketCopy = liveBracket
    ? `Live bracket: ${bracketSizeLabel(liveBracketSize)} with ${seededCount} seeded player${seededCount === 1 ? '' : 's'}.`
    : `Actual bracket if seeded now: ${bracketSizeLabel(rosterBracketSize)}. ${rosterPolicyCopy(tournament, advertisedRosterCap, minimumPlayers)}`;
  const rosterCountValue = signupSummary.loading ? '--' : String(signupSummary.count);
  const bracketValue = liveBracket ? `${seededCount} seeded` : bracketSizeLabel(rosterBracketSize);
  const rosterGroups = getRosterGroups(signups, liveBracket);

  return (
    <Surface style={styles.rosterCard}>
      <View style={styles.rosterHeroRow}>
        <View style={styles.rosterHeroTile}>
          <Text style={styles.rosterHeroLabel}>Registered</Text>
          <Text style={styles.rosterHeroValue}>
            {rosterCountValue}
            <Text style={styles.rosterHeroSubValue}> / {advertisedRosterCap}</Text>
          </Text>
          <Text style={styles.rosterHeroMeta}>advertised seats</Text>
        </View>
        <View style={styles.rosterHeroTile}>
          <Text style={styles.rosterHeroLabel}>Bracket</Text>
          <Text style={styles.rosterHeroValue}>{bracketValue}</Text>
          <Text style={styles.rosterHeroMeta}>{liveBracket ? 'published now' : 'flexible actual size'}</Text>
        </View>
      </View>

      <View style={styles.rosterHeader}>
        <Badge tone={signupSummary.count ? 'green' : 'blue'}>
          {signupCountLabel(signupSummary.count, signupSummary.loading)}
        </Badge>
        <Badge tone="blue">{advertisedRosterCap} advertised seats</Badge>
        <Badge tone={liveBracket ? 'green' : 'accent'}>
          {liveBracket ? `${seededCount} seeded` : `${bracketSizeLabel(rosterBracketSize)} actual`}
        </Badge>
        <Text style={styles.rosterCapacity}>{rosterCapacityCopy}</Text>
      </View>

      {signupSummary.error ? <Text style={styles.rosterWarning}>{signupSummary.error}</Text> : null}
      <Text style={styles.rosterNote}>{bracketCopy}</Text>
      {extraSignupCount ? (
        <Text style={styles.rosterWarning}>
          {extraSignupCount} registered player{extraSignupCount === 1 ? '' : 's'} are not in the live bracket. The host should reset/reseed or clear signups before running a new bracket.
        </Text>
      ) : null}

      {signupSummary.loading ? (
        <Text style={styles.rosterEmptyText}>Loading registered players...</Text>
      ) : signups.length ? (
        <View style={styles.rosterGroupGrid}>
          {rosterGroups.map((group) => (
            <View key={group.key} style={styles.rosterGroup}>
              <View style={styles.rosterGroupHeader}>
                <Badge tone={group.tone}>{group.title}</Badge>
                <Text style={styles.rosterGroupCount}>{group.players.length}</Text>
              </View>
              <View style={styles.rosterList}>
                {group.players.map((signup, index) => (
                  <View
                    key={signup.id || `${group.key}-${signup.playerName}-${index}`}
                    style={[styles.rosterRow, signup.currentPlayer && styles.rosterRowCurrent]}>
                    <View style={[styles.rosterRank, signup.currentPlayer && styles.rosterRankCurrent]}>
                      <Text style={[styles.rosterRankText, signup.currentPlayer && styles.rosterRankTextCurrent]}>{index + 1}</Text>
                    </View>
                    <View style={styles.rosterPlayerCopy}>
                      <View style={styles.rosterNameRow}>
                        <Text style={styles.rosterPlayerName}>{signup.playerName || 'Unnamed player'}</Text>
                        {signup.currentPlayer ? <Badge tone="green">You</Badge> : null}
                      </View>
                      <Text style={styles.rosterPlayerMeta}>
                        {signup.playerHandle ? signup.playerHandle : 'No handle added'} • {signup.status || 'registered'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.rosterEmptyText}>
          No players are registered yet. Send players to signup and this list will update here.
        </Text>
      )}
    </Surface>
  );
}

function LiveBracketBoard({ bracket }) {
  const [openingMatchId, setOpeningMatchId] = useState('');
  const [accessError, setAccessError] = useState('');
  const matches = getBracketMatches(bracket);
  const completedCount = matches.filter((match) => match.status === 'final').length;
  const readyCount = matches.filter((match) => match.status === 'ready' || match.status === 'active').length;
  const nextMatch = getNextPublicMatch(bracket);

  async function handleOpenMatch(match) {
    setAccessError('');
    setOpeningMatchId(match.id);

    try {
      const result = await issueTournamentMatchTicket({
        slug: bracket.tournamentSlug,
        matchId: match.id,
      });

      if (result.roomUrl && globalThis.location?.assign) {
        globalThis.location.assign(result.roomUrl);
      }
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'Match access could not be opened.');
    } finally {
      setOpeningMatchId('');
    }
  }

  return (
    <Surface style={styles.liveBracketCard}>
      <View style={styles.liveBracketHeader}>
        <View style={styles.liveBracketHeaderCopy}>
          <Badge tone={bracket.status === 'complete' ? 'green' : 'accent'}>{bracket.status}</Badge>
          <Text style={styles.liveBracketTitle}>Public bracket</Text>
          <Text style={styles.liveBracketMeta}>
            {bracket.participantCount} players • {completedCount}/{matches.length} matches final • {readyCount} ready
          </Text>
        </View>
        <View style={styles.liveBracketStats}>
          <View style={styles.liveBracketStat}>
            <Text style={styles.liveBracketStatValue}>{bracket.participantCount}</Text>
            <Text style={styles.liveBracketStatLabel}>Players</Text>
          </View>
          <View style={styles.liveBracketStat}>
            <Text style={styles.liveBracketStatValue}>{completedCount}</Text>
            <Text style={styles.liveBracketStatLabel}>Final</Text>
          </View>
        </View>
      </View>
      {bracket.winner ? <Text style={styles.liveBracketWinner}>Champion: {bracket.winner.name}</Text> : null}
      {accessError ? <Text style={styles.liveBracketError}>{accessError}</Text> : null}

      {nextMatch ? (
        <View style={styles.upNextCard}>
          <View style={styles.upNextTopRow}>
            <Badge tone={getMatchTone(nextMatch)}>{getMatchStatusLabel(nextMatch)}</Badge>
            <Text style={styles.upNextRound}>{nextMatch.label}</Text>
          </View>
          <Text style={styles.upNextPlayers}>{matchPlayersLabel(nextMatch)}</Text>
          {nextMatch.status === 'ready' ? (
            <View style={styles.upNextActions}>
              <ActionButton onPress={() => handleOpenMatch(nextMatch)}>
                {openingMatchId === nextMatch.id ? 'Opening...' : 'Play match'}
              </ActionButton>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.liveRounds}>
        {bracket.rounds.map((round) => (
          <View key={round.index} style={styles.liveRound}>
            <Text style={styles.liveRoundTitle}>{round.title}</Text>
            {round.matches.map((match) => {
              const playerRows = getMatchPlayerRows(match);

              return (
                <View key={match.id} style={[styles.liveMatch, match.status === 'ready' && styles.liveMatchReady, match.status === 'final' && styles.liveMatchFinal]}>
                  <View style={styles.liveMatchTopRow}>
                    <Badge tone={getMatchTone(match)}>{getMatchStatusLabel(match)}</Badge>
                    <Text style={styles.liveMatchLabel}>{match.label}</Text>
                  </View>
                  <View style={styles.liveMatchPlayerList}>
                    {playerRows.map((player) => (
                      <View key={player.key} style={[styles.liveMatchPlayerRow, player.isWinner && styles.liveMatchPlayerWinner]}>
                        <View style={styles.liveMatchSeed}>
                          <Text style={styles.liveMatchSeedText}>{player.seed}</Text>
                        </View>
                        <Text numberOfLines={1} style={[styles.liveMatchPlayerName, player.isWinner && styles.liveMatchPlayerNameWinner]}>
                          {player.label}
                        </Text>
                        {player.isWinner ? <Text style={styles.liveMatchWinnerChip}>Winner</Text> : null}
                      </View>
                    ))}
                  </View>
                  {match.winnerName ? <Text style={styles.liveMatchWinner}>Winner: {match.winnerName}</Text> : null}
                  <View style={styles.liveMatchActions}>
                    {match.status === 'ready' ? (
                      <ActionButton onPress={() => handleOpenMatch(match)} variant="secondary">
                        {openingMatchId === match.id ? 'Opening...' : 'Play match'}
                      </ActionButton>
                    ) : (
                      <Text style={styles.liveMatchLocked}>
                        {match.status === 'final' ? 'Match complete' : 'Opens when both players are set'}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  arrivalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  arrivalCommandChip: {
    backgroundColor: 'rgba(94, 127, 163, 0.10)',
    borderColor: 'rgba(94, 127, 163, 0.22)',
    borderRadius: 8,
    borderWidth: 1,
    color: '#5E7FA3',
    fontSize: 13,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  arrivalCommandLabel: {
    color: '#A7A29A',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    marginRight: 2,
    textTransform: 'uppercase',
  },
  arrivalCommandRow: {
    alignItems: 'center',
    borderTopColor: 'rgba(244, 239, 230, 0.10)',
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
  },
  arrivalEyebrow: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  arrivalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  arrivalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  arrivalHeaderCopy: {
    flex: 1,
    minWidth: 190,
  },
  arrivalRail: {
    backgroundColor: 'rgba(8, 25, 21, 0.96)',
    borderColor: 'rgba(94, 127, 163, 0.26)',
    marginBottom: 16,
  },
  arrivalStep: {
    backgroundColor: 'rgba(244, 239, 230, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 190,
    flexGrow: 1,
    minHeight: 108,
    padding: 12,
  },
  arrivalStepBody: {
    color: '#A7A29A',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 5,
  },
  arrivalStepLabel: {
    color: '#5E7FA3',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  arrivalStepTitle: {
    color: '#F4EFE6',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
    marginTop: 5,
  },
  arrivalTitle: {
    color: '#F4EFE6',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
    marginTop: 2,
  },
  lobbyCard: {
    borderColor: 'rgba(244, 239, 230, 0.12)',
    marginBottom: 24,
    overflow: 'hidden',
  },
  lobbyCountdownLabel: {
    color: '#D6A24E',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  lobbyCountdownPanel: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(5, 11, 10, 0.72)',
    borderColor: 'rgba(214, 162, 78, 0.20)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    justifyContent: 'space-between',
    padding: 24,
  },
  lobbyCountdownPanelPhone: {
    gap: 16,
    padding: 16,
  },
  lobbyCountdownValue: {
    color: '#F4EFE6',
    fontSize: 64,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 70,
    marginTop: 8,
  },
  lobbyCountdownValuePhone: {
    fontSize: 46,
    lineHeight: 52,
  },
  lobbyCopy: {
    flex: 1.3,
    minWidth: 240,
  },
  lobbyBadgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  lobbyDate: {
    color: '#D6A24E',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
    textTransform: 'uppercase',
  },
  lobbyTitle: {
    color: '#F4EFE6',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 34,
    marginTop: 4,
  },
  lobbySummary: {
    color: '#A7A29A',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 23,
    marginTop: 8,
  },
  lobbyActions: {
    alignContent: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    minWidth: 220,
  },
  lobbyActionsPhone: {
    flexBasis: '100%',
    justifyContent: 'flex-start',
    minWidth: 0,
  },
  lobbyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  lobbyMetric: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 84,
    padding: 16,
  },
  lobbyMatchMetric: {
    flexBasis: 260,
  },
  lobbyMetricLabel: {
    color: '#A7A29A',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  lobbyMetricValue: {
    color: '#F4EFE6',
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
    marginTop: 8,
  },
  lobbyMetricSub: {
    color: '#A7A29A',
    fontSize: 16,
  },
  lobbyMatchText: {
    color: '#F4EFE6',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
    marginTop: 8,
  },
  lobbyRosterPreview: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 16,
    padding: 16,
  },
  lobbyRosterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  lobbyRosterTitle: {
    color: '#F4EFE6',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 22,
  },
  lobbyRosterMeta: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  lobbyRosterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  lobbyPlayerChip: {
    backgroundColor: 'rgba(214, 162, 78, 0.12)',
    borderColor: 'rgba(214, 162, 78, 0.24)',
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 180,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  lobbyPlayerText: {
    color: '#F4EFE6',
    fontSize: 13,
    fontWeight: '900',
  },
  lobbyEmpty: {
    color: '#A7A29A',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  lobbyMore: {
    color: '#A7A29A',
    fontSize: 13,
    fontWeight: '900',
    paddingVertical: 8,
  },
  broadcastStrip: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 25, 21, 0.96)',
    borderColor: 'rgba(214, 162, 78, 0.36)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  broadcastStatus: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    minWidth: 260,
  },
  broadcastDot: {
    backgroundColor: 'rgba(214, 162, 78, 0.45)',
    borderColor: 'rgba(214, 162, 78, 0.74)',
    borderRadius: 999,
    borderWidth: 3,
    height: 18,
    width: 18,
  },
  broadcastDotLive: {
    backgroundColor: '#F05252',
    borderColor: 'rgba(255, 180, 168, 0.84)',
  },
  broadcastCopy: {
    flex: 1,
    minWidth: 0,
  },
  broadcastEyebrow: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  broadcastTitle: {
    color: '#F4EFE6',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
    marginTop: 2,
  },
  broadcastActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  timelineCard: {
    borderColor: 'rgba(244, 239, 230, 0.12)',
    marginBottom: 24,
    paddingVertical: 14,
  },
  timelineTrack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  timelineStep: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 150,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 10,
    minHeight: 70,
    padding: 10,
  },
  timelineMarker: {
    alignItems: 'center',
    backgroundColor: 'rgba(244, 239, 230, 0.08)',
    borderColor: 'rgba(244, 239, 230, 0.14)',
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  timelineMarkerDone: {
    backgroundColor: 'rgba(214, 162, 78, 0.12)',
    borderColor: 'rgba(214, 162, 78, 0.42)',
  },
  timelineMarkerActive: {
    backgroundColor: 'rgba(214, 162, 78, 0.18)',
    borderColor: 'rgba(214, 162, 78, 0.62)',
  },
  timelineMarkerText: {
    color: '#A7A29A',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 17,
  },
  timelineMarkerTextActive: {
    color: '#D6A24E',
  },
  timelineCopy: {
    flex: 1,
    minWidth: 0,
  },
  timelineLabel: {
    color: '#A7A29A',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  timelineValue: {
    color: '#F4EFE6',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
    marginTop: 2,
  },
  timelineValueActive: {
    color: '#D6A24E',
  },
  timelineValueDone: {
    color: '#D6A24E',
  },
  eventConsole: {
    backgroundColor: 'rgba(17, 29, 26, 0.90)',
    borderColor: 'rgba(214, 162, 78, 0.34)',
    marginBottom: 18,
    paddingBottom: 10,
  },
  eventConsoleBadgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  eventConsoleBody: {
    color: '#A7A29A',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 4,
  },
  eventConsoleCopy: {
    flex: 1.2,
    minWidth: 220,
  },
  eventConsoleMeta: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  eventConsoleSignals: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  eventConsoleTitle: {
    color: '#F4EFE6',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  eventConsoleTopRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 10,
  },
  eventSignal: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 96,
    flexGrow: 1,
    minHeight: 68,
    padding: 10,
  },
  eventSignalReady: {
    backgroundColor: 'rgba(214, 162, 78, 0.09)',
    borderColor: 'rgba(214, 162, 78, 0.24)',
  },
  eventSignalLabel: {
    color: '#A7A29A',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  eventSignalValue: {
    color: '#F4EFE6',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
    marginTop: 5,
  },
  eventSignalValueReady: {
    color: '#D6A24E',
  },
  tournamentTabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 0,
  },
  tournamentTabButton: {
    flexBasis: 104,
    flexGrow: 1,
    marginBottom: 0,
    marginRight: 0,
    minWidth: 0,
  },
  dashboardCard: {
    borderColor: 'rgba(214, 162, 78, 0.34)',
    backgroundColor: 'rgba(8, 25, 21, 0.92)',
  },
  dashboardTopRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  dashboardCopy: {
    flex: 1.3,
    minWidth: 260,
  },
  dashboardTitle: {
    color: '#F4EFE6',
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 32,
    marginTop: 12,
  },
  dashboardText: {
    color: '#A7A29A',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 23,
    marginTop: 8,
  },
  dashboardActions: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    minWidth: 240,
  },
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  dashboardTile: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 16,
    borderWidth: 1,
    flexGrow: 1,
    flexBasis: 170,
    padding: 14,
  },
  dashboardTileLabel: {
    color: '#A7A29A',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.9,
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  dashboardTileValue: {
    color: '#F4EFE6',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: 5,
  },
  dashboardTileMeta: {
    color: '#D6A24E',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 2,
  },
  dashboardPolicy: {
    backgroundColor: 'rgba(214, 162, 78, 0.08)',
    borderColor: 'rgba(214, 162, 78, 0.24)',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  dashboardPolicyText: {
    color: '#D6A24E',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 20,
  },
  playerCommandDashboard: {
    flex: 1.05,
    minWidth: 280,
  },
  playerCommandGrid: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  playerCommandStatus: {
    flex: 1,
    minWidth: 280,
  },
  formatCard: {
    backgroundColor: 'rgba(8, 25, 21, 0.90)',
    borderColor: 'rgba(214, 162, 78, 0.30)',
  },
  formatTopRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  formatCopy: {
    flex: 1.3,
    minWidth: 260,
  },
  formatTitle: {
    color: '#F4EFE6',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
    marginTop: 10,
  },
  formatBody: {
    color: '#A7A29A',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 6,
  },
  formatStats: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    minWidth: 250,
  },
  formatStat: {
    backgroundColor: 'rgba(244, 239, 230, 0.045)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 132,
    flexGrow: 1,
    padding: 12,
  },
  formatStatLabel: {
    color: '#A7A29A',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  formatStatValue: {
    color: '#F4EFE6',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
    marginTop: 5,
  },
  formatRules: {
    gap: 8,
    marginTop: 16,
  },
  formatRule: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  formatRuleMarker: {
    color: '#D6A24E',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 22,
  },
  formatRuleText: {
    color: '#E4DED4',
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
  formatFooter: {
    alignItems: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.08)',
    borderColor: 'rgba(214, 162, 78, 0.22)',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
    padding: 12,
  },
  formatFooterText: {
    color: '#D6A24E',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    minWidth: 220,
  },
  tabCommandActions: {
    alignContent: 'flex-start',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    minWidth: 220,
  },
  tabCommandBody: {
    color: '#A7A29A',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 5,
  },
  tabCommandCard: {
    backgroundColor: 'rgba(17, 29, 26, 0.82)',
    borderColor: 'rgba(214, 162, 78, 0.28)',
    marginBottom: 18,
  },
  tabCommandCopy: {
    flex: 1.25,
    minWidth: 240,
  },
  tabCommandLabel: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  tabCommandStat: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 110,
    flexGrow: 1,
    minHeight: 64,
    padding: 10,
  },
  tabCommandStatLabel: {
    color: '#A7A29A',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  tabCommandStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  tabCommandStatValue: {
    color: '#F4EFE6',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
    marginTop: 5,
  },
  tabCommandTitle: {
    color: '#F4EFE6',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: 4,
  },
  tabCommandTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  block: {
    marginBottom: 14,
  },
  launchActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  launchCard: {
    borderColor: 'rgba(214, 162, 78, 0.3)',
  },
  launchCopy: {
    color: '#A7A29A',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  launchPath: {
    color: '#D6A24E',
    fontSize: 12,
    letterSpacing: 0.8,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  launchTitle: {
    color: '#F4EFE6',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
  },
  launchTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  linkButton: {
    marginRight: 10,
    marginBottom: 10,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginRight: -12,
  },
  bracketLoadNote: {
    color: '#A7A29A',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  rosterCard: {
    borderColor: 'rgba(214, 162, 78, 0.30)',
  },
  rosterHeroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  rosterHeroTile: {
    backgroundColor: 'rgba(214, 162, 78, 0.08)',
    borderColor: 'rgba(214, 162, 78, 0.30)',
    borderRadius: 16,
    borderWidth: 1,
    flexGrow: 1,
    flexBasis: 180,
    padding: 14,
  },
  rosterHeroLabel: {
    color: '#A7A29A',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  rosterHeroValue: {
    color: '#F4EFE6',
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
    marginTop: 3,
  },
  rosterHeroSubValue: {
    color: '#A7A29A',
    fontSize: 18,
  },
  rosterHeroMeta: {
    color: '#D6A24E',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 2,
  },
  rosterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  rosterCapacity: {
    color: '#A7A29A',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    minWidth: 220,
  },
  rosterWarning: {
    color: '#FFB4A8',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginBottom: 12,
  },
  rosterEmptyText: {
    color: '#A7A29A',
    fontSize: 15,
    lineHeight: 22,
  },
  rosterNote: {
    color: '#A7A29A',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 12,
  },
  rosterList: {
    gap: 10,
  },
  rosterGroupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  rosterGroup: {
    backgroundColor: 'rgba(255, 255, 255, 0.025)',
    borderColor: 'rgba(244, 239, 230, 0.09)',
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: 250,
    flexGrow: 1,
    padding: 12,
  },
  rosterGroupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  rosterGroupCount: {
    color: '#F4EFE6',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 25,
  },
  rosterRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 12,
  },
  rosterRowCurrent: {
    backgroundColor: 'rgba(214, 162, 78, 0.11)',
    borderColor: 'rgba(214, 162, 78, 0.44)',
  },
  rosterRank: {
    alignItems: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.14)',
    borderColor: 'rgba(214, 162, 78, 0.42)',
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    marginRight: 12,
    width: 34,
  },
  rosterRankCurrent: {
    backgroundColor: 'rgba(214, 162, 78, 0.18)',
    borderColor: 'rgba(214, 162, 78, 0.60)',
  },
  rosterRankText: {
    color: '#D6A24E',
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '900',
  },
  rosterRankTextCurrent: {
    color: '#D6A24E',
  },
  rosterPlayerCopy: {
    flex: 1,
    minWidth: 0,
  },
  rosterNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rosterPlayerName: {
    color: '#F4EFE6',
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 23,
  },
  rosterPlayerMeta: {
    color: '#A7A29A',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 2,
  },
  statusSpotlight: {
    backgroundColor: 'rgba(8, 25, 21, 0.94)',
    borderColor: 'rgba(214, 162, 78, 0.30)',
    marginBottom: 18,
  },
  statusSpotlightReady: {
    backgroundColor: 'rgba(20, 45, 32, 0.96)',
    borderColor: 'rgba(77, 217, 133, 0.58)',
    shadowColor: '#4DD985',
    shadowOpacity: 0.18,
    shadowRadius: 24,
  },
  statusSpotlightTopRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
  },
  statusSpotlightCopy: {
    flex: 1,
    minWidth: 260,
  },
  statusSpotlightAction: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-end',
    minWidth: 220,
  },
  statusSpotlightTitle: {
    color: '#F4EFE6',
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 32,
    marginTop: 12,
  },
  statusSpotlightBody: {
    color: '#D4DDD7',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 8,
  },
  statusSpotlightMatchCallout: {
    alignItems: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.14)',
    borderColor: 'rgba(214, 162, 78, 0.58)',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 18,
    padding: 16,
  },
  statusSpotlightMatchCopy: {
    flex: 1,
    minWidth: 230,
  },
  statusSpotlightMatchLabel: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  statusSpotlightMatchTitle: {
    color: '#F4EFE6',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
    marginTop: 5,
  },
  statusSpotlightMatchPlayers: {
    color: '#D4DDD7',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 4,
  },
  statusSpotlightPlayButton: {
    flexGrow: 1,
    marginBottom: 0,
    marginRight: 0,
    minWidth: 190,
  },
  statusSpotlightSteps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  statusSpotlightStep: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 150,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 10,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  statusSpotlightStepDone: {
    backgroundColor: 'rgba(77, 217, 133, 0.09)',
    borderColor: 'rgba(77, 217, 133, 0.34)',
  },
  statusSpotlightStepReady: {
    backgroundColor: 'rgba(214, 162, 78, 0.14)',
    borderColor: 'rgba(214, 162, 78, 0.58)',
  },
  statusSpotlightStepNumber: {
    alignItems: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.10)',
    borderColor: 'rgba(214, 162, 78, 0.30)',
    borderRadius: 999,
    borderWidth: 1,
    color: '#D6A24E',
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '900',
    height: 34,
    lineHeight: 32,
    textAlign: 'center',
    width: 34,
  },
  statusSpotlightStepNumberDone: {
    backgroundColor: 'rgba(77, 217, 133, 0.14)',
    borderColor: 'rgba(77, 217, 133, 0.42)',
    color: '#4DD985',
  },
  statusSpotlightStepCopy: {
    flex: 1,
    minWidth: 0,
  },
  statusSpotlightStepLabel: {
    color: '#A7A29A',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  statusSpotlightStepValue: {
    color: '#F4EFE6',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
    marginTop: 2,
  },
  playerStatusCard: {
    borderColor: 'rgba(214, 162, 78, 0.26)',
  },
  playerStatusCardReady: {
    backgroundColor: 'rgba(12, 36, 28, 0.96)',
    borderColor: 'rgba(214, 162, 78, 0.58)',
  },
  playerStatusTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  playerStatusMeta: {
    color: '#A7A29A',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  playerStatusTitle: {
    color: '#F4EFE6',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  playerStatusCopy: {
    color: '#A7A29A',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  playerStatusSteps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  playerStatusStep: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 14,
    borderWidth: 1,
    flexGrow: 1,
    flexBasis: 145,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  playerStatusStepDone: {
    backgroundColor: 'rgba(214, 162, 78, 0.10)',
    borderColor: 'rgba(214, 162, 78, 0.38)',
  },
  playerStatusStepReady: {
    backgroundColor: 'rgba(214, 162, 78, 0.12)',
    borderColor: 'rgba(214, 162, 78, 0.52)',
  },
  playerStatusStepLabel: {
    color: '#A7A29A',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  playerStatusStepLabelDone: {
    color: '#D6A24E',
  },
  playerStatusStepLabelReady: {
    color: '#D6A24E',
  },
  playerStatusStepValue: {
    color: '#F4EFE6',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
    marginTop: 3,
  },
  playerStatusWarning: {
    color: '#FFB4A8',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 8,
  },
  playerMatchBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  playerMatchLabel: {
    color: '#D6A24E',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  playerMatchPlayers: {
    color: '#F4EFE6',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
    marginTop: 6,
  },
  playerStatusActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  liveBracketCard: {
    borderColor: 'rgba(214, 162, 78, 0.30)',
  },
  liveBracketHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  liveBracketHeaderCopy: {
    flex: 1,
    minWidth: 230,
  },
  liveBracketTitle: {
    color: '#F4EFE6',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
    marginTop: 10,
  },
  liveBracketMeta: {
    color: '#A7A29A',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  liveBracketStats: {
    flexDirection: 'row',
    gap: 10,
  },
  liveBracketStat: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.045)',
    borderColor: 'rgba(244, 239, 230, 0.12)',
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 74,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  liveBracketStatValue: {
    color: '#F4EFE6',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
  },
  liveBracketStatLabel: {
    color: '#A7A29A',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  liveBracketWinner: {
    color: '#D6A24E',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22,
    marginBottom: 12,
  },
  liveBracketError: {
    color: '#FFB4A8',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginBottom: 12,
  },
  upNextCard: {
    backgroundColor: 'rgba(214, 162, 78, 0.10)',
    borderColor: 'rgba(214, 162, 78, 0.36)',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    padding: 14,
  },
  upNextTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  upNextRound: {
    color: '#D6A24E',
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  upNextPlayers: {
    color: '#F4EFE6',
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 27,
    marginTop: 10,
  },
  upNextActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
  },
  liveRounds: {
    marginTop: 8,
  },
  liveRound: {
    marginBottom: 14,
  },
  liveRoundTitle: {
    color: '#F4EFE6',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  liveMatch: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
  },
  liveMatchReady: {
    backgroundColor: 'rgba(214, 162, 78, 0.09)',
    borderColor: 'rgba(214, 162, 78, 0.34)',
  },
  liveMatchFinal: {
    backgroundColor: 'rgba(214, 162, 78, 0.07)',
    borderColor: 'rgba(214, 162, 78, 0.28)',
  },
  liveMatchTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  liveMatchLabel: {
    color: '#A7A29A',
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  liveMatchPlayerList: {
    gap: 8,
    marginTop: 12,
  },
  liveMatchPlayerRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  liveMatchPlayerWinner: {
    backgroundColor: 'rgba(214, 162, 78, 0.11)',
    borderColor: 'rgba(214, 162, 78, 0.30)',
  },
  liveMatchSeed: {
    alignItems: 'center',
    backgroundColor: 'rgba(244, 239, 230, 0.08)',
    borderRadius: 999,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  liveMatchSeedText: {
    color: '#A7A29A',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 14,
  },
  liveMatchPlayerName: {
    color: '#F4EFE6',
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  liveMatchPlayerNameWinner: {
    color: '#D6A24E',
  },
  liveMatchWinnerChip: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  liveMatchWinner: {
    color: '#D6A24E',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 6,
  },
  liveMatchActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  liveMatchLocked: {
    color: '#A7A29A',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  snapshotCard: {
    borderColor: 'rgba(214, 162, 78, 0.24)',
  },
  snapshotLabel: {
    color: '#F4EFE6',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 10,
    fontWeight: '700',
  },
  snapshotCopy: {
    color: '#A7A29A',
    fontSize: 14,
    lineHeight: 21,
  },
  snapshotCallout: {
    color: '#D6A24E',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
    fontWeight: '700',
  },
  sponsorSoftwareActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sponsorSoftwareBody: {
    color: '#A7A29A',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 6,
  },
  sponsorSoftwareCopy: {
    flex: 1,
    minWidth: 250,
  },
  sponsorSoftwareStrip: {
    alignItems: 'center',
    backgroundColor: 'rgba(7, 17, 15, 0.94)',
    borderColor: 'rgba(94, 205, 158, 0.22)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sponsorSoftwareTitle: {
    color: '#F4EFE6',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: 8,
  },
});

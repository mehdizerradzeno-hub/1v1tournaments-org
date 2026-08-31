import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

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
import { TournamentJourney } from '../components/tournament-master-ui.jsx';
import { formatDateLine } from '../lib/format.js';
import {
  buildResultFromTournamentBracket,
  getGameBySlug,
  getCheckInPath,
  getResultByTournamentSlug,
  getResultsForGame,
  getStreamBySlug,
  getTournamentBySlug,
  getTournamentPath,
  siteData,
} from '../lib/siteData.js';
import { getEffectiveRegistrationStatus, mergeTournamentSettings } from '../lib/tournamentSettings.js';
import { getTournamentGameName } from '../lib/tournamentCatalog.js';
import { getTournamentMode } from '../lib/tournamentModes.js';
import {
  getTournamentPlayerPresentation,
  TOURNAMENT_PLAYER_PRESENTATION_STATES,
} from '../lib/tournamentJourneyPresentation.js';
import {
  fetchTournamentPlayerStatus,
  fetchSignupSummary,
  fetchTournamentBracket,
  fetchTournamentEvent,
  issueTournamentMatchTicket,
} from '../lib/tournamentHostingClient.js';
import { downloadLinks } from '../lib/downloadLinks.js';
import { handleTabKeyNavigation } from '../lib/accessibleTabs.js';
import { useVisibleNow } from '../lib/useVisibleNow.js';
import { startVisibilityAwarePolling } from '../lib/visibilityPoller.js';

function signupCountLabel(count, loading = false) {
  if (loading) return 'Loading';
  return `${count} signed up`;
}

const DEFAULT_ROSTER_CAP = 8;
const DEFAULT_MINIMUM_PLAYERS = 2;
const TOURNAMENT_TABS = [
  { id: 'play', label: 'Overview', body: 'Player status, live path, and main action.' },
  { id: 'roster', label: 'Players', body: 'Who is signed up and bracket-ready.' },
  { id: 'bracket', label: 'Bracket', body: 'Current match flow and table access.' },
  { id: 'info', label: 'Schedule & rules', body: 'Agenda, format, links, and competition rules.' },
  { id: 'results', label: 'Results', body: 'Final placement and the permanent event record.' },
];

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

function getSignInPath(checkInPath) {
  return `${checkInPath}?mode=signin#account-access`;
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
    return { label: 'Your Match', href: matchStatusPath };
  }

  if (signup) {
    return isBracketLive
      ? { label: 'View Bracket', href: `${tournamentPath}#live-bracket` }
      : { label: 'Registered', href: `${tournamentPath}#registered-players` };
  }

  if (isBracketLive) {
    return account
      ? { label: 'View Bracket', href: `${tournamentPath}#live-bracket` }
      : { label: 'Sign In', href: signInPath };
  }

  if (registrationMeta.value === 'open') {
    if (loading) {
      return { label: 'Sign Up', href: checkInPath };
    }

    return account
      ? { label: 'Sign Up', href: checkInPath }
      : { label: 'Sign In', href: signInPath };
  }

  return { label: 'View Roster', href: `${tournamentPath}#registered-players` };
}

function tabFromHash(hash) {
  switch (String(hash || '').replace(/^#/, '')) {
    case 'overview':
      return 'play';
    case 'my-match':
      return 'play';
    case 'registered-players':
      return 'roster';
    case 'live-bracket':
      return 'bracket';
    case 'rules':
      return 'info';
    case 'results':
      return 'results';
    default:
      return '';
  }
}

function hashFromTab(tab) {
  if (tab === 'roster') return '#registered-players';
  if (tab === 'bracket') return '#live-bracket';
  if (tab === 'info') return '#rules';
  if (tab === 'results') return '#results';
  return '#overview';
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
  const nowMs = useVisibleNow(15000);
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

    let firstRefresh = true;
    const stopPolling = startVisibilityAwarePolling(() => {
      const silent = !firstRefresh;
      firstRefresh = false;
      return Promise.all([
        loadBracket({ silent }),
        loadSignupSummary({ silent }),
        loadPlayerStatus({ silent }),
      ]);
    }, 15000);

    return () => {
      active = false;
      stopPolling();
    };
  }, [slug, seededTournament]);

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
  const gameName = getTournamentGameName(visibleTournament.gameSlug);
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
  const isBracketComplete = liveBracket?.status === 'complete' || Boolean(result);
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
  const quickLinks = (visibleTournament.links || []).filter((link) => link.href !== `/tournaments/${visibleTournament.slug}`);
  const advertisedRosterCap = getAdvertisedRosterCap(visibleTournament);
  const minimumPlayers = getMinimumPlayers(visibleTournament);
  const formatDetails = getTournamentFormatDetails(visibleTournament);
  const liveBracketSize = bracketSizeFromBracket(liveBracket, liveBracket?.participantCount || 0);
  const rosterBracketSize = actualBracketSizeFromSignups(signupSummary.count, minimumPlayers);

  function handleSelectTab(tab) {
    setActiveTab(tab);

    if (globalThis.history?.replaceState && globalThis.location) {
      globalThis.history.replaceState(
        null,
        '',
        `${globalThis.location.pathname}${globalThis.location.search}${hashFromTab(tab)}`,
      );
    }
  }

  return (
    <HubScreen
      eyebrow={game?.badge || 'Tournament'}
      footerNote={siteData.site.adminNote}
      heroVariant="compact"
      lead={visibleTournament.detail}
      pageDataSet={{ tournamentPage: 'true' }}
      subtitle={`${gameName} tournament • ${formatDateLine(visibleTournament.date, visibleTournament.timeZone, visibleTournament.timeZoneLabel)}`}
      stickyActions={false}
      showHero={false}
      showNavigation
      title={visibleTournament.title}>
      <TournamentJourney compact />
      <TournamentLobbyHero
        advertisedRosterCap={advertisedRosterCap}
        countdownLabel={getCountdownLabel(visibleTournament, nowMs)}
        isBracketLive={isBracketLive}
        liveBracket={liveBracket}
        registrationMeta={registrationMeta}
        result={result}
        signupSummary={signupSummary}
        streams={streams}
        tournament={visibleTournament}
      />

      <PlayerStatusSpotlight
        bracketPath={`${tournamentPath}#live-bracket`}
        checkInWindow={visibleTournament.checkIn?.window || visibleTournament.checkIn?.preview || ''}
        liveBracket={liveBracket}
        matchPath={matchStatusPath}
        playerStatus={playerStatus}
        registrationMeta={registrationMeta}
        result={result}
        signInPath={signInPath}
        slug={visibleTournament.slug}
        signupPath={checkInPath}
        tournamentStatus={visibleTournament.status}
      />

      <TournamentEventConsole
        activeTab={activeTab}
        advertisedRosterCap={advertisedRosterCap}
        isBracketLive={isBracketLive}
        liveBracket={liveBracket}
        onSelectTab={handleSelectTab}
        playerHasReadyMatch={playerHasReadyMatch}
        registrationMeta={registrationMeta}
        result={result}
        signupSummary={signupSummary}
      />

      {activeTab === 'play' ? (
        <View
          accessibilityRole="tabpanel"
          aria-labelledby="tournament-tab-play"
          nativeID="tournament-panel-play">
          <LiveBroadcastStrip
            isBracketLive={isBracketLive}
            nextMatch={getNextPublicMatch(liveBracket)}
            streams={streams}
          />

          <Section
            description="Competition format, field requirements, and bracket structure."
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
        </View>
      ) : null}

      {activeTab === 'roster' ? (
        <View
          accessibilityRole="tabpanel"
          aria-labelledby="tournament-tab-roster"
          nativeID="tournament-panel-roster">
          <TournamentTabCommandCard
            body={
              isBracketLive
                ? 'Confirm who made the published bracket, then jump to your match or the live view.'
                : 'Use this roster to confirm signups before the host seeds the bracket.'
            }
            primary={!playerStatus.data?.signup && !isBracketLive ? primaryPlayerAction : null}
            secondary={isBracketLive
              ? { label: 'View Bracket', href: `${tournamentPath}#live-bracket` }
              : { label: 'View Roster', href: `${tournamentPath}#registered-players` }}
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
        </View>
      ) : null}

      {activeTab === 'bracket' ? (
        <View
          accessibilityRole="tabpanel"
          aria-labelledby="tournament-tab-bracket"
          nativeID="tournament-panel-bracket">
          <TournamentTabCommandCard
            body={
              isBracketLive
                ? 'Follow the active match flow, table links, winners, and bracket status.'
                : 'Bracket preview is ready. Live table links appear after the host publishes the bracket.'
            }
            primary={null}
            secondary={streams.length ? { label: 'Watch', href: '/stream' } : { label: 'Roster', href: `${tournamentPath}#registered-players` }}
            stats={[
              { label: 'Bracket', value: isBracketComplete ? 'Complete' : liveBracket ? 'Live' : 'Preview' },
              { label: 'Players', value: liveBracket ? String(liveBracket.participantCount || 0) : seatLabel(signupSummary.count, advertisedRosterCap, signupSummary.loading) },
              { label: 'Next', value: getNextPublicMatch(liveBracket)?.label || 'After seed' },
            ]}
            title="Tournament Bracket"
          />

          {liveBracket ? (
            <Section
              description={`Match cards show assigned players, winners, and ${gameName} match links.`}
              nativeID="live-bracket"
              title={bracketSectionTitle}>
              <LiveBracketBoard bracket={liveBracket} />
            </Section>
          ) : null}

          {!liveBracket ? (
            <Section
              description={`After the host generates a bracket, match cards show the assigned players and ${gameName} match links.`}
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
              {streams.length ? (
                <QuickActionCard
                  actionLabel="Watch table"
                  body="Follow the live tournament broadcast and current match action."
                  href="/stream"
                  meta="Live Coverage"
                  title="Watch Tournament"
                  tone="blue"
                />
              ) : null}
            </View>
          </Section>
        </View>
      ) : null}

      {activeTab === 'info' ? (
        <View
          accessibilityRole="tabpanel"
          aria-labelledby="tournament-tab-info"
          nativeID="tournament-panel-info">
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

          <Section description="Rules stay close to the event so admins can update one record at a time." nativeID="rules" title="Game rules">
            {game?.ruleSections?.map((section) => (
              <View key={section.title} style={styles.block}>
                <RuleBlock section={section} />
              </View>
            ))}
          </Section>
        </View>
      ) : null}

      {activeTab === 'results' ? (
        <View
          accessibilityRole="tabpanel"
          aria-labelledby="tournament-tab-results"
          nativeID="tournament-panel-results">
          <TournamentTabCommandCard
            body={result
              ? 'Review the champion, final placements, and recorded outcome for this event.'
              : 'This permanent event record will publish after the final match is complete.'}
            primary={{ label: 'Results archive', href: '/results' }}
            secondary={{ label: 'Bracket', href: `${tournamentPath}#live-bracket` }}
            stats={[
              {
                label: 'Event',
                value: isBracketComplete
                  ? 'Complete'
                  : isBracketLive
                    ? 'Live'
                    : registrationMeta.value === 'open'
                      ? 'Upcoming'
                      : registrationMeta.label,
              },
              { label: 'Bracket', value: liveBracket ? `${liveBracket.participantCount || 0} players` : 'Pending' },
              { label: 'Record', value: result ? 'Published' : 'Awaiting final' },
            ]}
            title="Event results"
          />
          <Section
            description="Completed events publish final standings as a permanent competition record."
            nativeID="results"
            title="Results">
            {result ? (
              <ResultCard result={result} />
            ) : (
              <EmptyState
                action={<ActionButton href="/results">Open results archive</ActionButton>}
                body="Results will appear here after the tournament closes and the final is recorded."
                title="Results are not posted yet"
              />
            )}
          </Section>
        </View>
      ) : null}
    </HubScreen>
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
  const { width } = useWindowDimensions();
  const compact = width > 0 && width < 520;
  const tabIds = TOURNAMENT_TABS.map((tab) => tab.id);

  return (
    <View accessibilityRole="tablist" style={styles.tournamentTabBar}>
      {TOURNAMENT_TABS.map((tab) => {
        const selected = activeTab === tab.id;

        return (
          <Pressable
            aria-controls={`tournament-panel-${tab.id}`}
            aria-selected={selected}
            accessibilityLabel={`${tab.label}. ${tab.body}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={tab.id}
            nativeID={`tournament-tab-${tab.id}`}
            onKeyDown={(event) => handleTabKeyNavigation(event, {
              activeId: activeTab,
              idPrefix: 'tournament-tab-',
              onSelect: onSelectTab,
              tabIds,
            })}
            onPress={() => onSelectTab(tab.id)}
            style={({ pressed }) => [
              styles.tournamentTabButton,
              selected && styles.tournamentTabButtonSelected,
              pressed && styles.tournamentTabButtonPressed,
            ]}>
            <Text style={[styles.tournamentTabLabel, selected && styles.tournamentTabLabelSelected]}>
              {compact && tab.id === 'info' ? 'Details' : tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TournamentLobbyHero({
  advertisedRosterCap,
  countdownLabel,
  isBracketLive,
  liveBracket,
  registrationMeta,
  result,
  signupSummary,
  streams,
  tournament,
}) {
  const { width } = useWindowDimensions();
  const isPhone = width > 0 && width < 420;
  const signups = signupSummary.signups || [];
  const signupCount = signupSummary.loading ? '--' : `${signupSummary.count}/${advertisedRosterCap}`;
  const openSeats = signupSummary.loading ? '--' : String(getOpenSeats(signupSummary.count, advertisedRosterCap));
  const nextMatch = getNextPublicMatch(liveBracket);
  const isComplete = liveBracket?.status === 'complete' || Boolean(result);
  const championName = liveBracket?.winner?.name || result?.winner || '';

  return (
    <Surface style={styles.lobbyCard}>
      <View style={styles.lobbyBadgeRow}>
        <Badge tone={isComplete ? 'green' : liveBracket ? 'green' : registrationMeta.tone}>
          {isComplete ? 'Completed' : liveBracket ? 'Tournament Live' : registrationMeta.label}
        </Badge>
        <Text style={styles.lobbyDate}>
          {formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)}
        </Text>
      </View>

      <View style={[styles.lobbyCountdownPanel, isPhone && styles.lobbyCountdownPanelPhone]}>
        <View style={styles.lobbyCopy}>
          <Text style={styles.lobbyCountdownLabel}>{isComplete ? 'CHAMPION' : isBracketLive ? 'LIVE NOW' : 'STARTS IN'}</Text>
          <Text style={[styles.lobbyCountdownValue, isPhone && styles.lobbyCountdownValuePhone]}>
            {isComplete ? championName || 'Results posted' : countdownLabel}
          </Text>
          <Text accessibilityRole="heading" aria-level={1} style={styles.lobbyTitle}>
            {isComplete ? 'Tournament Complete' : isBracketLive ? 'Tournament Live' : tournament.name || 'Tournament Lobby'}
          </Text>
          <Text style={styles.lobbySummary}>
            {isComplete
              ? result?.summary || 'Final results are posted for this tournament.'
              : `${tournament.format} | ${tournament.location} | ${tournament.entryLine}`}
          </Text>
        </View>
        <View style={[styles.lobbyActions, isPhone && styles.lobbyActionsPhone]}>
          {streams.length ? <ActionButton href="/stream" variant="secondary">Watch Tournament</ActionButton> : null}
        </View>
      </View>

      <View style={styles.lobbyGrid}>
        <View style={styles.lobbyMetric}>
          <Text style={styles.lobbyMetricLabel}>Players</Text>
          <Text style={styles.lobbyMetricValue}>
            {signupCount}
          </Text>
        </View>
        <View style={styles.lobbyMetric}>
          <Text style={styles.lobbyMetricLabel}>Seats Open</Text>
          <Text style={styles.lobbyMetricValue}>{openSeats}</Text>
        </View>
        <View style={[styles.lobbyMetric, styles.lobbyMatchMetric]}>
          <Text style={styles.lobbyMetricLabel}>{isComplete ? 'Final status' : nextMatch ? nextMatch.label || 'Up next' : 'Match focus'}</Text>
          <Text numberOfLines={1} style={styles.lobbyMatchText}>
            {isComplete ? 'Results posted' : nextMatch ? matchPlayersLabel(nextMatch) : 'Waiting for seeding'}
          </Text>
        </View>
      </View>

      <View style={styles.lobbyRosterPreview}>
        <View style={styles.lobbyRosterHeader}>
          <Text style={styles.lobbyRosterTitle}>Competitors</Text>
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
            <Text style={styles.lobbyEmpty}>No competitors registered yet.</Text>
          )}
          {signups.length > 8 ? <Text style={styles.lobbyMore}>+{signups.length - 8} more</Text> : null}
        </View>
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

function PlayerStatusSpotlight({
  bracketPath,
  checkInWindow,
  liveBracket,
  matchPath,
  playerStatus,
  registrationMeta,
  result,
  signInPath,
  slug,
  signupPath,
  tournamentStatus,
}) {
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const data = playerStatus.data || {};
  const currentMatch = data.currentMatch || null;
  const waitingMatch = data.waitingMatch || null;
  const accountName = data.account?.playerName || '';
  const signupName = data.signup?.playerName || '';
  const statusUnavailable = Boolean(playerStatus.error && !playerStatus.loading);
  const resolvedPresentation = getTournamentPlayerPresentation({
    bracketPath,
    hasBracket: Boolean(liveBracket),
    matchPath,
    playerStatus,
    registrationStatus: registrationMeta.value,
    signInPath,
    signupPath,
    tournamentStatus: result ? 'complete' : tournamentStatus,
  });
  const presentation = playerStatus.loading
    ? {
        state: TOURNAMENT_PLAYER_PRESENTATION_STATES.WAITING,
        label: 'CHECKING',
        title: 'Checking your tournament status…',
        description: 'Looking for your player account, registration, and assigned match.',
        primaryAction: null,
      }
    : statusUnavailable
      ? {
          state: TOURNAMENT_PLAYER_PRESENTATION_STATES.WAITING,
          label: 'STATUS UNAVAILABLE',
          title: 'WE COULDN’T LOAD YOUR STATUS',
          description: 'Your account and registration were not changed. We’ll retry automatically.',
          primaryAction: null,
        }
      : resolvedPresentation;
  const playableMatch = presentation.state === TOURNAMENT_PLAYER_PRESENTATION_STATES.READY_MATCH
    ? currentMatch
    : null;
  const visibleWaitingMatch = presentation.state === TOURNAMENT_PLAYER_PRESENTATION_STATES.PENDING_MATCH
    ? waitingMatch
    : null;
  const finished = [
    TOURNAMENT_PLAYER_PRESENTATION_STATES.ELIMINATED,
    TOURNAMENT_PLAYER_PRESENTATION_STATES.CHAMPION,
    TOURNAMENT_PLAYER_PRESENTATION_STATES.COMPLETE,
  ].includes(presentation.state);
  const steps = statusUnavailable ? [] : [
    {
      label: 'SIGN UP',
      value: signupName ? 'Registered' : accountName ? 'Ready to register' : 'Account needed',
      done: Boolean(signupName),
    },
    {
      label: 'CHECK IN',
      value: liveBracket
        ? 'Bracket ready'
        : signupName
          ? checkInWindow || 'Waiting for bracket'
          : 'After signup',
      done: Boolean(liveBracket),
    },
    {
      label: 'PLAY',
      value: finished ? 'Complete' : playableMatch ? 'Ready' : visibleWaitingMatch ? 'Preparing' : 'Waiting',
      done: Boolean(playableMatch || finished),
    },
  ];
  const matchPlayers = playableMatch?.players?.map(playerLabel).filter(Boolean).join(' vs ') || 'Assigned players';

  async function handlePlayMyMatch() {
    if (!playableMatch || opening) return;

    setOpenError('');
    setOpening(true);

    try {
      const result = await issueTournamentMatchTicket({
        slug,
        matchId: playableMatch.id,
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
    <Surface nativeID="my-match" style={[styles.statusSpotlight, playableMatch && styles.statusSpotlightReady]}>
      <View style={styles.statusSpotlightTopRow}>
        <View style={styles.statusSpotlightCopy}>
          <Badge tone={statusTone(data.nextStep)}>{presentation.label}</Badge>
          <Text style={styles.statusSpotlightTitle}>{presentation.title}</Text>
          <Text style={styles.statusSpotlightBody}>{presentation.description}</Text>
        </View>
        <View style={styles.statusSpotlightAction}>
          {!playableMatch && presentation.primaryAction ? (
            <ActionButton href={presentation.primaryAction.href}>
              {presentation.primaryAction.label}
            </ActionButton>
          ) : null}
        </View>
      </View>
      {playableMatch ? (
        <View style={styles.statusSpotlightMatchCallout}>
          <View style={styles.statusSpotlightMatchCopy}>
            <Text style={styles.statusSpotlightMatchLabel}>Ready now</Text>
            <Text style={styles.statusSpotlightMatchTitle}>
              {playableMatch.round.title} • {playableMatch.label}
            </Text>
            <Text style={styles.statusSpotlightMatchPlayers}>{matchPlayers}</Text>
          </View>
          <ActionButton
            onPress={handlePlayMyMatch}
            style={styles.statusSpotlightPlayButton}
            variant="success">
            {opening ? 'OPENING…' : 'PLAY MATCH'}
          </ActionButton>
        </View>
      ) : null}
      {visibleWaitingMatch ? (
        <View style={styles.statusSpotlightMatchCallout}>
          <View style={styles.statusSpotlightMatchCopy}>
            <Text style={styles.statusSpotlightMatchLabel}>Preparing match…</Text>
            <Text style={styles.statusSpotlightMatchTitle}>
              {visibleWaitingMatch.round.title} • {visibleWaitingMatch.label}
            </Text>
            <Text style={styles.statusSpotlightMatchPlayers}>
              {visibleWaitingMatch.players?.map(playerLabel).join(' vs ') || 'Waiting for opponent'}
            </Text>
          </View>
        </View>
      ) : null}
      {playerStatus.error ? <Text style={styles.playerStatusWarning}>{playerStatus.error}</Text> : null}
      {openError ? <Text style={styles.playerStatusWarning}>{openError}</Text> : null}
      {steps.length ? (
        <View style={styles.statusSpotlightSteps}>
          {steps.map((step, index) => (
            <View
              key={step.label}
              style={[
                styles.statusSpotlightStep,
                step.done && styles.statusSpotlightStepDone,
                playableMatch && step.label === 'PLAY' && styles.statusSpotlightStepReady,
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
      ) : null}
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
  const matches = getBracketMatches(bracket);
  const completedCount = matches.filter((match) => match.status === 'final').length;
  const readyCount = matches.filter((match) => match.status === 'ready' || match.status === 'active').length;
  const nextMatch = getNextPublicMatch(bracket);

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
      {bracket.winner ? (
        <View style={styles.liveBracketChampionPanel}>
          <Text style={styles.liveBracketChampionLabel}>Champion</Text>
          <Text style={styles.liveBracketChampionName}>{bracket.winner.name}</Text>
          <Text style={styles.liveBracketChampionBody}>
            Final results are posted from this completed tournament bracket.
          </Text>
        </View>
      ) : null}
      {nextMatch ? (
        <View style={styles.upNextCard}>
          <View style={styles.upNextTopRow}>
            <Badge tone={getMatchTone(nextMatch)}>{getMatchStatusLabel(nextMatch)}</Badge>
            <Text style={styles.upNextRound}>{nextMatch.label}</Text>
          </View>
          <Text style={styles.upNextPlayers}>{matchPlayersLabel(nextMatch)}</Text>
          <Text style={styles.liveMatchLocked}>
            {nextMatch.status === 'ready' ? 'Ready for assigned players' : 'Waiting for the bracket to advance'}
          </Text>
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
                    <Text style={styles.liveMatchLocked}>
                      {match.status === 'final'
                        ? 'Match complete'
                        : match.status === 'ready'
                          ? 'Ready for assigned players'
                          : 'Opens when both players are set'}
                    </Text>
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
  arrivalAction: {
    minHeight: 44,
  },
  arrivalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  arrivalActionsPhone: {
    flexBasis: '100%',
    width: '100%',
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
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.12)',
    borderRadius: 999,
    borderWidth: 1,
    flexBasis: 104,
    flexGrow: 1,
    justifyContent: 'center',
    marginBottom: 0,
    marginRight: 0,
    minHeight: 46,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tournamentTabButtonSelected: {
    backgroundColor: 'rgba(214, 162, 78, 0.14)',
    borderColor: 'rgba(214, 162, 78, 0.58)',
  },
  tournamentTabButtonPressed: {
    opacity: 0.82,
  },
  tournamentTabLabel: {
    color: '#A7A29A',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  tournamentTabLabelSelected: {
    color: '#F0C86A',
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
    boxShadow: '0 0 24px rgba(77, 217, 133, 0.18)',
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
  liveBracketChampionPanel: {
    backgroundColor: 'rgba(214, 162, 78, 0.10)',
    borderColor: 'rgba(214, 162, 78, 0.36)',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  liveBracketChampionLabel: {
    color: '#D6A24E',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  liveBracketChampionName: {
    color: '#F4EFE6',
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 32,
    marginTop: 5,
  },
  liveBracketChampionBody: {
    color: '#A7A29A',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
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
    borderColor: 'rgba(214, 162, 78, 0.28)',
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

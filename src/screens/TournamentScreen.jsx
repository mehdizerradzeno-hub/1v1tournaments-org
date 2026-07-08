import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
  getResultByTournamentSlug,
  getResultsForGame,
  getStreamBySlug,
  getTournamentBySlug,
  getTournamentPath,
  siteData,
} from '../lib/siteData.js';
import { getEffectiveRegistrationStatus, mergeTournamentSettings } from '../lib/tournamentSettings.js';
import {
  fetchTournamentPlayerStatus,
  fetchSignupSummary,
  fetchTournamentBracket,
  fetchTournamentEvent,
  issueTournamentMatchTicket,
} from '../lib/tournamentHostingClient.js';

function signupCountLabel(count, loading = false) {
  if (loading) return 'Loading';
  return `${count} signed up`;
}

const DEFAULT_ROSTER_CAP = 8;
const DEFAULT_MINIMUM_PLAYERS = 2;

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
    return { label: 'View bracket', href: `${tournamentPath}#live-bracket` };
  }

  if (status.value === 'open') {
    return { label: 'Sign up now', href: checkInPath };
  }

  return { label: 'View roster', href: `${tournamentPath}#registered-players` };
}

export default function TournamentScreen({ slug }) {
  const [liveBracket, setLiveBracket] = useState(null);
  const [bracketState, setBracketState] = useState({ loading: true, error: '' });
  const [playerStatus, setPlayerStatus] = useState({ loading: true, error: '', data: null });
  const [signupSummary, setSignupSummary] = useState({ count: 0, signups: [], loading: true, error: '' });
  const [tournamentSettings, setTournamentSettings] = useState(null);
  const [hostedTournament, setHostedTournament] = useState(null);
  const [tournamentLookup, setTournamentLookup] = useState({ loading: true, error: '' });
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

    async function loadBracket() {
      if (!slug) {
        return;
      }

      setBracketState({ loading: true, error: '' });

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

    async function loadSignupSummary() {
      setSignupSummary((current) => ({ ...current, loading: true, error: '' }));

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

    async function loadPlayerStatus() {
      setPlayerStatus((current) => ({ ...current, loading: true, error: '' }));

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

    return () => {
      active = false;
    };
  }, [slug, seededTournament]);

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

  const playerMatchAction = {
    label: playerHasReadyMatch ? 'Play my match' : 'My match',
    href: matchStatusPath,
    variant: isBracketLive ? 'primary' : 'secondary',
  };
  const tournamentAction = isBracketLive
    ? { label: 'Live bracket', href: `${tournamentPath}#live-bracket`, variant: 'secondary' }
    : heroSignupAction(registrationMeta, checkInPath, tournamentPath);

  const heroActions = [
    isBracketLive ? playerMatchAction : tournamentAction,
    isBracketLive ? tournamentAction : playerMatchAction,
    streams.length ? { label: 'Watch live', href: '/live', variant: 'secondary' } : null,
    { label: 'Rules', href: '/rules', variant: 'secondary' },
  ].filter(Boolean);

  const quickLinks = (visibleTournament.links || []).filter((link) => link.href !== `/tournaments/${visibleTournament.slug}`);
  const advertisedRosterCap = getAdvertisedRosterCap(visibleTournament);
  const minimumPlayers = getMinimumPlayers(visibleTournament);
  const liveBracketSize = bracketSizeFromBracket(liveBracket, liveBracket?.participantCount || 0);
  const rosterBracketSize = actualBracketSizeFromSignups(signupSummary.count, minimumPlayers);
  const activeBracketSize = liveBracket ? liveBracketSize : rosterBracketSize;

  return (
    <HubScreen
      actions={heroActions}
      eyebrow={game?.badge || 'Tournament'}
      footerNote={siteData.site.adminNote}
      lead={visibleTournament.detail}
      stats={[
        { label: 'Format', value: visibleTournament.format, tone: 'blue' },
        { label: 'Registration', value: registrationMeta.label, tone: registrationMeta.tone },
        { label: 'Seats', value: seatLabel(signupSummary.count, advertisedRosterCap, signupSummary.loading), tone: signupSummary.count ? 'green' : 'blue' },
        { label: 'Bracket', value: liveBracket ? `${liveBracket.participantCount || 0} seeded` : bracketSizeLabel(activeBracketSize), tone: liveBracket ? 'green' : 'accent' },
        { label: 'Location', value: visibleTournament.location, tone: 'accent' },
      ]}
      subtitle={
        isPrimaryGame
          ? `Spades launch event • ${formatDateLine(visibleTournament.date, visibleTournament.timeZone, visibleTournament.timeZoneLabel)}`
          : formatDateLine(visibleTournament.date, visibleTournament.timeZone, visibleTournament.timeZoneLabel)
      }
      title={visibleTournament.title}>
      <Section
        description="Start here. This dashboard shows the next action, roster size, and bracket state without making players hunt."
        nativeID="tournament-dashboard"
        title="Tournament dashboard">
        <TournamentDashboard
          advertisedRosterCap={advertisedRosterCap}
          checkInPath={checkInPath}
          isBracketLive={isBracketLive}
          liveBracket={liveBracket}
          matchStatusPath={matchStatusPath}
          minimumPlayers={minimumPlayers}
          playerStatus={playerStatus}
          registrationMeta={registrationMeta}
          signupSummary={signupSummary}
          streams={streams}
          tournament={visibleTournament}
        />
      </Section>

      <Section
        description={
          isBracketLive
            ? 'Start here once the bracket is live. Signed-in players can open their assigned table without reading the whole bracket.'
            : 'Start here before the bracket is live. This card tells each signed-in player whether they need to sign up or wait.'
        }
        nativeID="my-match"
        title={isBracketLive ? 'My match' : 'Find your match'}>
        <PlayerTournamentStatus
          checkInPath={checkInPath}
          playerStatus={playerStatus}
          slug={visibleTournament.slug}
        />
      </Section>

      {liveBracket ? (
        <Section
          description="Match cards show assigned players, winners, and Spades room links."
          nativeID="live-bracket"
          title={bracketSectionTitle}>
          <LiveBracketBoard bracket={liveBracket} />
        </Section>
      ) : null}

      {showSignupSection ? (
        <Section
          description={registrationMeta.actionCopy}
          title="Sign up">
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

      <Section
        description={
          isBracketLive
            ? 'Public roster count and seeded-player status for the current live bracket.'
            : 'Public-safe roster count, bracket size, and seeded-player status in one place.'
        }
        nativeID="registered-players"
        title={isBracketLive ? 'Players in this bracket' : 'Registered players and bracket size'}>
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
              actionLabel="Create account and join"
              body="Use this before the bracket is seeded."
              href={checkInPath}
              meta={signupCountLabel(signupSummary.count, signupSummary.loading)}
              title="Player signup"
              tone="green"
            />
          ) : null}
          <QuickActionCard
            actionLabel={playerHasReadyMatch ? 'Play my match' : 'Check status'}
            body={
              isBracketLive
                ? 'Open your assigned table from your signed-in tournament account.'
                : 'Jump to your account-linked status card and current match once the bracket is live.'
            }
            href={matchStatusPath}
            meta="Player"
            title="My match"
            tone="green"
          />
          {streams.length ? (
            <QuickActionCard
              actionLabel="Watch table"
              body="Open the spectator table for the current match."
              href="/live"
              meta="Spectator"
              title="Watch live"
              tone="blue"
            />
          ) : null}
        </View>
      </Section>

      <Section description="Format, entry rules, and event notes." title="Event snapshot">
        <Surface style={styles.snapshotCard}>
          <Text style={styles.snapshotLabel}>{visibleTournament.summary}</Text>
          <Text style={styles.snapshotCopy}>{visibleTournament.entryLine}</Text>
          {visibleTournament.callout ? <Text style={styles.snapshotCallout}>{visibleTournament.callout}</Text> : null}
          <BulletList items={visibleTournament.highlights} />
        </Surface>
      </Section>

      {isPrimaryGame && gamePath ? (
        <Section
          description="Use the account-linked match card once the bracket is live."
          title="Match access">
          <Surface style={styles.launchCard}>
            <View style={styles.launchTopRow}>
              <Badge tone="accent">Ticket path</Badge>
              <Text style={styles.launchPath}>My match</Text>
            </View>
            <Text style={styles.launchTitle}>Open gameplay from your tournament seat</Text>
            <Text style={styles.launchCopy}>
              The hub checks your player account, creates the match ticket, and then sends you to the Spades table.
            </Text>
            <View style={styles.launchActions}>
              <ActionButton href={matchStatusPath}>Go to my match</ActionButton>
              <ActionButton href="/live" variant="secondary">
                Watch live
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
            action={<ActionButton href="/live">Open live page</ActionButton>}
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
    </HubScreen>
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

function TournamentDashboard({
  advertisedRosterCap,
  checkInPath,
  isBracketLive,
  liveBracket,
  matchStatusPath,
  minimumPlayers,
  playerStatus,
  registrationMeta,
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
  const primaryAction = currentMatch
    ? { label: 'Play my match', href: matchStatusPath }
    : isBracketLive
      ? { label: 'Find my match', href: matchStatusPath }
      : registrationMeta.value === 'open'
        ? { label: data?.signup ? 'View my status' : 'Create account + join', href: data?.signup ? matchStatusPath : checkInPath }
        : { label: 'View roster', href: `${tournamentPath}#registered-players` };

  return (
    <Surface style={styles.dashboardCard}>
      <View style={styles.dashboardTopRow}>
        <View style={styles.dashboardCopy}>
          <Badge tone={currentMatch ? 'green' : isBracketLive ? 'accent' : registrationMeta.tone}>
            {currentMatch ? 'Match ready' : isBracketLive ? 'Bracket live' : registrationMeta.label}
          </Badge>
          <Text style={styles.dashboardTitle}>
            {currentMatch ? 'Your table is ready.' : isBracketLive ? 'Find your assigned match.' : 'Join before the bracket is seeded.'}
          </Text>
          <Text style={styles.dashboardText}>
            {dashboardStatusCopy({ isBracketLive, playerStatus, registrationMeta })}
          </Text>
        </View>

        <View style={styles.dashboardActions}>
          <ActionButton href={primaryAction.href}>{primaryAction.label}</ActionButton>
          <ActionButton href={`${tournamentPath}${isBracketLive ? '#live-bracket' : '#registered-players'}`} variant="secondary">
            {isBracketLive ? 'View bracket' : 'View roster'}
          </ActionButton>
          {streams.length ? (
            <ActionButton href="/live" variant="secondary">
              Watch live
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

function PlayerTournamentStatus({ checkInPath, playerStatus, slug }) {
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const data = playerStatus.data;
  const currentMatch = data?.currentMatch || null;

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
    <Surface style={styles.playerStatusCard}>
      <View style={styles.playerStatusTopRow}>
        <Badge tone={statusTone(data?.nextStep)}>{data?.nextStep || 'checking'}</Badge>
        <Text style={styles.playerStatusMeta}>
          {playerStatus.loading ? 'Checking account' : data?.account?.playerName || 'No player account open'}
        </Text>
      </View>

      <Text style={styles.playerStatusTitle}>
        {playerStatus.loading ? 'Checking your tournament status...' : data?.statusLabel || 'Status unavailable'}
      </Text>

      {playerStatus.error ? <Text style={styles.playerStatusWarning}>{playerStatus.error}</Text> : null}
      {openError ? <Text style={styles.playerStatusWarning}>{openError}</Text> : null}

      {data?.signup ? (
        <Text style={styles.playerStatusCopy}>
          Signed up as {playerLabel({ name: data.signup.playerName, handle: data.signup.playerHandle })}.
        </Text>
      ) : null}

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
          <ActionButton onPress={handlePlayMyMatch}>{opening ? 'Opening...' : 'Play my match'}</ActionButton>
        ) : (
          <ActionButton href={checkInPath}>{data?.account ? 'Open signup' : 'Create or sign in'}</ActionButton>
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

  return (
    <Surface style={styles.rosterCard}>
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
        <View style={styles.rosterList}>
          {signups.map((signup, index) => (
            <View
              key={signup.id || `${signup.playerName}-${index}`}
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
  const completedCount = bracket.rounds
    .flatMap((round) => round.matches)
    .filter((match) => match.status === 'final').length;

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
        <Badge tone={bracket.status === 'complete' ? 'green' : 'accent'}>{bracket.status}</Badge>
        <Text style={styles.liveBracketMeta}>
          {bracket.participantCount} players • {completedCount} final
        </Text>
      </View>
      {bracket.winner ? <Text style={styles.liveBracketWinner}>Champion: {bracket.winner.name}</Text> : null}
      {accessError ? <Text style={styles.liveBracketError}>{accessError}</Text> : null}

      <View style={styles.liveRounds}>
        {bracket.rounds.map((round) => (
          <View key={round.index} style={styles.liveRound}>
            <Text style={styles.liveRoundTitle}>{round.title}</Text>
            {round.matches.map((match) => {
              const players = match.players || [];

              return (
                <View key={match.id} style={styles.liveMatch}>
                  <View style={styles.liveMatchTopRow}>
                    <Badge tone={match.status === 'final' ? 'green' : match.status === 'ready' ? 'accent' : 'blue'}>
                      {match.status}
                    </Badge>
                    <Text style={styles.liveMatchLabel}>{match.label}</Text>
                  </View>
                  <Text style={styles.liveMatchPlayers}>{players.map(playerLabel).join(' vs ')}</Text>
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
    color: '#AAB4AE',
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
    color: '#AAB4AE',
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
    color: '#AAB4AE',
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
    color: '#AAB4AE',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  rosterCard: {
    borderColor: 'rgba(97, 210, 145, 0.30)',
  },
  rosterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  rosterCapacity: {
    color: '#AAB4AE',
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
    color: '#AAB4AE',
    fontSize: 15,
    lineHeight: 22,
  },
  rosterNote: {
    color: '#AAB4AE',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 12,
  },
  rosterList: {
    gap: 10,
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
    backgroundColor: 'rgba(97, 210, 145, 0.11)',
    borderColor: 'rgba(97, 210, 145, 0.44)',
  },
  rosterRank: {
    alignItems: 'center',
    backgroundColor: 'rgba(97, 210, 145, 0.14)',
    borderColor: 'rgba(97, 210, 145, 0.42)',
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
    color: '#61D291',
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
    color: '#AAB4AE',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 2,
  },
  playerStatusCard: {
    borderColor: 'rgba(214, 162, 78, 0.26)',
  },
  playerStatusTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  playerStatusMeta: {
    color: '#AAB4AE',
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
    color: '#AAB4AE',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
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
    borderColor: 'rgba(97, 210, 145, 0.30)',
  },
  liveBracketHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 10,
  },
  liveBracketMeta: {
    color: '#AAB4AE',
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  liveBracketWinner: {
    color: '#61D291',
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
  liveMatchTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  liveMatchLabel: {
    color: '#AAB4AE',
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  liveMatchPlayers: {
    color: '#F4EFE6',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
    marginTop: 10,
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
    color: '#AAB4AE',
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
    color: '#AAB4AE',
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
});

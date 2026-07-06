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
  issueTournamentMatchTicket,
} from '../lib/tournamentHostingClient.js';

function signupCountLabel(count, loading = false) {
  if (loading) return 'Loading';
  return `${count} signed up`;
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

function playerCapacityLabel(count, size, loading = false) {
  if (loading) return 'Loading';
  return `${count}/${size}`;
}

function openSlotLabel(count, size, loading = false) {
  if (loading) return 'Checking open seats';
  const openSlots = Math.max(size - count, 0);

  if (count < 2) return 'Need 2 players to generate a bracket';
  if (openSlots === 0) return 'Current bracket size is full';
  return `${openSlots} open bracket seat${openSlots === 1 ? '' : 's'}`;
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
  const tournament = getTournamentBySlug(slug);
  const liveTournament = useMemo(
    () => mergeTournamentSettings(tournament, tournamentSettings),
    [tournament, tournamentSettings],
  );

  useEffect(() => {
    let active = true;

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
  }, [slug]);

  if (!tournament) {
    return (
      <HubScreen
        actions={[{ label: 'Home', href: '/' }]}
        eyebrow="Tournament not found"
        lead="That tournament page is not available."
        subtitle="Add the event record or check the route."
        title="Unknown tournament">
        <EmptyState
          action={<ActionButton href="/">Back home</ActionButton>}
          body="The detail route is ready, but the matching tournament record still needs to be added."
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
    || (visibleTournament.status === 'complete' ? getResultsForGame(visibleTournament.gameSlug)[0] || null : null);
  const playerHasReadyMatch = Boolean(playerStatus.data?.currentMatch);
  const isBracketLive = registrationMeta.reason === 'bracket-live' || Boolean(liveBracket);

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
  const liveBracketSize = bracketSizeFromBracket(liveBracket, liveBracket?.participantCount || 0);
  const rosterBracketSize = nextPowerOfTwo(signupSummary.count);
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
        { label: 'Registered', value: signupSummary.loading ? 'Loading' : String(signupSummary.count), tone: signupSummary.count ? 'green' : 'blue' },
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
        description="Tournament day starts here. This card tells each signed-in player whether they need to sign up, wait, or open their assigned Spades table."
        nativeID="my-match"
        title="Find your match">
        <PlayerTournamentStatus
          checkInPath={checkInPath}
          playerStatus={playerStatus}
          slug={visibleTournament.slug}
        />
      </Section>

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

      <Section
        description="Public-safe roster count, bracket size, and seeded-player status in one place."
        nativeID="registered-players"
        title="Registered players and bracket size">
        <RegisteredPlayersPanel
          liveBracket={liveBracket}
          liveBracketSize={liveBracketSize}
          rosterBracketSize={rosterBracketSize}
          signupSummary={signupSummary}
        />
      </Section>

      <Section
        description="After the host generates a bracket, match cards show the assigned players and Spades room links."
        nativeID="live-bracket"
        title={liveBracket ? 'Live bracket' : 'Bracket preview'}>
        {liveBracket ? (
          <LiveBracketBoard bracket={liveBracket} />
        ) : (
          <>
            <BracketBoard bracket={visibleTournament.bracket} />
            {bracketState.error ? <Text style={styles.bracketLoadNote}>{bracketState.error}</Text> : null}
            {!bracketState.loading && !bracketState.error ? (
              <Text style={styles.bracketLoadNote}>No live bracket has been published yet.</Text>
            ) : null}
          </>
        )}
      </Section>

      <Section description="Quick paths for players and viewers." title="Event links">
        <View style={styles.quickGrid}>
          <QuickActionCard
            actionLabel="Create account and join"
            body="Use this before the bracket is seeded."
            href={checkInPath}
            meta={signupCountLabel(signupSummary.count, signupSummary.loading)}
            title="Player signup"
            tone="green"
          />
          <QuickActionCard
            actionLabel="Check status"
            body="Jump to your account-linked status card and current match once the bracket is live."
            href={matchStatusPath}
            meta="Player"
            title="My match"
            tone="green"
          />
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

function RegisteredPlayersPanel({ liveBracket, liveBracketSize, rosterBracketSize, signupSummary }) {
  const signups = signupSummary.signups || [];
  const seededCount = liveBracket?.participantCount || 0;
  const extraSignupCount = liveBracket ? Math.max(signupSummary.count - seededCount, 0) : 0;
  const rosterCapacityCopy = liveBracket
    ? `${seededCount}/${liveBracketSize} seeded in the live bracket`
    : `${playerCapacityLabel(signupSummary.count, rosterBracketSize, signupSummary.loading)} players • ${openSlotLabel(signupSummary.count, rosterBracketSize, signupSummary.loading)}`;
  const bracketCopy = liveBracket
    ? `Live bracket: ${bracketSizeLabel(liveBracketSize)} with ${seededCount} seeded player${seededCount === 1 ? '' : 's'}.`
    : `If generated now: ${bracketSizeLabel(rosterBracketSize)} bracket.`;

  return (
    <Surface style={styles.rosterCard}>
      <View style={styles.rosterHeader}>
        <Badge tone={signupSummary.count ? 'green' : 'blue'}>
          {signupCountLabel(signupSummary.count, signupSummary.loading)}
        </Badge>
        <Badge tone={liveBracket ? 'green' : 'accent'}>
          {liveBracket ? `${seededCount} seeded` : `${bracketSizeLabel(rosterBracketSize)} bracket`}
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
            <View key={signup.id || `${signup.playerName}-${index}`} style={styles.rosterRow}>
              <View style={styles.rosterRank}>
                <Text style={styles.rosterRankText}>{index + 1}</Text>
              </View>
              <View style={styles.rosterPlayerCopy}>
                <Text style={styles.rosterPlayerName}>{signup.playerName || 'Unnamed player'}</Text>
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
  rosterRankText: {
    color: '#61D291',
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '900',
  },
  rosterPlayerCopy: {
    flex: 1,
    minWidth: 0,
  },
  rosterPlayerName: {
    color: '#F4EFE6',
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

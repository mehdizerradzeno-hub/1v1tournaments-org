import { useEffect, useState } from 'react';
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
  siteData,
} from '../lib/siteData.js';
import { fetchSignupSummary, fetchTournamentBracket } from '../lib/tournamentHostingClient.js';

function signupCountLabel(count, loading = false) {
  if (loading) return 'Loading';
  return `${count} signed up`;
}

export default function TournamentScreen({ slug }) {
  const [liveBracket, setLiveBracket] = useState(null);
  const [bracketState, setBracketState] = useState({ loading: true, error: '' });
  const [signupSummary, setSignupSummary] = useState({ count: 0, loading: true, error: '' });
  const tournament = getTournamentBySlug(slug);

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
          setSignupSummary({
            count: result.signupCount || 0,
            loading: false,
            error: '',
          });
        }
      } catch (error) {
        if (active) {
          setSignupSummary({
            count: 0,
            loading: false,
            error: error instanceof Error ? error.message : 'Signup count could not be loaded.',
          });
        }
      }
    }

    loadSignupSummary();

    return () => {
      active = false;
    };
  }, [slug]);

  if (!tournament) {
    return (
      <HubScreen
        actions={[{ label: 'Home', href: '/' }]}
        eyebrow="Tournament not found"
        lead="That tournament slug is not present in the current content file."
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

  const game = getGameBySlug(tournament.gameSlug);
  const isPrimaryGame = game?.slug === siteData.site.primaryGameSlug;
  const gamePath = game ? getGamePath(game.slug) : null;
  const streams = (tournament.streamSlugs || [])
    .map((streamSlug) => getStreamBySlug(streamSlug))
    .filter(Boolean);
  const checkInPath = getCheckInPath(tournament.slug);
  const result = getResultByTournamentSlug(tournament.slug)
    || (tournament.status === 'complete' ? getResultsForGame(tournament.gameSlug)[0] || null : null);

  const heroActions = [
    isPrimaryGame && gamePath ? { label: 'Open /spades', href: gamePath } : null,
    { label: 'Sign up', href: checkInPath, variant: 'secondary' },
    streams.length ? { label: 'Watch live', href: '/live' } : null,
    { label: 'Rules', href: '/rules', variant: 'secondary' },
    { label: 'Results', href: '/results', variant: 'ghost' },
  ].filter(Boolean);

  const quickLinks = (tournament.links || []).filter((link) => link.href !== `/tournaments/${tournament.slug}`);

  return (
    <HubScreen
      actions={heroActions}
      eyebrow={game?.badge || 'Tournament'}
      footerNote={siteData.site.adminNote}
      lead={tournament.detail}
      stats={[
        { label: 'Format', value: tournament.format, tone: 'blue' },
        { label: 'Signed up', value: signupCountLabel(signupSummary.count, signupSummary.loading), tone: signupSummary.count ? 'green' : 'blue' },
        { label: 'Location', value: tournament.location, tone: 'accent' },
        { label: 'Entry', value: 'Free', tone: 'green' },
      ]}
      subtitle={
        isPrimaryGame
          ? `Spades launch event • ${formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)}`
          : formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)
      }
      title={tournament.title}>
      <Section description="Everything about the event should be visible on one phone-sized page." title="Event snapshot">
        <Surface style={styles.snapshotCard}>
          <Text style={styles.snapshotLabel}>{tournament.summary}</Text>
          <Text style={styles.snapshotCopy}>{tournament.entryLine}</Text>
          {tournament.callout ? <Text style={styles.snapshotCallout}>{tournament.callout}</Text> : null}
          <BulletList items={tournament.highlights} />
        </Surface>
      </Section>

      <Section
        description="The roster count updates from the live signup store, then the host generates the bracket from that roster."
        title="Sign up">
        <CheckInPanel
          checkIn={tournament.checkIn}
          checkInPath={checkInPath}
          signupCount={signupSummary.count}
          signupError={signupSummary.error}
          signupLoading={signupSummary.loading}
        />
      </Section>

      <Section
        description="Once admin generates a bracket, this section becomes the live match board with Spades room links."
        title={liveBracket ? 'Live bracket' : 'Bracket preview'}>
        {liveBracket ? (
          <LiveBracketBoard bracket={liveBracket} />
        ) : (
          <>
            <BracketBoard bracket={tournament.bracket} />
            {bracketState.error ? <Text style={styles.bracketLoadNote}>{bracketState.error}</Text> : null}
            {!bracketState.loading && !bracketState.error ? (
              <Text style={styles.bracketLoadNote}>No live bracket has been published yet.</Text>
            ) : null}
          </>
        )}
      </Section>

      {isPrimaryGame && gamePath ? (
        <Section
          description="Spades is the hub's launch lane, and this page keeps the featured event one tap away from the main game route."
          title="Spades launch lane">
          <Surface style={styles.launchCard}>
            <View style={styles.launchTopRow}>
              <Badge tone="accent">Launch path</Badge>
              <Text style={styles.launchPath}>{gamePath}</Text>
            </View>
            <Text style={styles.launchTitle}>The featured event for the first live game</Text>
            <Text style={styles.launchCopy}>
              Keep this page updated with the Spades schedule, live coverage, and result notes so the launch experience stays focused.
            </Text>
            <View style={styles.launchActions}>
              <ActionButton href={gamePath}>Open /spades</ActionButton>
              <ActionButton href="/live" variant="secondary">
                Watch live
              </ActionButton>
            </View>
          </Surface>
        </Section>
      ) : null}

      {quickLinks.length ? (
        <Section description="Quick links are editable alongside the tournament copy." title="Quick links">
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
        <AgendaList items={tournament.agenda} />
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

      <Section description="If the event is complete, the scorecard can be shown here from the same data file." title="Results">
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

function LiveBracketBoard({ bracket }) {
  const completedCount = bracket.rounds
    .flatMap((round) => round.matches)
    .filter((match) => match.status === 'final').length;

  return (
    <Surface style={styles.liveBracketCard}>
      <View style={styles.liveBracketHeader}>
        <Badge tone={bracket.status === 'complete' ? 'green' : 'accent'}>{bracket.status}</Badge>
        <Text style={styles.liveBracketMeta}>
          {bracket.participantCount} players • {completedCount} final
        </Text>
      </View>
      {bracket.winner ? <Text style={styles.liveBracketWinner}>Champion: {bracket.winner.name}</Text> : null}

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
                    <ActionButton external href={match.roomUrl} variant="secondary">
                      Play match
                    </ActionButton>
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
  bracketLoadNote: {
    color: '#AAB4AE',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
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

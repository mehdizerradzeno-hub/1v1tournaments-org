import { StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  BulletList,
  EmptyState,
  HubScreen,
  ResultCard,
  RuleBlock,
  Section,
  StreamCard,
  Surface,
  TournamentCard,
} from '../components/hub-ui.jsx';
import {
  getGameBySlug,
  getResultsForGame,
  getCheckInPath,
  getStreamBySlug,
  getTournamentPath,
  getTournamentsForGame,
  mergeResults,
  siteData,
} from '../lib/siteData.js';
import { useLiveTournamentResult } from '../lib/liveResults.js';

export default function GameScreen({ gameSlug }) {
  const game = getGameBySlug(gameSlug);
  const tournaments = game ? getTournamentsForGame(game.slug) : [];
  const featuredTournament = game?.featuredTournamentSlug
    ? tournaments.find((tournament) => tournament.slug === game.featuredTournamentSlug) || null
    : tournaments[0] || null;
  const liveResult = useLiveTournamentResult(featuredTournament?.slug || '');

  if (!game) {
    return (
      <HubScreen
        actions={[{ label: 'Home', href: '/' }]}
        eyebrow="Game not found"
        lead="That game page is not available."
        subtitle="Check the game link and try again."
        title="Unknown game">
        <EmptyState
          action={<ActionButton href="/">Back home</ActionButton>}
          body="Use the home page to return to the active game and tournament paths."
          title="Nothing to show here"
        />
      </HubScreen>
    );
  }

  const results = mergeResults(
    getResultsForGame(game.slug),
    liveResult?.gameSlug === game.slug ? liveResult : null,
  );
  const featuredStreams = featuredTournament?.streamSlugs
    ? featuredTournament.streamSlugs
        .map((streamSlug) => getStreamBySlug(streamSlug))
        .filter(Boolean)
    : [];
  const upcomingTournaments = tournaments.filter((tournament) => tournament.status === 'upcoming');
  const visibleUpcomingTournaments = featuredTournament
    ? upcomingTournaments.filter((tournament) => tournament.slug !== featuredTournament.slug)
    : upcomingTournaments;
  const isPrimaryGame = game.slug === siteData.site.primaryGameSlug;

  const stats = [
    { label: 'Status', value: game.status === 'active' ? 'Active' : 'Coming soon', tone: game.status === 'active' ? 'green' : 'blue' },
    { label: 'Upcoming', value: String(upcomingTournaments.length), tone: 'accent' },
    { label: 'Entry', value: 'Free', tone: 'green' },
  ];

  const actions = [];
  if (featuredTournament) {
    actions.push({ label: 'Open featured event', href: getTournamentPath(featuredTournament.slug) });
    actions.push({ label: 'Sign up', href: getCheckInPath(featuredTournament.slug), variant: 'secondary' });
  }
  actions.push({ label: 'Rules', href: '/rules', variant: 'secondary' });
  actions.push({ label: 'Results', href: '/results', variant: 'ghost' });

  return (
    <HubScreen
      actions={actions}
      eyebrow={game.badge}
      footerNote={siteData.site.adminNote}
      lead={game.heroCopy}
      stats={stats}
      subtitle={
        isPrimaryGame
          ? 'Launch game'
          : game.status === 'active'
            ? 'Currently featured'
            : featuredTournament
              ? 'Featured event available'
              : 'Coming soon'
      }
      title={game.name}>
      <Section description="Where this game fits in the tournament hub." title="Game snapshot">
        <Surface style={styles.snapshotCard}>
          <Text style={styles.snapshotLabel}>{game.summary}</Text>
          <BulletList items={game.highlights} />
        </Surface>
      </Section>

      {featuredTournament ? (
        <Section
          description={
            isPrimaryGame
              ? 'Spades is the launch game, with the featured event and live coverage pinned at the top.'
              : 'The featured event is pinned first so the main tournament stays easy to find.'
          }
          title={isPrimaryGame ? 'Launch coverage' : 'Featured event'}>
          <Surface style={styles.featuredCard}>
            <View style={styles.featuredHeader}>
              <Text style={styles.featuredBadge}>{featuredTournament.badge}</Text>
              <Text style={styles.featuredMeta}>{featuredTournament.format}</Text>
            </View>
            <Text style={styles.featuredTitle}>{featuredTournament.title}</Text>
            {game.shortPath ? <Text style={styles.featuredPath}>{game.shortPath}</Text> : null}
            <Text style={styles.featuredLead}>{featuredTournament.detail}</Text>
            <Text style={styles.featuredEntry}>{featuredTournament.entryLine}</Text>
            {featuredTournament.callout ? <Text style={styles.featuredCallout}>{featuredTournament.callout}</Text> : null}
            <BulletList items={featuredTournament.highlights} tone="accent" />
            <View style={styles.featuredActions}>
              <ActionButton href={getTournamentPath(featuredTournament.slug)}>Open tournament</ActionButton>
              <ActionButton href={getCheckInPath(featuredTournament.slug)} variant="secondary">
                Sign up
              </ActionButton>
              <ActionButton href="/live" variant="secondary">
                Watch live
              </ActionButton>
            </View>
          </Surface>
        </Section>
      ) : null}

      {isPrimaryGame && featuredStreams.length ? (
        <Section
          description="These links stay pinned to the Spades launch mode so the live table and replays are one tap away."
          title="Launch streams">
          {featuredStreams.map((stream) => (
            <View key={stream.slug} style={styles.block}>
              <StreamCard stream={stream} />
            </View>
          ))}
        </Section>
      ) : null}

      <Section
        description="Future public events for this game."
        title="Upcoming tournaments">
        {visibleUpcomingTournaments.map((tournament) => (
          <View key={tournament.slug} style={styles.block}>
            <TournamentCard
              gameName={game.name}
              href={getTournamentPath(tournament.slug)}
              tournament={tournament}
            />
          </View>
        ))}
        {!visibleUpcomingTournaments.length ? (
          <EmptyState
            body={
              game.status === 'active'
                ? 'Future events will appear here when they are scheduled.'
                : 'This game is coming soon. Add the first public event once the format is ready.'
            }
            title={game.status === 'active' ? 'No upcoming events for this game' : 'No public events posted yet'}
          />
        ) : null}
      </Section>

      <Section
        description="Current public notes for this game."
        title="Rule blocks">
        {game.ruleSections.map((section) => (
          <View key={section.title} style={styles.block}>
            <RuleBlock section={section} />
          </View>
        ))}
      </Section>

      <Section
        description="Recent final tables for this game."
        title="Latest results">
        {results.map((result) => (
          <View key={result.slug} style={styles.block}>
            <ResultCard result={result} />
          </View>
        ))}
        {!results.length ? (
          <EmptyState
            action={<ActionButton href="/results">Open results page</ActionButton>}
            body="Posted results will appear here after an event is complete."
            title="No results recorded yet"
          />
        ) : null}
      </Section>
    </HubScreen>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 14,
  },
  featuredActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  featuredBadge: {
    color: '#D6A24E',
    fontSize: 12,
    letterSpacing: 0.8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  featuredCallout: {
    color: '#D6A24E',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
    fontWeight: '700',
  },
  featuredCard: {
    borderColor: 'rgba(214, 162, 78, 0.3)',
  },
  featuredEntry: {
    color: '#F4EFE6',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
    fontWeight: '700',
  },
  featuredHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  featuredLead: {
    color: '#AAB4AE',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  featuredMeta: {
    color: '#AAB4AE',
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: '800',
  },
  featuredPath: {
    color: '#D6A24E',
    fontSize: 12,
    letterSpacing: 0.8,
    fontWeight: '800',
    marginTop: 8,
    fontFamily: 'monospace',
  },
  featuredTitle: {
    color: '#F4EFE6',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
  },
  snapshotCard: {
    borderColor: 'rgba(214, 162, 78, 0.24)',
  },
  snapshotLabel: {
    color: '#F4EFE6',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 10,
  },
});

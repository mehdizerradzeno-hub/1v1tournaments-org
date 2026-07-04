import { Text, View, StyleSheet } from 'react-native';

import {
  ActionButton,
  Badge,
  GameCard,
  HubScreen,
  QuickActionCard,
  ResultCard,
  Section,
  StepStrip,
  StreamCard,
  StatPill,
  Surface,
  TournamentCard,
  EmptyState,
  BulletList,
} from '../components/hub-ui.jsx';
import {
  getGameBySlug,
  getGamePath,
  getGames,
  getResults,
  getStreams,
  getCheckInPath,
  getTournamentPath,
  getUpcomingTournaments,
  siteData,
} from '../lib/siteData.js';

function getHomeStats(upcomingCount, gameCount, streamCount) {
  return [
    { label: 'Next event', value: 'Jul 18', tone: 'accent' },
    { label: 'Signup', value: 'Open', tone: 'green' },
    { label: 'Events', value: String(upcomingCount), tone: 'accent' },
    { label: 'Games', value: String(gameCount), tone: 'blue' },
    { label: 'Streams', value: String(streamCount), tone: 'green' },
  ];
}

export default function HomeScreen() {
  const games = getGames();
  const streams = getStreams();
  const upcoming = getUpcomingTournaments();
  const results = getResults();
  const spades = getGameBySlug(siteData.site.primaryGameSlug);
  const gameLookup = new Map(games.map((game) => [game.slug, game]));
  const featuredTournament = getUpcomingTournaments().find(
    (tournament) => tournament.slug === siteData.site.primaryTournamentSlug,
  ) || upcoming[0] || null;
  const featuredTournamentPath = featuredTournament ? getTournamentPath(featuredTournament.slug) : '/';
  const featuredSignupPath = featuredTournament ? getCheckInPath(featuredTournament.slug) : '/';

  return (
    <HubScreen
      actions={[
        { label: 'Sign up for Spades', href: featuredSignupPath },
        { label: 'View tournament', href: featuredTournamentPath, variant: 'secondary' },
        { label: 'Open Spades', href: getGamePath(siteData.site.primaryGameSlug), variant: 'secondary' },
        { label: 'Host admin', href: '/admin', variant: 'ghost' },
      ]}
      eyebrow="Official website"
      footerNote={siteData.site.adminNote}
      lead="Create a player account, join the roster, open your match link, and let the hub track the bracket."
      stats={getHomeStats(upcoming.length, games.length, streams.length)}
      subtitle="Free-entry Spades tournaments with account-based signup and hosted brackets."
      title={siteData.site.name}>
      <Section
        description="The main paths for players and the host are always one tap away."
        title="Start here">
        <View style={styles.quickGrid}>
          <QuickActionCard
            actionLabel="Create account and join"
            body="Reserve your spot with a player account so future match rooms can verify your seat."
            href={featuredSignupPath}
            meta="Player"
            title="Sign up"
            tone="green"
          />
          <QuickActionCard
            actionLabel="See roster and matches"
            body="Open the event page for live signup count, bracket status, match links, streams, and rules."
            href={featuredTournamentPath}
            meta="Event"
            title="Tournament page"
            tone="accent"
          />
          <QuickActionCard
            actionLabel="Launch game"
            body="Use Spades for gameplay. Tournament links send players into the right match room."
            href={getGamePath(siteData.site.primaryGameSlug)}
            meta="Game"
            title="Play Spades"
            tone="blue"
          />
          <QuickActionCard
            actionLabel="Load roster and bracket"
            body="Host controls live in the private admin console for roster review and bracket generation."
            href="/admin"
            meta="Host"
            title="Admin console"
            tone="rose"
          />
        </View>
      </Section>

      <Section description="This is the operating flow for the first live Spades bracket." title="How a tournament runs">
        <StepStrip
          steps={[
            { title: 'Players sign up', body: 'Each signup is tied to a player account on the hub.' },
            { title: 'Host generates bracket', body: 'The admin console seeds matches from the live roster.' },
            { title: 'Players open match links', body: 'Spades handles gameplay while the hub owns tournament state.' },
            { title: 'Winner advances', body: 'Match results report back to the hub and update the bracket.' },
          ]}
        />
      </Section>

      {featuredTournament ? (
        <Section
          action={<ActionButton href={featuredSignupPath}>Sign up</ActionButton>}
          description="This is the next event players should use for testing and real signups."
          title="Featured tournament">
          <TournamentCard
            gameName={gameLookup.get(featuredTournament.gameSlug)?.name || featuredTournament.gameSlug}
            href={featuredTournamentPath}
            tournament={featuredTournament}
          />
        </Section>
      ) : null}

      {spades ? (
        <Section
          description="Spades is the gameplay app. The tournament hub creates the match links and bracket context."
          title="Spades spotlight">
          <Surface style={styles.spadesSpotlight}>
            <View style={styles.spadesTopRow}>
              <Badge tone="accent">Featured game</Badge>
              <Text style={styles.spadesPath}>/spades</Text>
            </View>
            <Text style={styles.spadesTitle}>{spades.name}</Text>
            <Text style={styles.spadesLead}>{spades.heroCopy}</Text>
            <BulletList items={spades.highlights} tone="accent" />
            <View style={styles.spadesStats}>
              {spades.quickFacts.map((fact) => (
                <StatPill key={fact.label} label={fact.label} value={fact.value} tone="accent" />
              ))}
            </View>
            <View style={styles.spadesActions}>
              <ActionButton href={getGamePath(spades.slug)}>Open Spades</ActionButton>
              <ActionButton href={getTournamentPath(siteData.site.primaryTournamentSlug)} variant="secondary">
                Tournament page
              </ActionButton>
            </View>
          </Surface>
        </Section>
      ) : null}

      <Section
        description="All public events are listed here after the featured event."
        title="Upcoming events">
        {upcoming.filter((tournament) => tournament.slug !== featuredTournament?.slug).map((tournament) => (
          <View key={tournament.slug} style={styles.block}>
            <TournamentCard
              gameName={gameLookup.get(tournament.gameSlug)?.name || tournament.gameSlug}
              href={getTournamentPath(tournament.slug)}
              tournament={tournament}
            />
          </View>
        ))}
        {!upcoming.length ? (
          <EmptyState
            body="New public events will appear here when they are scheduled."
            title="No upcoming tournaments yet"
          />
        ) : null}
      </Section>

      <Section
        description="Spades is active now. More games can use the same tournament flow later."
        title="Games on deck">
        {games.map((game) => (
          <View key={game.slug} style={styles.block}>
            <GameCard game={game} href={getGamePath(game.slug)} />
          </View>
        ))}
      </Section>

      <Section
        description="Live table and replay links for current events."
        title="Stream and YouTube links">
        {streams.map((stream) => (
          <StreamCard key={stream.slug} stream={stream} />
        ))}
      </Section>

      <Section
        action={<ActionButton href="/results" variant="secondary">All results</ActionButton>}
        description="Completed events show here after winners are posted."
        title="Latest results">
        {results.slice(0, 2).map((result) => (
          <View key={result.slug} style={styles.block}>
            <ResultCard result={result} />
          </View>
        ))}
        {!results.length ? (
          <EmptyState
            body="Once a tournament closes, the result record can be added here without touching the page layout."
            title="No results yet"
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
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginRight: -12,
  },
  spadesSpotlight: {
    borderColor: 'rgba(214, 162, 78, 0.28)',
  },
  spadesTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  spadesPath: {
    color: '#D6A24E',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    fontFamily: 'monospace',
  },
  spadesTitle: {
    color: '#F4EFE6',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    marginBottom: 8,
  },
  spadesLead: {
    color: '#F4EFE6',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 12,
  },
  spadesStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  spadesActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
});

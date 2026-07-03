import { Text, View, StyleSheet } from 'react-native';

import {
  ActionButton,
  Badge,
  GameCard,
  HubScreen,
  ResultCard,
  Section,
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
  getTournamentPath,
  getUpcomingTournaments,
  siteData,
} from '../lib/siteData.js';

function getHomeStats(upcomingCount, gameCount, streamCount) {
  return [
    { label: 'Upcoming', value: String(upcomingCount), tone: 'accent' },
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

  return (
    <HubScreen
      actions={[
        { label: 'Open Spades', href: getGamePath(siteData.site.primaryGameSlug) },
        { label: 'About', href: '/about', variant: 'secondary' },
        { label: 'Contact', href: '/contact', variant: 'secondary' },
        { label: 'Live links', href: '/live', variant: 'secondary' },
        { label: 'Rules', href: '/rules', variant: 'ghost' },
      ]}
      eyebrow="Official website"
      footerNote={siteData.site.adminNote}
      lead={siteData.site.tagline}
      stats={getHomeStats(upcoming.length, games.length, streams.length)}
      subtitle={siteData.site.headline}
      title={siteData.site.name}>
      <Section
        description="This is the public organization site while Spades is live and Euchre is still being prepared."
        title="Organization snapshot">
        <Surface style={styles.organizationCard}>
          <Text style={styles.organizationTitle}>{siteData.organization.mission}</Text>
          <BulletList items={siteData.organization.focus} tone="blue" />
          <View style={styles.organizationActions}>
            <ActionButton href="/about">About the organization</ActionButton>
            <ActionButton href={`mailto:${siteData.site.contactEmail}`} external variant="secondary">
              Contact by email
            </ActionButton>
          </View>
        </Surface>
      </Section>

      {spades ? (
        <Section
          description="Spades is the launch lane for the public site, with a direct route and the featured tournament already attached."
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
                Featured event
              </ActionButton>
            </View>
          </Surface>
        </Section>
      ) : null}

      <Section
        description="Upcoming events are sorted by date and stay free to edit in one config file."
        title="Upcoming tournaments">
        {upcoming.map((tournament) => (
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
            body="Add a tournament entry to the content file and it will show up here immediately."
            title="No upcoming tournaments yet"
          />
        ) : null}
      </Section>

      <Section
        description="Spades is active now. Euchre is coming soon."
        title="Games on deck">
        {games.map((game) => (
          <View key={game.slug} style={styles.block}>
            <GameCard game={game} href={getGamePath(game.slug)} />
          </View>
        ))}
      </Section>

      <Section
        description="Stream links stay in one editable file and point at the live table, replay archive, and channel page."
        title="Stream and YouTube links">
        {streams.map((stream) => (
          <StreamCard key={stream.slug} stream={stream} />
        ))}
      </Section>

      <Section
        action={<ActionButton href="/results" variant="secondary">All results</ActionButton>}
        description="Scoreboards are captured from the same editable event data."
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
  organizationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  organizationCard: {
    borderColor: 'rgba(108, 199, 255, 0.24)',
  },
  organizationTitle: {
    color: '#F4EFE6',
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
    marginBottom: 12,
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

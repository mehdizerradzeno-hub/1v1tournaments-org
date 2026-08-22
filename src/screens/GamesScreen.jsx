import { StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  EmptyState,
  GameCard,
  HubScreen,
  PlayerRouteStrip,
  QuickActionCard,
  Section,
  Surface,
} from '../components/hub-ui.jsx';
import { getGamePath, getGames, siteData } from '../lib/siteData.js';

export default function GamesScreen() {
  const games = getGames();

  const activeGames = games.filter((game) => game.status === 'active');
  const comingSoonGames = games.filter((game) => game.status !== 'active');

  return (
    <HubScreen
      actions={[
        { label: 'Next tournament', href: '/next' },
        { label: 'Leagues', href: '/leagues', variant: 'secondary' },
        { label: 'Profile', href: '/account', variant: 'ghost' },
      ]}
      eyebrow="Game directory"
      footerNote={siteData.site.adminNote}
      heroVariant="compact"
      lead="Choose a game, then enter tournament or league competition through the same shared 1V1 account."
      stats={[
        { label: 'Games', value: String(games.length), tone: 'accent' },
        { label: 'Live', value: String(activeGames.length), tone: 'green' },
        { label: 'Coming soon', value: String(comingSoonGames.length), tone: 'blue' },
      ]}
      stickyActions={false}
      subtitle="One account across competitive card games"
      title="Compete">
      <PlayerRouteStrip
        body="Choose a game for its formats and rules, or go directly to the next tournament when you are ready to play."
      />

      <Section
        description="Spades is the current public competition game. Euchre remains visible while its public event rollout is prepared."
        title="Current lineup">
        {games.map((game) => (
          <View key={game.slug} style={styles.block}>
            <GameCard game={game} href={getGamePath(game.slug)} />
          </View>
        ))}
      </Section>

      <Section
        description="Pick the competition path that matches what you want to do now."
        title="Choose your competition">
        <View style={styles.pathGrid}>
          <QuickActionCard
            actionLabel="Open next event"
            body="See the current signup state, countdown, roster, and bracket path."
            href="/next"
            meta="Fastest path"
            title="Tournament play"
            tone="accent"
          />
          <QuickActionCard
            actionLabel="Browse leagues"
            body="Join recurring weekly competition and track standings across a season."
            href="/leagues"
            meta="Season play"
            title="League play"
            tone="blue"
          />
          <QuickActionCard
            actionLabel="Open profile"
            body="Use one account for registration, match assignments, and competitive history."
            href="/account"
            meta="Shared account"
            title="Your player profile"
            tone="green"
          />
        </View>
      </Section>

      <Section description="Availability labels distinguish public competition from apps still moving through release rollout." title="Release status">
        <Surface style={styles.noteCard}>
          <Text style={styles.noteCopy}>
            Spades currently owns public tournament and league play. Euchre keeps its game page and shared-account path without advertising public events before they are ready.
          </Text>
          <ActionButton href={getGamePath(siteData.site.primaryGameSlug)} variant="secondary">
            Open Spades
          </ActionButton>
        </Surface>
      </Section>

      {!games.length ? (
        <EmptyState
          action={<ActionButton href="/">Back home</ActionButton>}
          body="Games will appear here when they are published."
          title="No games configured"
        />
      ) : null}
    </HubScreen>
  );
}

const styles = StyleSheet.create({
  pathGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  block: {
    marginBottom: 14,
  },
  noteCard: {
    borderColor: 'rgba(94, 127, 163, 0.24)',
  },
  noteCopy: {
    color: '#A7A29A',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
});

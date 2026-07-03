import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, EmptyState, GameCard, HubScreen, Section, Surface } from '../components/hub-ui.jsx';
import { getGamePath, getGames, siteData } from '../lib/siteData.js';

export default function GamesScreen() {
  const games = getGames();

  const activeGames = games.filter((game) => game.status === 'active');
  const comingSoonGames = games.filter((game) => game.status !== 'active');

  return (
    <HubScreen
      actions={[
        { label: 'Spades', href: getGamePath(siteData.site.primaryGameSlug) },
        { label: 'Rules', href: '/rules', variant: 'secondary' },
        { label: 'Live', href: '/live', variant: 'ghost' },
      ]}
      eyebrow="Game directory"
      footerNote={siteData.site.adminNote}
      lead="This page gives both current game slots a stable home, with Spades featured first and Euchre marked as coming soon."
      stats={[
        { label: 'Games', value: String(games.length), tone: 'accent' },
        { label: 'Live', value: String(activeGames.length), tone: 'green' },
        { label: 'Coming soon', value: String(comingSoonGames.length), tone: 'blue' },
      ]}
      subtitle="Browse the current card-game lineup"
      title="All games">
      <Section
        description="Spades is live today. Euchre is coming soon."
        title="Current lineup">
        {games.map((game) => (
          <View key={game.slug} style={styles.block}>
            <GameCard game={game} href={getGamePath(game.slug)} />
          </View>
        ))}
      </Section>

      <Section description="This route keeps the current lineup visible and gives future games a place to land." title="Why this page exists">
        <Surface style={styles.noteCard}>
          <Text style={styles.noteCopy}>
            Add another game object, give it a slug, and it can be surfaced here immediately with the same card layout.
          </Text>
          <ActionButton href="/rules" variant="secondary">
            Keep the format notes nearby
          </ActionButton>
        </Surface>
      </Section>

      {!games.length ? (
        <EmptyState
          action={<ActionButton href="/">Back home</ActionButton>}
          body="The shared content file is empty, so there are no games to display yet."
          title="No games configured"
        />
      ) : null}
    </HubScreen>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 14,
  },
  noteCard: {
    borderColor: 'rgba(108, 199, 255, 0.24)',
  },
  noteCopy: {
    color: '#AAB4AE',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
});

import { StyleSheet, Text, View } from 'react-native';

import {
  Badge,
  HubScreen,
  RuleBlock,
  Section,
  Surface,
} from '../components/hub-ui.jsx';
import { getGames, getGeneralRules, siteData } from '../lib/siteData.js';

export default function RulesScreen() {
  const games = getGames();
  const generalRules = getGeneralRules();

  return (
    <HubScreen
      actions={[
        { label: 'Spades', href: '/spades' },
        { label: 'Results', href: '/results', variant: 'secondary' },
        { label: 'Live', href: '/live', variant: 'ghost' },
      ]}
      eyebrow="Rules"
      footerNote={siteData.site.adminNote}
      lead="General event rules come first, then the game-specific notes for Spades and the coming-soon Euchre lane."
      stats={[
        { label: 'Games', value: String(games.length), tone: 'blue' },
        { label: 'Blocks', value: String(generalRules.length), tone: 'accent' },
        { label: 'Entry', value: 'Free', tone: 'green' },
      ]}
      subtitle="Free entry, no buy-in, no wagering."
      title="How the hub is run">
      <Section description="These rules apply across every event on the site." title="General event rules">
        {generalRules.map((section) => (
          <View key={section.title} style={styles.block}>
            <RuleBlock section={section} />
          </View>
        ))}
      </Section>

      <Section
        description="Each game keeps its own rule block so the page stays easy to maintain."
        title="Game-specific notes">
        {games.map((game) => (
          <View key={game.slug} style={styles.gameGroup}>
            <Surface style={[styles.gameHeader, { borderColor: game.accent }]}>
              <View style={styles.gameHeaderRow}>
                <Badge tone={game.status === 'active' ? 'green' : 'blue'}>
                  {game.badge}
                </Badge>
                <Text style={styles.gameStatus}>{game.status.toUpperCase()}</Text>
              </View>
              <Text style={styles.gameTitle}>{game.name}</Text>
              <Text style={styles.gameSummary}>{game.summary}</Text>
            </Surface>

            {game.ruleSections.map((section) => (
              <View key={`${game.slug}-${section.title}`} style={styles.block}>
                <RuleBlock section={section} />
              </View>
            ))}
          </View>
        ))}
      </Section>
    </HubScreen>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 14,
  },
  gameGroup: {
    marginBottom: 12,
  },
  gameHeader: {
    marginBottom: 14,
    borderColor: 'rgba(214, 162, 78, 0.24)',
  },
  gameHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gameStatus: {
    color: '#AAB4AE',
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: '800',
  },
  gameTitle: {
    color: '#F4EFE6',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
  },
  gameSummary: {
    color: '#AAB4AE',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
});

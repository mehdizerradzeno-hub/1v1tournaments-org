import { StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  Badge,
  EmptyState,
  HubScreen,
  ResultCard,
  Section,
  Surface,
} from '../components/hub-ui.jsx';
import { getGames, getGamePath, getResults, getResultsForGame, siteData } from '../lib/siteData.js';

export default function ResultsScreen() {
  const games = getGames();
  const results = getResults();
  const latestResult = results[0] || null;

  return (
    <HubScreen
      actions={[
        { label: 'Spades', href: getGamePath(siteData.site.primaryGameSlug) },
        { label: 'Rules', href: '/rules', variant: 'secondary' },
        { label: 'Live', href: '/live', variant: 'ghost' },
      ]}
      eyebrow="Results"
      footerNote={siteData.site.adminNote}
      lead="Archived scoreboards and final tables live here after events are complete."
      stats={[
        { label: 'Results', value: String(results.length), tone: 'accent' },
        { label: 'Games', value: String(games.length), tone: 'blue' },
        { label: 'Latest winner', value: latestResult ? latestResult.winner : 'TBD', tone: 'green' },
      ]}
      subtitle="Recent scoreboards and final tables for the public organization site"
      title="Results archive">
      <Section description="The latest results appear first." title="Recent results">
        {results.map((result) => (
          <View key={result.slug} style={styles.block}>
            <ResultCard result={result} />
          </View>
        ))}
        {!results.length ? (
          <EmptyState
            action={<ActionButton href="/spades">View Spades</ActionButton>}
            body="Completed events will appear here after winners are posted."
            title="No results recorded yet"
          />
        ) : null}
      </Section>

      <Section description="Each game gets a slot even before its first result exists." title="Game archive">
        {games.map((game) => {
          const gameResults = getResultsForGame(game.slug);
          const latestGameResult = gameResults[0] || null;

          return (
            <View key={game.slug} style={styles.gameGroup}>
              <Surface style={[styles.gameHeader, { borderColor: game.accent }]}>
                <View style={styles.gameHeaderTop}>
                  <Badge tone={game.status === 'active' ? 'green' : 'blue'}>
                    {game.badge}
                  </Badge>
                  <ActionButton href={getGamePath(game.slug)} variant="ghost">
                    Open game
                  </ActionButton>
                </View>
                <Text style={styles.gameTitle}>{game.name}</Text>
                <Text style={styles.gameSummary}>{game.summary}</Text>
              </Surface>

              {latestGameResult ? (
                <ResultCard result={latestGameResult} />
              ) : (
                <EmptyState
                  action={<ActionButton href={getGamePath(game.slug)}>Open game page</ActionButton>}
                  body={
                    game.status === 'active'
                      ? 'Add a completed result record and it will show up here.'
                      : 'This game does not have any posted results yet.'
                  }
                  title={`${game.name} results will appear here`}
                />
              )}
            </View>
          );
        })}
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
    borderColor: 'rgba(214, 162, 78, 0.24)',
    marginBottom: 14,
  },
  gameHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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

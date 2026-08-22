import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  Badge,
  CompetitionFilterTabs,
  EmptyState,
  HubScreen,
  PlayerRouteStrip,
  ResultCard,
  Section,
  StatPill,
  Surface,
} from '../components/hub-ui.jsx';
import { formatResultDate } from '../lib/format.js';
import { getGames, getGamePath, getResults, getTournamentPath, siteData } from '../lib/siteData.js';
import { useMergedLiveResults } from '../lib/liveResults.js';

export default function ResultsScreen() {
  const games = getGames();
  const results = useMergedLiveResults(getResults());
  const [activeGame, setActiveGame] = useState('all');
  const filteredResults = useMemo(
    () => activeGame === 'all'
      ? results
      : results.filter((result) => result.gameSlug === activeGame),
    [activeGame, results],
  );
  const activeGameLabel = activeGame === 'all'
    ? 'All games'
    : games.find((game) => game.slug === activeGame)?.name || 'Game';
  const championCount = new Set(filteredResults.map((result) => result.winner).filter(Boolean)).size;
  const filterItems = [
    { id: 'all', label: 'All games', count: results.length },
    ...games.map((game) => ({
      id: game.slug,
      label: game.name,
      count: results.filter((result) => result.gameSlug === game.slug).length,
    })),
  ];
  const latestTournamentPath = results[0]?.tournamentSlug
    ? getTournamentPath(results[0].tournamentSlug)
    : '/next';

  return (
    <HubScreen
      actions={[
        { label: 'Leaderboard', href: '/leaderboard' },
        { label: 'Rules', href: '/rules', variant: 'secondary' },
      ]}
      eyebrow="Results"
      footerNote={siteData.site.adminNote}
      heroVariant="compact"
      lead="Archived scoreboards and final tables live here after events are complete."
      subtitle="Posted scoreboards and final tables"
      stickyActions={false}
      title="Results archive">
      <PlayerRouteStrip
        body="Results are the archive. If you are here before or during an event, go straight to the next tournament, your match, or the live table."
      />

      <CompetitionFilterTabs
        activeId={activeGame}
        items={filterItems}
        label="Filter tournament results by game"
        onSelect={setActiveGame}
      />

      <Surface
        accessibilityRole="tabpanel"
        aria-labelledby={`competition-filter-${activeGame}`}
        nativeID="competition-filter-panel"
        style={styles.summaryCard}>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryEyebrow}>{activeGameLabel}</Text>
          <Text style={styles.summaryTitle}>Permanent competition record</Text>
          <Text style={styles.summaryBody}>Final placements stay attached to their event page and ranking history.</Text>
        </View>
        <View style={styles.summaryStats}>
          <StatPill label="Events" value={String(filteredResults.length)} tone="accent" />
          <StatPill label="Champions" value={String(championCount)} tone="green" />
          <StatPill label="Latest" value={filteredResults[0] ? formatResultDate(filteredResults[0].date) : 'Pending'} tone="blue" />
        </View>
      </Surface>

      <Section
        action={<ActionButton href={latestTournamentPath}>Open latest tournament</ActionButton>}
        description="Completed finals, placements, and posting notes appear here in newest-first order."
        nativeID="recent-results"
        title="Recent results">
        {filteredResults.map((result) => (
          <View key={result.slug} style={styles.block}>
            <ResultCard
              href={result.tournamentSlug ? getTournamentPath(result.tournamentSlug) : undefined}
              result={result}
            />
          </View>
        ))}
        {!filteredResults.length ? (
          <EmptyState
            action={<ActionButton href="/next">Open next tournament</ActionButton>}
            body={`${activeGameLabel} results will appear here after a bracket closes and the final is recorded.`}
            title={`No ${activeGameLabel.toLowerCase()} results yet`}
          />
        ) : null}
      </Section>

      <Section
        description="A compact per-game status view so players can quickly see what has posted."
        title="Game archive">
        {games.map((game) => {
          const gameResults = results.filter((result) => result.gameSlug === game.slug);
          const latestGameResult = gameResults[0] || null;

          return (
            <View key={game.slug} style={styles.gameGroup}>
              <GameArchiveCard
                game={game}
                resultCount={gameResults.length}
                latestResult={latestGameResult}
              />
            </View>
          );
        })}
      </Section>
    </HubScreen>
  );
}

function GameArchiveCard({ game, latestResult, resultCount }) {
  return (
    <Surface style={[styles.archiveCard, { borderColor: game.accent }]}>
      <View style={styles.archiveTopRow}>
        <View style={styles.archiveTitleGroup}>
          <Text style={styles.archiveTitle}>{game.name}</Text>
          <Badge tone={game.status === 'active' ? 'green' : 'blue'}>
            {game.badge}
          </Badge>
        </View>
        <Text style={styles.archiveCount}>{resultCount} posted</Text>
      </View>

      <Text style={styles.archiveSummary}>{game.summary}</Text>

      <View style={styles.archiveResultBox}>
        {latestResult ? (
          <>
            <Text style={styles.archiveMeta}>Latest result</Text>
            <Text style={styles.archiveWinner}>{latestResult.winner}</Text>
            <Text style={styles.archiveDetail}>
              {latestResult.title} • {formatResultDate(latestResult.date)}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.archiveMeta}>No posted results yet</Text>
            <Text style={styles.archiveDetail}>
              {game.status === 'active'
                ? 'Completed event results will land here after the bracket closes.'
                : 'Coming soon. No public events are active for this game yet.'}
            </Text>
          </>
        )}
      </View>

      <View style={styles.archiveActions}>
        <ActionButton href={getGamePath(game.slug)}>
          Open game
        </ActionButton>
        <ActionButton href="/results#recent-results" variant="secondary">
          Recent results
        </ActionButton>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    alignItems: 'center',
    borderColor: 'rgba(214, 162, 78, 0.28)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 230,
  },
  summaryEyebrow: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  summaryTitle: {
    color: '#F4EFE6',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: 5,
  },
  summaryBody: {
    color: '#A7A29A',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5,
  },
  summaryStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  block: {
    marginBottom: 14,
  },
  gameGroup: {
    marginBottom: 12,
  },
  archiveCard: {
    borderColor: 'rgba(214, 162, 78, 0.24)',
  },
  archiveTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  archiveTitleGroup: {
    flex: 1,
    minWidth: 190,
  },
  archiveTitle: {
    color: '#F4EFE6',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 29,
    marginBottom: 10,
  },
  archiveCount: {
    color: '#A7A29A',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  archiveSummary: {
    color: '#A7A29A',
    fontSize: 14,
    lineHeight: 21,
  },
  archiveResultBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  archiveMeta: {
    color: '#D6A24E',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  archiveWinner: {
    color: '#F4EFE6',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
    marginTop: 4,
  },
  archiveDetail: {
    color: '#A7A29A',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  archiveActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
  },
});

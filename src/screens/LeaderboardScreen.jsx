import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  ActionButton,
  Badge,
  CompetitionFilterTabs,
  EmptyState,
  HubScreen,
  PlayerRouteStrip,
  Section,
  StatPill,
  Surface,
} from '../components/hub-ui.jsx';
import { formatPlacement, formatResultDate } from '../lib/format.js';
import { useMergedLiveResults } from '../lib/liveResults.js';
import { getGames, getGamePath, getResults } from '../lib/siteData.js';
import { theme } from '../lib/theme.js';
import { buildTournamentLeaderboard, summarizeTournamentLeaderboard } from '../lib/tournamentLeaderboard.js';

const RANKING_PRIORITIES = [
  { number: '01', title: 'Championships', body: 'Tournament wins carry the most weight.' },
  { number: '02', title: 'Finals', body: 'More championship-round appearances break the next tie.' },
  { number: '03', title: 'Match record', body: 'Bracket wins, then fewer losses, separate tied finalists.' },
  { number: '04', title: 'Events played', body: 'Participation is the final performance tie-break.' },
];

function rankLabel(rank) {
  if (rank === 1) return 'Circuit leader';
  if (rank <= 3) return 'Podium';
  if (rank <= 10) return 'Top 10';
  return 'Ranked';
}

function normalizeSearch(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US');
}

export default function LeaderboardScreen() {
  const games = useMemo(() => getGames(), []);
  const results = useMergedLiveResults(getResults());
  const [activeGame, setActiveGame] = useState('all');
  const [playerSearch, setPlayerSearch] = useState('');
  const filteredResults = useMemo(
    () => activeGame === 'all'
      ? results
      : results.filter((result) => result.gameSlug === activeGame),
    [activeGame, results],
  );
  const allEntries = useMemo(() => buildTournamentLeaderboard(results), [results]);
  const entries = useMemo(
    () => activeGame === 'all' ? allEntries : buildTournamentLeaderboard(filteredResults),
    [activeGame, allEntries, filteredResults],
  );
  const gameLeaderboards = useMemo(
    () => Object.fromEntries(games.map((game) => [
      game.slug,
      buildTournamentLeaderboard(results, { gameSlug: game.slug }),
    ])),
    [games, results],
  );
  const summary = useMemo(
    () => summarizeTournamentLeaderboard(entries, filteredResults),
    [entries, filteredResults],
  );
  const searchValue = normalizeSearch(playerSearch);
  const visibleEntries = useMemo(
    () => searchValue
      ? entries.filter((entry) => normalizeSearch(entry.name).includes(searchValue))
      : entries,
    [entries, searchValue],
  );
  const activeGameLabel = activeGame === 'all'
    ? 'All games'
    : games.find((game) => game.slug === activeGame)?.name || 'Game';
  const filterItems = [
    { id: 'all', label: 'All games', count: allEntries.length },
    ...games.map((game) => ({
      id: game.slug,
      label: game.name,
      count: gameLeaderboards[game.slug]?.length || 0,
    })),
  ];

  return (
    <HubScreen
      actions={[
        { label: 'Recent results', href: '/results' },
        { label: 'How ranking works', href: '/leaderboard#ranking-method', variant: 'secondary' },
      ]}
      eyebrow="Tournament rankings"
      footerNote="Tournament rankings are separate from the Spades in-game leaderboard and any future Euchre in-game leaderboard. This page tracks posted hosted-event performance only."
      heroVariant="compact"
      lead="See the circuit leaders, search the full field, and understand exactly how posted tournament performance is ordered."
      subtitle="Championships • finals • bracket record"
      stickyActions={false}
      title="Rankings">
      <PlayerRouteStrip
        body="Rankings update after results post. During an event, use the tournament page, My Match, or the live bracket."
      />

      <CompetitionFilterTabs
        activeId={activeGame}
        items={filterItems}
        label="Filter tournament rankings by game"
        onSelect={setActiveGame}
      />

      <Surface
        accessibilityRole="tabpanel"
        aria-labelledby={`competition-filter-${activeGame}`}
        nativeID="competition-filter-panel"
        style={styles.summaryCard}>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryEyebrow}>{activeGameLabel} circuit</Text>
          <Text style={styles.summaryTitle}>Current competition snapshot</Text>
          <Text style={styles.summaryBody}>Only completed events with posted placements enter these standings.</Text>
        </View>
        <View style={styles.summaryStats}>
          <StatPill label="Ranked players" value={String(summary.playerCount)} tone="accent" />
          <StatPill label="Completed events" value={String(summary.eventCount)} tone="green" />
          <StatPill label="Current leader" value={summary.topPlayer} tone="blue" />
        </View>
      </Surface>

      {entries.length ? (
        <>
          <Section
            description={`The top three in ${activeGameLabel.toLowerCase()} competition, based only on posted event history.`}
            title="Podium">
            <View style={styles.podiumGrid}>
              {entries.slice(0, 3).map((entry) => (
                <PodiumCard entry={entry} key={entry.name} />
              ))}
            </View>
          </Section>

          <Section
            action={<ActionButton href="/results" variant="secondary">Review results</ActionButton>}
            description="Search narrows the field without changing the official rank numbers."
            title={`${activeGameLabel} standings`}>
            <Surface style={styles.searchBar}>
              <View style={styles.searchCopy}>
                <Text style={styles.searchLabel}>Find a player</Text>
                <Text style={styles.searchHint}>{entries.length} ranked player{entries.length === 1 ? '' : 's'} in this circuit</Text>
              </View>
              <TextInput
                accessibilityLabel="Search ranked players"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setPlayerSearch}
                placeholder="Search player name"
                placeholderTextColor="#6B766F"
                returnKeyType="search"
                style={styles.searchInput}
                value={playerSearch}
              />
              {playerSearch ? (
                <ActionButton onPress={() => setPlayerSearch('')} variant="ghost">Clear</ActionButton>
              ) : null}
            </Surface>

            {visibleEntries.length ? (
              <View style={styles.table}>
                {visibleEntries.map((entry) => (
                  <LeaderboardRow entry={entry} key={entry.name} />
                ))}
              </View>
            ) : (
              <EmptyState
                action={<ActionButton onPress={() => setPlayerSearch('')}>Clear search</ActionButton>}
                body={`No ${activeGameLabel.toLowerCase()} ranking matches “${playerSearch.trim()}”.`}
                title="No ranked player found"
              />
            )}
          </Section>
        </>
      ) : (
        <Section
          description={`${activeGameLabel} standings begin after the first completed tournament posts placements.`}
          title="Standings opening soon">
          <EmptyState
            action={<ActionButton href="/next">Open next tournament</ActionButton>}
            body="No results have been backfilled or invented. Complete the first event and this page will build itself from the final bracket."
            title="No posted tournament standings yet"
          />
        </Section>
      )}

      <Section
        description="The ordering is achievement-based and deterministic. It is not an Elo or in-game skill rating."
        nativeID="ranking-method"
        title="How ranking works">
        <Surface style={styles.methodPanel}>
          <View style={styles.methodIntro}>
            <Badge tone="accent">Transparent order</Badge>
            <Text style={styles.methodTitle}>Win events first. Then prove consistency.</Text>
            <Text style={styles.methodBody}>
              Every ranking can be traced back to a posted tournament placement and bracket record.
            </Text>
          </View>
          <View style={styles.methodGrid}>
            {RANKING_PRIORITIES.map((priority) => (
              <View key={priority.number} style={styles.methodStep}>
                <Text style={styles.methodNumber}>{priority.number}</Text>
                <Text style={styles.methodStepTitle}>{priority.title}</Text>
                <Text style={styles.methodStepBody}>{priority.body}</Text>
              </View>
            ))}
          </View>
        </Surface>
      </Section>

      <Section
        description="Each game builds an independent event history while the all-games view recognizes cross-game results."
        title="Game circuits">
        <View style={styles.gameGrid}>
          {games.map((game) => {
            const gameEntries = gameLeaderboards[game.slug] || [];
            const gameLeader = gameEntries[0] || null;
            const eventCount = results.filter((result) => (
              result.gameSlug === game.slug && result.placements?.length
            )).length;

            return (
              <Surface key={game.slug} style={[styles.gameCard, { borderColor: game.accent }]}>
                <View style={styles.gameTopRow}>
                  <View style={styles.gameTitleGroup}>
                    <Text style={styles.gameTitle}>{game.name}</Text>
                    <Text style={styles.gameCopy}>
                      {gameEntries.length
                        ? `${gameEntries.length} ranked player${gameEntries.length === 1 ? '' : 's'} across ${eventCount} completed event${eventCount === 1 ? '' : 's'}.`
                        : 'No completed hosted-event standings yet.'}
                    </Text>
                  </View>
                  <Badge tone={gameEntries.length ? 'green' : 'blue'}>{game.badge}</Badge>
                </View>
                <View style={styles.gameLeaderBox}>
                  <Text style={styles.gameLeaderLabel}>Circuit leader</Text>
                  <Text style={styles.gameLeaderName}>{gameLeader?.name || 'TBD'}</Text>
                  <Text style={styles.gameLeaderMeta}>
                    {gameLeader ? `${gameLeader.tournamentWins} championship${gameLeader.tournamentWins === 1 ? '' : 's'}` : 'Waiting for posted results'}
                  </Text>
                </View>
                <View style={styles.gameActions}>
                  <ActionButton href={getGamePath(game.slug)} variant={gameEntries.length ? 'primary' : 'secondary'}>
                    Open {game.name}
                  </ActionButton>
                </View>
              </Surface>
            );
          })}
        </View>
      </Section>
    </HubScreen>
  );
}

function PodiumCard({ entry }) {
  const isLeader = entry.rank === 1;

  return (
    <Surface style={[styles.podiumCard, isLeader && styles.podiumCardLeader]}>
      <View style={styles.podiumTopRow}>
        <View style={[styles.podiumRank, isLeader && styles.podiumRankLeader]}>
          <Text style={[styles.podiumRankText, isLeader && styles.podiumRankTextLeader]}>#{entry.rank}</Text>
        </View>
        <Badge tone={isLeader ? 'accent' : 'blue'}>{rankLabel(entry.rank)}</Badge>
      </View>
      <Text accessibilityRole="header" aria-level={3} style={styles.podiumName}>{entry.name}</Text>
      <Text style={styles.podiumMeta}>
        {entry.eventsPlayed} event{entry.eventsPlayed === 1 ? '' : 's'} • {entry.gameSlugs.join(' + ') || 'All games'}
      </Text>
      <View style={styles.podiumStats}>
        <CompactStat label="Titles" value={entry.tournamentWins} />
        <CompactStat label="Finals" value={entry.finalsMade} />
        <CompactStat label="Record" value={`${entry.matchWins}-${entry.matchLosses}`} />
      </View>
      {entry.latestResult ? (
        <View style={styles.podiumLatest}>
          <Text style={styles.podiumLatestLabel}>Latest</Text>
          <Text numberOfLines={2} style={styles.podiumLatestTitle}>
            {formatPlacement(entry.latestResult.place)} • {entry.latestResult.title}
          </Text>
          <Text style={styles.podiumLatestDate}>{formatResultDate(entry.latestResult.date)}</Text>
        </View>
      ) : null}
    </Surface>
  );
}

function LeaderboardRow({ entry }) {
  return (
    <Surface style={[styles.rowCard, entry.rank <= 3 && styles.rowCardPodium]}>
      <View style={[styles.rankBadge, entry.rank === 1 && styles.rankBadgeLeader]}>
        <Text style={[styles.rankText, entry.rank === 1 && styles.rankTextLeader]}>#{entry.rank}</Text>
      </View>
      <View style={styles.playerBlock}>
        <View style={styles.playerNameRow}>
          <Text style={styles.playerName}>{entry.name}</Text>
          <Badge tone={entry.rank <= 3 ? 'accent' : entry.rank <= 10 ? 'blue' : 'neutral'}>{rankLabel(entry.rank)}</Badge>
        </View>
        <Text style={styles.playerMeta}>
          {entry.eventsPlayed} event{entry.eventsPlayed === 1 ? '' : 's'} • {entry.gameSlugs.join(', ') || 'All games'}
        </Text>
        {entry.latestResult ? (
          <Text numberOfLines={2} style={styles.playerRecent}>
            Latest: {formatPlacement(entry.latestResult.place)} at {entry.latestResult.title}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowStats}>
        <CompactStat label="Titles" value={entry.tournamentWins} />
        <CompactStat label="Finals" value={entry.finalsMade} />
        <CompactStat label="Record" value={`${entry.matchWins}-${entry.matchLosses}`} />
        <CompactStat label="Win rate" value={`${entry.winRate}%`} />
      </View>
    </Surface>
  );
}

function CompactStat({ label, value }) {
  return (
    <View style={styles.compactStat}>
      <Text style={styles.compactLabel}>{label}</Text>
      <Text style={styles.compactValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  compactLabel: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  compactStat: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: theme.colors.line,
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 76,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  compactValue: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
    marginTop: 2,
  },
  gameActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  gameCard: {
    flexBasis: 300,
    flexGrow: 1,
    minWidth: 250,
  },
  gameCopy: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 4,
  },
  gameGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gameLeaderBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: theme.colors.line,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  gameLeaderLabel: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  gameLeaderMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 3,
  },
  gameLeaderName: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
    marginTop: 5,
  },
  gameTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  gameTitleGroup: {
    flex: 1,
    minWidth: 190,
  },
  gameTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  methodBody: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
  },
  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  methodIntro: {
    maxWidth: 720,
  },
  methodNumber: {
    color: theme.colors.accent,
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  methodPanel: {
    borderColor: theme.colors.accentGlow,
  },
  methodStep: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: theme.colors.line,
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: 190,
    flexGrow: 1,
    minWidth: 170,
    padding: 14,
  },
  methodStepBody: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  methodStepTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
    marginTop: 8,
  },
  methodTitle: {
    color: theme.colors.text,
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 29,
    marginTop: 12,
  },
  playerBlock: {
    flex: 1,
    minWidth: 220,
  },
  playerMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 4,
  },
  playerName: {
    color: theme.colors.text,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
  },
  playerNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  playerRecent: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 5,
  },
  podiumCard: {
    borderColor: theme.colors.lineStrong,
    flexBasis: 250,
    flexGrow: 1,
    minWidth: 230,
  },
  podiumCardLeader: {
    backgroundColor: theme.colors.surfaceLift,
    borderColor: theme.colors.accent,
  },
  podiumGrid: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  podiumLatest: {
    borderTopColor: theme.colors.line,
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 12,
  },
  podiumLatestDate: {
    color: theme.colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  podiumLatestLabel: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  podiumLatestTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 4,
  },
  podiumMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 5,
  },
  podiumName: {
    color: theme.colors.text,
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 29,
    marginTop: 14,
  },
  podiumRank: {
    alignItems: 'center',
    backgroundColor: theme.colors.blueSoft,
    borderColor: theme.colors.blue,
    borderRadius: 14,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  podiumRankLeader: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  podiumRankText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  podiumRankTextLeader: {
    color: '#101010',
  },
  podiumStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 14,
  },
  podiumTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  rankBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLift,
    borderColor: theme.colors.lineStrong,
    borderRadius: 16,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  rankBadgeLeader: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  rankText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  rankTextLeader: {
    color: '#101010',
  },
  rowCard: {
    alignItems: 'center',
    borderColor: theme.colors.lineStrong,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 14,
  },
  rowCardPodium: {
    borderColor: theme.colors.accentGlow,
  },
  rowStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  searchBar: {
    alignItems: 'center',
    borderColor: theme.colors.lineStrong,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14,
    padding: 12,
  },
  searchCopy: {
    flex: 1,
    minWidth: 170,
  },
  searchHint: {
    color: theme.colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  searchInput: {
    backgroundColor: theme.colors.backgroundAlt,
    borderColor: theme.colors.lineStrong,
    borderRadius: 14,
    borderWidth: 1,
    color: theme.colors.text,
    flexBasis: 260,
    flexGrow: 1,
    fontSize: 14,
    minHeight: 46,
    minWidth: 210,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  searchLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  summaryBody: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5,
  },
  summaryCard: {
    alignItems: 'center',
    borderColor: theme.colors.lineStrong,
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
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  summaryStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  summaryTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: 5,
  },
  table: {
    gap: 9,
  },
});

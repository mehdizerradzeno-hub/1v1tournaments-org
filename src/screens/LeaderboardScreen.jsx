import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  Badge,
  EmptyState,
  HubScreen,
  PlayerRouteStrip,
  Section,
  StatPill,
  Surface,
} from '../components/hub-ui.jsx';
import { formatPlacement, formatResultDate } from '../lib/format.js';
import { getGames, getGamePath, getResults, siteData } from '../lib/siteData.js';
import { theme } from '../lib/theme.js';
import { buildTournamentLeaderboard } from '../lib/tournamentLeaderboard.js';
import { useMergedLiveResults } from '../lib/liveResults.js';

export default function LeaderboardScreen() {
  const games = getGames();
  const results = useMergedLiveResults(getResults(), siteData.site.primaryTournamentSlug);
  const entries = useMemo(() => buildTournamentLeaderboard(results), [results]);
  const leader = entries[0] || null;

  return (
    <HubScreen
      actions={[
        { label: 'Results', href: '/results' },
        { label: 'Rules', href: '/rules', variant: 'ghost' },
      ]}
      eyebrow="Tournament leaderboard"
      footerNote="Tournament rankings are separate from the Spades in-game leaderboard. This page tracks hosted event performance only."
      heroVariant="compact"
      lead="Tournament wins, finals, events played, and bracket match records live here after results post."
      subtitle="Hosted-event standings"
      stickyActions={false}
      title="Tournament rankings">
      <PlayerRouteStrip
        body="Rankings are for after results post. During an event, use the next tournament page, your match status, or the live view."
      />

      <Section
        description="The top player card shows the current tournament resume. It updates as completed event results are posted."
        title="Current leader">
        {leader ? (
          <LeaderboardHero entry={leader} />
        ) : (
          <EmptyState
            action={<ActionButton href="/tournaments/spades-summer-series">Open tournament</ActionButton>}
            body="Run and complete the first tournament, then the standings will appear here automatically."
            title="No tournament standings yet"
          />
        )}
      </Section>

      <Section
        action={<ActionButton href="/results" variant="secondary">Recent results</ActionButton>}
        description="Ranked by tournament wins first, then finals, bracket match wins, and losses."
        title="Overall standings">
        {entries.length ? (
          <View style={styles.table}>
            {entries.map((entry) => (
              <LeaderboardRow key={entry.name} entry={entry} />
            ))}
          </View>
        ) : (
          <EmptyState
            body="Completed tournament placements will create the first leaderboard rows."
            title="Waiting for posted results"
          />
        )}
      </Section>

      <Section
        description="Keep tournament reputation separate from the gameplay app leaderboard. Each game can grow its own event history."
        title="By game">
        {games.map((game) => {
          const gameEntries = buildTournamentLeaderboard(results, { gameSlug: game.slug });
          const gameLeader = gameEntries[0] || null;

          return (
            <Surface key={game.slug} style={[styles.gameCard, { borderColor: game.accent }]}>
              <View style={styles.gameTopRow}>
                <View style={styles.gameTitleGroup}>
                  <Text style={styles.gameTitle}>{game.name}</Text>
                  <Text style={styles.gameCopy}>
                    {game.status === 'active'
                      ? 'Active tournament standings for this game.'
                      : 'Coming soon. No hosted events are counted yet.'}
                  </Text>
                </View>
                <Badge tone={game.status === 'active' ? 'green' : 'blue'}>{game.badge}</Badge>
              </View>

              <View style={styles.gameStats}>
                <StatPill label="Players" value={String(gameEntries.length)} tone={game.status === 'active' ? 'green' : 'neutral'} />
                <StatPill label="Leader" value={gameLeader?.name || 'TBD'} tone="accent" />
                <StatPill label="Wins" value={String(gameLeader?.tournamentWins || 0)} tone="blue" />
              </View>

              <View style={styles.gameActions}>
                <ActionButton href={getGamePath(game.slug)} variant={game.status === 'active' ? 'primary' : 'secondary'}>
                  Open game
                </ActionButton>
              </View>
            </Surface>
          );
        })}
      </Section>
    </HubScreen>
  );
}

function LeaderboardHero({ entry }) {
  return (
    <Surface style={styles.heroCard}>
      <View style={styles.heroTopRow}>
        <Badge tone="accent">Rank #{entry.rank}</Badge>
        <Text style={styles.heroMeta}>{entry.eventsPlayed} event{entry.eventsPlayed === 1 ? '' : 's'} played</Text>
      </View>
      <Text style={styles.heroName}>{entry.name}</Text>
      <View style={styles.heroStats}>
        <StatPill label="Tournament wins" value={String(entry.tournamentWins)} tone="accent" />
        <StatPill label="Finals made" value={String(entry.finalsMade)} tone="green" />
        <StatPill label="Match record" value={`${entry.matchWins}-${entry.matchLosses}`} tone="blue" />
        <StatPill label="Win rate" value={`${entry.winRate}%`} tone="neutral" />
      </View>
      {entry.latestResult ? (
        <View style={styles.latestBox}>
          <Text style={styles.latestLabel}>Latest result</Text>
          <Text style={styles.latestTitle}>
            {formatPlacement(entry.latestResult.place)} • {entry.latestResult.title}
          </Text>
          <Text style={styles.latestDate}>{formatResultDate(entry.latestResult.date)}</Text>
        </View>
      ) : null}
    </Surface>
  );
}

function LeaderboardRow({ entry }) {
  return (
    <Surface style={styles.rowCard}>
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>#{entry.rank}</Text>
      </View>
      <View style={styles.playerBlock}>
        <Text style={styles.playerName}>{entry.name}</Text>
        <Text style={styles.playerMeta}>
          {entry.eventsPlayed} event{entry.eventsPlayed === 1 ? '' : 's'} • {entry.gameSlugs.join(', ') || 'All games'}
        </Text>
        {entry.latestResult ? (
          <Text style={styles.playerRecent}>
            Latest: {formatPlacement(entry.latestResult.place)} at {entry.latestResult.title}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowStats}>
        <CompactStat label="Wins" value={entry.tournamentWins} />
        <CompactStat label="Finals" value={entry.finalsMade} />
        <CompactStat label="Record" value={`${entry.matchWins}-${entry.matchLosses}`} />
        <CompactStat label="Rate" value={`${entry.winRate}%`} />
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
  heroCard: {
    borderColor: theme.colors.accent,
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  heroMeta: {
    color: theme.colors.muted,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  heroName: {
    color: theme.colors.text,
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 40,
    marginTop: 12,
  },
  heroStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  latestBox: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accentGlow,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  latestLabel: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  latestTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
    marginTop: 5,
  },
  latestDate: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 4,
  },
  table: {
    gap: 12,
  },
  rowCard: {
    alignItems: 'center',
    borderColor: theme.colors.lineStrong,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  rankBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accentGlow,
    borderRadius: 18,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  rankText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  playerBlock: {
    flex: 1,
    minWidth: 220,
  },
  playerName: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 25,
  },
  playerMeta: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 3,
  },
  playerRecent: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 5,
  },
  rowStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  compactStat: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: theme.colors.line,
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 80,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  compactLabel: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  compactValue: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
    marginTop: 2,
  },
  gameCard: {
    marginBottom: 12,
  },
  gameTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  gameTitleGroup: {
    flex: 1,
    minWidth: 220,
  },
  gameTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  gameCopy: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 4,
  },
  gameStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
  },
  gameActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
  },
});

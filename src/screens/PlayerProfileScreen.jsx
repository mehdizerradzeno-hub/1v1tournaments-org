import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  Badge,
  EmptyState,
  HubScreen,
  Section,
  StatPill,
  Surface,
} from '../components/hub-ui.jsx';
import { getTournamentPath } from '../lib/siteData.js';
import { fetchPublicPlayerProfile } from '../lib/tournamentHostingClient.js';
import { theme } from '../lib/theme.js';

function normalizedHandle(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase();
}

function gameName(game) {
  return game === 'euchre' ? 'Euchre' : 'Spades';
}

function publicSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : '';
}

function GameRankCard({ rank }) {
  const position = rank.status === 'ranked' && Number.isInteger(rank.rank) ? `#${rank.rank}` : 'Unranked';
  return (
    <Surface style={styles.card}>
      <View style={styles.topRow}>
        <Badge tone={rank.status === 'ranked' ? 'accent' : 'neutral'}>{gameName(rank.game)}</Badge>
        <Text style={styles.position}>{position}</Text>
      </View>
      <Text style={styles.cardTitle}>{rank.leaderboard || 'Game leaderboard'}</Text>
      <Text style={styles.cardMeta}>{rank.season || 'Current season'}</Text>
      <Text style={styles.cardMeta}>{rank.provisional ? 'Provisional placement' : 'Verified placement'}</Text>
    </Surface>
  );
}

function LeagueCard({ league }) {
  const record = league.record || {};
  const leagueSlug = publicSlug(league.id);
  return (
    <Surface style={styles.card}>
      <View style={styles.topRow}>
        <Badge tone="blue">{gameName(league.game)}</Badge>
        <Text style={styles.position}>{league.rank ? `#${league.rank}` : 'Standing pending'}</Text>
      </View>
      <Text style={styles.cardTitle}>{league.name}</Text>
      <Text style={styles.cardMeta}>{league.season?.name || 'Season'}</Text>
      <View style={styles.pills}>
        <StatPill label="W" tone="green" value={String(record.wins || 0)} />
        <StatPill label="L" tone="rose" value={String(record.losses || 0)} />
        <StatPill label="T" tone="neutral" value={String(record.ties || 0)} />
      </View>
      <View style={styles.action}>
        <ActionButton href={leagueSlug ? `/leagues?league=${encodeURIComponent(leagueSlug)}#standings` : '/leagues#standings'} variant="ghost">
          View league standings
        </ActionButton>
      </View>
    </Surface>
  );
}

function TournamentResultCard({ match }) {
  const slug = publicSlug(match.tournament?.slug);
  const score = match.scores ? Object.values(match.scores).join(' – ') : 'Score not posted';
  return (
    <Surface style={styles.matchCard}>
      <View style={styles.topRow}>
        <Badge tone={match.outcome === 'win' ? 'green' : 'neutral'}>{match.outcome === 'win' ? 'Win' : 'Loss'}</Badge>
        <Text style={styles.matchGame}>{gameName(match.game)}</Text>
      </View>
      <Text style={styles.cardTitle}>{match.tournament?.title || 'Hosted tournament'}</Text>
      <Text style={styles.cardMeta}>{match.round?.title || 'Tournament match'}</Text>
      <Text style={styles.score}>{score}</Text>
      <View style={styles.action}>
        <ActionButton href={slug ? getTournamentPath(slug) : '/tournaments'} variant="ghost">View tournament</ActionButton>
      </View>
    </Surface>
  );
}

function ProfileContent({ playerHandle }) {
  const [profile, setProfile] = useState(null);
  const [message, setMessage] = useState(playerHandle ? '' : 'Enter a valid player username.');
  const [loading, setLoading] = useState(Boolean(playerHandle));

  useEffect(() => {
    let cancelled = false;
    if (!playerHandle) return undefined;

    fetchPublicPlayerProfile(playerHandle)
      .then((result) => {
        if (!cancelled) setProfile(result.profile || result);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error?.message || 'Player profile could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [playerHandle]);

  const ranks = profile?.ranks || [];
  const leagues = profile?.leagues || [];
  const matches = profile?.tournaments?.verifiedMatches || [];
  const title = profile?.player?.displayName || (playerHandle ? `@${playerHandle}` : 'Player profile');

  return (
    <HubScreen
      actions={[{ label: 'Rankings', href: '/leaderboard', variant: 'secondary' }]}
      eyebrow="Public player card"
      footerNote="Game ranks are published by their game. This public card never exposes ratings, emails, account IDs, or private match data."
      heroVariant="compact"
      lead="Verified game rank, public league standing, and completed hosted-tournament results in one cross-game card."
      publicShell
      stickyActions={false}
      subtitle={profile?.player?.handle ? `@${profile.player.handle}` : '1v1 Tournaments'}
      title={title}>
      {loading ? (
        <Section title="Loading player profile">
          <EmptyState body="Checking verified rank and public competition history." title="Loading…" />
        </Section>
      ) : message ? (
        <Section title="Profile unavailable">
          <EmptyState action={<ActionButton href="/leaderboard" variant="secondary">Open rankings</ActionButton>} body={message} title="This player card could not be opened" />
        </Section>
      ) : (
        <>
          <Section description="Each game owns its competitive rating. The platform only carries forward the verified placement." title="Game ranks">
            {ranks.length ? <View style={styles.grid}>{ranks.map((rank) => <GameRankCard key={`${rank.game}-${rank.leaderboard}-${rank.season}`} rank={rank} />)}</View> : (
              <EmptyState body="A rank will appear after a game publishes a verified leaderboard placement." title="No game rank published yet" />
            )}
          </Section>

          <Section description="Only standings from public league seasons appear on a player card." title="League standing">
            {leagues.length ? <View style={styles.grid}>{leagues.map((league) => <LeagueCard key={league.id} league={league} />)}</View> : (
              <EmptyState body="No public league standing is available for this player right now." title="No league standing" />
            )}
          </Section>

          <Section description="A result appears only after the game’s signed completion finalizes the hosted bracket match." title="Verified tournament results">
            {matches.length ? <View style={styles.matches}>{matches.map((match, index) => <TournamentResultCard key={`${match.tournament?.slug}-${match.round?.index}-${index}`} match={match} />)}</View> : (
              <EmptyState body="Completed hosted-tournament results appear here after verification." title="No verified tournament results" />
            )}
          </Section>
        </>
      )}
    </HubScreen>
  );
}

export default function PlayerProfileScreen({ handle }) {
  const playerHandle = useMemo(() => normalizedHandle(handle), [handle]);
  return <ProfileContent key={playerHandle} playerHandle={playerHandle} />;
}

const styles = StyleSheet.create({
  action: { marginTop: 14 },
  card: { flexBasis: 280, flexGrow: 1, minWidth: 250 },
  cardMeta: { color: theme.colors.muted, fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: 4 },
  cardTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '900', lineHeight: 24, marginTop: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  matchCard: { width: '100%' },
  matchGame: { color: theme.colors.muted, fontSize: 12, fontWeight: '800' },
  matches: { gap: 10 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  position: { color: theme.colors.text, fontSize: 17, fontWeight: '900' },
  score: { color: theme.colors.accent, fontSize: 15, fontWeight: '900', lineHeight: 20, marginTop: 12 },
  topRow: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
});

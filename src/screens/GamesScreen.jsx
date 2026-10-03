import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, EmptyState, HubScreen, Section, Surface } from '../components/hub-ui.jsx';
import { getPublicGames } from '../lib/publicPresentationCatalog.js';

export default function GamesScreen() {
  const games = getPublicGames();

  return <HubScreen accountHref="/account" footerNote="Creating the competitive 1v1 spades category." heroVariant="compact" lead="Every game has a public information page. Tournament and play availability remain separate, explicit facts." publicShell stickyActions={false} subtitle="Four game lanes. One clear public path." title="Choose your game"><Section description="Explore the table that fits your game. A card never implies a tournament server integration." title="All games"><View style={styles.grid}>{games.map((game) => <Surface key={game.slug} style={[styles.gameCard, { borderColor: game.accent }]}><Text style={[styles.gameMark, { color: game.accent }]}>1V1</Text><Text style={styles.gameTitle}>{game.name}</Text><Text style={styles.gameSummary}>{game.summary}</Text><Text style={styles.gameAvailability}>{game.availability}</Text><ActionButton href={game.infoPath} variant="secondary">Explore {game.shortName}</ActionButton></Surface>)}</View></Section>{!games.length ? <EmptyState action={<ActionButton href="/">Back home</ActionButton>} body="Game information will appear here when it is published." title="No games configured" /> : null}</HubScreen>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  gameCard: { flexGrow: 1, flexShrink: 1, minWidth: 240, padding: 18 },
  gameMark: { fontFamily: 'Georgia', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  gameTitle: { color: '#F4EFE6', fontSize: 24, fontWeight: '900', lineHeight: 29, marginTop: 6 },
  gameSummary: { color: '#BDC6D0', fontSize: 14, lineHeight: 21, marginTop: 8 },
  gameAvailability: { color: '#E1C278', fontSize: 12, lineHeight: 18, marginBottom: 14, marginTop: 10 },
});

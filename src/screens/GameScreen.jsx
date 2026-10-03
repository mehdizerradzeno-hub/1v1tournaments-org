import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, EmptyState, HubScreen, ResultCard, Section, Surface } from '../components/hub-ui.jsx';
import { formatDateLine } from '../lib/format.js';
import { getResults, siteData } from '../lib/siteData.js';
import { fetchTournamentEvents } from '../lib/tournamentHostingClient.js';
import { filterPublicEventsByGame, getPublicGamePresentation, getPublicPresentationEvents } from '../lib/publicPresentationCatalog.js';
import { useVisibleNow } from '../lib/useVisibleNow.js';

export default function GameScreen({ gameSlug }) {
  const [hostedEvents, setHostedEvents] = useState([]);
  const game = getPublicGamePresentation(gameSlug);
  const nowMs = useVisibleNow(60000);
  const events = useMemo(() => filterPublicEventsByGame(getPublicPresentationEvents(siteData.tournaments, hostedEvents), game?.slug).filter((event) => event.status === 'live' || new Date(event.date).getTime() > nowMs), [game?.slug, hostedEvents, nowMs]);
  const results = useMemo(() => getResults().filter((result) => result.gameSlug === game?.slug), [game?.slug]);

  useEffect(() => {
    let active = true;
    fetchTournamentEvents().then((result) => { if (active) setHostedEvents(Array.isArray(result.tournaments) ? result.tournaments : []); }).catch(() => { if (active) setHostedEvents([]); });
    return () => { active = false; };
  }, []);

  if (!game) return <HubScreen accountHref="/account" heroVariant="compact" lead="That game page is not available." publicShell stickyActions={false} subtitle="Check the game link and try again." title="Unknown game"><EmptyState action={<ActionButton href="/games">Browse games</ActionButton>} body="Only published game information routes are available here." title="Nothing to show here" /></HubScreen>;

  return <HubScreen accountHref="/account" footerNote="Creating the competitive 1v1 spades category." heroVariant="compact" lead={game.summary} publicShell stickyActions={false} subtitle="Public game information" title={game.name}><Section description="This lane remains descriptive until a verified public event or play destination is available." title="Availability"><Surface style={[styles.availability, { borderColor: game.accent }]}><Text style={styles.availabilityLabel}>PUBLIC STATUS</Text><Text style={styles.availabilityText}>{game.availability}</Text><View style={styles.factRow}>{game.facts.map((fact) => <Text key={fact} style={styles.fact}>{fact}</Text>)}</View>{game.playPath && game.webReady ? <ActionButton href={game.playPath} variant="secondary">Open {game.shortName}</ActionButton> : <ActionButton href="/tournaments" variant="secondary">Browse tournaments</ActionButton>}</Surface></Section><Section description="Only published, eligible public events for this game appear here." title="Live and upcoming tournaments">{events.length ? <View style={styles.eventList}>{events.map((event) => <Surface key={event.slug} style={[styles.event, { borderColor: game.accent }]}>{event.status === 'live' ? <Text style={styles.eventLive}>Live now</Text> : null}<Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.eventMeta}>{formatDateLine(event.date, event.timeZone, event.timeZoneLabel)}</Text>{event.format ? <Text style={styles.eventMeta}>{event.format}</Text> : null}<ActionButton href={`/tournaments/${event.slug}`} variant="secondary">View event</ActionButton></Surface>)}</View> : <EmptyState action={<ActionButton href="/tournaments" variant="secondary">Browse tournaments</ActionButton>} body={`No public ${game.name} tournaments are live or scheduled.`} title="No public events posted" />}</Section><Section description="Only completed public records appear here." title="Results">{results.length ? results.map((result) => <View key={result.slug} style={styles.result}><ResultCard href={result.tournamentSlug ? `/tournaments/${result.tournamentSlug}` : undefined} result={result} /></View>) : <EmptyState action={<ActionButton href="/results" variant="secondary">Open results</ActionButton>} body={`No ${game.name} results have been posted.`} title="No posted results yet" />}</Section></HubScreen>;
}

const styles = StyleSheet.create({
  availability: { padding: 18 },
  availabilityLabel: { color: '#E3AD4F', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  availabilityText: { color: '#F4EFE6', fontSize: 17, fontWeight: '800', lineHeight: 24, marginTop: 7 },
  factRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15, marginTop: 12 },
  fact: { backgroundColor: '#151c25', borderColor: 'rgba(255,255,255,.13)', borderRadius: 999, borderWidth: 1, color: '#C7D0D9', fontSize: 12, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6 },
  eventList: { gap: 12 }, event: { padding: 17 }, eventLive: { color: '#8DCAA9', fontSize: 10, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase' }, eventTitle: { color: '#F4EFE6', fontSize: 19, fontWeight: '900' }, eventMeta: { color: '#B8C2CC', fontSize: 13, lineHeight: 19, marginTop: 4 }, result: { marginBottom: 12 },
});

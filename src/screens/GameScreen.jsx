import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, EmptyState, HubScreen, ResultCard, Section, Surface } from '../components/hub-ui.jsx';
import { EUCHRE_TOURNAMENT_ENTRY_PATHS } from '../lib/euchreTournamentEntry.js';
import { formatDateLine } from '../lib/format.js';
import { getResults, siteData } from '../lib/siteData.js';
import { fetchMyReadyTournamentMatches, fetchTournamentEvents } from '../lib/tournamentHostingClient.js';
import { filterPublicEventsByGame, getPublicGamePresentation, getPublicPresentationEvents } from '../lib/publicPresentationCatalog.js';
import { useVisibleNow } from '../lib/useVisibleNow.js';

function MyEuchreMatchPanel({ enabled }) {
  const [state, setState] = useState({ status: 'idle', matches: [], signedIn: false });

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let active = true;

    fetchMyReadyTournamentMatches()
      .then((result) => {
        if (!active) return;
        setState({
          status: 'ready',
          matches: Array.isArray(result.matches) ? result.matches : [],
          signedIn: Boolean(result.account),
        });
      })
      .catch(() => {
        if (active) setState({ status: 'unavailable', matches: [], signedIn: false });
      });

    return () => { active = false; };
  }, [enabled]);

  if (!enabled) return null;
  const isChecking = state.status === 'idle';

  return (
    <Section
      nativeID="my-match"
      description="The Hub privately checks your live Euchre assignments, then opens the ticketed match from its owning event page."
      title="My Euchre Match">
      <Surface style={styles.myMatchPanel}>
        {isChecking ? <Text style={styles.availabilityText}>Checking your active Euchre assignments…</Text> : null}
        {!isChecking && state.matches.length ? (
          <View style={styles.eventList}>
            {state.matches.map(({ event, match, href }) => (
              <View key={event.slug} style={styles.myMatchRow}>
                <View style={styles.myMatchCopy}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventMeta}>{match.label || 'Your assigned match'} is ready.</Text>
                </View>
                <ActionButton href={href}>Play My Match</ActionButton>
              </View>
            ))}
          </View>
        ) : null}
        {!isChecking && state.status === 'ready' && !state.matches.length ? (
          <EmptyState
            action={<ActionButton href={EUCHRE_TOURNAMENT_ENTRY_PATHS.browseEvents} variant="secondary">Browse Euchre Events</ActionButton>}
            body={state.signedIn
              ? 'No live Euchre match is assigned to this account right now. Open your event page to check its full status.'
              : 'Sign in through the Hub with the account used for registration, then open this path again to check your assignment.'}
            title={state.signedIn ? 'No ready Euchre match' : 'Sign in to find your match'}
          />
        ) : null}
        {!isChecking && state.status === 'unavailable' ? (
          <EmptyState
            action={<ActionButton href={EUCHRE_TOURNAMENT_ENTRY_PATHS.browseEvents} variant="secondary">Browse Euchre Events</ActionButton>}
            body="Your assignment could not be confirmed just now. Open the event you registered for and use its My Match panel."
            title="Match lookup unavailable"
          />
        ) : null}
      </Surface>
    </Section>
  );
}

export default function GameScreen({ gameSlug, initialView = '' }) {
  const [hostedEvents, setHostedEvents] = useState([]);
  const game = getPublicGamePresentation(gameSlug);
  const nowMs = useVisibleNow(60000);
  const allEvents = useMemo(
    () => filterPublicEventsByGame(getPublicPresentationEvents(siteData.tournaments, hostedEvents), game?.slug),
    [game?.slug, hostedEvents],
  );
  const events = useMemo(
    () => allEvents.filter((event) => event.status === 'live' || new Date(event.date).getTime() > nowMs),
    [allEvents, nowMs],
  );
  const results = useMemo(() => getResults().filter((result) => result.gameSlug === game?.slug), [game?.slug]);
  const isEuchre = game?.slug === 'euchre';
  const isMyMatchView = isEuchre && initialView === 'my-match';

  useEffect(() => {
    let active = true;
    fetchTournamentEvents()
      .then((result) => { if (active) setHostedEvents(Array.isArray(result.tournaments) ? result.tournaments : []); })
      .catch(() => { if (active) setHostedEvents([]); });
    return () => { active = false; };
  }, []);

  if (!game) {
    return (
      <HubScreen accountHref="/account" heroVariant="compact" lead="That game page is not available." publicShell stickyActions={false} subtitle="Check the game link and try again." title="Unknown game">
        <EmptyState action={<ActionButton href="/games">Browse games</ActionButton>} body="Only published game information routes are available here." title="Nothing to show here" />
      </HubScreen>
    );
  }

  return (
    <HubScreen accountHref="/account" footerNote="Creating the competitive 1v1 spades category." heroVariant="compact" lead={game.summary} publicShell stickyActions={false} subtitle="Public game information" title={game.name}>
      <Section
        description={isEuchre
          ? 'The Hub owns Euchre event creation, registration, brackets, permissions, and results. Euchre runs only the assigned ticketed match.'
          : 'This lane remains descriptive until a verified public event or play destination is available.'}
        title="Availability">
        <Surface style={[styles.availability, { borderColor: game.accent }]}>
          <Text style={styles.availabilityLabel}>PUBLIC STATUS</Text>
          <Text style={styles.availabilityText}>{game.availability}</Text>
          <View style={styles.factRow}>{game.facts.map((fact) => <Text key={fact} style={styles.fact}>{fact}</Text>)}</View>
          {game.playPath && game.webReady ? <ActionButton href={game.playPath} variant="secondary">Open {game.shortName}</ActionButton> : <ActionButton href="/tournaments" variant="secondary">Browse tournaments</ActionButton>}
        </Surface>
      </Section>

      {isEuchre ? (
        <Section
          description="Every route stays on the Hub until a player launches their Hub-authorized Euchre assignment."
          title="Euchre tournament paths">
          <Surface style={styles.entryPanel}>
            <View style={styles.entryPath}>
              <Text style={styles.entryTitle}>Find a competition</Text>
              <Text style={styles.eventMeta}>Browse the Hub’s published Euchre events and their registration state.</Text>
              <ActionButton href={EUCHRE_TOURNAMENT_ENTRY_PATHS.browseEvents} variant="secondary">Browse Euchre Events</ActionButton>
            </View>
            <View style={styles.entryPath}>
              <Text style={styles.entryTitle}>Run an event</Text>
              <Text style={styles.eventMeta}>Use the existing Hub host authorization and create a new event with Euchre preselected.</Text>
              <ActionButton href={EUCHRE_TOURNAMENT_ENTRY_PATHS.hostTournament}>Host an Euchre Tournament</ActionButton>
            </View>
            <View style={styles.entryPath}>
              <Text style={styles.entryTitle}>Enter an assigned table</Text>
              <Text style={styles.eventMeta}>The Hub confirms the assignment and issues the match ticket; Euchre runs the table.</Text>
              <ActionButton href={EUCHRE_TOURNAMENT_ENTRY_PATHS.playMyMatch} variant="secondary">Play My Match</ActionButton>
            </View>
          </Surface>
        </Section>
      ) : null}

      <MyEuchreMatchPanel enabled={isMyMatchView} />

      <Section nativeID="events" description="Only published, eligible public events for this game appear here." title="Live and upcoming tournaments">
        {events.length ? (
          <View style={styles.eventList}>
            {events.map((event) => (
              <Surface key={event.slug} style={[styles.event, { borderColor: game.accent }]}>
                {event.status === 'live' ? <Text style={styles.eventLive}>Live now</Text> : null}
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text style={styles.eventMeta}>{formatDateLine(event.date, event.timeZone, event.timeZoneLabel)}</Text>
                {event.format ? <Text style={styles.eventMeta}>{event.format}</Text> : null}
                <ActionButton href={`/tournaments/${event.slug}`} variant="secondary">View event</ActionButton>
              </Surface>
            ))}
          </View>
        ) : <EmptyState action={<ActionButton href="/tournaments" variant="secondary">Browse tournaments</ActionButton>} body={`No public ${game.name} tournaments are live or scheduled.`} title="No public events posted" />}
      </Section>

      <Section description="Only completed public records appear here." title="Results">
        {results.length ? results.map((result) => <View key={result.slug} style={styles.result}><ResultCard href={result.tournamentSlug ? `/tournaments/${result.tournamentSlug}` : undefined} result={result} /></View>) : <EmptyState action={<ActionButton href="/results" variant="secondary">Open results</ActionButton>} body={`No ${game.name} results have been posted.`} title="No posted results yet" />}
      </Section>
    </HubScreen>
  );
}

const styles = StyleSheet.create({
  availability: { padding: 18 },
  availabilityLabel: { color: '#E3AD4F', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  availabilityText: { color: '#F4EFE6', fontSize: 17, fontWeight: '800', lineHeight: 24, marginTop: 7 },
  entryPanel: { gap: 14, padding: 18 },
  entryPath: { borderBottomColor: 'rgba(255,255,255,.12)', borderBottomWidth: 1, gap: 8, paddingBottom: 16 },
  entryTitle: { color: '#F4EFE6', fontSize: 17, fontWeight: '900' },
  eventList: { gap: 12 },
  event: { padding: 17 },
  eventLive: { color: '#8DCAA9', fontSize: 10, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase' },
  eventTitle: { color: '#F4EFE6', fontSize: 19, fontWeight: '900' },
  eventMeta: { color: '#B8C2CC', fontSize: 13, lineHeight: 19, marginTop: 4 },
  factRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15, marginTop: 12 },
  fact: { backgroundColor: '#151c25', borderColor: 'rgba(255,255,255,.13)', borderRadius: 999, borderWidth: 1, color: '#C7D0D9', fontSize: 12, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6 },
  myMatchCopy: { flex: 1 },
  myMatchPanel: { padding: 18 },
  myMatchRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  result: { marginBottom: 12 },
});

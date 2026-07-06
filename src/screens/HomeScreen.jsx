import { useEffect, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';

import {
  ActionButton,
  Badge,
  GameCard,
  HubScreen,
  QuickActionCard,
  ResultCard,
  Section,
  StepStrip,
  StreamCard,
  StatPill,
  Surface,
  TournamentCard,
  EmptyState,
  BulletList,
} from '../components/hub-ui.jsx';
import { formatDateLine, formatShortDate } from '../lib/format.js';
import {
  getGameBySlug,
  getGamePath,
  getGames,
  getResults,
  getStreams,
  getCheckInPath,
  getTournamentPath,
  getUpcomingTournaments,
  siteData,
} from '../lib/siteData.js';
import { getEffectiveRegistrationStatus, getRegistrationStatusMeta, mergeTournamentSettings } from '../lib/tournamentSettings.js';
import { fetchSignupSummary, fetchTournamentBracket, fetchTournamentSettings } from '../lib/tournamentHostingClient.js';

const PLAYER_FLOW_STEPS = [
  { title: 'Create account', body: 'One player account keeps your signup and match seat tied to you.' },
  { title: 'Sign up', body: 'Join the tournament roster before the host seeds the bracket.' },
  { title: 'Reminder window', body: 'Thirty minutes before start is the right time for an opt-in email reminder.' },
  { title: 'Join game', body: 'Use My match to open your assigned Spades table.' },
  { title: 'Play game', body: 'Finish the match in Spades while the hub keeps the bracket.' },
  { title: 'See results', body: 'Return to the hub for the updated bracket and winner status.' },
];

function getHomeStats(upcomingCount, gameCount, featuredTournament, registrationMeta, signupSummary, liveBracket) {
  const registeredValue = signupSummary.loading ? 'Loading' : String(signupSummary.count);

  return [
    {
      label: 'Next event',
      value: featuredTournament ? formatShortDate(featuredTournament.date, featuredTournament.timeZone) : 'TBD',
      tone: 'accent',
    },
    { label: 'Status', value: registrationMeta.label.replace('Registration ', ''), tone: registrationMeta.tone },
    { label: 'Registered', value: registeredValue, tone: signupSummary.count ? 'green' : 'blue' },
    { label: 'Bracket', value: liveBracket ? `${liveBracket.participantCount || 0} seeded` : 'Not seeded', tone: liveBracket ? 'green' : 'accent' },
    { label: 'Games', value: String(gameCount), tone: 'blue' },
    { label: 'Events', value: String(upcomingCount), tone: 'accent' },
  ];
}

function getCountdownState(tournament, nowMs) {
  const startMs = new Date(tournament?.date).getTime();

  if (!Number.isFinite(startMs)) {
    return {
      hasDate: false,
      hasStarted: false,
      parts: [
        { label: 'Days', value: '--' },
        { label: 'Hours', value: '--' },
        { label: 'Minutes', value: '--' },
        { label: 'Seconds', value: '--' },
      ],
    };
  }

  const remainingMs = Math.max(startMs - nowMs, 0);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    hasDate: true,
    hasStarted: startMs <= nowMs,
    parts: [
      { label: 'Days', value: String(days) },
      { label: 'Hours', value: String(hours).padStart(2, '0') },
      { label: 'Minutes', value: String(minutes).padStart(2, '0') },
      { label: 'Seconds', value: String(seconds).padStart(2, '0') },
    ],
  };
}

export default function HomeScreen() {
  const [featuredSettings, setFeaturedSettings] = useState(null);
  const [featuredBracket, setFeaturedBracket] = useState(null);
  const [featuredSignupSummary, setFeaturedSignupSummary] = useState({ count: 0, loading: true });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const games = getGames();
  const streams = getStreams();
  const upcoming = getUpcomingTournaments();
  const results = getResults();
  const spades = getGameBySlug(siteData.site.primaryGameSlug);
  const gameLookup = new Map(games.map((game) => [game.slug, game]));
  const seededFeaturedTournament = getUpcomingTournaments().find(
    (tournament) => tournament.slug === siteData.site.primaryTournamentSlug,
  ) || upcoming[0] || null;
  const featuredTournament = mergeTournamentSettings(seededFeaturedTournament, featuredSettings);
  const seededFeaturedSlug = seededFeaturedTournament?.slug || '';
  const featuredTournamentPath = featuredTournament ? getTournamentPath(featuredTournament.slug) : '/';
  const featuredSignupPath = featuredTournament ? getCheckInPath(featuredTournament.slug) : '/';
  const featuredMatchStatusPath = featuredTournament ? `${featuredTournamentPath}#my-match` : featuredTournamentPath;
  const remainingUpcoming = upcoming.filter((tournament) => tournament.slug !== featuredTournament?.slug);
  const featuredRegistrationMeta = featuredTournament
    ? getEffectiveRegistrationStatus(featuredTournament, { hasLiveBracket: Boolean(featuredBracket) })
    : getRegistrationStatusMeta('coming-soon');
  const featuredPrimaryAction = featuredBracket
    ? { label: 'Find my match', href: featuredMatchStatusPath }
    : { label: 'Create account and sign up', href: featuredSignupPath };

  useEffect(() => {
    if (!seededFeaturedSlug) {
      return undefined;
    }

    let active = true;

    async function loadFeaturedData() {
      const [settingsResult, bracketResult, signupResult] = await Promise.allSettled([
        fetchTournamentSettings({ slug: seededFeaturedSlug }),
        fetchTournamentBracket({ slug: seededFeaturedSlug }),
        fetchSignupSummary({ slug: seededFeaturedSlug }),
      ]);

      if (!active) {
        return;
      }

      setFeaturedSettings(settingsResult.status === 'fulfilled' ? settingsResult.value.settings || null : null);
      setFeaturedBracket(bracketResult.status === 'fulfilled' ? bracketResult.value.bracket || null : null);
      setFeaturedSignupSummary({
        count: signupResult.status === 'fulfilled' ? signupResult.value.signupCount || 0 : 0,
        loading: false,
      });
    }

    loadFeaturedData();

    return () => {
      active = false;
    };
  }, [seededFeaturedSlug]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <HubScreen
      actions={[
        featuredPrimaryAction,
        { label: 'View bracket', href: `${featuredTournamentPath}#live-bracket`, variant: 'secondary' },
        { label: 'Watch live', href: '/live', variant: 'secondary' },
      ]}
      eyebrow="Official website"
      footerNote={siteData.site.adminNote}
      lead="Create an account, sign up for the next Spades tournament, open your match when the bracket is live, play, then come back for results."
      stats={getHomeStats(upcoming.length, games.length, featuredTournament, featuredRegistrationMeta, featuredSignupSummary, featuredBracket)}
      subtitle="Free-entry Spades tournaments with account-based signup, hosted brackets, and clear match links."
      title={siteData.site.name}>
      <Section
        description="Everything a player needs before the next Spades bracket."
        title="Next tournament">
        <NextTournamentPanel
          bracket={featuredBracket}
          countdown={getCountdownState(featuredTournament, nowMs)}
          matchStatusPath={featuredMatchStatusPath}
          registrationMeta={featuredRegistrationMeta}
          signupPath={featuredSignupPath}
          signupSummary={featuredSignupSummary}
          tournament={featuredTournament}
          tournamentPath={featuredTournamentPath}
        />
      </Section>

      <Section description="The whole player path, in order." title="How to play">
        <StepStrip steps={PLAYER_FLOW_STEPS} />
      </Section>

      {featuredTournament ? (
        <Section
          action={<ActionButton href={featuredTournamentPath}>Open tournament</ActionButton>}
          description="Roster, bracket, match status, live table, rules, and results stay on this event page."
          title="Tournament control center">
          <TournamentCard
            gameName={gameLookup.get(featuredTournament.gameSlug)?.name || featuredTournament.gameSlug}
            href={featuredTournamentPath}
            tournament={featuredTournament}
          />
        </Section>
      ) : null}

      <Section
        description="The main player links stay here if someone scrolls past the countdown."
        title="Quick actions">
        <View style={styles.quickGrid}>
          <QuickActionCard
            actionLabel="Create account"
            body="Create or open your player account, then reserve your spot before the bracket is seeded."
            href={featuredSignupPath}
            meta="Player"
            title="Sign up"
            tone="green"
          />
          <QuickActionCard
            actionLabel={featuredBracket ? 'Find table' : 'Check status'}
            body={featuredBracket ? 'Open your current tournament status and assigned match.' : 'After signup, this shows whether you are waiting, matched, or ready.'}
            href={featuredMatchStatusPath}
            meta="Player"
            title="My match"
            tone="green"
          />
          <QuickActionCard
            actionLabel="See bracket"
            body="Open the event page for the roster, bracket, match links, stream, rules, and results."
            href={featuredTournamentPath}
            meta="Event"
            title="Tournament page"
            tone="accent"
          />
          <QuickActionCard
            actionLabel="Watch table"
            body="Open the spectator table for the current Spades match."
            href="/live"
            meta="Spectator"
            title="Watch live"
            tone="blue"
          />
        </View>
      </Section>

      {spades ? (
        <Section
          description="Spades is the gameplay app. The tournament hub creates the match links and bracket context."
          title="Spades spotlight">
          <Surface style={styles.spadesSpotlight}>
            <View style={styles.spadesTopRow}>
              <Badge tone="accent">Featured game</Badge>
              <Text style={styles.spadesPath}>/spades</Text>
            </View>
            <Text style={styles.spadesTitle}>{spades.name}</Text>
            <Text style={styles.spadesLead}>{spades.heroCopy}</Text>
            <BulletList items={spades.highlights} tone="accent" />
            <View style={styles.spadesStats}>
              {spades.quickFacts.map((fact) => (
                <StatPill key={fact.label} label={fact.label} value={fact.value} tone="accent" />
              ))}
            </View>
            <View style={styles.spadesActions}>
              <ActionButton href={getGamePath(spades.slug)}>Open Spades</ActionButton>
              <ActionButton href={getTournamentPath(siteData.site.primaryTournamentSlug)} variant="secondary">
                Tournament page
              </ActionButton>
            </View>
          </Surface>
        </Section>
      ) : null}

      {remainingUpcoming.length ? (
        <Section
          description="Only real public events appear here. Drafts and future placeholders stay out of the player path."
          title="Other public events">
          {remainingUpcoming.map((tournament) => (
            <View key={tournament.slug} style={styles.block}>
              <TournamentCard
                gameName={gameLookup.get(tournament.gameSlug)?.name || tournament.gameSlug}
                href={getTournamentPath(tournament.slug)}
                tournament={tournament}
              />
            </View>
          ))}
        </Section>
      ) : null}

      <Section
        description="Spades is active now. Euchre stays as a coming-soon lane until it is ready."
        title="Game lineup">
        {games.map((game) => (
          <View key={game.slug} style={styles.block}>
            <GameCard game={game} href={game.status === 'active' ? getGamePath(game.slug) : null} />
          </View>
        ))}
      </Section>

      <Section
        description="Live table and replay links for current events."
        title="Stream and YouTube links">
        {streams.map((stream) => (
          <StreamCard key={stream.slug} stream={stream} />
        ))}
      </Section>

      <Section
        action={<ActionButton href="/results" variant="secondary">All results</ActionButton>}
        description="Completed events show here after winners are posted."
        title="Latest results">
        {results.slice(0, 2).map((result) => (
          <View key={result.slug} style={styles.block}>
            <ResultCard result={result} />
          </View>
        ))}
        {!results.length ? (
          <EmptyState
            body="Once a tournament closes, the result record can be added here without touching the page layout."
            title="No results yet"
          />
        ) : null}
      </Section>
    </HubScreen>
  );
}

function NextTournamentPanel({
  bracket,
  countdown,
  matchStatusPath,
  registrationMeta,
  signupPath,
  signupSummary,
  tournament,
  tournamentPath,
}) {
  const isBracketLive = Boolean(bracket);
  const headline = isBracketLive
    ? 'Bracket is live'
    : countdown.hasStarted
      ? 'Tournament time'
      : 'Starts in';
  const primaryHref = isBracketLive ? matchStatusPath : signupPath;
  const primaryLabel = isBracketLive ? 'Find my match' : 'Create account and sign up';
  const secondaryLabel = isBracketLive ? 'View bracket' : 'Tournament details';

  if (!tournament) {
    return (
      <EmptyState
        body="The next public event has not been posted yet."
        title="No tournament scheduled"
      />
    );
  }

  return (
    <Surface style={styles.countdownPanel}>
      <View style={styles.countdownTopRow}>
        <Badge tone={registrationMeta.tone}>{registrationMeta.label}</Badge>
        <Text style={styles.countdownDate}>
          {countdown.hasDate ? formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel) : 'Date pending'}
        </Text>
      </View>
      <View style={styles.countdownBody}>
        <View style={styles.countdownCopy}>
          <Text style={styles.countdownKicker}>{headline}</Text>
          <Text style={styles.countdownTitle}>{tournament.title}</Text>
          <Text style={styles.countdownSummary}>{tournament.detail || tournament.summary}</Text>
        </View>
        <View style={styles.countdownGrid}>
          {countdown.parts.map((part) => (
            <View key={part.label} style={styles.countdownUnit}>
              <Text style={styles.countdownValue}>{part.value}</Text>
              <Text style={styles.countdownLabel}>{part.label}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.countdownStatusRow}>
        <StatPill
          label="Registered"
          value={signupSummary.loading ? 'Loading' : String(signupSummary.count)}
          tone={signupSummary.count ? 'green' : 'blue'}
        />
        <StatPill
          label="Bracket"
          value={bracket ? `${bracket.participantCount || 0} seeded` : 'Not seeded'}
          tone={bracket ? 'green' : 'accent'}
        />
        <StatPill label="Entry" value="Free" tone="green" />
      </View>
      <View style={styles.countdownActions}>
        <ActionButton href={primaryHref}>{primaryLabel}</ActionButton>
        <ActionButton href={tournamentPath} variant="secondary">
          {secondaryLabel}
        </ActionButton>
        <ActionButton href="/live" variant="secondary">
          Watch live
        </ActionButton>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 14,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginRight: -12,
  },
  countdownPanel: {
    borderColor: 'rgba(97, 210, 145, 0.28)',
  },
  countdownTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  countdownDate: {
    color: '#AAB4AE',
    flexShrink: 1,
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  countdownBody: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  countdownCopy: {
    flex: 1,
    minWidth: 260,
  },
  countdownKicker: {
    color: '#61D291',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  countdownTitle: {
    color: '#F4EFE6',
    fontFamily: 'Georgia',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
    marginTop: 6,
  },
  countdownSummary: {
    color: '#F4EFE6',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 8,
  },
  countdownGrid: {
    flexBasis: 430,
    flexDirection: 'row',
    flexGrow: 1,
    flexWrap: 'wrap',
    gap: 10,
  },
  countdownUnit: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(97, 210, 145, 0.28)',
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: 92,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 92,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  countdownValue: {
    color: '#F4EFE6',
    fontFamily: 'monospace',
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
  },
  countdownLabel: {
    color: '#AAB4AE',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    lineHeight: 16,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  countdownStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  countdownActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  spadesSpotlight: {
    borderColor: 'rgba(214, 162, 78, 0.28)',
  },
  spadesTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  spadesPath: {
    color: '#D6A24E',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    fontFamily: 'monospace',
  },
  spadesTitle: {
    color: '#F4EFE6',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    marginBottom: 8,
  },
  spadesLead: {
    color: '#F4EFE6',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 12,
  },
  spadesStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  spadesActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
});

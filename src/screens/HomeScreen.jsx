import { useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet, useWindowDimensions } from 'react-native';

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
  buildResultFromTournamentBracket,
  getGameBySlug,
  getGamePath,
  getGames,
  getResults,
  getStreams,
  getCheckInPath,
  getTournamentPath,
  getUpcomingTournaments,
  mergeResults,
  siteData,
} from '../lib/siteData.js';
import { getEffectiveRegistrationStatus, getRegistrationStatusMeta, mergeTournamentSettings } from '../lib/tournamentSettings.js';
import { fetchSignupSummary, fetchTournamentBracket, fetchTournamentSettings } from '../lib/tournamentHostingClient.js';

const DEFAULT_ROSTER_CAP = 8;
const DEFAULT_MINIMUM_PLAYERS = 2;

const PLAYER_FLOW_STEPS = [
  { title: 'Create account', body: 'One player account keeps your signup and match seat tied to you.' },
  { title: 'Sign up', body: 'Join the tournament roster before the host seeds the bracket.' },
  { title: 'Reminder window', body: 'Thirty minutes before start is the right time for an opt-in email reminder.' },
  { title: 'Join game', body: 'Use My match to open your assigned Spades table.' },
  { title: 'Play game', body: 'Finish the match in Spades while the hub keeps the bracket.' },
  { title: 'See results', body: 'Return to the hub for the updated bracket and winner status.' },
];

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRosterCap(tournament) {
  return parsePositiveInt(tournament?.rosterCap, DEFAULT_ROSTER_CAP);
}

function getMinimumPlayers(tournament) {
  return parsePositiveInt(tournament?.minimumPlayers, DEFAULT_MINIMUM_PLAYERS);
}

function registeredCountLabel(signupSummary, tournament) {
  const cap = getRosterCap(tournament);

  if (signupSummary?.loading) {
    return `Loading / ${cap}`;
  }

  if (signupSummary?.unavailable) {
    return `Open / ${cap}`;
  }

  return `${signupSummary?.count || 0} / ${cap}`;
}

function bracketTargetLabel(tournament) {
  return `${getRosterCap(tournament)} target`;
}

function flexibleBracketCopy(tournament) {
  return tournament?.bracketFlexPolicy
    || `Advertised ${getRosterCap(tournament)}-player bracket. Runs with ${getMinimumPlayers(tournament)}+ players and fills byes automatically.`;
}

function sortTournamentsByDate(tournaments) {
  return [...tournaments].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
}

function dateKey(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function isTournamentToday(tournament, nowMs) {
  const startMs = new Date(tournament?.date).getTime();

  if (!Number.isFinite(startMs)) {
    return false;
  }

  return dateKey(startMs, tournament.timeZone) === dateKey(nowMs, tournament.timeZone);
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

function getNextUpcomingTournament(tournaments, nowMs) {
  const datedTournaments = tournaments
    .map((tournament) => ({
      tournament,
      startMs: new Date(tournament?.date).getTime(),
    }))
    .filter((item) => Number.isFinite(item.startMs))
    .sort((left, right) => left.startMs - right.startMs);
  const futureTournament = datedTournaments.find((item) => item.startMs > nowMs);

  return futureTournament?.tournament || datedTournaments[0]?.tournament || tournaments[0] || null;
}

export default function HomeScreen() {
  const [eventDataBySlug, setEventDataBySlug] = useState({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const games = useMemo(() => getGames(), []);
  const streams = useMemo(() => getStreams(), []);
  const upcoming = useMemo(() => getUpcomingTournaments(), []);
  const spades = getGameBySlug(siteData.site.primaryGameSlug);
  const gameLookup = new Map(games.map((game) => [game.slug, game]));
  const upcomingSlugs = upcoming.map((tournament) => tournament.slug).join('|');
  const hydratedUpcoming = sortTournamentsByDate(
    upcoming.map((tournament) => mergeTournamentSettings(tournament, eventDataBySlug[tournament.slug]?.settings || null)),
  );
  const featuredTournament = getNextUpcomingTournament(hydratedUpcoming, nowMs);
  const seededFeaturedSlug = featuredTournament?.slug || '';
  const featuredEventData = eventDataBySlug[seededFeaturedSlug] || {};
  const featuredBracket = featuredEventData.bracket || null;
  const featuredSignupSummary = featuredEventData.signupSummary || { count: 0, loading: Boolean(featuredTournament) };
  const featuredTournamentPath = featuredTournament ? getTournamentPath(featuredTournament.slug) : '/';
  const featuredSignupPath = featuredTournament ? getCheckInPath(featuredTournament.slug) : '/';
  const featuredMatchStatusPath = featuredTournament ? `${featuredTournamentPath}#my-match` : featuredTournamentPath;
  const featuredRegistrationMeta = featuredTournament
    ? getEffectiveRegistrationStatus(featuredTournament, { hasLiveBracket: Boolean(featuredBracket) })
    : getRegistrationStatusMeta('coming-soon');
  const featuredResult = buildResultFromTournamentBracket(featuredTournament, featuredBracket);
  const results = mergeResults(getResults(), featuredResult);
  const featuredCountdown = getCountdownState(featuredTournament, nowMs);

  useEffect(() => {
    if (!upcoming.length) {
      return undefined;
    }

    let active = true;

    async function loadScheduleData() {
      const settled = await Promise.allSettled(
        upcoming.map(async (tournament) => {
          const [settingsResult, bracketResult, signupResult] = await Promise.allSettled([
            fetchTournamentSettings({ slug: tournament.slug }),
            fetchTournamentBracket({ slug: tournament.slug }),
            fetchSignupSummary({ slug: tournament.slug }),
          ]);

          return {
            slug: tournament.slug,
            settings: settingsResult.status === 'fulfilled' ? settingsResult.value.settings || null : null,
            bracket: bracketResult.status === 'fulfilled' ? bracketResult.value.bracket || null : null,
            signupSummary: {
              count: signupResult.status === 'fulfilled' ? signupResult.value.signupCount || 0 : 0,
              loading: false,
              unavailable: signupResult.status !== 'fulfilled',
            },
          };
        }),
      );

      if (!active) {
        return;
      }

      setEventDataBySlug(
        Object.fromEntries(
          settled
            .filter((result) => result.status === 'fulfilled')
            .map((result) => [result.value.slug, result.value]),
        ),
      );
    }

    loadScheduleData();

    return () => {
      active = false;
    };
  }, [upcoming, upcomingSlugs]);

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
      eyebrow="Official website"
      footerNote={siteData.site.adminNote}
      forceTopNav
      lead="Create an account, sign up for the next Spades tournament, open your match when the bracket is live, play, then come back for results."
      showHero={false}
      subtitle="Free-entry Spades tournaments with account-based signup, hosted brackets, and clear match links."
      title={siteData.site.name}>
      <PremiumCountdownHero
        bracket={featuredBracket}
        countdown={featuredCountdown}
        eventCount={upcoming.length}
        gameCount={games.length}
        matchStatusPath={featuredMatchStatusPath}
        registrationMeta={featuredRegistrationMeta}
        signupSummary={featuredSignupSummary}
        tournament={featuredTournament}
        tournamentPath={featuredTournamentPath}
      />

      <Section
        action={<ActionButton href={featuredTournamentPath}>Open next event</ActionButton>}
        description="Live, tonight, and upcoming public tournaments appear here, soonest first."
        nativeID="next-tournaments"
        title="All upcoming tournaments">
        <ScheduleSummaryBar
          eventDataBySlug={eventDataBySlug}
          nowMs={nowMs}
          tournaments={hydratedUpcoming}
        />
        <UpcomingTournamentList
          featuredTournament={featuredTournament}
          eventDataBySlug={eventDataBySlug}
          gameLookup={gameLookup}
          nowMs={nowMs}
          tournaments={hydratedUpcoming}
        />
      </Section>

      <Section
        description="The event page holds roster, bracket, match status, live table, rules, and results."
        title="Tournament hub">
        {featuredTournament ? (
          <View style={styles.hubTournamentCard}>
            <TournamentCard
              gameName={gameLookup.get(featuredTournament.gameSlug)?.name || featuredTournament.gameSlug}
              href={featuredTournamentPath}
              tournament={featuredTournament}
            />
          </View>
        ) : null}
      </Section>

      <Section
        description="What the current bracket system can handle, and what I recommend for launch."
        title="Tournament sizes">
        <TournamentCapacityPanel />
      </Section>

      <Section description="The whole player path, in order." title="How to play">
        <StepStrip steps={PLAYER_FLOW_STEPS} />
      </Section>

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

function PremiumCountdownHero({
  bracket,
  countdown,
  eventCount,
  gameCount,
  matchStatusPath,
  registrationMeta,
  signupSummary,
  tournament,
  tournamentPath,
}) {
  const isBracketLive = Boolean(bracket);
  const { width } = useWindowDimensions();
  const isCompact = width > 0 && width < 760;
  const isTight = width > 0 && width < 440;
  const heroStats = tournament
    ? [
        {
          label: 'Next event',
          value: countdown.hasDate ? formatShortDate(tournament.date, tournament.timeZone) : 'TBD',
          tone: 'accent',
        },
        {
          label: 'Registered',
          value: registeredCountLabel(signupSummary, tournament),
          tone: signupSummary.count ? 'green' : 'blue',
        },
        {
          label: 'Bracket',
          value: bracket ? `${bracket.participantCount || 0} seeded` : bracketTargetLabel(tournament),
          tone: bracket ? 'green' : 'accent',
        },
        { label: 'Games', value: String(gameCount || 0), tone: 'blue' },
        { label: 'Events', value: String(eventCount || 0), tone: 'green' },
      ]
    : [];

  if (!tournament) {
    return (
      <EmptyState
        body="The next public event has not been posted yet."
        title="No tournament scheduled"
      />
    );
  }

  return (
    <Surface style={[styles.premiumHero, isTight && styles.premiumHeroTight]}>
      <View pointerEvents="none" style={styles.premiumHeroBackdrop}>
        <Text style={[styles.heroSpade, styles.heroSpadeLeft]}>♠</Text>
        <Text style={[styles.heroSpade, styles.heroSpadeRight]}>♠</Text>
        <View style={styles.heroGoldGlow} />
        <View style={styles.heroGreenGlow} />
      </View>
      <View style={styles.premiumHeroTopRow}>
        <Badge tone={isBracketLive ? 'green' : registrationMeta.tone}>
          {isBracketLive ? 'Bracket is live' : registrationMeta.label}
        </Badge>
        <Text style={styles.premiumHeroDomain}>Tournament hub</Text>
      </View>

      <View style={styles.premiumHeroCopy}>
        <Text accessibilityRole="header" style={[styles.premiumHeroTitle, isCompact && styles.premiumHeroTitleCompact]}>
          {tournament.title}
        </Text>
        <Text style={styles.premiumHeroSubtitle}>Free-entry. Account-based. Head-to-head Spades.</Text>
        <Text style={styles.premiumHeroDate}>
          {countdown.hasDate ? formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel) : 'Date pending'}
        </Text>
      </View>

      <View style={[styles.countdownFrame, isTight && styles.countdownFrameTight]}>
        <View style={styles.countdownRailRow}>
          <View style={styles.countdownRail} />
          <Text style={styles.countdownFrameLabel}>Tournament starts in</Text>
          <View style={styles.countdownRail} />
        </View>
        <View style={[styles.countdownGrid, isCompact && styles.countdownGridCompact]}>
          {countdown.parts.map((part) => (
            <View key={part.label} style={[styles.countdownUnit, isTight && styles.countdownUnitTight]}>
              <Text
                adjustsFontSizeToFit
                numberOfLines={1}
                style={[
                  styles.countdownValue,
                  isCompact && styles.countdownValueCompact,
                  isTight && styles.countdownValueTight,
                ]}>
                {part.value}
              </Text>
              <Text style={styles.countdownLabel}>{part.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.heroActionRow}>
        <ActionButton href={matchStatusPath} style={styles.heroActionButton}>
          Find my match
        </ActionButton>
        <ActionButton href={`${tournamentPath}#live-bracket`} style={styles.heroActionButton} variant="secondary">
          View bracket
        </ActionButton>
        <ActionButton href="/live" variant="secondary">
          Watch live
        </ActionButton>
      </View>

      <View style={styles.rosterPolicyBar}>
        <Text style={styles.rosterPolicyText}>{flexibleBracketCopy(tournament)}</Text>
      </View>

      <View style={styles.heroInfoGrid}>
        {heroStats.map((stat) => (
          <View key={stat.label} style={[styles.heroInfoTile, styles[`heroInfo${stat.tone[0].toUpperCase()}${stat.tone.slice(1)}`]]}>
            <Text style={styles.heroInfoLabel}>{stat.label}</Text>
            <Text numberOfLines={1} style={styles.heroInfoValue}>{stat.value}</Text>
          </View>
        ))}
      </View>
    </Surface>
  );
}

function ScheduleSummaryBar({ eventDataBySlug, nowMs, tournaments }) {
  const openCount = tournaments.filter((tournament) => {
    const data = eventDataBySlug[tournament.slug] || {};
    const meta = getEffectiveRegistrationStatus(tournament, { hasLiveBracket: Boolean(data.bracket) });

    return meta.value === 'open';
  }).length;
  const liveBracketCount = tournaments.filter((tournament) => eventDataBySlug[tournament.slug]?.bracket).length;
  const tonightCount = tournaments.filter((tournament) => isTournamentToday(tournament, nowMs)).length;

  return (
    <View style={styles.scheduleSummaryGrid}>
      <View style={[styles.scheduleSummaryTile, styles.scheduleSummaryTileAccent]}>
        <Text style={styles.scheduleSummaryLabel}>Next event</Text>
        <Text style={styles.scheduleSummaryValue}>
          {tournaments[0] ? formatShortDate(tournaments[0].date, tournaments[0].timeZone) : 'TBD'}
        </Text>
      </View>
      <View style={styles.scheduleSummaryTile}>
        <Text style={styles.scheduleSummaryLabel}>Tonight</Text>
        <Text style={styles.scheduleSummaryValue}>{tonightCount}</Text>
      </View>
      <View style={styles.scheduleSummaryTile}>
        <Text style={styles.scheduleSummaryLabel}>Open signups</Text>
        <Text style={styles.scheduleSummaryValue}>{openCount}</Text>
      </View>
      <View style={styles.scheduleSummaryTile}>
        <Text style={styles.scheduleSummaryLabel}>Live brackets</Text>
        <Text style={styles.scheduleSummaryValue}>{liveBracketCount}</Text>
      </View>
      <View style={styles.scheduleSummaryTile}>
        <Text style={styles.scheduleSummaryLabel}>Upcoming</Text>
        <Text style={styles.scheduleSummaryValue}>{tournaments.length}</Text>
      </View>
    </View>
  );
}

function UpcomingTournamentList({
  featuredTournament,
  eventDataBySlug,
  gameLookup,
  nowMs,
  tournaments,
}) {
  if (!tournaments.length) {
    return (
      <EmptyState
        body="When the next public Spades event is scheduled, it will appear here with a signup button and start time."
        title="No public tournaments scheduled"
      />
    );
  }

  return (
    <View style={styles.upcomingList}>
      {tournaments.map((tournament, index) => {
        const isNext = tournament.slug === featuredTournament?.slug;
        const eventData = eventDataBySlug[tournament.slug] || {};
        const bracket = eventData.bracket || null;
        const registrationMeta = getEffectiveRegistrationStatus(tournament, {
          hasLiveBracket: Boolean(bracket),
        });
        const signupSummary = eventData.signupSummary || { count: 0, loading: true };
        const tournamentPath = getTournamentPath(tournament.slug);
        const signupPath = getCheckInPath(tournament.slug);
        const matchPath = `${tournamentPath}#my-match`;
        const gameName = gameLookup.get(tournament.gameSlug)?.name || tournament.gameSlug;
        const registrationIsOpen = registrationMeta.value === 'open';
        const isToday = isTournamentToday(tournament, nowMs);

        return (
          <Surface key={tournament.slug} style={[styles.upcomingRow, isNext && styles.upcomingRowNext]}>
            <View style={styles.upcomingRank}>
              <Text style={styles.upcomingRankText}>{index + 1}</Text>
            </View>
            <View style={styles.upcomingCopy}>
              <View style={styles.upcomingTopLine}>
                <Badge tone={isNext ? 'green' : registrationMeta.tone}>
                  {isNext ? 'Next tournament' : registrationMeta.label}
                </Badge>
                {isToday ? <Badge tone="accent">Tonight</Badge> : null}
                <Text style={styles.upcomingGame}>{gameName}</Text>
              </View>
              <Text style={styles.upcomingTitle}>{tournament.title}</Text>
              <Text style={styles.upcomingDate}>{formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)}</Text>
              <Text style={styles.upcomingSummary}>{flexibleBracketCopy(tournament)}</Text>
              <View style={styles.upcomingStats}>
                <StatPill
                  label="Registered"
                  value={registeredCountLabel(signupSummary, tournament)}
                  tone={signupSummary.count ? 'green' : 'blue'}
                />
                <StatPill
                  label="Bracket"
                  value={bracket ? `${bracket.participantCount || 0} seeded` : bracketTargetLabel(tournament)}
                  tone={bracket ? 'green' : 'accent'}
                />
                <StatPill label="Minimum" value={`${getMinimumPlayers(tournament)} players`} tone="blue" />
                <StatPill label="Entry" value="Free" tone="green" />
              </View>
            </View>
            <View style={styles.upcomingActions}>
              <ActionButton href={registrationIsOpen ? signupPath : tournamentPath}>
                {registrationIsOpen ? 'Sign up' : 'Details'}
              </ActionButton>
              <ActionButton href={matchPath} variant="secondary">
                My match
              </ActionButton>
            </View>
          </Surface>
        );
      })}
    </View>
  );
}

function TournamentCapacityPanel() {
  return (
    <Surface style={styles.capacityPanel}>
      <View style={styles.capacityTopRow}>
        <View style={styles.capacityCopy}>
          <Badge tone="green">Recommended setup</Badge>
          <Text style={styles.capacityTitle}>Advertise a fixed size. Run the real bracket flexibly.</Text>
          <Text style={styles.capacityBody}>
            Show a clear target like 8-player bracket so players know what they are joining.
            The host can still run with 2+ players, and the bracket fills open seats with automatic byes.
          </Text>
        </View>
        <View style={styles.capacityStats}>
          <StatPill label="Default cap" value="8" tone="green" />
          <StatPill label="Quick cup" value="4" tone="accent" />
          <StatPill label="Minimum" value="2" tone="blue" />
          <StatPill label="Byes" value="Auto" tone="green" />
        </View>
      </View>
      <BulletList
        items={[
          'Recommended launch default: advertise 8 seats and show registered players as 2 / 8, 5 / 8, and so on.',
          'If the event underfills, run the actual bracket with the players who joined and use byes.',
          'If the event overfills, close signups, waitlist extras, or spin up another bracket.',
        ]}
        tone="green"
      />
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
  premiumHero: {
    backgroundColor: '#07110F',
    borderColor: 'rgba(214, 162, 78, 0.34)',
    borderRadius: 24,
    marginBottom: 22,
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
    shadowColor: '#D6A24E',
    shadowOpacity: 0.18,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
  },
  premiumHeroTight: {
    paddingHorizontal: 12,
    paddingTop: 18,
  },
  premiumHeroBackdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  heroSpade: {
    color: '#F4EFE6',
    fontFamily: 'Georgia',
    fontWeight: '800',
    opacity: 0.035,
    position: 'absolute',
  },
  heroSpadeLeft: {
    fontSize: 180,
    left: 28,
    top: 36,
    transform: [{ rotate: '-8deg' }],
  },
  heroSpadeRight: {
    bottom: 12,
    fontSize: 220,
    right: 34,
    transform: [{ rotate: '10deg' }],
  },
  heroGoldGlow: {
    position: 'absolute',
    alignSelf: 'center',
    top: 132,
    width: 620,
    height: 160,
    borderRadius: 999,
    backgroundColor: 'rgba(214, 162, 78, 0.12)',
  },
  heroGreenGlow: {
    position: 'absolute',
    left: -120,
    top: -80,
    width: 320,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(97, 210, 145, 0.08)',
  },
  premiumHeroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  premiumHeroDomain: {
    color: '#AAB4AE',
    flexShrink: 1,
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  premiumHeroCopy: {
    alignItems: 'center',
    alignSelf: 'center',
    maxWidth: 820,
    width: '100%',
  },
  premiumHeroTitle: {
    color: '#F4EFE6',
    fontFamily: 'Georgia',
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 48,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 14,
  },
  premiumHeroTitleCompact: {
    fontSize: 32,
    lineHeight: 38,
  },
  premiumHeroSubtitle: {
    color: '#F4EFE6',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  premiumHeroDate: {
    color: '#D6A24E',
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 19,
    marginTop: 10,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  countdownFrame: {
    borderColor: 'rgba(214, 162, 78, 0.58)',
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    shadowColor: '#D6A24E',
    shadowOpacity: 0.26,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  countdownFrameTight: {
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingTop: 14,
    paddingBottom: 12,
  },
  countdownRailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 14,
  },
  countdownRail: {
    backgroundColor: 'rgba(214, 162, 78, 0.48)',
    flex: 1,
    height: 1,
    maxWidth: 160,
  },
  countdownFrameLabel: {
    color: '#D6A24E',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    lineHeight: 18,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  countdownGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  countdownGridCompact: {
    gap: 10,
  },
  countdownUnit: {
    alignItems: 'center',
    backgroundColor: 'rgba(7, 17, 15, 0.78)',
    borderColor: 'rgba(214, 162, 78, 0.28)',
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: 132,
    flexGrow: 1,
    justifyContent: 'center',
    maxWidth: 190,
    minHeight: 116,
    minWidth: 118,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  countdownUnitTight: {
    flexBasis: 92,
    maxWidth: '48%',
    minHeight: 88,
    minWidth: 88,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  countdownValue: {
    color: '#FFD66B',
    fontFamily: 'monospace',
    fontSize: 56,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 62,
    textAlign: 'center',
    textShadowColor: 'rgba(214, 162, 78, 0.92)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  countdownValueCompact: {
    fontSize: 42,
    lineHeight: 48,
  },
  countdownValueTight: {
    fontSize: 34,
    lineHeight: 39,
  },
  countdownLabel: {
    color: '#AAB4AE',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    lineHeight: 16,
    marginTop: 6,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  heroActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 18,
  },
  heroActionButton: {
    minWidth: 190,
  },
  rosterPolicyBar: {
    alignSelf: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.10)',
    borderColor: 'rgba(214, 162, 78, 0.34)',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 6,
    maxWidth: 780,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: '100%',
  },
  rosterPolicyText: {
    color: '#F4EFE6',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    textAlign: 'center',
  },
  heroInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginTop: 8,
  },
  heroInfoTile: {
    backgroundColor: 'rgba(23, 38, 34, 0.72)',
    borderColor: 'rgba(244, 239, 230, 0.12)',
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 152,
    flexGrow: 1,
    maxWidth: 210,
    minHeight: 70,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  heroInfoAccent: {
    borderColor: 'rgba(214, 162, 78, 0.45)',
    backgroundColor: 'rgba(214, 162, 78, 0.12)',
  },
  heroInfoBlue: {
    borderColor: 'rgba(108, 199, 255, 0.38)',
    backgroundColor: 'rgba(108, 199, 255, 0.10)',
  },
  heroInfoGreen: {
    borderColor: 'rgba(97, 210, 145, 0.42)',
    backgroundColor: 'rgba(97, 210, 145, 0.11)',
  },
  heroInfoLabel: {
    color: '#AAB4AE',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  heroInfoValue: {
    color: '#F4EFE6',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
    marginTop: 3,
  },
  hubTournamentCard: {
    marginTop: 14,
  },
  scheduleSummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  scheduleSummaryTile: {
    backgroundColor: 'rgba(23, 38, 34, 0.76)',
    borderColor: 'rgba(244, 239, 230, 0.12)',
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: 150,
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  scheduleSummaryTileAccent: {
    backgroundColor: 'rgba(214, 162, 78, 0.12)',
    borderColor: 'rgba(214, 162, 78, 0.42)',
  },
  scheduleSummaryLabel: {
    color: '#AAB4AE',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  scheduleSummaryValue: {
    color: '#F4EFE6',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
    marginTop: 2,
  },
  upcomingList: {
    gap: 12,
  },
  upcomingRow: {
    alignItems: 'stretch',
    borderColor: 'rgba(244, 239, 230, 0.12)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  upcomingRowNext: {
    borderColor: 'rgba(97, 210, 145, 0.34)',
    backgroundColor: 'rgba(97, 210, 145, 0.06)',
  },
  upcomingRank: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(97, 210, 145, 0.12)',
    borderColor: 'rgba(97, 210, 145, 0.34)',
    borderRadius: 999,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  upcomingRankText: {
    color: '#61D291',
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 22,
  },
  upcomingCopy: {
    flex: 1,
    minWidth: 260,
  },
  upcomingTopLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  upcomingGame: {
    color: '#AAB4AE',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  upcomingTitle: {
    color: '#F4EFE6',
    fontFamily: 'Georgia',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
  },
  upcomingDate: {
    color: '#D6A24E',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 4,
  },
  upcomingSummary: {
    color: '#AAB4AE',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  upcomingStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  upcomingActions: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    minWidth: 220,
  },
  capacityPanel: {
    borderColor: 'rgba(97, 210, 145, 0.28)',
  },
  capacityTopRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  capacityCopy: {
    flex: 1,
    minWidth: 260,
  },
  capacityTitle: {
    color: '#F4EFE6',
    fontFamily: 'Georgia',
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 31,
    marginTop: 10,
  },
  capacityBody: {
    color: '#AAB4AE',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 8,
  },
  capacityStats: {
    flexBasis: 340,
    flexDirection: 'row',
    flexGrow: 1,
    flexWrap: 'wrap',
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

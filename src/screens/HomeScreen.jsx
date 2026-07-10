import { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Pressable, Text, View, StyleSheet, useWindowDimensions } from 'react-native';

import {
  ActionButton,
  Badge,
  GameCard,
  HubScreen,
  ResultCard,
  Section,
  StreamCard,
  StatPill,
  Surface,
  EmptyState,
  BulletList,
} from '../components/hub-ui.jsx';
import { formatDateLine, formatShortDate } from '../lib/format.js';
import { APP_STORE_BADGE_URL, downloadLinks } from '../lib/downloadLinks.js';
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
import { mergeTournamentLists } from '../lib/tournamentCatalog.js';
import { getEffectiveRegistrationStatus, getRegistrationStatusMeta, mergeTournamentSettings } from '../lib/tournamentSettings.js';
import {
  fetchSignupSummary,
  fetchTournamentBracket,
  fetchTournamentEvents,
  fetchTournamentSettings,
} from '../lib/tournamentHostingClient.js';

const DEFAULT_ROSTER_CAP = 8;
const DEFAULT_MINIMUM_PLAYERS = 2;
const APP_STORE_BADGE_WIDTH = 178;
const APP_STORE_BADGE_HEIGHT = 53;

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

function isConfiguredUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function openExternalUrl(href) {
  if (!isConfiguredUrl(href)) {
    return;
  }

  Linking.openURL(href).catch(() => {});
}

export default function HomeScreen() {
  const [eventDataBySlug, setEventDataBySlug] = useState({});
  const [hostedTournaments, setHostedTournaments] = useState([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const games = useMemo(() => getGames(), []);
  const streams = useMemo(() => getStreams(), []);
  const upcoming = useMemo(
    () => mergeTournamentLists(getUpcomingTournaments(), hostedTournaments).filter((tournament) => tournament.status === 'upcoming'),
    [hostedTournaments],
  );
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
    let active = true;

    async function loadHostedTournaments() {
      try {
        const result = await fetchTournamentEvents();

        if (active) {
          setHostedTournaments(result.tournaments || []);
        }
      } catch {
        if (active) {
          setHostedTournaments([]);
        }
      }
    }

    loadHostedTournaments();

    return () => {
      active = false;
    };
  }, []);

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
              signups: signupResult.status === 'fulfilled' ? signupResult.value.signups || [] : [],
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
      <HomepageFrontDoor
        bracket={featuredBracket}
        matchStatusPath={featuredMatchStatusPath}
        registrationMeta={featuredRegistrationMeta}
        signupPath={featuredSignupPath}
        signupSummary={featuredSignupSummary}
        tournament={featuredTournament}
        tournamentPath={featuredTournamentPath}
      />

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

      <TwitchTournamentBoard
        bracket={featuredBracket}
        matchStatusPath={featuredMatchStatusPath}
        registrationMeta={featuredRegistrationMeta}
        signupPath={featuredSignupPath}
        signupSummary={featuredSignupSummary}
        tournament={featuredTournament}
        tournamentPath={featuredTournamentPath}
      />

      <PremiumDownloadSection />

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
                Event
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
        <AppStoreBadgeButton
          href={downloadLinks.appStoreSpades}
          label="Download 1v1 Spades on the App Store"
          large
        />
        <PremiumLinkButton href={downloadLinks.webSpades} label="Play on the Web" />
        <PremiumLinkButton href={downloadLinks.tournaments} label="Join Tournaments" />
        <PremiumLinkButton href={downloadLinks.twitch} label="Watch on Twitch" />
        <PremiumLinkButton href={downloadLinks.discord} label="Discord" />
        <PremiumLinkButton href={downloadLinks.youtube} label="YouTube" />
      </View>

      <View style={styles.heroActionRowSecondary}>
        <ActionButton href={matchStatusPath} style={styles.heroActionButton}>
          My Match
        </ActionButton>
        <ActionButton href={`${tournamentPath}#live-bracket`} style={styles.heroActionButton} variant="secondary">
          View bracket
        </ActionButton>
        <ActionButton href="/stream" variant="secondary">
          Watch
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

function PremiumDownloadSection() {
  const games = [
    {
      key: 'spades',
      title: '1v1 Spades',
      eyebrow: 'Live now',
      body: 'Open the competitive Spades app, play on web, or install from the App Store.',
      appStoreUrl: downloadLinks.appStoreSpades,
      webUrl: downloadLinks.webSpades,
      accent: '#D6A24E',
    },
    {
      key: 'euchre',
      title: '1v1 Euchre',
      eyebrow: 'Next game',
      body: 'Euchre is wired for the same 1v1 family experience. The App Store badge appears automatically when its URL is configured.',
      appStoreUrl: downloadLinks.appStoreEuchre,
      webUrl: downloadLinks.webEuchre,
      accent: '#5E7FA3',
    },
  ];

  return (
    <>
      <Section
        description="Install the apps, launch the web versions, or jump straight into hosted events from one consistent landing section."
        eyebrow="Official downloads"
        nativeID="downloads"
        title="Play the 1v1 card lineup">
        <View style={styles.downloadGamesGrid}>
          {games.map((game) => (
            <PremiumGameDownloadCard key={game.key} game={game} />
          ))}
        </View>
      </Section>

      <Section
        description="The tournament hub owns signup, event rules, brackets, and public event pages."
        eyebrow="Tournament hub"
        title="Run the bracket from 1v1Tournaments.org">
        <View style={styles.tournamentDownloadGrid}>
          <PremiumLinkPanel
            body="Open the public hub for account signup, brackets, event pages, and results."
            href={downloadLinks.tournaments}
            label="Visit 1v1Tournaments.org"
            tone="accent"
          />
          <PremiumLinkPanel
            body="Jump to the next posted tournament and check the current schedule."
            href={`${downloadLinks.tournaments}/#next-tournaments`}
            label="Upcoming Events"
            tone="green"
          />
          <PremiumLinkPanel
            body="Review free-entry event rules, match flow, and platform notes."
            href={`${downloadLinks.tournaments}/rules`}
            label="Tournament Rules"
            tone="blue"
          />
        </View>
      </Section>
    </>
  );
}

function HomepageFrontDoor({
  bracket,
  matchStatusPath,
  registrationMeta,
  signupPath,
  signupSummary,
  tournament,
  tournamentPath,
}) {
  if (!tournament) {
    return null;
  }

  const signups = signupSummary.signups || [];
  const cap = getRosterCap(tournament);
  const registeredCount = signupSummary.count || signups.length || 0;
  const signupLoading = Boolean(signupSummary.loading);
  const registrationOpen = registrationMeta.value === 'open';
  const bracketLive = Boolean(bracket);
  const joinHref = registrationOpen ? signupPath : tournamentPath;
  const joinLabel = registrationOpen ? 'Join' : 'Event';
  const joinBody = registrationOpen
    ? 'Create or open your tournament account and reserve your seat.'
    : 'Registration is not open, but the event page still shows schedule, roster, and rules.';

  return (
    <Section
      description="The homepage now points visitors to the three places they need most on stream day."
      eyebrow="Start here"
      nativeID="start-here"
      title="Choose your next move">
      <Surface style={styles.frontDoorShell}>
        <View style={styles.frontDoorHeader}>
          <View style={styles.frontDoorTitleBlock}>
            <Badge tone={bracketLive ? 'green' : registrationMeta.tone}>
              {bracketLive ? 'Bracket live' : registrationMeta.label}
            </Badge>
            <Text style={styles.frontDoorTitle}>{tournament.title}</Text>
            <Text style={styles.frontDoorMeta}>
              {formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)}
            </Text>
          </View>
          <View style={styles.frontDoorCountTile}>
            <Text style={styles.frontDoorCountLabel}>Signed up</Text>
            <Text style={styles.frontDoorCountValue}>
              {signupLoading ? '--' : registeredCount}
              <Text style={styles.frontDoorCountCap}> / {cap}</Text>
            </Text>
          </View>
        </View>

        <View style={styles.frontDoorGrid}>
          <FrontDoorCard
            actionLabel="Event"
            body="See time, roster, bracket, rules, results, and match status in one event page."
            href={tournamentPath}
            meta="Next"
            title="Next tournament"
            tone="accent"
          />
          <FrontDoorCard
            actionLabel="Watch"
            body="Open the public stream page with Twitch, roster, and stream-day links."
            href="/stream"
            meta="Stream"
            title="Watch Tournament"
            tone="blue"
          />
          <FrontDoorCard
            actionLabel={joinLabel}
            body={joinBody}
            href={joinHref}
            meta="Player"
            title="Join tournament"
            tone="green"
          />
        </View>

        <View style={styles.frontDoorSecondaryRow}>
          <ActionButton href={matchStatusPath} variant="secondary">
            My Match
          </ActionButton>
          <ActionButton href="/next" variant="secondary">
            Compact lobby
          </ActionButton>
          <ActionButton href="/leaderboard" variant="secondary">
            Tournament leaderboard
          </ActionButton>
          <ActionButton href="/rules" variant="secondary">
            Rules
          </ActionButton>
        </View>
      </Surface>
    </Section>
  );
}

function FrontDoorCard({ actionLabel, body, href, meta, title, tone }) {
  return (
    <Surface style={[styles.frontDoorCard, styles[`frontDoorCard${tone[0].toUpperCase()}${tone.slice(1)}`]]}>
      <Text style={styles.frontDoorCardMeta}>{meta}</Text>
      <Text style={styles.frontDoorCardTitle}>{title}</Text>
      <Text style={styles.frontDoorCardBody}>{body}</Text>
      <ActionButton href={href} style={styles.frontDoorCardAction}>
        {actionLabel}
      </ActionButton>
    </Surface>
  );
}

function TwitchTournamentBoard({
  bracket,
  matchStatusPath,
  registrationMeta,
  signupPath,
  signupSummary,
  tournament,
  tournamentPath,
}) {
  if (!tournament) {
    return null;
  }

  const signups = signupSummary.signups || [];
  const cap = getRosterCap(tournament);
  const openSeats = Math.max(cap - (signupSummary.count || signups.length || 0), 0);
  const signupLoading = Boolean(signupSummary.loading);
  const signupUnavailable = Boolean(signupSummary.unavailable);
  const registrationOpen = registrationMeta.value === 'open';
  const bracketLive = Boolean(bracket);

  return (
    <Section
      description="Built for stream viewers: the next event, signup count, and public roster are visible without opening admin tools."
      eyebrow="Twitch ready"
      nativeID="twitch-board"
      title="Next tournament">
      <Surface style={styles.twitchBoard}>
        <View pointerEvents="none" style={styles.twitchBoardGlow} />
        <View style={styles.twitchBoardMain}>
          <View style={styles.twitchEventCopy}>
            <View style={styles.twitchTopRow}>
              <Badge tone={bracketLive ? 'green' : registrationMeta.tone}>
                {bracketLive ? 'Bracket live' : registrationMeta.label}
              </Badge>
              <Text style={styles.twitchLiveTag}>Stream overlay friendly</Text>
            </View>
            <Text style={styles.twitchTitle}>{tournament.title}</Text>
            <Text style={styles.twitchDate}>
              {formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)}
            </Text>
            <Text style={styles.twitchSummary}>
              {tournament.format} • {tournament.location} • {tournament.entryLine}
            </Text>
            <View style={styles.twitchActions}>
              <ActionButton href={registrationOpen ? signupPath : tournamentPath}>
                {registrationOpen ? 'Join' : 'Event'}
              </ActionButton>
              <ActionButton href={matchStatusPath} variant="secondary">
                My Match
              </ActionButton>
              <ActionButton href="/stream" variant="secondary">
                Watch
              </ActionButton>
              {isConfiguredUrl(downloadLinks.twitch) ? (
                <ActionButton external href={downloadLinks.twitch} variant="secondary">
                  Twitch
                </ActionButton>
              ) : null}
            </View>
          </View>

          <View style={styles.twitchScoreStack}>
            <View style={styles.twitchScoreTile}>
              <Text style={styles.twitchScoreLabel}>Signed up</Text>
              <Text style={styles.twitchScoreValue}>
                {signupLoading ? '--' : signupSummary.count || signups.length || 0}
                <Text style={styles.twitchScoreSub}> / {cap}</Text>
              </Text>
            </View>
            <View style={styles.twitchScoreTile}>
              <Text style={styles.twitchScoreLabel}>Open seats</Text>
              <Text style={styles.twitchScoreValue}>{signupLoading ? '--' : openSeats}</Text>
            </View>
          </View>
        </View>

        <View style={styles.twitchRosterPanel}>
          <View style={styles.twitchRosterHeader}>
            <Text style={styles.twitchRosterTitle}>Public signup roster</Text>
            <Text style={styles.twitchRosterMeta}>
              {signupUnavailable ? 'Live roster unavailable' : signupLoading ? 'Loading players' : `${signups.length} visible`}
            </Text>
          </View>
          {signupLoading ? (
            <Text style={styles.twitchRosterEmpty}>Loading registered players...</Text>
          ) : signups.length ? (
            <View style={styles.twitchRosterGrid}>
              {signups.slice(0, 12).map((signup, index) => (
                <View key={signup.id || `${signup.playerName}-${index}`} style={styles.twitchRosterRow}>
                  <View style={styles.twitchRosterRank}>
                    <Text style={styles.twitchRosterRankText}>{index + 1}</Text>
                  </View>
                  <View style={styles.twitchRosterNameBlock}>
                    <Text numberOfLines={1} style={styles.twitchRosterName}>
                      {signup.playerName || 'Unnamed player'}
                    </Text>
                    <Text numberOfLines={1} style={styles.twitchRosterHandle}>
                      {signup.playerHandle || signup.status || 'registered'}
                    </Text>
                  </View>
                </View>
              ))}
              {signups.length > 12 ? (
                <View style={styles.twitchRosterMore}>
                  <Text style={styles.twitchRosterMoreText}>+{signups.length - 12} more players</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={styles.twitchRosterEmpty}>
              No public signups yet. Send viewers to Join Tournament to get the roster started.
            </Text>
          )}
        </View>
      </Surface>
    </Section>
  );
}

function PremiumGameDownloadCard({ game }) {
  return (
    <Surface style={[styles.downloadGameCard, { borderColor: game.accent }]}>
      <View style={styles.downloadGameTopRow}>
        <Badge tone={game.key === 'spades' ? 'green' : 'blue'}>{game.eyebrow}</Badge>
        <Text style={styles.downloadGameMark}>1v1</Text>
      </View>
      <Text style={styles.downloadGameTitle}>{game.title}</Text>
      <Text style={styles.downloadGameBody}>{game.body}</Text>
      <View style={styles.downloadButtonStack}>
        <AppStoreBadgeButton href={game.appStoreUrl} label={`Download ${game.title} on the App Store`} />
        <PremiumLinkButton href={game.webUrl} label="Play on Web" />
      </View>
    </Surface>
  );
}

function AppStoreBadgeButton({ href, label, large = false }) {
  if (!isConfiguredUrl(href)) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="link"
      onPress={() => openExternalUrl(href)}
      style={({ hovered, pressed }) => [
        styles.appStoreBadgeShell,
        large && styles.appStoreBadgeShellLarge,
        hovered && styles.downloadHover,
        pressed && styles.downloadPressed,
      ]}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={{ uri: APP_STORE_BADGE_URL }}
        style={[styles.appStoreBadgeImage, large && styles.appStoreBadgeImageLarge]}
      />
    </Pressable>
  );
}

function PremiumLinkButton({ href, label }) {
  const enabled = isConfiguredUrl(href);

  return (
    <Pressable
      accessibilityLabel={enabled ? label : `${label} link is not configured yet`}
      accessibilityRole={enabled ? 'link' : 'button'}
      disabled={!enabled}
      onPress={() => openExternalUrl(href)}
      style={({ hovered, pressed }) => [
        styles.premiumLinkButton,
        !enabled && styles.premiumLinkButtonDisabled,
        hovered && enabled && styles.downloadHover,
        pressed && enabled && styles.downloadPressed,
      ]}>
      <Text style={[styles.premiumLinkButtonText, !enabled && styles.premiumLinkButtonTextDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

function PremiumLinkPanel({ body, href, label, tone }) {
  const enabled = isConfiguredUrl(href);

  return (
    <Pressable
      accessibilityLabel={enabled ? label : `${label} link is not configured yet`}
      accessibilityRole={enabled ? 'link' : 'button'}
      disabled={!enabled}
      onPress={() => openExternalUrl(href)}
      style={({ hovered, pressed }) => [
        styles.tournamentLinkPanel,
        styles[`tournamentLinkPanel${tone[0].toUpperCase()}${tone.slice(1)}`],
        hovered && enabled && styles.downloadHover,
        pressed && enabled && styles.downloadPressed,
      ]}>
      <Text style={styles.tournamentLinkLabel}>{label}</Text>
      <Text style={styles.tournamentLinkBody}>{body}</Text>
    </Pressable>
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
        const signups = signupSummary.signups || [];
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
              <UpcomingRosterPreview loading={signupSummary.loading} signups={signups} />
            </View>
            <View style={styles.upcomingActions}>
              <ActionButton href={registrationIsOpen ? signupPath : tournamentPath}>
                {registrationIsOpen ? 'Join' : 'Event'}
              </ActionButton>
              <ActionButton href={matchPath} variant="secondary">
                My Match
              </ActionButton>
            </View>
          </Surface>
        );
      })}
    </View>
  );
}

function UpcomingRosterPreview({ loading, signups }) {
  if (loading) {
    return <Text style={styles.upcomingRosterEmpty}>Loading public roster...</Text>;
  }

  if (!signups.length) {
    return <Text style={styles.upcomingRosterEmpty}>No public signups yet.</Text>;
  }

  return (
    <View style={styles.upcomingRosterPreview}>
      <Text style={styles.upcomingRosterLabel}>Signed up</Text>
      <View style={styles.upcomingRosterNames}>
        {signups.slice(0, 6).map((signup, index) => (
          <View key={signup.id || `${signup.playerName}-${index}`} style={styles.upcomingRosterChip}>
            <Text numberOfLines={1} style={styles.upcomingRosterChipText}>
              {signup.playerName || 'Unnamed player'}
            </Text>
          </View>
        ))}
        {signups.length > 6 ? (
          <View style={styles.upcomingRosterChip}>
            <Text style={styles.upcomingRosterChipText}>+{signups.length - 6}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 14,
  },
  frontDoorShell: {
    backgroundColor: '#07110F',
    borderColor: 'rgba(214, 162, 78, 0.34)',
    borderRadius: 22,
    overflow: 'hidden',
    padding: 16,
  },
  frontDoorHeader: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  frontDoorTitleBlock: {
    flex: 1,
    minWidth: 260,
  },
  frontDoorTitle: {
    color: '#F4EFE6',
    fontFamily: 'Georgia',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 36,
    marginTop: 10,
  },
  frontDoorMeta: {
    color: '#FFD66B',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.7,
    lineHeight: 18,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  frontDoorCountTile: {
    backgroundColor: 'rgba(214, 162, 78, 0.12)',
    borderColor: 'rgba(214, 162, 78, 0.38)',
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 104,
    minWidth: 168,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  frontDoorCountLabel: {
    color: '#A7A29A',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  frontDoorCountValue: {
    color: '#FFD66B',
    fontFamily: 'monospace',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 44,
    marginTop: 4,
  },
  frontDoorCountCap: {
    color: '#F4EFE6',
    fontSize: 18,
  },
  frontDoorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  frontDoorCard: {
    backgroundColor: 'rgba(17, 29, 26, 0.88)',
    borderColor: 'rgba(244, 239, 230, 0.14)',
    borderRadius: 18,
    flexBasis: 250,
    flexGrow: 1,
    justifyContent: 'space-between',
    minHeight: 238,
    minWidth: 0,
    padding: 16,
  },
  frontDoorCardAccent: {
    backgroundColor: 'rgba(214, 162, 78, 0.11)',
    borderColor: 'rgba(214, 162, 78, 0.42)',
  },
  frontDoorCardBlue: {
    backgroundColor: 'rgba(94, 127, 163, 0.10)',
    borderColor: 'rgba(94, 127, 163, 0.36)',
  },
  frontDoorCardGreen: {
    backgroundColor: 'rgba(214, 162, 78, 0.10)',
    borderColor: 'rgba(214, 162, 78, 0.36)',
  },
  frontDoorCardMeta: {
    color: '#D6A24E',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  frontDoorCardTitle: {
    color: '#F4EFE6',
    fontFamily: 'Georgia',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 29,
    marginTop: 8,
  },
  frontDoorCardBody: {
    color: '#A7A29A',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 8,
  },
  frontDoorCardAction: {
    marginTop: 16,
  },
  frontDoorSecondaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
  },
  twitchBoard: {
    backgroundColor: '#06100E',
    borderColor: 'rgba(214, 162, 78, 0.40)',
    borderRadius: 24,
    overflow: 'hidden',
    padding: 0,
  },
  twitchBoardGlow: {
    backgroundColor: 'rgba(214, 162, 78, 0.10)',
    borderRadius: 999,
    height: 240,
    position: 'absolute',
    right: -90,
    top: -110,
    width: 360,
  },
  twitchBoardMain: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    padding: 18,
  },
  twitchEventCopy: {
    flex: 2,
    minWidth: 280,
  },
  twitchTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  twitchLiveTag: {
    color: '#D6A24E',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  twitchTitle: {
    color: '#F4EFE6',
    fontFamily: 'Georgia',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 40,
  },
  twitchDate: {
    color: '#FFD66B',
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.7,
    lineHeight: 20,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  twitchSummary: {
    color: '#F4EFE6',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 8,
  },
  twitchActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  twitchScoreStack: {
    flexBasis: 290,
    flexDirection: 'row',
    flexGrow: 1,
    flexWrap: 'wrap',
    gap: 10,
  },
  twitchScoreTile: {
    backgroundColor: 'rgba(214, 162, 78, 0.13)',
    borderColor: 'rgba(214, 162, 78, 0.42)',
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: 132,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 128,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  twitchScoreLabel: {
    color: '#A7A29A',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  twitchScoreValue: {
    color: '#FFD66B',
    fontFamily: 'monospace',
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 50,
    marginTop: 6,
  },
  twitchScoreSub: {
    color: '#F4EFE6',
    fontSize: 22,
  },
  twitchRosterPanel: {
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderTopColor: 'rgba(244, 239, 230, 0.10)',
    borderTopWidth: 1,
    padding: 18,
  },
  twitchRosterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  twitchRosterTitle: {
    color: '#F4EFE6',
    fontFamily: 'Georgia',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 27,
  },
  twitchRosterMeta: {
    color: '#A7A29A',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  twitchRosterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  twitchRosterRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 38, 34, 0.82)',
    borderColor: 'rgba(214, 162, 78, 0.28)',
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: 230,
    flexDirection: 'row',
    flexGrow: 1,
    minHeight: 70,
    minWidth: 0,
    padding: 10,
  },
  twitchRosterRank: {
    alignItems: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.14)',
    borderColor: 'rgba(214, 162, 78, 0.38)',
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    marginRight: 10,
    width: 42,
  },
  twitchRosterRankText: {
    color: '#D6A24E',
    fontFamily: 'monospace',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
  },
  twitchRosterNameBlock: {
    flex: 1,
    minWidth: 0,
  },
  twitchRosterName: {
    color: '#F4EFE6',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
  },
  twitchRosterHandle: {
    color: '#A7A29A',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 2,
  },
  twitchRosterMore: {
    alignItems: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.12)',
    borderColor: 'rgba(214, 162, 78, 0.35)',
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: 230,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 70,
    padding: 12,
  },
  twitchRosterMoreText: {
    color: '#FFD66B',
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  twitchRosterEmpty: {
    color: '#A7A29A',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  downloadGamesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  downloadGameCard: {
    backgroundColor: '#08110F',
    borderRadius: 20,
    flexBasis: 320,
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  downloadGameTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  downloadGameMark: {
    color: '#D6A24E',
    fontFamily: 'Georgia',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  downloadGameTitle: {
    color: '#F4EFE6',
    fontFamily: 'Georgia',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 33,
  },
  downloadGameBody: {
    color: '#A7A29A',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 8,
  },
  downloadButtonStack: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  appStoreBadgeShell: {
    alignItems: 'center',
    height: APP_STORE_BADGE_HEIGHT,
    justifyContent: 'center',
    width: APP_STORE_BADGE_WIDTH,
  },
  appStoreBadgeShellLarge: {
    height: 60,
    width: 202,
  },
  appStoreBadgeImage: {
    height: APP_STORE_BADGE_HEIGHT,
    width: APP_STORE_BADGE_WIDTH,
  },
  appStoreBadgeImageLarge: {
    height: 60,
    width: 202,
  },
  premiumLinkButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.16)',
    borderColor: 'rgba(214, 162, 78, 0.62)',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
    transitionDuration: '160ms',
    transitionProperty: 'transform, opacity, background-color, border-color',
  },
  premiumLinkButtonDisabled: {
    backgroundColor: 'rgba(244, 239, 230, 0.05)',
    borderColor: 'rgba(244, 239, 230, 0.12)',
    opacity: 0.62,
  },
  premiumLinkButtonText: {
    color: '#F4EFE6',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    lineHeight: 17,
    textTransform: 'uppercase',
  },
  premiumLinkButtonTextDisabled: {
    color: '#A7A29A',
  },
  downloadHover: {
    transform: [{ translateY: -2 }],
  },
  downloadPressed: {
    opacity: 0.82,
    transform: [{ translateY: 1 }],
  },
  tournamentDownloadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tournamentLinkPanel: {
    backgroundColor: 'rgba(17, 29, 26, 0.88)',
    borderColor: 'rgba(244, 239, 230, 0.14)',
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: 250,
    flexGrow: 1,
    minHeight: 138,
    minWidth: 0,
    padding: 16,
    transitionDuration: '160ms',
    transitionProperty: 'transform, opacity, background-color, border-color',
  },
  tournamentLinkPanelAccent: {
    backgroundColor: 'rgba(214, 162, 78, 0.12)',
    borderColor: 'rgba(214, 162, 78, 0.42)',
  },
  tournamentLinkPanelGreen: {
    backgroundColor: 'rgba(214, 162, 78, 0.10)',
    borderColor: 'rgba(214, 162, 78, 0.36)',
  },
  tournamentLinkPanelBlue: {
    backgroundColor: 'rgba(94, 127, 163, 0.10)',
    borderColor: 'rgba(94, 127, 163, 0.36)',
  },
  tournamentLinkLabel: {
    color: '#F4EFE6',
    fontFamily: 'Georgia',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 25,
  },
  tournamentLinkBody: {
    color: '#A7A29A',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 8,
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
    backgroundColor: 'rgba(214, 162, 78, 0.08)',
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
    color: '#A7A29A',
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
    color: '#A7A29A',
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
    gap: 10,
  },
  heroActionRowSecondary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 10,
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
    borderColor: 'rgba(94, 127, 163, 0.38)',
    backgroundColor: 'rgba(94, 127, 163, 0.10)',
  },
  heroInfoGreen: {
    borderColor: 'rgba(214, 162, 78, 0.42)',
    backgroundColor: 'rgba(214, 162, 78, 0.11)',
  },
  heroInfoLabel: {
    color: '#A7A29A',
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
    color: '#A7A29A',
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
    borderColor: 'rgba(214, 162, 78, 0.34)',
    backgroundColor: 'rgba(214, 162, 78, 0.06)',
  },
  upcomingRank: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(214, 162, 78, 0.12)',
    borderColor: 'rgba(214, 162, 78, 0.34)',
    borderRadius: 999,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  upcomingRankText: {
    color: '#D6A24E',
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
    color: '#A7A29A',
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
    color: '#A7A29A',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  upcomingStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  upcomingRosterPreview: {
    marginTop: 10,
  },
  upcomingRosterLabel: {
    color: '#D6A24E',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 16,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  upcomingRosterNames: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  upcomingRosterChip: {
    backgroundColor: 'rgba(214, 162, 78, 0.12)',
    borderColor: 'rgba(214, 162, 78, 0.30)',
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 180,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  upcomingRosterChipText: {
    color: '#F4EFE6',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 15,
  },
  upcomingRosterEmpty: {
    color: '#A7A29A',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 10,
  },
  upcomingActions: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    minWidth: 220,
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

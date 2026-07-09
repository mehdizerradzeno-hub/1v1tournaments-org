import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, usePathname } from 'expo-router';

import { theme } from '../lib/theme.js';
import { formatPlacement, formatResultDate, formatShortDate } from '../lib/format.js';
import { fetchPlayerAccount } from '../lib/tournamentHostingClient.js';
import { getCheckInPath, getTournamentPath, siteData } from '../lib/siteData.js';

const PRIMARY_TOURNAMENT_PATH = getTournamentPath(siteData.site.primaryTournamentSlug);
const PRIMARY_CHECK_IN_PATH = getCheckInPath(siteData.site.primaryTournamentSlug);
const PRIMARY_SIGN_IN_PATH = `${PRIMARY_CHECK_IN_PATH}?mode=signin`;
const PRIMARY_MATCH_PATH = `${PRIMARY_TOURNAMENT_PATH}#my-match`;
const PLAYER_ACCOUNT_CHANGED_EVENT = 'one-v-one-tournaments-player-account-changed';

const NAV_ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'My match', href: PRIMARY_MATCH_PATH, activePath: PRIMARY_TOURNAMENT_PATH },
  { label: 'Tournament', href: PRIMARY_TOURNAMENT_PATH },
  { label: 'Stream', href: '/stream' },
  { label: 'Leaderboard', href: '/leaderboard' },
  { label: 'Sign up', href: PRIMARY_CHECK_IN_PATH },
  { label: 'Rules', href: '/rules' },
];

const MOBILE_NAV_ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'My match', href: PRIMARY_MATCH_PATH, activePath: PRIMARY_TOURNAMENT_PATH },
  { label: 'Tournament', href: PRIMARY_TOURNAMENT_PATH },
  { label: 'Ranks', href: '/leaderboard' },
];

const STICKY_ACTION_ITEMS = [
  { label: 'Join', href: PRIMARY_CHECK_IN_PATH, tone: 'primary' },
  { label: 'My match', href: PRIMARY_MATCH_PATH, tone: 'secondary', activePath: PRIMARY_TOURNAMENT_PATH },
  { label: 'Watch', href: '/live', tone: 'secondary' },
];

const DISPLAY_FONT = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });
const MONO_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'Menlo' });

function isInternalHref(href) {
  return typeof href === 'string' && href.startsWith('/');
}

function isActivePath(pathname, href) {
  if (href === '/') {
    return pathname === '/';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function isNavItemActive(pathname, item) {
  return isActivePath(pathname, item.activePath || item.href);
}

function getToneColor(tone) {
  if (tone === 'blue') return theme.colors.blue;
  if (tone === 'green') return theme.colors.green;
  if (tone === 'rose') return theme.colors.rose;
  if (tone === 'neutral') return theme.colors.lineStrong;
  return theme.colors.accent;
}

function shortAccountName(account) {
  const name = String(account?.playerName || account?.email || '').trim();

  if (!name) {
    return 'Player';
  }

  return name.length > 18 ? `${name.slice(0, 17)}...` : name;
}

function LinkShell({ href, children, style, accessibilityLabel, onPress, variant = 'primary', external = false, disabled = false }) {
  const linkStyles = ({ pressed }) => [
    styles.button,
    variant === 'secondary' && styles.buttonSecondary,
    variant === 'ghost' && styles.buttonGhost,
    pressed && !disabled && styles.buttonPressed,
    disabled && styles.buttonDisabled,
    style,
  ];

  if (href && isInternalHref(href) && !external && !disabled) {
    return (
      <Link accessibilityLabel={accessibilityLabel} href={href} asChild>
        <Pressable accessibilityRole="link" style={linkStyles}>
          {children}
        </Pressable>
      </Link>
    );
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={href ? 'link' : 'button'}
      disabled={disabled}
      onPress={() => {
        if (disabled) {
          return;
        }

        if (onPress) {
          onPress();
          return;
        }

        if (href) {
          Linking.openURL(href).catch(() => {});
        }
      }}
      style={linkStyles}>
      {children}
    </Pressable>
  );
}

function CardLink({ href, children, style, accent = theme.colors.accent, external = false, accessibilityLabel, onPress }) {
  return (
    <LinkShell
      accessibilityLabel={accessibilityLabel}
      external={external}
      href={href}
      onPress={onPress}
      style={style}>
      <View style={[styles.card, { borderColor: accent }]}>{children}</View>
    </LinkShell>
  );
}

export function Surface({ children, style }) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

export function Badge({ children, tone = 'neutral', style }) {
  return (
    <View style={[styles.badge, styles[`badge${tone[0].toUpperCase()}${tone.slice(1)}`], style]}>
      <Text style={[styles.badgeText, tone === 'neutral' && styles.badgeTextNeutral]}>{children}</Text>
    </View>
  );
}

export function ActionButton({ href, onPress, children, variant = 'primary', external = false, style, accessibilityLabel, disabled = false }) {
  return (
    <LinkShell
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      external={external}
      href={href}
      onPress={onPress}
      style={[styles.actionButtonWrap, style]}
      variant={variant}>
      <View
        style={[
          styles.actionButtonInner,
          variant === 'secondary' && styles.actionButtonInnerSecondary,
          variant === 'ghost' && styles.actionButtonInnerGhost,
          variant === 'danger' && styles.actionButtonInnerDanger,
          disabled && styles.actionButtonInnerDisabled,
        ]}>
        <Text
          style={[
            styles.actionButtonText,
            variant === 'secondary' && styles.actionButtonTextSecondary,
            variant === 'ghost' && styles.actionButtonTextSecondary,
            variant === 'danger' && styles.actionButtonTextDanger,
            disabled && styles.actionButtonTextDisabled,
          ]}>
          {children}
        </Text>
      </View>
    </LinkShell>
  );
}

function HeaderAccountChip({ account, loading }) {
  const signedIn = Boolean(account);
  const accountName = shortAccountName(account);
  const label = loading ? 'Checking' : signedIn ? 'Signed in' : 'Account';
  const value = loading ? 'One sec...' : signedIn ? accountName : 'Sign in';

  return (
    <LinkShell
      accessibilityLabel={signedIn ? `Signed in as ${accountName}. Switch account.` : 'Sign in to your tournament account'}
      href={PRIMARY_SIGN_IN_PATH}
      style={styles.accountChipShell}
      variant={signedIn ? 'secondary' : 'primary'}>
      <View style={[styles.accountChip, signedIn ? styles.accountChipSignedIn : styles.accountChipSignedOut]}>
        <Text style={[styles.accountChipLabel, !signedIn && styles.accountChipLabelSignedOut]}>{label}</Text>
        <Text
          numberOfLines={1}
          style={[styles.accountChipValue, !signedIn && styles.accountChipValueSignedOut]}>
          {value}
        </Text>
      </View>
    </LinkShell>
  );
}

export function StatPill({ label, value, tone = 'neutral' }) {
  return (
    <View style={[styles.statPill, styles[`stat${tone[0].toUpperCase()}${tone.slice(1)}`]]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function Section({ eyebrow, title, description, action, children, style, nativeID }) {
  return (
    <View nativeID={nativeID} style={[styles.section, style]}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleGroup}>
          {eyebrow ? <Text style={styles.sectionEyebrow}>{eyebrow}</Text> : null}
          <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
          {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
        </View>
        {action ? <View style={styles.sectionAction}>{action}</View> : null}
      </View>
      {children}
    </View>
  );
}

export function BulletList({ items, tone = 'accent', compact = false }) {
  if (!items?.length) {
    return null;
  }

  return (
    <View style={compact ? styles.listCompact : styles.list}>
      {items.map((item) => (
        <View key={item} style={styles.listItem}>
          <View style={[styles.listDot, styles[`listDot${tone[0].toUpperCase()}${tone.slice(1)}`]]} />
          <Text style={styles.listText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function AgendaList({ items }) {
  if (!items?.length) {
    return null;
  }

  return (
    <View style={styles.timeline}>
      {items.map((item, index) => (
        <View key={`${item.time}-${item.label}`} style={styles.timelineRow}>
          <View style={styles.timelineRail}>
            <View style={styles.timelineNode} />
            {index < items.length - 1 ? <View style={styles.timelineLine} /> : null}
          </View>
          <View style={styles.timelineContent}>
            <Text style={styles.timelineTime}>{item.time}</Text>
            <Text style={styles.timelineLabel}>{item.label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function EmptyState({ title, body, action }) {
  return (
    <Surface style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </Surface>
  );
}

export function QuickActionCard({
  title,
  body,
  meta,
  href,
  actionLabel,
  tone = 'accent',
  external = false,
}) {
  const borderColor = getToneColor(tone);

  return (
    <CardLink accessibilityLabel={title} accent={borderColor} external={external} href={href} style={styles.quickActionWrap}>
      <View style={styles.quickActionTopRow}>
        <Badge tone={tone}>{meta}</Badge>
        <Text style={styles.quickActionArrow}>Go</Text>
      </View>
      <Text style={styles.quickActionTitle}>{title}</Text>
      <Text style={styles.quickActionBody}>{body}</Text>
      {actionLabel ? <Text style={styles.quickActionCta}>{actionLabel}</Text> : null}
    </CardLink>
  );
}

export function StepStrip({ steps }) {
  if (!steps?.length) {
    return null;
  }

  return (
    <View style={styles.stepStrip}>
      {steps.map((step, index) => (
        <View key={step.title} style={styles.stepItem}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>{index + 1}</Text>
          </View>
          <View style={styles.stepCopy}>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepBody}>{step.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function GameCard({ game, href }) {
  const card = (
    <>
      <View style={styles.cardTopRow}>
        <Badge tone={game.status === 'active' ? 'green' : 'blue'}>{game.badge}</Badge>
        <Text style={styles.cardStatus}>{game.status.toUpperCase()}</Text>
      </View>
      <Text style={styles.cardTitle}>{game.name}</Text>
      <Text style={styles.cardSubtitle}>{game.summary}</Text>
      <Text style={styles.cardHeroCopy}>{game.heroCopy}</Text>
      <View style={styles.factRow}>
        {game.quickFacts.map((fact) => (
          <StatPill key={fact.label} label={fact.label} value={fact.value} tone={game.status === 'active' ? 'green' : 'neutral'} />
        ))}
      </View>
      <BulletList items={game.highlights} />
    </>
  );

  if (!href) {
    return <Surface style={[styles.cardSurface, { borderColor: game.accent }]}>{card}</Surface>;
  }

  return (
    <CardLink accessibilityLabel={`${game.name} page`} accent={game.accent} href={href}>
      {card}
    </CardLink>
  );
}

export function TournamentCard({ tournament, gameName, href }) {
  const [month = '', day = ''] = formatShortDate(tournament.date, tournament.timeZone).split(' ');
  const card = (
    <>
      <View style={styles.cardTopRow}>
        <Badge tone={tournament.status === 'upcoming' ? 'accent' : 'neutral'}>{tournament.badge}</Badge>
        <Text style={styles.cardStatus}>{tournament.status.toUpperCase()}</Text>
      </View>
      <View style={styles.tournamentHeaderRow}>
        <View style={styles.dateBadge}>
          <Text style={styles.dateMonth}>{month}</Text>
          <Text style={styles.dateDay}>{day}</Text>
        </View>
        <View style={styles.tournamentHeaderCopy}>
          <Text style={styles.cardTitle}>{tournament.title}</Text>
          <Text style={styles.cardSubtitle}>{gameName}</Text>
        </View>
      </View>
      <Text style={styles.cardHeroCopy}>{tournament.summary}</Text>
      <View style={styles.factRow}>
        <StatPill label="Format" value={tournament.format} tone="neutral" />
        <StatPill label="Location" value={tournament.location} tone="neutral" />
      </View>
      {tournament.callout ? <Text style={styles.callout}>{tournament.callout}</Text> : null}
    </>
  );

  if (!href) {
    return <Surface style={styles.cardSurface}>{card}</Surface>;
  }

  return (
    <CardLink accessibilityLabel={`${tournament.title} details`} href={href}>
      {card}
    </CardLink>
  );
}

export function ResultCard({ result, href }) {
  const dateLabel = formatResultDate(result.date);
  const placements = result.placements || [];
  const card = (
    <>
      <View style={styles.cardTopRow}>
        <Badge tone="neutral">{result.badge}</Badge>
        <Text style={styles.cardStatus}>{result.status.toUpperCase()}</Text>
      </View>
      <Text style={styles.cardTitle}>{result.title}</Text>
      <View style={styles.resultScoreRow}>
        <View style={styles.resultSummaryBlock}>
          <Text style={styles.resultWinner}>{result.winner}</Text>
          <Text style={styles.cardSubtitle}>{result.summary}</Text>
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreValue}>{result.score}</Text>
        </View>
      </View>
      <Text style={styles.resultDate}>{dateLabel}</Text>
      <View style={styles.placementList}>
        {placements.map((placement) => (
          <View key={`${result.slug}-${placement.place}`} style={styles.placementRow}>
            <Text style={styles.placementLabel}>{formatPlacement(placement.place)}</Text>
            <Text style={styles.placementName}>{placement.name}</Text>
          </View>
        ))}
      </View>
      {result.notes?.length ? <BulletList items={result.notes} compact /> : null}
    </>
  );

  if (!href) {
    return <Surface style={[styles.cardSurface, styles.resultSurface]}>{card}</Surface>;
  }

  return (
    <CardLink accessibilityLabel={`${result.title} results`} href={href}>
      {card}
    </CardLink>
  );
}

export function StreamCard({ stream }) {
  return (
    <Surface style={styles.streamCard}>
      <View style={styles.cardTopRow}>
        <Badge tone={stream.kind === 'live' ? 'rose' : 'blue'}>{stream.label}</Badge>
        <Text style={styles.cardStatus}>{stream.kind.toUpperCase()}</Text>
      </View>
      <Text style={styles.cardTitle}>{stream.title}</Text>
      <Text style={styles.cardHeroCopy}>{stream.description}</Text>
      <View style={styles.streamActionRow}>
        <ActionButton external href={stream.href}>
          Open link
        </ActionButton>
      </View>
    </Surface>
  );
}

function signupCountLabel(count = 0, loading = false) {
  if (loading) return 'Loading';
  return `${count} signed up`;
}

export function CheckInPanel({
  checkIn,
  checkInPath,
  registrationMeta = null,
  signupCount = 0,
  signupEnabled = true,
  signupError = '',
  signupLoading = false,
}) {
  if (!checkIn) {
    return (
      <EmptyState
        body="Add a check-in block to the tournament record and the signup flow will appear here."
        title="Check-in is not configured yet"
      />
    );
  }

  return (
    <Surface style={styles.checkInCard}>
      <View style={styles.checkInTopRow}>
        <Badge tone="green">{signupCountLabel(signupCount, signupLoading)}</Badge>
        <Text style={styles.checkInWindow}>{checkIn.window}</Text>
      </View>
      <Text style={styles.checkInTitle}>{checkIn.title || 'Signup and check-in'}</Text>
      {checkIn.note ? <Text style={styles.checkInCopy}>{checkIn.note}</Text> : null}
      {!signupEnabled && registrationMeta?.actionCopy ? (
        <Text style={styles.checkInWarning}>{registrationMeta.actionCopy}</Text>
      ) : null}
      {signupError ? <Text style={styles.checkInWarning}>{signupError}</Text> : null}
      <BulletList items={checkIn.steps} tone="blue" />
      <View style={styles.checkInActions}>
        {checkInPath ? (
          <ActionButton disabled={!signupEnabled} href={checkInPath}>
            {signupEnabled ? 'Sign up now' : registrationMeta?.label || 'Registration closed'}
          </ActionButton>
        ) : null}
        <ActionButton href="/rules" variant="secondary">
          Review rules
        </ActionButton>
      </View>
    </Surface>
  );
}

export function BracketBoard({ bracket }) {
  if (!bracket?.rounds?.length) {
    return (
      <EmptyState
        body="Add a bracket object to the tournament record and the preview will appear here."
        title="Bracket preview is not configured yet"
      />
    );
  }

  return (
    <Surface style={styles.bracketCard}>
      <View style={styles.bracketHeader}>
        <Badge tone="accent">{bracket.title || 'Bracket preview'}</Badge>
        <Text style={styles.bracketStatus}>{bracket.rounds.length} rounds</Text>
      </View>
      {bracket.note ? <Text style={styles.bracketNote}>{bracket.note}</Text> : null}
      <View style={styles.bracketRounds}>
        {bracket.rounds.map((round) => (
          <View key={round.title} style={styles.bracketRound}>
            <Text style={styles.bracketRoundTitle}>{round.title}</Text>
            <View style={styles.bracketMatchList}>
              {round.matches.map((match) => (
                <View key={`${round.title}-${match.label}`} style={styles.bracketMatch}>
                  <View style={styles.bracketMatchTopRow}>
                    <Text style={styles.bracketMatchLabel}>{match.label}</Text>
                    {match.winner ? <Text style={styles.bracketWinnerLabel}>{match.winner}</Text> : null}
                  </View>
                  <Text style={styles.bracketMatchTeams}>{match.teams?.join(' vs ')}</Text>
                  {match.note ? <Text style={styles.bracketMatchNote}>{match.note}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </Surface>
  );
}

export function RuleBlock({ section }) {
  return (
    <Surface style={styles.ruleCard}>
      <Text style={styles.ruleTitle}>{section.title}</Text>
      <BulletList items={section.items} tone="blue" />
    </Surface>
  );
}

export function HubScreen({
  eyebrow,
  title,
  subtitle,
  lead,
  actions = [],
  stats = [],
  children,
  footerNote,
  forceTopNav = false,
  showHero = true,
}) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const [playerAccount, setPlayerAccount] = useState(null);
  const [playerAccountLoading, setPlayerAccountLoading] = useState(true);
  const showMobileNav = !forceTopNav && Platform.OS === 'web' && width > 0 && width < 720;
  const showTopNav = forceTopNav || !showMobileNav;
  const showLaptopLayout = Platform.OS === 'web' && width >= 1360;
  const showStickyActions = pathname !== '/admin';
  const showStickyActionCopy = width >= 430;

  useEffect(() => {
    let active = true;

    async function loadPlayerAccount() {
      try {
        const result = await fetchPlayerAccount();

        if (active) {
          setPlayerAccount(result.account || null);
        }
      } catch {
        if (active) {
          setPlayerAccount(null);
        }
      } finally {
        if (active) {
          setPlayerAccountLoading(false);
        }
      }
    }

    function refreshPlayerAccount() {
      if (active) {
        setPlayerAccountLoading(true);
      }

      loadPlayerAccount();
    }

    loadPlayerAccount();

    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener(PLAYER_ACCOUNT_CHANGED_EVENT, refreshPlayerAccount);
    }

    return () => {
      active = false;

      if (typeof globalThis.removeEventListener === 'function') {
        globalThis.removeEventListener(PLAYER_ACCOUNT_CHANGED_EVENT, refreshPlayerAccount);
      }
    };
  }, []);

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.backdrop}>
        <View style={styles.backdropBandTop} />
        <View style={styles.backdropBandBottom} />
      </View>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            showStickyActions && styles.scrollContentWithStickyActions,
            showMobileNav && styles.scrollContentWithMobileNav,
            showStickyActions && showMobileNav && styles.scrollContentWithStickyActionsAndMobileNav,
          ]}
          showsVerticalScrollIndicator={false}>
          <View style={[styles.page, showLaptopLayout && styles.pageLaptop]}>
            <View style={[styles.brandRow, showLaptopLayout && styles.brandRowLaptop]}>
              <Link href="/" asChild>
                <Pressable accessibilityRole="link" style={styles.brandLink}>
                  <View style={styles.brandMark}>
                    <Text style={styles.brandMarkText}>1v1</Text>
                  </View>
                  <View style={styles.brandCopy}>
                    <Text style={styles.brandTitle}>1v1 Tournaments</Text>
                    <Text style={styles.brandDomain}>Free-entry Spades events</Text>
                  </View>
                </Pressable>
              </Link>
              <View style={styles.brandUtility}>
                {playerAccount?.hostApproved ? (
                  <ActionButton href="/admin" variant="secondary" style={styles.brandButton}>
                    Admin
                  </ActionButton>
                ) : null}
                <HeaderAccountChip account={playerAccount} loading={playerAccountLoading} />
              </View>
            </View>

            {showTopNav ? (
              <View style={[styles.navRow, showLaptopLayout && styles.navRowLaptop]}>
                {NAV_ITEMS.map((item) => {
                  const active = isNavItemActive(pathname, item);
                  return (
                    <LinkShell key={`${item.label}-${item.href}`} href={item.href} style={styles.navWrap} variant={active ? 'primary' : 'secondary'}>
                      <View style={[styles.navChip, active && styles.navChipActive]}>
                        <Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text>
                      </View>
                    </LinkShell>
                  );
                })}
              </View>
            ) : null}

            {showHero ? (
              <Surface style={[styles.heroSurface, showLaptopLayout && styles.heroSurfaceLaptop]}>
                <View style={styles.heroTopRow}>
                  {eyebrow ? <Badge tone="accent">{eyebrow}</Badge> : null}
                  <Text style={styles.heroDomain}>Tournament hub</Text>
                </View>
                <Text accessibilityRole="header" style={[styles.heroTitle, showLaptopLayout && styles.heroTitleLaptop]}>{title}</Text>
                {subtitle ? <Text style={[styles.heroSubtitle, showLaptopLayout && styles.heroSubtitleLaptop]}>{subtitle}</Text> : null}
                {lead ? <Text style={[styles.heroLead, showLaptopLayout && styles.heroLeadLaptop]}>{lead}</Text> : null}

                {actions.length ? (
                  <View style={[styles.actionRow, showLaptopLayout && styles.actionRowLaptop]}>
                    {actions.map((action) => (
                      <ActionButton
                        key={`${action.label}-${action.href || action.variant}`}
                        external={action.external}
                        href={action.href}
                        onPress={action.onPress}
                        variant={action.variant || 'primary'}>
                        {action.label}
                      </ActionButton>
                    ))}
                  </View>
                ) : null}

                {stats.length ? (
                  <View style={[styles.statsRow, showLaptopLayout && styles.statsRowLaptop]}>
                    {stats.map((stat) => (
                      <StatPill key={stat.label} label={stat.label} value={stat.value} tone={stat.tone || 'neutral'} />
                    ))}
                  </View>
                ) : null}
              </Surface>
            ) : null}

            {children}

            {footerNote ? (
              <Surface style={styles.footerSurface}>
                <Text style={styles.footerLabel}>Site note</Text>
                <Text style={styles.footerText}>{footerNote}</Text>
              </Surface>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
      {showMobileNav ? (
        <View style={styles.mobileBottomNav}>
          {MOBILE_NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item);

            return (
              <LinkShell
                key={`mobile-${item.label}-${item.href}`}
                href={item.href}
                style={styles.mobileBottomNavItem}
                variant={active ? 'primary' : 'secondary'}>
                <View style={[styles.mobileBottomNavChip, active && styles.mobileBottomNavChipActive]}>
                  <Text style={[styles.mobileBottomNavText, active && styles.mobileBottomNavTextActive]}>
                    {item.label}
                  </Text>
                </View>
              </LinkShell>
            );
          })}
        </View>
      ) : null}
      {showStickyActions ? (
        <View style={[styles.stickyActionBar, showMobileNav && styles.stickyActionBarWithMobileNav]}>
          {showStickyActionCopy ? (
            <View style={styles.stickyActionCopy}>
              <Text style={styles.stickyActionLabel}>Next event</Text>
              <Text numberOfLines={1} style={styles.stickyActionTitle}>Join or find your match</Text>
            </View>
          ) : null}
          <View style={styles.stickyActionButtons}>
            {STICKY_ACTION_ITEMS.map((item) => {
              const active = isNavItemActive(pathname, item);

              return (
                <LinkShell
                  key={`sticky-${item.label}-${item.href}`}
                  href={item.href}
                  style={styles.stickyActionButton}
                  variant={item.tone === 'primary' ? 'primary' : 'secondary'}>
                  <View style={[styles.stickyActionChip, active && styles.stickyActionChipActive, item.tone === 'primary' && styles.stickyActionChipPrimary]}>
                    <Text style={[styles.stickyActionText, item.tone === 'primary' && styles.stickyActionTextPrimary, active && styles.stickyActionTextActive]}>
                      {item.label}
                    </Text>
                  </View>
                </LinkShell>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const sharedCardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.28,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 12 },
  elevation: 8,
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  safeArea: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  backdropBandTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: theme.colors.backgroundAlt,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  backdropBandBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 260,
    backgroundColor: 'rgba(108, 199, 255, 0.04)',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  scrollContentWithStickyActions: {
    paddingBottom: 108,
  },
  scrollContentWithMobileNav: {
    paddingBottom: 104,
  },
  scrollContentWithStickyActionsAndMobileNav: {
    paddingBottom: 178,
  },
  page: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  pageLaptop: {
    maxWidth: 1280,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 10,
    padding: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(9, 19, 17, 0.82)',
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  brandRowLaptop: {
    marginBottom: 10,
  },
  brandLink: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  brandMark: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceLift,
    borderWidth: 1,
    borderColor: theme.colors.lineStrong,
    ...sharedCardShadow,
  },
  brandMarkText: {
    color: theme.colors.accent,
    fontSize: 18,
    fontFamily: DISPLAY_FONT,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  brandCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  brandTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  brandDomain: {
    color: theme.colors.muted,
    fontSize: 12,
    marginTop: 2,
    fontFamily: MONO_FONT,
    letterSpacing: 0.4,
  },
  brandUtility: {
    alignItems: 'center',
    flexShrink: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  brandButton: {
    marginRight: 0,
    marginLeft: 8,
    marginBottom: 8,
  },
  accountChipShell: {
    marginBottom: 8,
    marginLeft: 8,
    maxWidth: 178,
  },
  accountChip: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    minHeight: 50,
    minWidth: 116,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  accountChipSignedIn: {
    backgroundColor: 'rgba(97, 210, 145, 0.12)',
    borderColor: 'rgba(97, 210, 145, 0.62)',
  },
  accountChipSignedOut: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  accountChipLabel: {
    color: theme.colors.green,
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 13,
    textTransform: 'uppercase',
  },
  accountChipLabelSignedOut: {
    color: '#101010',
  },
  accountChipValue: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 17,
    marginTop: 1,
  },
  accountChipValueSignedOut: {
    color: '#101010',
    fontSize: 15,
    textTransform: 'uppercase',
  },
  navRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 18,
    padding: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(17, 29, 26, 0.72)',
    borderWidth: 1,
    borderColor: theme.colors.line,
    alignSelf: 'flex-start',
  },
  navRowLaptop: {
    marginBottom: 14,
  },
  navWrap: {
    marginRight: 4,
    marginBottom: 0,
  },
  navChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  navChipActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accent,
  },
  navText: {
    color: theme.colors.muted,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  navTextActive: {
    color: theme.colors.text,
  },
  mobileBottomNav: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(9, 19, 17, 0.96)',
    borderWidth: 1,
    borderColor: theme.colors.lineStrong,
    ...sharedCardShadow,
  },
  mobileBottomNavItem: {
    flex: 1,
    marginHorizontal: 3,
  },
  mobileBottomNavChip: {
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  mobileBottomNavChipActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accent,
  },
  mobileBottomNavText: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  mobileBottomNavTextActive: {
    color: theme.colors.text,
  },
  stickyActionBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
    zIndex: 30,
    alignItems: 'center',
    backgroundColor: 'rgba(9, 19, 17, 0.97)',
    borderColor: 'rgba(214, 162, 78, 0.30)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    padding: 8,
    ...sharedCardShadow,
  },
  stickyActionBarWithMobileNav: {
    bottom: 84,
  },
  stickyActionCopy: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 8,
  },
  stickyActionLabel: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  stickyActionTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 17,
    marginTop: 1,
  },
  stickyActionButtons: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
  },
  stickyActionButton: {
    marginBottom: 0,
    marginRight: 0,
  },
  stickyActionChip: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLift,
    borderColor: theme.colors.lineStrong,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 42,
    minWidth: 66,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  stickyActionChipPrimary: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  stickyActionChipActive: {
    borderColor: theme.colors.accent,
  },
  stickyActionText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  stickyActionTextPrimary: {
    color: '#101010',
  },
  stickyActionTextActive: {
    color: theme.colors.text,
  },
  heroSurface: {
    padding: 22,
    borderRadius: 22,
    marginBottom: 22,
    borderColor: theme.colors.accentSoft,
    overflow: 'hidden',
  },
  heroSurfaceLaptop: {
    paddingHorizontal: 28,
    paddingVertical: 20,
    marginBottom: 20,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  heroDomain: {
    color: theme.colors.muted,
    fontFamily: MONO_FONT,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 32,
    lineHeight: 36,
    fontFamily: DISPLAY_FONT,
    fontWeight: '800',
    letterSpacing: 0,
    maxWidth: 720,
  },
  heroTitleLaptop: {
    maxWidth: 980,
  },
  heroSubtitle: {
    color: theme.colors.accent,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 12,
    textTransform: 'uppercase',
  },
  heroSubtitleLaptop: {
    marginTop: 10,
  },
  heroLead: {
    color: theme.colors.text,
    fontSize: 18,
    lineHeight: 27,
    marginTop: 10,
    maxWidth: 760,
  },
  heroLeadLaptop: {
    maxWidth: 1040,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 20,
  },
  actionRowLaptop: {
    marginTop: 18,
  },
  actionButtonWrap: {
    marginRight: 10,
    marginBottom: 10,
  },
  button: {
    borderRadius: theme.radius.pill,
  },
  buttonPressed: {
    opacity: 0.86,
    transform: [{ translateY: 1 }],
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  actionButtonInner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  actionButtonInnerSecondary: {
    backgroundColor: theme.colors.surfaceLift,
    borderColor: theme.colors.lineStrong,
  },
  actionButtonInnerGhost: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.lineStrong,
  },
  actionButtonInnerDanger: {
    backgroundColor: 'rgba(224, 106, 92, 0.16)',
    borderColor: 'rgba(224, 106, 92, 0.72)',
  },
  actionButtonInnerDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: theme.colors.line,
  },
  actionButtonText: {
    color: '#101010',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  actionButtonTextSecondary: {
    color: theme.colors.text,
  },
  actionButtonTextDanger: {
    color: '#FFE5E0',
  },
  actionButtonTextDisabled: {
    color: theme.colors.muted,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 18,
  },
  statsRowLaptop: {
    marginTop: 16,
  },
  statPill: {
    minWidth: 112,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceLift,
    borderWidth: 1,
    borderColor: theme.colors.lineStrong,
    marginRight: 10,
    marginBottom: 10,
  },
  statNeutral: {
    backgroundColor: theme.colors.surface,
  },
  statAccent: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accent,
  },
  statBlue: {
    backgroundColor: theme.colors.blueSoft,
    borderColor: theme.colors.blue,
  },
  statGreen: {
    backgroundColor: theme.colors.greenSoft,
    borderColor: theme.colors.green,
  },
  statRose: {
    backgroundColor: theme.colors.roseSoft,
    borderColor: theme.colors.rose,
  },
  statLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
    fontFamily: MONO_FONT,
  },
  statValue: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  section: {
    marginBottom: 22,
  },
  sectionHead: {
    marginBottom: 12,
  },
  sectionTitleGroup: {
    maxWidth: 760,
  },
  sectionEyebrow: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
    fontFamily: MONO_FONT,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 26,
    lineHeight: 30,
    fontFamily: DISPLAY_FONT,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sectionDescription: {
    color: theme.colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
  sectionAction: {
    marginTop: 10,
  },
  surface: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 18,
    ...sharedCardShadow,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    overflow: 'hidden',
    ...sharedCardShadow,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  cardStatus: {
    color: theme.colors.muted,
    flexShrink: 1,
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: '800',
    fontFamily: MONO_FONT,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 22,
    lineHeight: 26,
    fontFamily: DISPLAY_FONT,
    fontWeight: '800',
    letterSpacing: 0,
  },
  cardSubtitle: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  cardHeroCopy: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  factRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
  },
  callout: {
    color: theme.colors.accent,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
    fontWeight: '700',
  },
  list: {
    marginTop: 14,
  },
  listCompact: {
    marginTop: 12,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  listDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginTop: 7,
    marginRight: 10,
    backgroundColor: theme.colors.accent,
  },
  listDotAccent: {
    backgroundColor: theme.colors.accent,
  },
  listDotBlue: {
    backgroundColor: theme.colors.blue,
  },
  listDotGreen: {
    backgroundColor: theme.colors.green,
  },
  listDotRose: {
    backgroundColor: theme.colors.rose,
  },
  listText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 21,
    flex: 1,
  },
  timeline: {
    marginTop: 12,
  },
  timelineRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  timelineRail: {
    width: 20,
    alignItems: 'center',
    marginRight: 10,
  },
  timelineNode: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
    borderWidth: 3,
    borderColor: theme.colors.surfaceLift,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: theme.colors.lineStrong,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 2,
  },
  timelineTime: {
    color: theme.colors.accent,
    fontSize: 12,
    fontFamily: MONO_FONT,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  timelineLabel: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  emptyState: {
    marginTop: 4,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    fontFamily: DISPLAY_FONT,
  },
  emptyBody: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  emptyAction: {
    marginTop: 14,
  },
  quickActionWrap: {
    flexBasis: 240,
    flexGrow: 1,
    marginRight: 12,
    marginBottom: 12,
  },
  quickActionAccent: {
    borderColor: theme.colors.accent,
  },
  quickActionBlue: {
    borderColor: theme.colors.blue,
  },
  quickActionGreen: {
    borderColor: theme.colors.green,
  },
  quickActionRose: {
    borderColor: theme.colors.rose,
  },
  quickActionNeutral: {
    borderColor: theme.colors.lineStrong,
  },
  quickActionTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 10,
  },
  quickActionArrow: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    fontFamily: MONO_FONT,
  },
  quickActionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: DISPLAY_FONT,
    fontWeight: '800',
  },
  quickActionBody: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  quickActionCta: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginTop: 14,
    textTransform: 'uppercase',
  },
  stepStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  stepItem: {
    alignItems: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: 260,
    flexDirection: 'row',
    flexGrow: 1,
    marginBottom: 12,
    marginRight: 12,
    padding: 14,
  },
  stepNumber: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accent,
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    marginRight: 12,
    width: 34,
  },
  stepNumberText: {
    color: theme.colors.text,
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: '800',
  },
  stepCopy: {
    flex: 1,
    minWidth: 0,
  },
  stepTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  stepBody: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  tournamentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateBadge: {
    width: 72,
    height: 84,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceBright,
    borderWidth: 1,
    borderColor: theme.colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  dateMonth: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  dateDay: {
    color: theme.colors.text,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: DISPLAY_FONT,
    fontWeight: '800',
  },
  tournamentHeaderCopy: {
    flex: 1,
  },
  resultScoreRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 12,
  },
  resultSummaryBlock: {
    flex: 1,
    minWidth: 210,
  },
  resultWinner: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    fontFamily: DISPLAY_FONT,
  },
  scoreBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    minWidth: 92,
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  scoreValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.4,
    fontFamily: MONO_FONT,
    lineHeight: 20,
    textAlign: 'center',
  },
  resultDate: {
    color: theme.colors.muted,
    fontSize: 12,
    marginTop: 10,
    fontFamily: MONO_FONT,
    letterSpacing: 0.5,
  },
  placementList: {
    marginTop: 12,
  },
  placementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
  },
  placementLabel: {
    color: theme.colors.accent,
    fontWeight: '800',
    fontFamily: MONO_FONT,
    letterSpacing: 0.5,
  },
  placementName: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 14,
    marginLeft: 12,
    textAlign: 'right',
  },
  resultSurface: {
    overflow: 'hidden',
  },
  streamCard: {
    marginBottom: 14,
  },
  streamActionRow: {
    marginTop: 16,
  },
  checkInActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  checkInCard: {
    borderColor: 'rgba(108, 199, 255, 0.24)',
  },
  checkInCopy: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  checkInWarning: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 8,
  },
  checkInTitle: {
    color: theme.colors.text,
    fontSize: 22,
    lineHeight: 26,
    fontFamily: DISPLAY_FONT,
    fontWeight: '800',
    letterSpacing: 0,
  },
  checkInTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  checkInWindow: {
    color: theme.colors.blue,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'right',
    flexShrink: 1,
  },
  bracketCard: {
    borderColor: 'rgba(214, 162, 78, 0.24)',
  },
  bracketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  bracketStatus: {
    color: theme.colors.muted,
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: '800',
    fontFamily: MONO_FONT,
  },
  bracketNote: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  bracketRounds: {
    gap: 14,
  },
  bracketRound: {
    gap: 10,
  },
  bracketRoundTitle: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
    fontFamily: DISPLAY_FONT,
  },
  bracketMatchList: {
    gap: 10,
  },
  bracketMatch: {
    borderWidth: 1,
    borderColor: theme.colors.lineStrong,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceBright,
    padding: 14,
  },
  bracketMatchTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  bracketMatchLabel: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: MONO_FONT,
  },
  bracketWinnerLabel: {
    color: theme.colors.green,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    flexShrink: 1,
    fontFamily: MONO_FONT,
  },
  bracketMatchTeams: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    fontWeight: '700',
  },
  bracketMatchNote: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  ruleCard: {
    marginBottom: 14,
  },
  ruleTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontFamily: DISPLAY_FONT,
    fontWeight: '800',
    marginBottom: 8,
  },
  footerSurface: {
    marginTop: 6,
    marginBottom: 10,
  },
  footerLabel: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    fontFamily: MONO_FONT,
    marginBottom: 6,
  },
  footerText: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
  },
  badgeText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: MONO_FONT,
  },
  badgeTextNeutral: {
    color: theme.colors.muted,
  },
  badgeNeutral: {
    backgroundColor: theme.colors.surfaceLift,
    borderColor: theme.colors.lineStrong,
  },
  badgeAccent: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accent,
  },
  badgeBlue: {
    backgroundColor: theme.colors.blueSoft,
    borderColor: theme.colors.blue,
  },
  badgeGreen: {
    backgroundColor: theme.colors.greenSoft,
    borderColor: theme.colors.green,
  },
  badgeRose: {
    backgroundColor: theme.colors.roseSoft,
    borderColor: theme.colors.rose,
  },
  cardSurface: {
    marginBottom: 14,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surface,
    ...sharedCardShadow,
  },
});

import { StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  Badge,
  EmptyState,
  HubScreen,
  Section,
  StreamCard,
  Surface,
} from '../components/hub-ui.jsx';
import { downloadLinks } from '../lib/downloadLinks.js';
import { formatDateLine } from '../lib/format.js';
import { getGamePath, getStreams, getTournamentPath, getUpcomingTournaments, siteData } from '../lib/siteData.js';

function isConfiguredUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

export default function LiveScreen() {
  const streams = getStreams();
  const hasTwitch = isConfiguredUrl(downloadLinks.twitch);
  const hasDiscord = isConfiguredUrl(downloadLinks.discord);
  const upcoming = getUpcomingTournaments();
  const nextTournament = upcoming[0] || null;
  const nextTournamentPath = nextTournament ? getTournamentPath(nextTournament.slug) : '/next';

  return (
    <HubScreen
      actions={[
        hasTwitch ? { label: 'Twitch', href: downloadLinks.twitch, external: true } : null,
        hasDiscord ? { label: 'Discord', href: downloadLinks.discord, external: true, variant: 'secondary' } : null,
        { label: 'Spades', href: getGamePath(siteData.site.primaryGameSlug) },
        { label: 'Rules', href: '/rules', variant: 'secondary' },
        { label: 'Results', href: '/results', variant: 'ghost' },
      ].filter(Boolean)}
      eyebrow="Watch"
      footerNote={siteData.site.adminNote}
      lead="The public command center for stream day: Twitch first, next tournament second, community and overlays one tap away."
      stats={[
        { label: 'Broadcast', value: hasTwitch ? 'Twitch' : 'Pending', tone: hasTwitch ? 'rose' : 'neutral' },
        { label: 'Links', value: String(streams.length + (hasTwitch ? 1 : 0) + (hasDiscord ? 1 : 0)), tone: 'accent' },
        { label: 'Community', value: hasDiscord ? 'Discord' : 'Set URL', tone: hasDiscord ? 'blue' : 'neutral' },
        { label: 'YouTube', value: 'Archive', tone: 'blue' },
      ]}
      subtitle="Twitch broadcast, tournament links, and community channels"
      title="Live coverage">
      <LiveBroadcastPanel
        hasDiscord={hasDiscord}
        hasTwitch={hasTwitch}
        nextTournament={nextTournament}
        nextTournamentPath={nextTournamentPath}
      />

      <Section description="The links viewers and stream setup need most during the show." title="Stream command center">
        <View style={styles.commandGrid}>
          <CommandCard
            actionLabel={hasTwitch ? 'Open Twitch' : 'Set Twitch URL'}
            body="Main broadcast destination for live tournament coverage."
            href={hasTwitch ? downloadLinks.twitch : '/stream'}
            meta={hasTwitch ? 'Primary' : 'Needs config'}
            title="Twitch broadcast"
            tone="rose"
            external={hasTwitch}
          />
          <CommandCard
            actionLabel="Open tournament"
            body="Public bracket, signup count, roster groups, and player match status."
            href={nextTournamentPath}
            meta="Guest hub"
            title="Tournament page"
            tone="accent"
          />
          <CommandCard
            actionLabel={hasDiscord ? 'Join Discord' : 'Set Discord URL'}
            body="Use Discord for live alerts, table coordination, and community chatter."
            href={hasDiscord ? downloadLinks.discord : '/contact'}
            meta={hasDiscord ? 'Community' : 'Placeholder'}
            title="Discord"
            tone="blue"
            external={hasDiscord}
          />
        </View>
      </Section>

      <Section description="Browser-source URLs for Twitch scenes." title="Overlay sources">
        <View style={styles.overlayGrid}>
          <OverlayLinkCard body="Full tournament panel with signup count, countdown, roster chips, QR code, and next match." href="/overlay" title="Full overlay" />
          <OverlayLinkCard body="Lower-third layout for gameplay scenes when the table needs most of the screen." href="/overlay/compact" title="Compact overlay" />
          <OverlayLinkCard body="Current or next match focus for bracket transitions and between-game scenes." href="/overlay/bracket" title="Bracket overlay" />
        </View>
      </Section>

      <Section description="Open the spectator table during a match. Use YouTube for the channel and replay links." title="Current links">
        {streams.map((stream) => (
          <View key={stream.slug} style={styles.block}>
            <StreamCard stream={stream} />
          </View>
        ))}
        {!streams.length ? (
          <EmptyState
            action={<ActionButton href="https://www.youtube.com/" external>Open YouTube</ActionButton>}
            body="Live links will appear here when coverage is assigned."
            title="No live links are assigned yet"
          />
        ) : null}
      </Section>

      <Section description="The official watch path for tournament day." title="Coverage note">
        <Surface style={styles.noteCard}>
          <Text style={styles.noteCopy}>
            Keep this page open during events when viewers need the spectator table or replay links.
          </Text>
          <ActionButton href="/rules" variant="secondary">
            Keep the rules and live links aligned
          </ActionButton>
        </Surface>
      </Section>
    </HubScreen>
  );
}

function LiveBroadcastPanel({ hasDiscord, hasTwitch, nextTournament, nextTournamentPath }) {
  return (
    <Section
      description="Twitch stays first, with the next event and bracket one click behind it."
      title="Broadcast hub">
      <Surface style={styles.livePanel}>
        <View style={styles.livePanelTopRow}>
          <View style={styles.liveStatusGroup}>
            <View style={styles.liveDot} />
            <Badge tone="rose">Live</Badge>
            <Text style={styles.liveStatusText}>Tournament coverage</Text>
          </View>
          <Text style={styles.liveMeta}>Twitch + tournament hub</Text>
        </View>
        <Text style={styles.liveTitle}>{hasTwitch ? 'Watch live on Twitch' : 'Twitch broadcast link pending'}</Text>
        <Text style={styles.liveCopy}>
          {nextTournament
            ? `${nextTournament.title} is the next event. Keep this page open for Twitch, the tournament page, overlays, and community links.`
            : 'Keep this page open for Twitch, the tournament page, overlays, and community links.'}
        </Text>
        {nextTournament ? (
          <View style={styles.nextEventCard}>
            <View style={styles.nextEventCopy}>
              <Text style={styles.nextEventLabel}>Next event</Text>
              <Text style={styles.nextEventTitle}>{nextTournament.title}</Text>
              <Text style={styles.nextEventMeta}>
                {formatDateLine(nextTournament.date, nextTournament.timeZone, nextTournament.timeZoneLabel)}
              </Text>
            </View>
            <ActionButton href={nextTournamentPath} variant="secondary">
              Open event
            </ActionButton>
          </View>
        ) : null}
        <View style={styles.liveActionRow}>
          {hasTwitch ? (
            <ActionButton external href={downloadLinks.twitch}>
              Open Twitch
            </ActionButton>
          ) : null}
          <ActionButton href="/stream" variant="secondary">
            Stream board
          </ActionButton>
          <ActionButton href={nextTournamentPath} variant="secondary">
            Tournament page
          </ActionButton>
          {hasDiscord ? (
            <ActionButton external href={downloadLinks.discord} variant="secondary">
              Join Discord
            </ActionButton>
          ) : null}
        </View>
        {!hasDiscord ? (
          <Text style={styles.liveConfigNote}>
            Discord button appears automatically after DISCORD_URL is set in downloadLinks.js.
          </Text>
        ) : null}
      </Surface>
    </Section>
  );
}

function CommandCard({ actionLabel, body, external = false, href, meta, title, tone }) {
  return (
    <Surface style={[styles.commandCard, tone === 'rose' && styles.commandCardRose, tone === 'blue' && styles.commandCardBlue]}>
      <Text style={styles.commandMeta}>{meta}</Text>
      <Text style={styles.commandTitle}>{title}</Text>
      <Text style={styles.commandBody}>{body}</Text>
      <View style={styles.commandAction}>
        <ActionButton external={external} href={href} variant={tone === 'rose' ? 'primary' : 'secondary'}>
          {actionLabel}
        </ActionButton>
      </View>
    </Surface>
  );
}

function OverlayLinkCard({ body, href, title }) {
  return (
    <Surface style={styles.overlayCard}>
      <Text style={styles.overlayTitle}>{title}</Text>
      <Text style={styles.overlayBody}>{body}</Text>
      <ActionButton href={href} variant="secondary">
        Open source
      </ActionButton>
    </Surface>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 14,
  },
  commandAction: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
  },
  commandBody: {
    color: '#AAB4AE',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 8,
  },
  commandCard: {
    borderColor: 'rgba(214, 162, 78, 0.26)',
    flexBasis: 245,
    flexGrow: 1,
  },
  commandCardBlue: {
    borderColor: 'rgba(108, 199, 255, 0.28)',
  },
  commandCardRose: {
    backgroundColor: 'rgba(23, 11, 12, 0.78)',
    borderColor: 'rgba(224, 106, 92, 0.44)',
  },
  commandGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  commandMeta: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  commandTitle: {
    color: '#F4EFE6',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: 6,
  },
  noteCard: {
    borderColor: 'rgba(108, 199, 255, 0.24)',
  },
  noteCopy: {
    color: '#AAB4AE',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
  liveActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  liveConfigNote: {
    color: '#AAB4AE',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 10,
  },
  liveCopy: {
    color: '#AAB4AE',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 23,
    marginTop: 8,
  },
  liveDot: {
    backgroundColor: '#E06A5C',
    borderColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: 999,
    borderWidth: 2,
    height: 13,
    width: 13,
  },
  liveMeta: {
    color: '#D6A24E',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  livePanel: {
    backgroundColor: 'rgba(23, 11, 12, 0.82)',
    borderColor: 'rgba(224, 106, 92, 0.42)',
    overflow: 'hidden',
  },
  livePanelTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  liveStatusGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  liveStatusText: {
    color: '#F4EFE6',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  liveTitle: {
    color: '#F4EFE6',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 34,
    marginTop: 16,
  },
  nextEventCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.10)',
    borderColor: 'rgba(214, 162, 78, 0.28)',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 16,
    padding: 14,
  },
  nextEventCopy: {
    flex: 1,
    minWidth: 230,
  },
  nextEventLabel: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  nextEventMeta: {
    color: '#AAB4AE',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 3,
  },
  nextEventTitle: {
    color: '#F4EFE6',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
    marginTop: 4,
  },
  overlayBody: {
    color: '#AAB4AE',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginBottom: 14,
    marginTop: 8,
  },
  overlayCard: {
    borderColor: 'rgba(97, 210, 145, 0.24)',
    flexBasis: 245,
    flexGrow: 1,
  },
  overlayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  overlayTitle: {
    color: '#F4EFE6',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
  },
});

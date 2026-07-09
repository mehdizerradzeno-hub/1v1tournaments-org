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
import { getGamePath, getStreams, siteData } from '../lib/siteData.js';

function isConfiguredUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

export default function LiveScreen() {
  const streams = getStreams();
  const hasTwitch = isConfiguredUrl(downloadLinks.twitch);
  const hasDiscord = isConfiguredUrl(downloadLinks.discord);

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
      lead="Use this page when the tournament is live. Twitch is the main broadcast link, Discord is the community room, and the tournament page keeps signup, bracket, and match status clear."
      stats={[
        { label: 'Broadcast', value: hasTwitch ? 'Twitch' : 'Pending', tone: hasTwitch ? 'rose' : 'neutral' },
        { label: 'Links', value: String(streams.length + (hasTwitch ? 1 : 0) + (hasDiscord ? 1 : 0)), tone: 'accent' },
        { label: 'Community', value: hasDiscord ? 'Discord' : 'Set URL', tone: hasDiscord ? 'blue' : 'neutral' },
        { label: 'YouTube', value: 'Archive', tone: 'blue' },
      ]}
      subtitle="Twitch broadcast, tournament links, and community channels"
      title="Live coverage">
      <LiveBroadcastPanel hasDiscord={hasDiscord} hasTwitch={hasTwitch} />

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

function LiveBroadcastPanel({ hasDiscord, hasTwitch }) {
  return (
    <Section
      description="A clear public signal for viewers when tournament coverage is active."
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
        <Text style={styles.liveTitle}>Watch live on Twitch</Text>
        <Text style={styles.liveCopy}>
          Keep this page open for the broadcast link, signup path, public bracket, and community updates.
        </Text>
        <View style={styles.liveActionRow}>
          {hasTwitch ? (
            <ActionButton external href={downloadLinks.twitch}>
              Open Twitch
            </ActionButton>
          ) : null}
          <ActionButton href="/stream" variant="secondary">
            Stream board
          </ActionButton>
          <ActionButton href="/tournaments/spades-summer-series" variant="secondary">
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

const styles = StyleSheet.create({
  block: {
    marginBottom: 14,
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
});

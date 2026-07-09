import { useState } from 'react';
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

function canUseClipboard() {
  return typeof globalThis.navigator !== 'undefined' && Boolean(globalThis.navigator?.clipboard?.writeText);
}

function absoluteSiteUrl(path) {
  const origin = downloadLinks.tournaments || 'https://1v1tournaments.org';

  return `${origin.replace(/\/$/, '')}${path}`;
}

function buildAnnouncementCopy(nextTournament, nextTournamentPath) {
  const eventTitle = nextTournament?.title || '1v1 Spades tournament';
  const eventUrl = absoluteSiteUrl(nextTournamentPath);
  const liveUrl = absoluteSiteUrl('/live');
  const twitchUrl = downloadLinks.twitch || liveUrl;

  return [
    {
      label: 'Twitch title',
      text: `${eventTitle} | 1v1 Spades Tournament | Free-entry bracket`,
    },
    {
      label: 'Discord live post',
      text: `We are live for ${eventTitle}.\n\nWatch: ${twitchUrl}\nTournament lobby: ${eventUrl}\nLive hub: ${liveUrl}`,
    },
    {
      label: 'Short social post',
      text: `${eventTitle} is coming up. Join the bracket, watch live, and follow results here: ${eventUrl}`,
    },
  ];
}

function buildGoLiveChecklist({ hasDiscord, hasTwitch }) {
  return [
    { label: 'Twitch URL', ready: hasTwitch, value: hasTwitch ? 'Connected' : 'Set TWITCH_URL' },
    { label: 'Discord URL', ready: hasDiscord, value: hasDiscord ? 'Connected' : 'Optional placeholder' },
    { label: 'Overlay URLs', ready: true, value: 'Ready' },
    { label: 'Announcement copy', ready: true, value: 'Ready' },
  ];
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

      <Section description="Automated stream-day readiness check for what can be handled from this site." title="Go-live checklist">
        <GoLiveChecklist items={buildGoLiveChecklist({ hasDiscord, hasTwitch })} />
      </Section>

      <Section description="Browser-source URLs for Twitch scenes." title="Overlay sources">
        <View style={styles.overlayGrid}>
          <OverlayLinkCard
            body="Full tournament panel with signup count, countdown, roster chips, QR code, and next match."
            href="/overlay"
            recommendedSize="1280 x 360"
            title="Full overlay"
          />
          <OverlayLinkCard
            body="Lower-third layout for gameplay scenes when the table needs most of the screen."
            href="/overlay/compact"
            recommendedSize="1280 x 170"
            title="Compact overlay"
          />
          <OverlayLinkCard
            body="Current or next match focus for bracket transitions and between-game scenes."
            href="/overlay/bracket"
            recommendedSize="1100 x 260"
            title="Bracket overlay"
          />
        </View>
      </Section>

      <Section description="Clear stream-day notification status for the community layer." title="Discord alerts">
        <DiscordAlertPanel hasDiscord={hasDiscord} />
      </Section>

      <Section description="Copy-ready text for Twitch, Discord, and social posts." title="Announcement kit">
        <AnnouncementKit items={buildAnnouncementCopy(nextTournament, nextTournamentPath)} />
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

function DiscordAlertPanel({ hasDiscord }) {
  return (
    <Surface style={styles.discordPanel}>
      <View style={styles.discordTopRow}>
        <Badge tone={hasDiscord ? 'blue' : 'neutral'}>{hasDiscord ? 'Configured' : 'Coming soon'}</Badge>
        <Text style={styles.discordMeta}>Live alerts</Text>
      </View>
      <Text style={styles.discordTitle}>
        {hasDiscord ? 'Discord is ready for stream-day alerts.' : 'Discord alerts are reserved for the next automation pass.'}
      </Text>
      <Text style={styles.discordCopy}>
        {hasDiscord
          ? 'Use the Discord button for manual live announcements now. Later this can send automatic alerts when the bracket is published or the stream goes live.'
          : 'Set DISCORD_URL in downloadLinks.js when the server invite is ready. The public buttons will appear automatically, and the later bot pass can post live/bracket announcements.'}
      </Text>
      <View style={styles.discordSteps}>
        <View style={styles.discordStep}>
          <Text style={styles.discordStepLabel}>Now</Text>
          <Text style={styles.discordStepValue}>{hasDiscord ? 'Invite linked' : 'Invite placeholder'}</Text>
        </View>
        <View style={styles.discordStep}>
          <Text style={styles.discordStepLabel}>Later</Text>
          <Text style={styles.discordStepValue}>Auto live alerts</Text>
        </View>
      </View>
      <View style={styles.discordActions}>
        {hasDiscord ? (
          <ActionButton external href={downloadLinks.discord} variant="secondary">
            Open Discord
          </ActionButton>
        ) : (
          <ActionButton href="/contact" variant="secondary">
            Contact page
          </ActionButton>
        )}
        <ActionButton href="/live" variant="ghost">
          Live hub
        </ActionButton>
      </View>
    </Surface>
  );
}

function AnnouncementKit({ items }) {
  return (
    <View style={styles.announcementGrid}>
      {items.map((item) => (
        <Surface key={item.label} style={styles.announcementCard}>
          <Text style={styles.announcementLabel}>{item.label}</Text>
          <Text selectable style={styles.announcementText}>{item.text}</Text>
          <CopyAction text={item.text} />
        </Surface>
      ))}
    </View>
  );
}

function GoLiveChecklist({ items }) {
  return (
    <Surface style={styles.checklistCard}>
      <View style={styles.checklistGrid}>
        {items.map((item) => (
          <View key={item.label} style={[styles.checklistItem, item.ready && styles.checklistItemReady]}>
            <View style={[styles.checklistDot, item.ready && styles.checklistDotReady]} />
            <View style={styles.checklistCopy}>
              <Text style={styles.checklistLabel}>{item.label}</Text>
              <Text style={[styles.checklistValue, item.ready && styles.checklistValueReady]}>{item.value}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={styles.checklistNote}>
        Clipboard buttons use the browser clipboard when available. Overlays, the next-event lobby, and tournament pages refresh live data automatically.
      </Text>
    </Surface>
  );
}

function CopyAction({ label = 'Copy', text }) {
  const [feedback, setFeedback] = useState('');

  async function handleCopy() {
    if (!canUseClipboard()) {
      setFeedback('Select text');
      return;
    }

    try {
      await globalThis.navigator.clipboard.writeText(text);
      setFeedback('Copied');
      setTimeout(() => setFeedback(''), 1800);
    } catch {
      setFeedback('Could not copy');
    }
  }

  return (
    <View style={styles.copyActionRow}>
      <ActionButton onPress={handleCopy} variant="secondary">
        {feedback || label}
      </ActionButton>
    </View>
  );
}

function OverlayLinkCard({ body, href, recommendedSize, title }) {
  const url = absoluteSiteUrl(href);

  return (
    <Surface style={styles.overlayCard}>
      <Text style={styles.overlayTitle}>{title}</Text>
      <Text style={styles.overlayBody}>{body}</Text>
      <View style={styles.overlayUrlBox}>
        <Text style={styles.overlayUrlLabel}>Browser source URL</Text>
        <Text selectable style={styles.overlayUrlText}>{url}</Text>
        <CopyAction label="Copy URL" text={url} />
      </View>
      <View style={styles.overlayUrlBox}>
        <Text style={styles.overlayUrlLabel}>Recommended size</Text>
        <Text style={styles.overlayUrlText}>{recommendedSize}</Text>
      </View>
      <ActionButton href={href} variant="secondary">
        Preview source
      </ActionButton>
    </Surface>
  );
}

const styles = StyleSheet.create({
  announcementCard: {
    borderColor: 'rgba(214, 162, 78, 0.24)',
    flexBasis: 265,
    flexGrow: 1,
  },
  announcementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  announcementLabel: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  announcementText: {
    color: '#F4EFE6',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 21,
    marginTop: 10,
  },
  block: {
    marginBottom: 14,
  },
  checklistCard: {
    borderColor: 'rgba(97, 210, 145, 0.28)',
  },
  checklistCopy: {
    flex: 1,
    minWidth: 0,
  },
  checklistDot: {
    backgroundColor: 'rgba(244, 239, 230, 0.16)',
    borderColor: 'rgba(244, 239, 230, 0.24)',
    borderRadius: 999,
    borderWidth: 1,
    height: 14,
    width: 14,
  },
  checklistDotReady: {
    backgroundColor: '#61D291',
    borderColor: 'rgba(97, 210, 145, 0.72)',
  },
  checklistGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  checklistItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 10,
    borderWidth: 1,
    flexBasis: 210,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 10,
    padding: 12,
  },
  checklistItemReady: {
    backgroundColor: 'rgba(97, 210, 145, 0.08)',
    borderColor: 'rgba(97, 210, 145, 0.22)',
  },
  checklistLabel: {
    color: '#AAB4AE',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  checklistNote: {
    color: '#AAB4AE',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 12,
  },
  checklistValue: {
    color: '#F4EFE6',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
    marginTop: 2,
  },
  checklistValueReady: {
    color: '#61D291',
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
  copyActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  discordActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  discordCopy: {
    color: '#AAB4AE',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 8,
  },
  discordMeta: {
    color: '#6CC7FF',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  discordPanel: {
    borderColor: 'rgba(108, 199, 255, 0.28)',
  },
  discordStep: {
    backgroundColor: 'rgba(108, 199, 255, 0.08)',
    borderColor: 'rgba(108, 199, 255, 0.20)',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 180,
    flexGrow: 1,
    padding: 12,
  },
  discordStepLabel: {
    color: '#AAB4AE',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  discordSteps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  discordStepValue: {
    color: '#F4EFE6',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 22,
    marginTop: 4,
  },
  discordTitle: {
    color: '#F4EFE6',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: 12,
  },
  discordTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
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
  overlayUrlBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 10,
  },
  overlayUrlLabel: {
    color: '#AAB4AE',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  overlayUrlText: {
    color: '#D6A24E',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
    marginTop: 3,
  },
});

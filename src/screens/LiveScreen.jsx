import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

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
import { buildDefaultStreamCommands } from '../lib/streamCommands.js';
import { fetchStreamCommands, sendDiscordAlert } from '../lib/tournamentHostingClient.js';

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

const RUN_OF_SHOW = [
  {
    title: 'Before live',
    items: ['Open Twitch Studio or OBS.', 'Add full overlay as a browser source.', 'Open /next and confirm signup count.', 'Post the short announcement.'],
  },
  {
    title: 'Bracket launch',
    items: ['Switch to bracket overlay.', 'Confirm the tournament page shows bracket live.', 'Tell players to use My match.', 'Keep /live open for links.'],
  },
  {
    title: 'During matches',
    items: ['Use compact overlay on gameplay scene.', 'Refresh spectator table if a table changes.', 'Announce the next match from bracket overlay.', 'Watch roster and match status update automatically.'],
  },
  {
    title: 'After final',
    items: ['Switch back to full overlay.', 'Call out champion and final result.', 'Send viewers to Results.', 'Keep replay/archive links on /live.'],
  },
];

const OBS_SCENES = [
  { scene: 'Starting soon', source: 'Full overlay', url: '/overlay', size: '1280 x 360' },
  { scene: 'Gameplay', source: 'Compact overlay', url: '/overlay/compact', size: '1280 x 170' },
  { scene: 'Bracket break', source: 'Bracket overlay', url: '/overlay/bracket', size: '1100 x 260' },
  { scene: 'Intermission', source: 'Live hub', url: '/live', size: 'Browser window' },
];

const LIVE_TABS = [
  { id: 'control', label: 'Control' },
  { id: 'obs', label: 'OBS' },
  { id: 'announce', label: 'Announce' },
  { id: 'links', label: 'Links' },
];

const PRESENTATION_PLAN = [
  {
    label: 'Twitch chat',
    title: 'Send viewers to /next',
    body: 'Use chat commands for join, match, Discord, rules, and live links.',
  },
  {
    label: 'OBS',
    title: 'Use the overlay package',
    body: 'Full overlay before the event, compact during gameplay, bracket overlay between matches.',
  },
  {
    label: 'Host screen',
    title: 'Keep /live open',
    body: 'Use this dashboard for Twitch, Discord, copy blocks, alerts, and browser-source URLs.',
  },
];

export default function LiveScreen() {
  const [activeTab, setActiveTab] = useState('control');
  const [streamCommands, setStreamCommands] = useState({ commands: [], loading: true, error: '', source: 'default' });
  const streams = getStreams();
  const hasTwitch = isConfiguredUrl(downloadLinks.twitch);
  const hasDiscord = isConfiguredUrl(downloadLinks.discord);
  const upcoming = getUpcomingTournaments();
  const nextTournament = upcoming[0] || null;
  const nextTournamentPath = nextTournament ? getTournamentPath(nextTournament.slug) : '/next';
  const announcementItems = buildAnnouncementCopy(nextTournament, nextTournamentPath);
  const discordAnnouncement = announcementItems.find((item) => item.label === 'Discord live post')?.text || '';

  useEffect(() => {
    let active = true;

    async function loadCommands() {
      try {
        const result = await fetchStreamCommands();

        if (active) {
          setStreamCommands({
            commands: result.commands || [],
            error: '',
            loading: false,
            source: result.source || 'saved',
          });
        }
      } catch (error) {
        if (active) {
          setStreamCommands({
            commands: buildDefaultStreamCommands({ hasDiscord, nextTournamentPath }),
            error: error instanceof Error ? error.message : 'Using default stream commands.',
            loading: false,
            source: 'default',
          });
        }
      }
    }

    loadCommands();

    return () => {
      active = false;
    };
  }, [hasDiscord, nextTournamentPath]);

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
      heroVariant="compact"
      lead="Twitch, next event, overlays, and announcement tools in one place."
      subtitle="Broadcast command center"
      stickyActions={false}
      title="Live coverage">
      <LiveCockpit
        hasDiscord={hasDiscord}
        hasTwitch={hasTwitch}
        nextTournament={nextTournament}
        nextTournamentPath={nextTournamentPath}
        streams={streams}
      />

      <LiveCommandTabs activeTab={activeTab} onSelectTab={setActiveTab} />

      {activeTab === 'control' ? (
        <ControlPanel
          discordAnnouncement={discordAnnouncement}
          hasDiscord={hasDiscord}
          hasTwitch={hasTwitch}
          nextTournament={nextTournament}
          nextTournamentPath={nextTournamentPath}
        />
      ) : null}

      {activeTab === 'obs' ? <ObsPanel /> : null}

      {activeTab === 'announce' ? (
        <AnnouncePanel
          announcementItems={announcementItems}
          checklistItems={buildGoLiveChecklist({ hasDiscord, hasTwitch })}
          hasDiscord={hasDiscord}
        />
      ) : null}

      {activeTab === 'links' ? (
        <LinksPanel
          hasDiscord={hasDiscord}
          hasTwitch={hasTwitch}
          nextTournamentPath={nextTournamentPath}
          streams={streams}
          streamCommands={streamCommands}
        />
      ) : null}
    </HubScreen>
  );
}

function LiveCockpit({ hasDiscord, hasTwitch, nextTournament, nextTournamentPath, streams }) {
  return (
    <Surface style={styles.cockpit}>
      <View style={styles.cockpitStatusRow}>
        <View style={styles.liveStatusGroup}>
          <View style={styles.liveDot} />
          <Badge tone={hasTwitch ? 'rose' : 'neutral'}>{hasTwitch ? 'Twitch ready' : 'Twitch pending'}</Badge>
          <Text style={styles.cockpitStatusText}>Cockpit</Text>
        </View>
        <Text style={styles.cockpitMeta}>{streams.length} stream link{streams.length === 1 ? '' : 's'}</Text>
      </View>

      <View style={styles.cockpitGrid}>
        <View style={[styles.cockpitCard, styles.cockpitCardPrimary]}>
          <Text style={styles.cockpitLabel}>Broadcast</Text>
          <Text style={styles.cockpitTitle}>{hasTwitch ? 'Go to Twitch first' : 'Add Twitch URL'}</Text>
          <Text style={styles.cockpitBody}>Open the broadcast, then keep this hub beside OBS for overlays and announcements.</Text>
          <View style={styles.cockpitActions}>
            {hasTwitch ? (
              <ActionButton external href={downloadLinks.twitch}>Open Twitch</ActionButton>
            ) : (
              <ActionButton href="/stream">Set Twitch URL</ActionButton>
            )}
            <ActionButton href="/overlay/compact" variant="secondary">Compact overlay</ActionButton>
          </View>
        </View>

        <View style={styles.cockpitCard}>
          <Text style={styles.cockpitLabel}>Next tournament</Text>
          <Text style={styles.cockpitTitle}>{nextTournament?.title || 'Event pending'}</Text>
          <Text style={styles.cockpitBody}>
            {nextTournament
              ? formatDateLine(nextTournament.date, nextTournament.timeZone, nextTournament.timeZoneLabel)
              : 'Publish the next event to turn this into the stream lobby.'}
          </Text>
          <View style={styles.cockpitActions}>
            <ActionButton href={nextTournamentPath} variant="secondary">Open event</ActionButton>
            <ActionButton href={`${nextTournamentPath}#my-match`} variant="secondary">My match</ActionButton>
          </View>
        </View>

        <View style={[styles.cockpitCard, styles.cockpitCardBlue]}>
          <Text style={styles.cockpitLabel}>Community</Text>
          <Text style={styles.cockpitTitle}>{hasDiscord ? 'Discord linked' : 'Discord invite pending'}</Text>
          <Text style={styles.cockpitBody}>Send people to Discord for live alerts, tables, and quick tournament updates.</Text>
          <View style={styles.cockpitActions}>
            {hasDiscord ? (
              <ActionButton external href={downloadLinks.discord} variant="secondary">Open Discord</ActionButton>
            ) : (
              <ActionButton href="/contact" variant="secondary">Contact page</ActionButton>
            )}
            <ActionButton href="/rules" variant="secondary">Rules</ActionButton>
          </View>
        </View>
      </View>
    </Surface>
  );
}

function LiveCommandTabs({ activeTab, onSelectTab }) {
  return (
    <View style={styles.tabBar}>
      {LIVE_TABS.map((tab) => {
        const selected = activeTab === tab.id;

        return (
          <ActionButton
            key={tab.id}
            onPress={() => onSelectTab(tab.id)}
            style={styles.liveTabButton}
            variant={selected ? 'primary' : 'secondary'}>
            {tab.label}
          </ActionButton>
        );
      })}
    </View>
  );
}

function ControlPanel({ discordAnnouncement, hasDiscord, hasTwitch, nextTournament, nextTournamentPath }) {
  return (
    <>
      <PresentationPlan />

      <LiveTabCommandCard
        body="Start stream day here: open Twitch, confirm the event, then send the live alert."
        primary={hasTwitch ? { label: 'Open Twitch', href: downloadLinks.twitch, external: true } : { label: 'Set Twitch URL', href: '/stream' }}
        secondary={{ label: 'Tournament page', href: nextTournamentPath }}
        stats={[
          { label: 'Twitch', value: hasTwitch ? 'Ready' : 'Pending' },
          { label: 'Discord', value: hasDiscord ? 'Ready' : 'Manual' },
          { label: 'Event', value: nextTournament ? 'Set' : 'Pending' },
        ]}
        title="Control room"
        tone="rose"
      />

      <LiveBroadcastPanel
        hasDiscord={hasDiscord}
        hasTwitch={hasTwitch}
        nextTournament={nextTournament}
        nextTournamentPath={nextTournamentPath}
      />

      <Section description="The stream-day controls that should stay within reach." title="Control desk">
        <View style={styles.controlGrid}>
          <DiscordAlertPanel hasDiscord={hasDiscord} message={discordAnnouncement} />
          <Surface style={styles.quickPanel}>
            <Text style={styles.quickMeta}>Quick actions</Text>
            <Text style={styles.quickTitle}>Open the important stuff</Text>
            <View style={styles.quickActions}>
              {hasTwitch ? (
                <ActionButton external href={downloadLinks.twitch}>
                  Open Twitch
                </ActionButton>
              ) : (
                <ActionButton href="/stream">Set Twitch URL</ActionButton>
              )}
              <ActionButton href={nextTournamentPath} variant="secondary">
                Tournament page
              </ActionButton>
              <CopyAction label="Copy full overlay" text={absoluteSiteUrl('/overlay')} />
              <CopyAction label="Copy bracket overlay" text={absoluteSiteUrl('/overlay/bracket')} />
            </View>
          </Surface>
        </View>
      </Section>
    </>
  );
}

function ObsPanel() {
  return (
    <>
      <LiveTabCommandCard
        body="Copy browser-source URLs once, then switch scenes from OBS during the event."
        primary={{ label: 'Compact overlay', href: '/overlay/compact' }}
        secondary={{ label: 'Bracket overlay', href: '/overlay/bracket' }}
        stats={[
          { label: 'Scenes', value: String(OBS_SCENES.length) },
          { label: 'Primary', value: 'Full' },
          { label: 'Sizes', value: 'Ready' },
        ]}
        title="OBS control"
      />

      <Section description="Recommended OBS scenes and browser sources." nativeID="obs-scenes" title="OBS scene map">
        <ObsSceneMap items={OBS_SCENES} />
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
    </>
  );
}

function AnnouncePanel({ announcementItems, checklistItems, hasDiscord }) {
  return (
    <>
      <LiveTabCommandCard
        body="Copy the title and post first, then run the checklist before going live."
        primary={hasDiscord ? { label: 'Open Discord', href: downloadLinks.discord, external: true } : { label: 'Contact page', href: '/contact' }}
        secondary={{ label: 'Run checklist', href: '/live#go-live-checklist' }}
        stats={[
          { label: 'Copy blocks', value: String(announcementItems.length) },
          { label: 'Checklist', value: String(checklistItems.length) },
          { label: 'Discord', value: hasDiscord ? 'Ready' : 'Manual' },
        ]}
        title="Announcement control"
        tone="blue"
      />

      <Section description="Copy-ready text for Twitch, Discord, and social posts." nativeID="announcement-kit" title="Announcement kit">
        <AnnouncementKit items={announcementItems} />
      </Section>

      <Section description="Automated stream-day readiness check for what can be handled from this site." nativeID="go-live-checklist" title="Go-live checklist">
        <GoLiveChecklist items={checklistItems} />
      </Section>

      <Section description="A practical operator flow for running the tournament stream." title="Run of show">
        <RunOfShow items={RUN_OF_SHOW} />
      </Section>
    </>
  );
}

function LinksPanel({ hasDiscord, hasTwitch, nextTournamentPath, streams, streamCommands }) {
  const chatCommands = streamCommands.commands.length
    ? streamCommands.commands
    : buildDefaultStreamCommands({ hasDiscord, nextTournamentPath });

  return (
    <>
      <LiveTabCommandCard
        body="Give viewers one clean route: Twitch, tournament page, Discord, and replay links."
        primary={hasTwitch ? { label: 'Open Twitch', href: downloadLinks.twitch, external: true } : { label: 'Set Twitch URL', href: '/stream' }}
        secondary={{ label: 'Tournament page', href: nextTournamentPath }}
        stats={[
          { label: 'Stream links', value: String(streams.length) },
          { label: 'Discord', value: hasDiscord ? 'Ready' : 'Pending' },
          { label: 'Commands', value: streamCommands.loading ? 'Loading' : streamCommands.source },
        ]}
        title="Links control"
      />

      <Section description="The links viewers and stream setup need most during the show." nativeID="stream-links" title="Stream command center">
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

      <Section description="Copy these into Twitch's built-in chat commands or your bot dashboard." title="Twitch command list">
        {streamCommands.error ? <Text style={styles.commandWarning}>{streamCommands.error}</Text> : null}
        <TwitchCommandList commands={chatCommands} />
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
    </>
  );
}

function PresentationPlan() {
  return (
    <Section description="Recommended public presentation setup for Twitch day." title="Presentation setup">
      <View style={styles.presentationGrid}>
        {PRESENTATION_PLAN.map((item, index) => (
          <Surface key={item.label} style={styles.presentationCard}>
            <View style={styles.presentationNumber}>
              <Text style={styles.presentationNumberText}>{index + 1}</Text>
            </View>
            <Text style={styles.presentationLabel}>{item.label}</Text>
            <Text style={styles.presentationTitle}>{item.title}</Text>
            <Text style={styles.presentationBody}>{item.body}</Text>
          </Surface>
        ))}
      </View>
    </Section>
  );
}

function TwitchCommandList({ commands }) {
  return (
    <View style={styles.chatCommandGrid}>
      {commands.map((item) => (
        <Surface key={item.command} style={styles.chatCommandCard}>
          <View style={styles.chatCommandTopRow}>
            <Text selectable style={styles.chatCommandName}>{item.command}</Text>
            <Badge tone="blue">{item.where}</Badge>
          </View>
          <Text selectable style={styles.chatCommandResponse}>{item.response}</Text>
          <CopyAction label="Copy command" text={item.command} />
          <CopyAction label="Copy response" text={item.response} />
        </Surface>
      ))}
    </View>
  );
}

function LiveTabCommandCard({ body, primary, secondary, stats, title, tone = 'accent' }) {
  return (
    <Surface
      style={[
        styles.liveTabCommandCard,
        tone === 'rose' && styles.liveTabCommandCardRose,
        tone === 'blue' && styles.liveTabCommandCardBlue,
      ]}>
      <View style={styles.liveTabCommandTopRow}>
        <View style={styles.liveTabCommandCopy}>
          <Text style={styles.liveTabCommandLabel}>Live operator</Text>
          <Text style={styles.liveTabCommandTitle}>{title}</Text>
          <Text style={styles.liveTabCommandBody}>{body}</Text>
        </View>
        <View style={styles.liveTabCommandActions}>
          <ActionButton external={Boolean(primary.external)} href={primary.href}>
            {primary.label}
          </ActionButton>
          <ActionButton external={Boolean(secondary.external)} href={secondary.href} variant="secondary">
            {secondary.label}
          </ActionButton>
        </View>
      </View>
      <View style={styles.liveTabCommandStats}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.liveTabCommandStat}>
            <Text style={styles.liveTabCommandStatLabel}>{stat.label}</Text>
            <Text style={styles.liveTabCommandStatValue}>{stat.value}</Text>
          </View>
        ))}
      </View>
    </Surface>
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

function DiscordAlertPanel({ hasDiscord, message }) {
  const [sendState, setSendState] = useState({ sending: false, feedback: '', error: '' });
  const [adminToken, setAdminToken] = useState('');

  async function handleSendDiscordAlert() {
    setSendState({ sending: true, feedback: '', error: '' });

    try {
      await sendDiscordAlert({ message, token: adminToken.trim() });
      setSendState({ sending: false, feedback: 'Discord alert sent.', error: '' });
    } catch (error) {
      setSendState({
        sending: false,
        feedback: '',
        error: error instanceof Error ? error.message : 'Discord alert could not be sent.',
      });
    }
  }

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
      <View style={styles.discordTokenBlock}>
        <Text style={styles.discordTokenLabel}>Fallback admin token</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setAdminToken}
          placeholder="Netlify TOURNAMENT_ADMIN_TOKEN"
          placeholderTextColor="rgba(244, 239, 230, 0.40)"
          secureTextEntry
          style={styles.discordTokenInput}
          value={adminToken}
        />
        <Text style={styles.discordTokenHelp}>
          Use this when signed-in host auth is unavailable during a manual deploy.
        </Text>
      </View>
      <View style={styles.discordActions}>
        <ActionButton onPress={handleSendDiscordAlert}>
          {sendState.sending ? 'Sending...' : 'Send live alert'}
        </ActionButton>
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
      {sendState.feedback ? <Text style={styles.discordFeedback}>{sendState.feedback}</Text> : null}
      {sendState.error ? <Text style={styles.discordError}>{sendState.error}</Text> : null}
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

function RunOfShow({ items }) {
  return (
    <View style={styles.runGrid}>
      {items.map((section, sectionIndex) => (
        <Surface key={section.title} style={styles.runCard}>
          <View style={styles.runCardTop}>
            <View style={styles.runNumber}>
              <Text style={styles.runNumberText}>{sectionIndex + 1}</Text>
            </View>
            <Text style={styles.runTitle}>{section.title}</Text>
          </View>
          <View style={styles.runSteps}>
            {section.items.map((item) => (
              <View key={item} style={styles.runStep}>
                <View style={styles.runStepDot} />
                <Text style={styles.runStepText}>{item}</Text>
              </View>
            ))}
          </View>
        </Surface>
      ))}
    </View>
  );
}

function ObsSceneMap({ items }) {
  return (
    <View style={styles.sceneGrid}>
      {items.map((item) => {
        const url = item.url.startsWith('/') ? absoluteSiteUrl(item.url) : item.url;

        return (
          <Surface key={item.scene} style={styles.sceneCard}>
            <Text style={styles.sceneLabel}>{item.scene}</Text>
            <Text style={styles.sceneSource}>{item.source}</Text>
            <View style={styles.sceneUrlBox}>
              <Text selectable style={styles.sceneUrl}>{url}</Text>
              <CopyAction label="Copy URL" text={url} />
            </View>
            <Text style={styles.sceneSize}>{item.size}</Text>
          </Surface>
        );
      })}
    </View>
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
  chatCommandCard: {
    borderColor: 'rgba(108, 199, 255, 0.24)',
    flexBasis: 250,
    flexGrow: 1,
  },
  chatCommandGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  chatCommandName: {
    color: '#6CC7FF',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
  },
  chatCommandResponse: {
    color: '#F4EFE6',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 21,
    marginTop: 12,
  },
  chatCommandTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  commandWarning: {
    color: '#D6A24E',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    marginBottom: 12,
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
  cockpit: {
    backgroundColor: 'rgba(17, 29, 26, 0.88)',
    borderColor: 'rgba(214, 162, 78, 0.38)',
    marginBottom: 14,
  },
  cockpitActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  cockpitBody: {
    color: '#AAB4AE',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 6,
  },
  cockpitCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 250,
    flexGrow: 1,
    padding: 14,
  },
  cockpitCardBlue: {
    backgroundColor: 'rgba(108, 199, 255, 0.08)',
    borderColor: 'rgba(108, 199, 255, 0.22)',
  },
  cockpitCardPrimary: {
    backgroundColor: 'rgba(224, 106, 92, 0.10)',
    borderColor: 'rgba(224, 106, 92, 0.34)',
  },
  cockpitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  cockpitLabel: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  cockpitMeta: {
    color: '#D6A24E',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
    textTransform: 'uppercase',
  },
  cockpitStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  cockpitStatusText: {
    color: '#F4EFE6',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  cockpitTitle: {
    color: '#F4EFE6',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 25,
    marginTop: 6,
  },
  controlGrid: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
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
  discordError: {
    color: '#FFB4A8',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 10,
  },
  discordFeedback: {
    color: '#61D291',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 19,
    marginTop: 10,
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
  discordTokenBlock: {
    marginTop: 14,
  },
  discordTokenHelp: {
    color: '#AAB4AE',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 6,
  },
  discordTokenInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(108, 199, 255, 0.24)',
    borderRadius: 8,
    borderWidth: 1,
    color: '#F4EFE6',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  discordTokenLabel: {
    color: '#6CC7FF',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
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
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  quickMeta: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  quickPanel: {
    borderColor: 'rgba(214, 162, 78, 0.28)',
    flexBasis: 280,
    flexGrow: 1,
  },
  quickTitle: {
    color: '#F4EFE6',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: 8,
  },
  presentationBody: {
    color: '#AAB4AE',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 8,
  },
  presentationCard: {
    borderColor: 'rgba(214, 162, 78, 0.24)',
    flexBasis: 240,
    flexGrow: 1,
  },
  presentationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  presentationLabel: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    marginTop: 12,
    textTransform: 'uppercase',
  },
  presentationNumber: {
    alignItems: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.16)',
    borderColor: 'rgba(214, 162, 78, 0.42)',
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  presentationNumberText: {
    color: '#D6A24E',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 17,
  },
  presentationTitle: {
    color: '#F4EFE6',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
    marginTop: 6,
  },
  tabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 6,
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
  liveTabButton: {
    flexBasis: 112,
    flexGrow: 1,
    marginBottom: 0,
    marginRight: 0,
    minWidth: 0,
  },
  liveTabCommandActions: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  liveTabCommandBody: {
    color: '#AAB4AE',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 7,
  },
  liveTabCommandCard: {
    backgroundColor: 'rgba(17, 29, 26, 0.86)',
    borderColor: 'rgba(214, 162, 78, 0.32)',
    marginBottom: 14,
  },
  liveTabCommandCardBlue: {
    backgroundColor: 'rgba(9, 24, 34, 0.82)',
    borderColor: 'rgba(108, 199, 255, 0.30)',
  },
  liveTabCommandCardRose: {
    backgroundColor: 'rgba(23, 11, 12, 0.82)',
    borderColor: 'rgba(224, 106, 92, 0.38)',
  },
  liveTabCommandCopy: {
    flex: 1,
    minWidth: 240,
  },
  liveTabCommandLabel: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  liveTabCommandStat: {
    backgroundColor: 'rgba(255, 255, 255, 0.045)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 130,
    flexGrow: 1,
    padding: 10,
  },
  liveTabCommandStatLabel: {
    color: '#AAB4AE',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  liveTabCommandStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  liveTabCommandStatValue: {
    color: '#F4EFE6',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 22,
    marginTop: 3,
  },
  liveTabCommandTitle: {
    color: '#F4EFE6',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
    marginTop: 5,
  },
  liveTabCommandTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
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
  runCard: {
    borderColor: 'rgba(214, 162, 78, 0.24)',
    flexBasis: 260,
    flexGrow: 1,
  },
  runCardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  runGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  runNumber: {
    alignItems: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.16)',
    borderColor: 'rgba(214, 162, 78, 0.42)',
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  runNumberText: {
    color: '#D6A24E',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 17,
  },
  runStep: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  runStepDot: {
    backgroundColor: '#61D291',
    borderRadius: 999,
    height: 7,
    marginTop: 7,
    width: 7,
  },
  runSteps: {
    gap: 8,
    marginTop: 14,
  },
  runStepText: {
    color: '#AAB4AE',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  runTitle: {
    color: '#F4EFE6',
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 25,
  },
  sceneCard: {
    borderColor: 'rgba(97, 210, 145, 0.22)',
    flexBasis: 245,
    flexGrow: 1,
  },
  sceneGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sceneLabel: {
    color: '#AAB4AE',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  sceneSize: {
    color: '#61D291',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
    marginTop: 10,
    textTransform: 'uppercase',
  },
  sceneSource: {
    color: '#F4EFE6',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
    marginTop: 6,
  },
  sceneUrl: {
    color: '#D6A24E',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
  },
  sceneUrlBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 10,
  },
});

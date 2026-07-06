import { StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  EmptyState,
  HubScreen,
  Section,
  StreamCard,
  Surface,
} from '../components/hub-ui.jsx';
import { getGamePath, getStreams, siteData } from '../lib/siteData.js';

export default function LiveScreen() {
  const streams = getStreams();

  return (
    <HubScreen
      actions={[
        { label: 'Spades', href: getGamePath(siteData.site.primaryGameSlug) },
        { label: 'Rules', href: '/rules', variant: 'secondary' },
        { label: 'Results', href: '/results', variant: 'ghost' },
      ]}
      eyebrow="Watch"
      footerNote={siteData.site.adminNote}
      lead="Use this page to watch the current Spades spectator table first. YouTube stays here for the channel and replay archive."
      stats={[
        { label: 'Links', value: String(streams.length), tone: 'accent' },
        { label: 'Live', value: 'Spectator', tone: 'green' },
        { label: 'YouTube', value: 'Archive', tone: 'blue' },
      ]}
      subtitle="Spectator table and YouTube links"
      title="Live coverage">
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
});

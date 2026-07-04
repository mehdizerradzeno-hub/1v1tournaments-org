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
      lead="Use this page for the current live table, YouTube channel, and replay archive."
      stats={[
        { label: 'Links', value: String(streams.length), tone: 'accent' },
        { label: 'Channel', value: 'YouTube', tone: 'blue' },
        { label: 'Replays', value: 'Yes', tone: 'green' },
      ]}
      subtitle="Stream and YouTube links"
      title="Live coverage">
      <Section description="Use this page for the primary live table, the channel page, and the replay archive." title="Current links">
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

      <Section description="The official stream path for tournament day." title="Coverage note">
        <Surface style={styles.noteCard}>
          <Text style={styles.noteCopy}>
            Keep this page open during events when players or viewers need the broadcast link.
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

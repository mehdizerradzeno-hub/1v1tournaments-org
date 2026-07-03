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
      lead="The live and replay URLs live in the config file so they can be swapped without changing any page code."
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
            body="Add stream records in the data file and the cards will render here automatically."
            title="No live links are assigned yet"
          />
        ) : null}
      </Section>

      <Section description="This note is here so the next person knows where to edit the URLs." title="Update note">
        <Surface style={styles.noteCard}>
          <Text style={styles.noteCopy}>
            Update the shared data file when the official live channel or replay archive changes.
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

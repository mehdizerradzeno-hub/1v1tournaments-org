import { StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  Badge,
  BulletList,
  EmptyState,
  HubScreen,
  Section,
  Surface,
} from '../components/hub-ui.jsx';
import { formatDateLine } from '../lib/format.js';
import { getGameBySlug, getTournamentBySlug, getTournamentPath, siteData } from '../lib/siteData.js';

export default function CheckInScreen({ slug }) {
  const tournament = getTournamentBySlug(slug);

  if (!tournament) {
    return (
      <HubScreen
        actions={[{ label: 'Home', href: '/' }]}
        eyebrow="Check-in not found"
        lead="That tournament slug is not present in the current public content file."
        subtitle="Use the tournament page if you were looking for an event."
        title="Unknown check-in page">
        <EmptyState
          action={<ActionButton href="/">Back home</ActionButton>}
          body="The check-in placeholder route is ready, but the matching public tournament record still needs to be added."
          title="Nothing to display"
        />
      </HubScreen>
    );
  }

  const game = getGameBySlug(tournament.gameSlug);
  const checkIn = tournament.checkIn;

  return (
    <HubScreen
      actions={[
        { label: 'Tournament page', href: getTournamentPath(tournament.slug) },
        { label: 'Rules', href: '/rules', variant: 'secondary' },
        { label: 'Live', href: '/live', variant: 'ghost' },
      ]}
      eyebrow="Check-in placeholder"
      footerNote={siteData.site.adminNote}
      lead="This page is a static preview of the future sign-up and check-in flow. Nothing is submitted yet."
      stats={[
        { label: 'Status', value: checkIn?.status || 'Placeholder', tone: 'blue' },
        { label: 'Window', value: checkIn?.preview || 'TBD', tone: 'accent' },
        { label: 'Entry', value: 'Free', tone: 'green' },
      ]}
      subtitle={`${game?.name || 'Tournament'} • ${formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)}`}
      title={`${tournament.title} check-in`}>
      <Section description="Players can use this page as a pointer for the future private registration flow." title="What this page does">
        <Surface style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <Badge tone="blue">{checkIn?.status || 'Placeholder flow'}</Badge>
            <Text style={styles.summaryWindow}>{checkIn?.window || 'TBD'}</Text>
          </View>
          <Text style={styles.summaryTitle}>Signup and check-in are still static here.</Text>
          {checkIn?.note ? <Text style={styles.summaryCopy}>{checkIn.note}</Text> : null}
          <BulletList items={checkIn?.steps} tone="blue" />
        </Surface>
      </Section>

      <Section description="This is the work that still needs backend support later." title="Still to build">
        <Surface style={styles.todoCard}>
          <BulletList
            items={[
              'Connect the check-in page to a server-side allowlist.',
              'Store player sign-ups in a safe backend table after the admin workflow is ready.',
              'Publish check-in changes to the public tournament page only after review.',
            ]}
            tone="accent"
          />
        </Surface>
      </Section>

      <Section description="Use the tournament page when you only need event details." title="Back to the event">
        <Surface style={styles.backCard}>
          <Text style={styles.backCopy}>
            This placeholder flow stays separate so the public tournament page can keep the schedule, rules, and stream links clean.
          </Text>
          <ActionButton href={getTournamentPath(tournament.slug)}>Return to tournament</ActionButton>
        </Surface>
      </Section>
    </HubScreen>
  );
}

const styles = StyleSheet.create({
  backCard: {
    borderColor: 'rgba(214, 162, 78, 0.24)',
  },
  backCopy: {
    color: '#AAB4AE',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
  summaryCard: {
    borderColor: 'rgba(108, 199, 255, 0.24)',
  },
  summaryCopy: {
    color: '#AAB4AE',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  summaryTitle: {
    color: '#F4EFE6',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  summaryWindow: {
    color: '#6CC7FF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'right',
    flexShrink: 1,
  },
  todoCard: {
    borderColor: 'rgba(214, 162, 78, 0.24)',
  },
});

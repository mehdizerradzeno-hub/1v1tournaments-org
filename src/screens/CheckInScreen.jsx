import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

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
import { submitTournamentSignup } from '../lib/tournamentHostingClient.js';

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
  const [playerName, setPlayerName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [playerHandle, setPlayerHandle] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signup, setSignup] = useState(null);
  const [error, setError] = useState('');

  async function handleSubmitSignup() {
    setSubmitting(true);
    setError('');
    setSignup(null);

    try {
      const result = await submitTournamentSignup({
        tournamentSlug: tournament.slug,
        playerName,
        contactEmail,
        playerHandle,
        notes,
      });

      setSignup(result.signup);
      setPlayerName('');
      setContactEmail('');
      setPlayerHandle('');
      setNotes('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Signup could not be saved.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <HubScreen
      actions={[
        { label: 'Tournament page', href: getTournamentPath(tournament.slug) },
        { label: 'Rules', href: '/rules', variant: 'secondary' },
        { label: 'Live', href: '/live', variant: 'ghost' },
      ]}
      eyebrow="Tournament signup"
      footerNote="Player signups are stored server-side for admin review. Entry is free and no wagering is allowed."
      lead="Use this page to register for the tournament. The admin roster updates on the private admin page after the signup is saved."
      stats={[
        { label: 'Status', value: 'Open', tone: 'green' },
        { label: 'Window', value: checkIn?.preview || 'TBD', tone: 'accent' },
        { label: 'Entry', value: 'Free', tone: 'green' },
      ]}
      subtitle={`${game?.name || 'Tournament'} • ${formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)}`}
      title={`${tournament.title} check-in`}>
      <Section description="This form saves the player to the server-side tournament roster." title="Register for this tournament">
        <Surface style={styles.signupCard}>
          <View style={styles.summaryTopRow}>
            <Badge tone="green">Live signup</Badge>
            <Text style={styles.summaryWindow}>{checkIn?.window || 'Registration open'}</Text>
          </View>
          <Text style={styles.summaryTitle}>Reserve a spot</Text>
          <Text style={styles.summaryCopy}>
            Enter the player details below. Use an email you can check in case the admin needs to confirm table assignments.
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Player name</Text>
            <TextInput
              autoCapitalize="words"
              onChangeText={setPlayerName}
              placeholder="Name shown on the roster"
              placeholderTextColor="#6B766F"
              style={styles.input}
              value={playerName}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Contact email</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="email"
              onChangeText={setContactEmail}
              placeholder="you@example.com"
              placeholderTextColor="#6B766F"
              style={styles.input}
              value={contactEmail}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Player handle</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setPlayerHandle}
              placeholder="Discord, YouTube, or table name"
              placeholderTextColor="#6B766F"
              style={styles.input}
              value={playerHandle}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              multiline
              onChangeText={setNotes}
              placeholder="Optional availability or stream notes"
              placeholderTextColor="#6B766F"
              style={styles.notesInput}
              value={notes}
            />
          </View>

          <View style={styles.buttonRow}>
            <ActionButton onPress={handleSubmitSignup}>{submitting ? 'Saving...' : 'Submit signup'}</ActionButton>
            <ActionButton href={getTournamentPath(tournament.slug)} variant="secondary">
              Event details
            </ActionButton>
          </View>

          {signup ? (
            <Text style={styles.successText}>
              Signup saved for {signup.playerName}. Confirmation ID: {signup.id}
            </Text>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </Surface>
      </Section>

      <Section description="Check-in timing and player expectations for this event." title="Check-in details">
        <Surface style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <Badge tone="blue">{checkIn?.status || 'Registration flow'}</Badge>
            <Text style={styles.summaryWindow}>{checkIn?.window || 'TBD'}</Text>
          </View>
          <Text style={styles.summaryTitle}>{checkIn?.title || 'Signup and check-in'}</Text>
          {checkIn?.note ? <Text style={styles.summaryCopy}>{checkIn.note}</Text> : null}
          <BulletList items={checkIn?.steps} tone="blue" />
        </Surface>
      </Section>

      <Section description="Phase 1 gets registration online. Brackets and score reporting come next." title="Still to build">
        <Surface style={styles.todoCard}>
          <BulletList
            items={[
              'Generate seeds and brackets from the registered player roster.',
              'Let players report scores after each match.',
              'Let admins approve results and publish final standings.',
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
  signupCard: {
    borderColor: 'rgba(97, 210, 145, 0.30)',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  errorText: {
    color: '#E06A5C',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
    fontWeight: '700',
  },
  fieldGroup: {
    marginTop: 14,
  },
  fieldLabel: {
    color: '#F4EFE6',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    color: '#F4EFE6',
    borderWidth: 1,
    borderColor: 'rgba(244, 239, 230, 0.12)',
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  notesInput: {
    color: '#F4EFE6',
    minHeight: 96,
    borderWidth: 1,
    borderColor: 'rgba(244, 239, 230, 0.12)',
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
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
  successText: {
    color: '#61D291',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
    fontWeight: '700',
  },
});

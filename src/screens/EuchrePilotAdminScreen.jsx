import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, Badge, EmptyState, Section, Surface } from '../components/hub-ui.jsx';
import {
  configureEuchrePilot,
  fetchEuchrePilot,
  reportTournamentMatchWinner,
  setEuchrePilotCheckIn,
} from '../lib/tournamentHostingClient.js';

function parseCanonicalIds(value) {
  return String(value || '').split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

function confirmNoShow(playerName) {
  if (typeof globalThis.confirm !== 'function') return false;
  return globalThis.confirm(`Advance ${playerName} because the opponent is a confirmed no-show? This finalizes the match.`);
}

export default function EuchrePilotAdminScreen() {
  const [slug, setSlug] = useState('');
  const [token, setToken] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [inviteText, setInviteText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function applyResult(nextResult, nextMessage = '') {
    setResult(nextResult);
    setCapacity(nextResult.pilot.capacity);
    setInviteText(nextResult.pilot.invitedCanonicalAccountIds.join('\n'));
    setMessage(nextMessage);
    setError('');
  }

  async function run(action) {
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const nextResult = await action();
      applyResult(nextResult);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfigure() {
    await run(async () => {
      const nextResult = await configureEuchrePilot({
        token,
        slug,
        capacity,
        invitedCanonicalAccountIds: parseCanonicalIds(inviteText),
      });
      setMessage('Private invited-player policy saved. Public Euchre discovery remains unchanged.');
      return nextResult;
    });
  }

  async function handleCheckIn(player, checkedIn) {
    await run(() => setEuchrePilotCheckIn({
      token,
      slug,
      canonicalAccountId: player.canonicalAccountId,
      checkedIn,
    }));
  }

  async function handleNoShow(match, winner) {
    if (!confirmNoShow(winner.name)) return;

    await run(async () => {
      await reportTournamentMatchWinner({
        token,
        slug,
        matchId: match.id,
        winnerId: winner.participantId,
      });
      return fetchEuchrePilot({ token, slug });
    });
  }

  const readiness = result?.readiness;

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>HOST ONLY</Text>
          <Text style={styles.title}>Invited Euchre pilot</Text>
          <Text style={styles.lead}>Configure 4 or 8 canonical accounts, check attendance, and monitor bracket delivery.</Text>
        </View>
        <ActionButton href="/admin" variant="secondary">Tournament admin</ActionButton>
      </View>

      <Section description="Create the Euchre event in Tournament admin first, then attach this private allowlist." title="Pilot access">
        <Surface style={styles.panel}>
          <View style={styles.badges}>
            <Badge tone="accent">Invite only</Badge>
            <Badge tone="blue">Public discovery off</Badge>
            <Badge tone="green">Canonical accounts</Badge>
          </View>
          <Text style={styles.label}>Tournament slug</Text>
          <TextInput onChangeText={setSlug} placeholder="season-1-euchre-pilot" placeholderTextColor="#778078" style={styles.input} value={slug} />
          <Text style={styles.label}>Fallback admin token (not needed for an approved host account)</Text>
          <TextInput onChangeText={setToken} secureTextEntry style={styles.input} value={token} />
          <Text style={styles.label}>Player cap</Text>
          <View style={styles.actions}>
            <ActionButton onPress={() => setCapacity(4)} variant={capacity === 4 ? 'primary' : 'secondary'}>4 players</ActionButton>
            <ActionButton onPress={() => setCapacity(8)} variant={capacity === 8 ? 'primary' : 'secondary'}>8 players</ActionButton>
          </View>
          <Text style={styles.label}>Admitted canonical account IDs (one per line)</Text>
          <TextInput multiline numberOfLines={8} onChangeText={setInviteText} placeholder="acct_..." placeholderTextColor="#778078" style={[styles.input, styles.multiline]} value={inviteText} />
          <View style={styles.actions}>
            <ActionButton onPress={handleConfigure}>{loading ? 'Saving...' : 'Save invited pilot'}</ActionButton>
            <ActionButton onPress={() => run(() => fetchEuchrePilot({ token, slug }))} variant="secondary">Refresh readiness</ActionButton>
          </View>
          {message ? <Text style={styles.success}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Surface>
      </Section>

      {readiness ? (
        <>
          <Section description="Only registered, admitted canonical accounts can be checked in." title="Player readiness">
            <Surface style={styles.panel}>
              <View style={styles.metrics}>
                <Badge tone="accent">{readiness.admittedPlayers.length}/{readiness.capacity} admitted</Badge>
                <Badge tone="green">{readiness.checkedInPlayers.length} checked in</Badge>
                <Badge tone={readiness.missingPlayers.length ? 'accent' : 'green'}>{readiness.missingPlayers.length} missing</Badge>
                <Badge tone={readiness.readyToStart ? 'green' : 'blue'}>{readiness.readyToStart ? 'Ready to seed' : 'Not ready'}</Badge>
              </View>
              {readiness.admittedPlayers.map((player) => (
                <View key={player.canonicalAccountId} style={styles.row}>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{player.playerName || player.playerHandle || 'Invited account'}</Text>
                    <Text style={styles.meta}>{player.registered ? 'Registered' : 'Not registered'} · {player.checkedIn ? 'Checked in' : 'Missing check-in'}</Text>
                  </View>
                  <ActionButton disabled={!player.registered} onPress={() => handleCheckIn(player, !player.checkedIn)} variant={player.checkedIn ? 'secondary' : 'primary'}>
                    {player.checkedIn ? 'Undo check-in' : 'Check in'}
                  </ActionButton>
                </View>
              ))}
            </Surface>
          </Section>

          <Section description="Room presence is not exported by Euchre yet, so this view never guesses connection status." title="Assignments and results">
            <Surface style={styles.panel}>
              <View style={styles.metrics}>
                <Badge tone="blue">{readiness.assignedMatches.length} matches</Badge>
                <Badge tone="green">{readiness.completedResults.length} completed</Badge>
                <Badge tone="accent">{readiness.callbackConfirmedCount} callbacks confirmed</Badge>
                <Badge tone={readiness.champion ? 'green' : 'blue'}>{readiness.advancementStatus}</Badge>
              </View>
              {readiness.assignedMatches.length ? readiness.assignedMatches.map((match) => (
                <View key={match.id} style={styles.match}>
                  <Text style={styles.rowTitle}>{match.round} · {match.id}</Text>
                  <Text style={styles.meta}>{match.status} · room: {match.roomConnectionStatus} · callback: {match.callbackStatus}</Text>
                  <Text style={styles.meta}>{match.players.map((player) => `${player.seat}: ${player.name}`).join(' vs ') || 'Waiting for assignment'}</Text>
                  {match.status === 'ready' ? (
                    <>
                      <Text style={styles.note}>Reconnect: ask the player to reopen Play My Match from the tournament page. The active assignment remains deterministic.</Text>
                      <View style={styles.actions}>
                        {match.players.map((player) => (
                          <ActionButton key={player.participantId} onPress={() => handleNoShow(match, player)} variant="secondary">
                            Advance {player.name} (no-show)
                          </ActionButton>
                        ))}
                      </View>
                    </>
                  ) : null}
                </View>
              )) : <EmptyState body="Generate the bracket from Tournament admin after every admitted player is registered and checked in." title="No assignments yet" />}
              <Text style={styles.note}>Failed result callbacks are retried by Euchre&apos;s durable outbox. Refresh this view to verify delivery; Tournaments intentionally cannot forge or replay a game callback.</Text>
            </Surface>
          </Section>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#070B09' },
  content: { alignSelf: 'center', gap: 24, maxWidth: 1120, padding: 24, width: '100%' },
  header: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between' },
  eyebrow: { color: '#DCA84D', fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#F4F0E7', fontSize: 40, fontWeight: '900', marginTop: 8 },
  lead: { color: '#B7BBB5', fontSize: 17, lineHeight: 26, marginTop: 8, maxWidth: 720 },
  panel: { gap: 14 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  label: { color: '#E7E2D7', fontSize: 14, fontWeight: '800' },
  input: { backgroundColor: '#111713', borderColor: '#4F533F', borderRadius: 12, borderWidth: 1, color: '#F4F0E7', fontSize: 15, padding: 14 },
  multiline: { minHeight: 150, textAlignVertical: 'top' },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  success: { color: '#72D795', fontWeight: '700' },
  error: { color: '#F07D7D', fontWeight: '700' },
  row: { alignItems: 'center', borderColor: '#28342E', borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', paddingTop: 14 },
  rowCopy: { flex: 1, minWidth: 220 },
  rowTitle: { color: '#F4F0E7', fontSize: 16, fontWeight: '900' },
  meta: { color: '#AEB5AE', fontSize: 14, lineHeight: 21, marginTop: 4 },
  note: { color: '#D6C89E', fontSize: 14, lineHeight: 21 },
  match: { backgroundColor: '#0D1411', borderColor: '#38453D', borderRadius: 14, borderWidth: 1, gap: 8, padding: 16 },
});

import { useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  ActionButton,
  Badge,
  BracketBoard,
  EmptyState,
  HubScreen,
  CheckInPanel,
  Section,
  Surface,
  TournamentCard,
} from '../components/hub-ui.jsx';
import {
  fetchAdminServerState,
  saveAdminServerState,
  verifyAdminServerAccountId,
} from '../lib/adminServerClient.js';
import { normalizeAccountIds, parseAccountIds, serializeAdminServerPacket } from '../lib/adminServerState.js';
import { getGamePath, getGames, getTournamentPath, siteData } from '../lib/siteData.js';
import {
  fetchTournamentBracket,
  fetchTournamentRoster,
  generateTournamentBracket,
  reportTournamentMatchWinner,
  resetTournamentBracket,
} from '../lib/tournamentHostingClient.js';
import {
  buildAdminDraftPacket,
  clearAdminSessionRecord,
  createDraftTemplate,
  getAdminDrafts,
  getAdminSecretRecord,
  hasAdminStorage,
  hashAdminPassphrase,
  isAdminSessionValid,
  normalizeDrafts,
  resetAdminDrafts,
  setAdminDrafts,
  setAdminSecretRecord,
  setAdminSessionRecord,
  serializeAdminDraftPacket,
  verifyAdminPassphrase,
} from '../lib/adminStorage.js';

const CODE_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'Menlo' });

function canUseClipboard() {
  return typeof globalThis.navigator !== 'undefined' && Boolean(globalThis.navigator?.clipboard?.writeText);
}

function getModeLabel(mode) {
  if (mode === 'setup') return 'Setup';
  if (mode === 'locked') return 'Locked';
  if (mode === 'unlocked') return 'Unlocked';
  return 'Unsupported';
}

export default function AdminScreen() {
  const games = getGames();
  const gameLookup = useMemo(() => new Map(games.map((game) => [game.slug, game])), [games]);
  const storageAvailable = hasAdminStorage();
  const initialSecretRecord = getAdminSecretRecord();
  const initialDrafts = getAdminDrafts();
  const [mode, setMode] = useState(() => {
    if (!storageAvailable) {
      return 'unsupported';
    }

    if (!initialSecretRecord?.fingerprint) {
      return 'setup';
    }

    return isAdminSessionValid() ? 'unlocked' : 'locked';
  });
  const [secretExists, setSecretExists] = useState(() => Boolean(initialSecretRecord?.fingerprint));
  const [drafts, setDrafts] = useState(() => initialDrafts);
  const [selectedDraftSlug, setSelectedDraftSlug] = useState(() => initialDrafts[0]?.slug || '');
  const [editorValue, setEditorValue] = useState(() => JSON.stringify(initialDrafts, null, 2));
  const [serverUrl, setServerUrl] = useState(() => siteData.admin.serverUrl || '');
  const [serverAccountId, setServerAccountId] = useState('');
  const [serverAllowlistText, setServerAllowlistText] = useState(() =>
    normalizeAccountIds(siteData.admin.bootstrapAllowlistAccountIds || []).join('\n'),
  );
  const [serverState, setServerState] = useState(null);
  const [createPassphrase, setCreatePassphrase] = useState('');
  const [createConfirm, setCreateConfirm] = useState('');
  const [unlockPassphrase, setUnlockPassphrase] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [serverMessage, setServerMessage] = useState('');
  const [serverError, setServerError] = useState('');
  const [rosterToken, setRosterToken] = useState('');
  const [rosterSlug, setRosterSlug] = useState(() => siteData.site.primaryTournamentSlug || siteData.tournaments[0]?.slug || '');
  const [rosters, setRosters] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterMessage, setRosterMessage] = useState('');
  const [rosterError, setRosterError] = useState('');
  const [bracket, setBracket] = useState(null);
  const [bracketLoading, setBracketLoading] = useState(false);
  const [bracketMessage, setBracketMessage] = useState('');
  const [bracketError, setBracketError] = useState('');
  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.slug === selectedDraftSlug) || drafts[0] || null,
    [drafts, selectedDraftSlug],
  );
  const selectedDraftIndex = selectedDraft ? drafts.findIndex((draft) => draft.slug === selectedDraft.slug) : -1;
  const selectedDraftPacketText = useMemo(() => {
    if (!selectedDraft) {
      return '';
    }

    return JSON.stringify(buildAdminDraftPacket(selectedDraft), null, 2);
  }, [selectedDraft]);
  const serverPacketText = useMemo(
    () =>
      serializeAdminServerPacket({
        allowlistAccountIds: parseAccountIds(serverAllowlistText),
        draftTournaments: drafts,
      }),
    [drafts, serverAllowlistText],
  );
  const selectedRoster = useMemo(
    () => rosters.find((roster) => roster.tournamentSlug === rosterSlug) || rosters[0] || null,
    [rosters, rosterSlug],
  );

  function setFeedback(nextMessage = '', nextError = '') {
    setMessage(nextMessage);
    setError(nextError);
  }

  function setServerFeedback(nextMessage = '', nextError = '') {
    setServerMessage(nextMessage);
    setServerError(nextError);
  }

  function setRosterFeedback(nextMessage = '', nextError = '') {
    setRosterMessage(nextMessage);
    setRosterError(nextError);
  }

  function setBracketFeedback(nextMessage = '', nextError = '') {
    setBracketMessage(nextMessage);
    setBracketError(nextError);
  }

  function handleCreateAccess() {
    const passphrase = createPassphrase.trim();

    if (!passphrase) {
      setFeedback('', 'Enter a passphrase before creating private access.');
      return;
    }

    if (passphrase !== createConfirm.trim()) {
      setFeedback('', 'The two passphrase entries do not match.');
      return;
    }

    const fingerprint = setAdminSecretRecord(passphrase);
    setAdminSessionRecord(fingerprint);
    setSecretExists(true);
    setMode('unlocked');
    setFeedback('Private admin access has been created on this device.', '');
    setCreatePassphrase('');
    setCreateConfirm('');
    setUnlockPassphrase('');
  }

  function handleUnlock() {
    const passphrase = unlockPassphrase.trim();

    if (!passphrase) {
      setFeedback('', 'Enter the private passphrase to unlock this admin screen.');
      return;
    }

    if (!verifyAdminPassphrase(passphrase)) {
      setFeedback('', 'That passphrase did not match this device.');
      return;
    }

    setAdminSessionRecord(hashAdminPassphrase(passphrase));
    setMode('unlocked');
    setUnlockPassphrase('');
    setFeedback('Admin access unlocked.', '');
  }

  function handleLock() {
    clearAdminSessionRecord();
    setMode('locked');
    setFeedback('Admin access locked on this browser.', '');
  }

  function handleSaveDrafts() {
    try {
      const parsed = JSON.parse(editorValue);
      const normalized = normalizeDrafts(parsed);
      setAdminDrafts(normalized);
      setDrafts(normalized);
      setSelectedDraftSlug((currentSlug) =>
        normalized.some((draft) => draft.slug === currentSlug) ? currentSlug : normalized[0]?.slug || '',
      );
      setEditorValue(JSON.stringify(normalized, null, 2));
      setFeedback(`Saved ${normalized.length} draft tournament${normalized.length === 1 ? '' : 's'}.`, '');
    } catch {
      setFeedback('', 'The JSON editor needs to contain a valid draft array.');
    }
  }

  function handleResetDrafts() {
    const seeded = siteData.admin.draftTournaments;
    resetAdminDrafts();
    setDrafts(seeded);
    setSelectedDraftSlug(seeded[0]?.slug || '');
    setEditorValue(JSON.stringify(seeded, null, 2));
    setFeedback('Drafts reset to the seeded placeholder data.', '');
  }

  function handleAddDraft() {
    const nextIndex = drafts.length + 1;
    const template = createDraftTemplate({
      slug: `draft-${nextIndex}`,
      title: `Draft event ${nextIndex}`,
      gameSlug: siteData.site.primaryGameSlug,
    });
    const nextDrafts = [...drafts, template];
    setAdminDrafts(nextDrafts);
    setDrafts(nextDrafts);
    setSelectedDraftSlug(template.slug);
    setEditorValue(JSON.stringify(nextDrafts, null, 2));
    setFeedback(`Added ${template.title}.`, '');
  }

  async function handleCopyDrafts() {
    try {
      if (canUseClipboard()) {
        await globalThis.navigator.clipboard.writeText(editorValue);
        setFeedback('Draft JSON copied to the clipboard.', '');
        return;
      }

      Alert.alert('Copy draft JSON', editorValue);
      setFeedback('Clipboard is not available here, so the JSON was shown in an alert.', '');
    } catch {
      setFeedback('', 'Could not copy the draft JSON from this browser.');
    }
  }

  async function handleCopySelectedPacket() {
    await handleCopyDraftPacket(selectedDraft);
  }

  function handleSelectDraft(draftSlug) {
    const draft = drafts.find((item) => item.slug === draftSlug) || null;
    setSelectedDraftSlug(draftSlug);
    setFeedback(draft ? `Previewing ${draft.title}.` : 'Previewing the selected draft.', '');
  }

  async function handleCopyDraftPacket(draft) {
    if (!draft) {
      setFeedback('', 'Select a draft first so the export packet has content.');
      return;
    }

    try {
      const packetText = serializeAdminDraftPacket(draft);

      if (canUseClipboard()) {
        await globalThis.navigator.clipboard.writeText(packetText);
        setFeedback(`${draft.title} packet copied to the clipboard.`, '');
        return;
      }

      Alert.alert('Copy draft packet', packetText);
      setFeedback('Clipboard is not available here, so the packet was shown in an alert.', '');
    } catch {
      setFeedback('', 'Could not copy the selected draft packet from this browser.');
    }
  }

  async function handleLoadServerState() {
    const url = serverUrl.trim();

    if (!url) {
      setServerFeedback('', 'Enter the local server URL first.');
      return;
    }

    try {
      const result = await fetchAdminServerState(url);

      if (!result?.allowlistAccountIds) {
        setServerFeedback('', result?.error || 'The admin server did not return a valid state.');
        return;
      }

      const normalized = normalizeAccountIds(result.allowlistAccountIds);
      setServerState(result);
      setServerAllowlistText(normalized.join('\n'));
      setServerFeedback(`Loaded ${normalized.length} allowlist account${normalized.length === 1 ? '' : 's'} from the server.`, '');
    } catch (error) {
      setServerFeedback('', error instanceof Error ? error.message : 'Could not load the local admin server state.');
    }
  }

  async function handleUnlockWithAccountId() {
    const accountId = serverAccountId.trim();

    if (!accountId) {
      setServerFeedback('', 'Enter your account ID before unlocking with the server allowlist.');
      return;
    }

    try {
      const result = await verifyAdminServerAccountId(accountId, serverUrl.trim());

      if (!result?.allowed) {
        setServerFeedback('', result?.error || 'That account ID is not on the server allowlist.');
        return;
      }

      setMode('unlocked');
      setServerFeedback(`Server allowlist accepted ${accountId}.`, '');
      setFeedback('Admin access unlocked with the server allowlist.', '');
    } catch (error) {
      setServerFeedback('', error instanceof Error ? error.message : 'Could not reach the local allowlist server.');
    }
  }

  async function handleSaveServerState() {
    const allowlistAccountIds = parseAccountIds(serverAllowlistText);

    try {
      const result = await saveAdminServerState(
        {
          allowlistAccountIds,
          draftTournaments: drafts,
        },
        serverUrl.trim(),
      );

      if (!result?.ok && result?.allowlistAccountIds === undefined) {
        setServerFeedback('', result?.error || 'The admin server did not save the state.');
        return;
      }

      const normalized = normalizeAccountIds(result?.allowlistAccountIds || allowlistAccountIds);
      setServerState(result);
      setServerAllowlistText(normalized.join('\n'));
      setServerFeedback(
        `Saved ${normalized.length} allowlist account${normalized.length === 1 ? '' : 's'} and ${drafts.length} draft${drafts.length === 1 ? '' : 's'} to the server.`,
        '',
      );
    } catch (error) {
      setServerFeedback('', error instanceof Error ? error.message : 'Could not save the local admin server state.');
    }
  }

  async function handleSyncDraftsToServer() {
    if (!serverAllowlistText.trim()) {
      setServerFeedback('', 'Add at least one allowlist account ID before syncing drafts to the server.');
      return;
    }

    await handleSaveServerState();
  }

  function handleCopyServerPacket() {
    try {
      if (canUseClipboard()) {
        globalThis.navigator.clipboard.writeText(serverPacketText).catch(() => {});
        setServerFeedback('Server allowlist packet copied to the clipboard.', '');
        return;
      }

      Alert.alert('Copy server packet', serverPacketText);
      setServerFeedback('Clipboard is not available here, so the server packet was shown in an alert.', '');
    } catch {
      setServerFeedback('', 'Could not copy the server packet from this browser.');
    }
  }

  async function handleLoadRoster() {
    const token = rosterToken.trim();

    if (!token) {
      setRosterFeedback('', 'Enter the tournament admin token before loading signups.');
      return;
    }

    setRosterLoading(true);
    setRosterFeedback('', '');

    try {
      const result = await fetchTournamentRoster({
        token,
        slug: rosterSlug,
      });
      const nextRosters = result.rosters || [];
      const signupCount = nextRosters.reduce((total, roster) => total + (roster.signups?.length || 0), 0);

      setRosters(nextRosters);
      setBracket(null);
      setRosterFeedback(`Loaded ${signupCount} signup${signupCount === 1 ? '' : 's'}.`, '');
    } catch (error) {
      setRosterFeedback('', error instanceof Error ? error.message : 'Could not load tournament signups.');
    } finally {
      setRosterLoading(false);
    }
  }

  async function handleLoadBracket() {
    setBracketLoading(true);
    setBracketFeedback('', '');

    try {
      const result = await fetchTournamentBracket({ slug: rosterSlug });
      setBracket(result.bracket || null);
      setBracketFeedback(result.bracket ? 'Loaded the published bracket.' : 'No bracket is published for this tournament yet.', '');
    } catch (error) {
      setBracketFeedback('', error instanceof Error ? error.message : 'Could not load the tournament bracket.');
    } finally {
      setBracketLoading(false);
    }
  }

  async function handleGenerateBracket() {
    const token = rosterToken.trim();

    if (!token) {
      setBracketFeedback('', 'Enter the tournament admin token before generating a bracket.');
      return;
    }

    setBracketLoading(true);
    setBracketFeedback('', '');

    try {
      const result = await generateTournamentBracket({ token, slug: rosterSlug });
      setBracket(result.bracket || null);
      setBracketFeedback('Generated and published the bracket from the live signup roster.', '');
    } catch (error) {
      setBracketFeedback('', error instanceof Error ? error.message : 'Could not generate the tournament bracket.');
    } finally {
      setBracketLoading(false);
    }
  }

  async function handleResetBracket() {
    const token = rosterToken.trim();

    if (!token) {
      setBracketFeedback('', 'Enter the tournament admin token before resetting a bracket.');
      return;
    }

    setBracketLoading(true);
    setBracketFeedback('', '');

    try {
      await resetTournamentBracket({ token, slug: rosterSlug });
      setBracket(null);
      setBracketFeedback('Reset the published bracket for this tournament.', '');
    } catch (error) {
      setBracketFeedback('', error instanceof Error ? error.message : 'Could not reset the tournament bracket.');
    } finally {
      setBracketLoading(false);
    }
  }

  async function handleReportWinner(match, player) {
    const token = rosterToken.trim();

    if (!token) {
      setBracketFeedback('', 'Enter the tournament admin token before reporting a winner.');
      return;
    }

    setBracketLoading(true);
    setBracketFeedback('', '');

    try {
      const result = await reportTournamentMatchWinner({
        token,
        slug: rosterSlug,
        matchId: match.id,
        winnerId: player.id,
      });
      setBracket(result.bracket || null);
      setBracketFeedback(`${player.name} advanced from ${match.label}.`, '');
    } catch (error) {
      setBracketFeedback('', error instanceof Error ? error.message : 'Could not save the match winner.');
    } finally {
      setBracketLoading(false);
    }
  }

  async function handleCopyBracket() {
    const text = JSON.stringify(bracket || {}, null, 2);

    try {
      if (canUseClipboard()) {
        await globalThis.navigator.clipboard.writeText(text);
        setBracketFeedback('Bracket JSON copied to the clipboard.', '');
        return;
      }

      Alert.alert('Copy bracket JSON', text);
      setBracketFeedback('Clipboard is not available here, so the bracket JSON was shown in an alert.', '');
    } catch {
      setBracketFeedback('', 'Could not copy the bracket JSON from this browser.');
    }
  }

  async function handleCopyMatchCallback(match) {
    const payload = {
      action: 'report-winner',
      matchId: match.id,
      winnerId: 'winner-player-id-from-this-match',
    };
    const text = [
      `POST https://1v1tournaments.org/.netlify/functions/tournament-bracket?slug=${encodeURIComponent(rosterSlug)}`,
      'Authorization: Bearer $TOURNAMENT_MATCH_RESULT_TOKEN',
      'Content-Type: application/json',
      '',
      JSON.stringify(payload, null, 2),
      '',
      `curl -sS -X POST 'https://1v1tournaments.org/.netlify/functions/tournament-bracket?slug=${encodeURIComponent(rosterSlug)}' \\`,
      "  -H 'Authorization: Bearer $TOURNAMENT_MATCH_RESULT_TOKEN' \\",
      "  -H 'Content-Type: application/json' \\",
      `  --data '${JSON.stringify(payload)}'`,
    ].join('\n');

    try {
      if (canUseClipboard()) {
        await globalThis.navigator.clipboard.writeText(text);
        setBracketFeedback(`${match.id} callback packet copied.`, '');
        return;
      }

      Alert.alert('Copy match callback', text);
      setBracketFeedback('Clipboard is not available here, so the callback packet was shown in an alert.', '');
    } catch {
      setBracketFeedback('', 'Could not copy the match callback packet from this browser.');
    }
  }

  async function handleCopyRoster() {
    const text = JSON.stringify(rosters, null, 2);

    try {
      if (canUseClipboard()) {
        await globalThis.navigator.clipboard.writeText(text);
        setRosterFeedback('Roster JSON copied to the clipboard.', '');
        return;
      }

      Alert.alert('Copy roster JSON', text);
      setRosterFeedback('Clipboard is not available here, so the roster JSON was shown in an alert.', '');
    } catch {
      setRosterFeedback('', 'Could not copy the roster JSON from this browser.');
    }
  }

  function renderServerUnlockSection() {
    return (
      <Section
        description="Use the local allowlist server with your account ID. The browser passphrase remains a fallback."
        title="Unlock with account ID">
        <Surface style={styles.panel}>
          <Text style={styles.copy}>
            The server keeps the allowlist outside the browser. Start the local admin server, enter your account ID, and unlock with the safer path.
          </Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Server URL</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setServerUrl}
              placeholder="http://127.0.0.1:8787"
              placeholderTextColor="#6B766F"
              style={styles.input}
              value={serverUrl}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Account ID</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setServerAccountId}
              placeholder="Enter your account ID"
              placeholderTextColor="#6B766F"
              style={styles.input}
              value={serverAccountId}
            />
          </View>
          {serverError ? <Text style={styles.errorText}>{serverError}</Text> : null}
          {serverMessage ? <Text style={styles.successText}>{serverMessage}</Text> : null}
          <View style={styles.buttonRow}>
            <ActionButton onPress={handleUnlockWithAccountId}>Unlock with account ID</ActionButton>
            <ActionButton onPress={handleLoadServerState} variant="secondary">
              Load allowlist
            </ActionButton>
          </View>
        </Surface>
      </Section>
    );
  }

  function renderServerAllowlistSection() {
    const allowlistCount = normalizeAccountIds(serverAllowlistText).length;

    return (
      <Section
        description="Keep the allowlist and draft backups in the localhost server, not only in the browser."
        title="Server allowlist">
        <Surface style={styles.panel}>
          <View style={styles.metaRow}>
            <Badge tone={serverState ? 'green' : 'blue'}>{serverState ? 'Loaded' : 'Local copy'}</Badge>
            <Text style={styles.metaText}>
              {serverUrl ? `Server URL: ${serverUrl}` : 'Set the local server URL to sync allowlist data.'}
            </Text>
          </View>
          <Text style={styles.copy}>
            Use one account ID per line. Save this list to the local server, then sync the current draft data when you want the server backup updated.
          </Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Server URL</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setServerUrl}
              placeholder="http://127.0.0.1:8787"
              placeholderTextColor="#6B766F"
              style={styles.input}
              value={serverUrl}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Allowlist account IDs</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              onChangeText={setServerAllowlistText}
              placeholder="one account ID per line"
              placeholderTextColor="#6B766F"
              scrollEnabled
              selectTextOnFocus
              spellCheck={false}
              style={styles.serverEditor}
              value={serverAllowlistText}
            />
          </View>
          <View style={styles.metaRow}>
            <Badge tone="accent">{allowlistCount} allowlist account{allowlistCount === 1 ? '' : 's'}</Badge>
            <Text style={styles.metaText}>
              {serverState?.updatedAt ? `Server updated ${serverState.updatedAt}` : 'No server snapshot loaded yet.'}
            </Text>
          </View>
          {serverError ? <Text style={styles.errorText}>{serverError}</Text> : null}
          {serverMessage ? <Text style={styles.successText}>{serverMessage}</Text> : null}
          <View style={styles.buttonRow}>
            <ActionButton onPress={handleLoadServerState} variant="secondary">
              Refresh state
            </ActionButton>
            <ActionButton onPress={handleSaveServerState}>Save allowlist</ActionButton>
            <ActionButton onPress={handleSyncDraftsToServer} variant="secondary">
              Sync drafts
            </ActionButton>
            <ActionButton onPress={handleCopyServerPacket} variant="ghost">
              Copy packet
            </ActionButton>
          </View>
        </Surface>
      </Section>
    );
  }

  function renderLiveRosterSection() {
    const signupCount = selectedRoster?.signups?.length || 0;

    return (
      <Section
        description="Phase 1 signups are saved in Netlify Database and can be reviewed here before you seed a bracket."
        title="Live signup roster">
        <Surface style={styles.rosterPanel}>
          <View style={styles.metaRow}>
            <Badge tone="green">Phase 1</Badge>
            <Text style={styles.metaText}>Use the tournament admin token to load player registrations.</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Admin token</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setRosterToken}
              placeholder="Netlify TOURNAMENT_ADMIN_TOKEN"
              placeholderTextColor="#6B766F"
              secureTextEntry
              style={styles.input}
              value={rosterToken}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Tournament</Text>
            <View style={styles.tournamentPicker}>
              {siteData.tournaments.map((tournament) => (
                <ActionButton
                  key={tournament.slug}
                  onPress={() => setRosterSlug(tournament.slug)}
                  variant={rosterSlug === tournament.slug ? 'primary' : 'secondary'}>
                  {tournament.title}
                </ActionButton>
              ))}
            </View>
          </View>

          <View style={styles.buttonRow}>
            <ActionButton onPress={handleLoadRoster}>{rosterLoading ? 'Loading...' : 'Load signups'}</ActionButton>
            <ActionButton onPress={handleCopyRoster} variant="secondary">
              Copy roster JSON
            </ActionButton>
          </View>

          {rosterError ? <Text style={styles.errorText}>{rosterError}</Text> : null}
          {rosterMessage ? <Text style={styles.successText}>{rosterMessage}</Text> : null}

          <View style={styles.rosterSummary}>
            <Badge tone={signupCount ? 'green' : 'blue'}>{signupCount} registered</Badge>
            <Text style={styles.metaText}>{selectedRoster?.tournamentSlug || rosterSlug}</Text>
          </View>

          {selectedRoster?.signups?.length ? (
            <View style={styles.signupList}>
              {selectedRoster.signups.map((signup, index) => (
                <View key={signup.id} style={styles.signupRow}>
                  <View style={styles.signupRank}>
                    <Text style={styles.signupRankText}>{index + 1}</Text>
                  </View>
                  <View style={styles.signupCopy}>
                    <Text style={styles.signupName}>{signup.playerName}</Text>
                    <Text style={styles.signupMeta}>
                      {signup.playerHandle || 'No handle'} • {signup.contactEmail}
                    </Text>
                    {signup.notes ? <Text style={styles.signupNotes}>{signup.notes}</Text> : null}
                  </View>
                  <Badge tone="green">{signup.status || 'registered'}</Badge>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              body="Load a tournament roster after players submit the public check-in form."
              title="No signups loaded yet"
            />
          )}
        </Surface>
      </Section>
    );
  }

  function renderBracketManagerSection() {
    const readyMatches = bracket?.rounds
      ?.flatMap((round) => round.matches.map((match) => ({ ...match, roundTitle: round.title })))
      ?.filter((match) => match.players?.filter(Boolean).length === 2) || [];
    const completedCount = bracket?.rounds
      ?.flatMap((round) => round.matches)
      ?.filter((match) => match.status === 'final').length || 0;

    return (
      <Section
        description="Phase 2 creates a public bracket from signups and gives each match a Spades room link."
        title="Bracket manager">
        <Surface style={styles.bracketPanel}>
          <View style={styles.metaRow}>
            <Badge tone={bracket ? 'green' : 'blue'}>{bracket ? bracket.status : 'Not generated'}</Badge>
            <Text style={styles.metaText}>
              Matches open in 1v1spades.com rooms while this hub tracks bracket state and winners.
            </Text>
          </View>

          <View style={styles.buttonRow}>
            <ActionButton onPress={handleLoadBracket} variant="secondary">
              {bracketLoading ? 'Loading...' : 'Load bracket'}
            </ActionButton>
            <ActionButton onPress={handleGenerateBracket}>Generate from signups</ActionButton>
            <ActionButton onPress={handleResetBracket} variant="secondary">
              Reset bracket
            </ActionButton>
            <ActionButton onPress={handleCopyBracket} variant="ghost">
              Copy bracket JSON
            </ActionButton>
          </View>

          {bracketError ? <Text style={styles.errorText}>{bracketError}</Text> : null}
          {bracketMessage ? <Text style={styles.successText}>{bracketMessage}</Text> : null}

          {bracket ? (
            <>
              <View style={styles.rosterSummary}>
                <Badge tone="accent">{bracket.participantCount} players</Badge>
                <Badge tone="green">{completedCount} final</Badge>
                {bracket.winner ? <Badge tone="green">Winner: {bracket.winner.name}</Badge> : null}
              </View>

              <View style={styles.bracketRounds}>
                {bracket.rounds.map((round) => (
                  <View key={round.index} style={styles.bracketRound}>
                    <Text style={styles.bracketRoundTitle}>{round.title}</Text>
                    {round.matches.map((match) => {
                      const players = match.players || [];
                      const canReport = players.filter(Boolean).length === 2;

                      return (
                        <View key={match.id} style={styles.bracketMatchCard}>
                          <View style={styles.metaRow}>
                            <Badge tone={match.status === 'final' ? 'green' : canReport ? 'accent' : 'blue'}>{match.status}</Badge>
                            <Text style={styles.metaText}>{match.label}</Text>
                          </View>
                          <Text style={styles.matchTitle}>
                            {players.map((player) => player?.name || 'TBD').join(' vs ')}
                          </Text>
                          {match.winnerName ? <Text style={styles.signupNotes}>Winner: {match.winnerName}</Text> : null}
                          <Text style={styles.callbackText}>{match.id}</Text>
                          <View style={styles.buttonRow}>
                            <ActionButton external href={match.roomUrl} variant="secondary">
                              Open match room
                            </ActionButton>
                            <ActionButton onPress={() => handleCopyMatchCallback(match)} variant="secondary">
                              Copy callback
                            </ActionButton>
                            {players.filter(Boolean).map((player) => (
                              <ActionButton
                                key={`${match.id}-${player.id}`}
                                onPress={() => handleReportWinner(match, player)}
                                variant={match.winnerId === player.id ? 'primary' : 'ghost'}>
                                {match.winnerId === player.id ? 'Winner' : `Advance ${player.name}`}
                              </ActionButton>
                            ))}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>

              {!readyMatches.length && !bracket.winner ? (
                <Text style={styles.copy}>Waiting for enough players to reach the next match.</Text>
              ) : null}
            </>
          ) : (
            <EmptyState
              body="Load or generate the bracket after at least two players have registered."
              title="No bracket loaded yet"
            />
          )}
        </Surface>
      </Section>
    );
  }

  const actions = [
    { label: 'Home', href: '/' },
    { label: 'Spades', href: getGamePath(siteData.site.primaryGameSlug), variant: 'secondary' },
    { label: 'Rules', href: '/rules', variant: 'ghost' },
  ];

  const modeTone = mode === 'unlocked' ? 'green' : mode === 'locked' ? 'rose' : 'blue';

  if (mode === 'unsupported') {
    return (
      <HubScreen
        actions={actions}
        eyebrow="Private admin"
        footerNote="This browser does not expose local storage, so the private admin flow cannot persist here."
        lead="Open the web preview in a browser with local storage enabled to use the private draft editor."
        stats={[
          { label: 'Mode', value: getModeLabel(mode), tone: 'rose' },
          { label: 'Drafts', value: String(drafts.length), tone: 'accent' },
          { label: 'Storage', value: 'Unavailable', tone: 'rose' },
        ]}
        subtitle="Draft tournament editor"
        title="Private admin unavailable">
        <Section description="The lock is browser-local, so it needs a web browser that can save local data." title="Storage check">
          <EmptyState
            action={<ActionButton href="/">Back home</ActionButton>}
            body="This private admin flow stores the passphrase and draft data in browser storage. Open the web version to use it."
            title="Local storage is not available"
          />
        </Section>
      </HubScreen>
    );
  }

  if (mode === 'setup') {
    return (
      <HubScreen
        actions={actions}
        eyebrow="Private admin"
        footerNote="The server allowlist is the preferred path. Browser-local passphrase access stays as the fallback."
        lead="Unlock with your account ID on the local allowlist server, or create a browser-local fallback on this device."
        stats={[
          { label: 'Mode', value: getModeLabel(mode), tone: modeTone },
          { label: 'Drafts', value: String(drafts.length), tone: 'accent' },
          { label: 'Storage', value: 'Local only', tone: 'blue' },
        ]}
        subtitle="Draft tournament editor"
        title="Set up private access">
        {renderServerUnlockSection()}

        <Section description="Make one passphrase for this browser as a fallback only." title="Fallback access">
          <Surface style={styles.panel}>
            <Text style={styles.copy}>
              This gate is local to the browser on this device. It is helpful when you need a browser-only fallback, but the allowlist server is the preferred path.
            </Text>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Private passphrase</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setCreatePassphrase}
                placeholder="Create a passphrase"
                placeholderTextColor="#6B766F"
                secureTextEntry
                style={styles.input}
                value={createPassphrase}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Confirm passphrase</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setCreateConfirm}
                placeholder="Confirm the passphrase"
                placeholderTextColor="#6B766F"
                secureTextEntry
                style={styles.input}
                value={createConfirm}
              />
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {message ? <Text style={styles.successText}>{message}</Text> : null}
            <View style={styles.buttonRow}>
              <ActionButton onPress={handleCreateAccess}>Create private access</ActionButton>
              <ActionButton href="/" variant="secondary">
                Back home
              </ActionButton>
            </View>
          </Surface>
        </Section>
      </HubScreen>
    );
  }

  if (mode !== 'unlocked') {
    return (
      <HubScreen
        actions={actions}
        eyebrow="Private admin"
        footerNote="The server allowlist is the preferred path. Browser-local passphrase access stays as the fallback."
        lead="Unlock the draft editor with your account ID on the local server, or use the browser-local passphrase fallback."
        stats={[
          { label: 'Mode', value: getModeLabel(mode), tone: modeTone },
          { label: 'Drafts', value: String(drafts.length), tone: 'accent' },
          { label: 'Storage', value: secretExists ? 'Passphrase set' : 'Not ready', tone: 'blue' },
        ]}
        subtitle="Draft tournament editor"
        title="Unlock private admin">
        {renderServerUnlockSection()}

        <Section description="Enter the private passphrase for this browser." title="Unlock">
          <Surface style={styles.panel}>
            <Text style={styles.copy}>
              This screen is the fallback path for admin-only editing when the allowlist server is not available yet.
            </Text>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Private passphrase</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setUnlockPassphrase}
                placeholder="Enter the private passphrase"
                placeholderTextColor="#6B766F"
                secureTextEntry
                style={styles.input}
                value={unlockPassphrase}
              />
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {message ? <Text style={styles.successText}>{message}</Text> : null}
            <View style={styles.buttonRow}>
              <ActionButton onPress={handleUnlock}>Unlock admin</ActionButton>
              <ActionButton href="/" variant="secondary">
                Back home
              </ActionButton>
            </View>
          </Surface>
        </Section>
      </HubScreen>
    );
  }

  return (
    <HubScreen
      actions={actions}
      eyebrow="Private admin"
      footerNote="The server allowlist is the preferred path. Browser-local passphrase access stays as the fallback."
      lead="Draft tournaments can be edited here without changing the public Spades and Euchre gameplay files."
      stats={[
        { label: 'Mode', value: getModeLabel(mode), tone: modeTone },
        { label: 'Drafts', value: String(drafts.length), tone: 'accent' },
        { label: 'Storage', value: 'Browser local', tone: 'green' },
      ]}
      subtitle="Draft tournament editor"
      title="Private admin console">
      <Section
        action={
          <View style={styles.headerActions}>
            <ActionButton onPress={handleAddDraft} variant="secondary">
              Add draft
            </ActionButton>
            <ActionButton onPress={handleCopyDrafts} variant="secondary">
              Copy JSON
            </ActionButton>
            <ActionButton onPress={handleLock} variant="ghost">
              Lock
            </ActionButton>
          </View>
        }
        description="These drafts stay private on this device until you copy them into the final backend later."
        title="Access and tools">
        <Surface style={styles.panel}>
          <View style={styles.metaRow}>
            <Badge tone="green">Unlocked</Badge>
            <Text style={styles.metaText}>Session stays in browser storage until you lock it or clear site data.</Text>
          </View>
          <Text style={styles.copy}>
            Use this page to prepare draft tournaments, then keep the local server allowlist updated so the account-ID unlock stays private.
          </Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {message ? <Text style={styles.successText}>{message}</Text> : null}
        </Surface>
      </Section>

      {renderLiveRosterSection()}

      {renderBracketManagerSection()}

      {renderServerAllowlistSection()}

      <Section description="Pick a draft to preview, then copy the packet you want to hand off later." title="Draft library">
        {drafts.map((draft) => {
          const isSelected = draft.slug === selectedDraft?.slug;

          return (
            <View key={draft.slug} style={styles.cardBlock}>
              <TournamentCard gameName={gameLookup.get(draft.gameSlug)?.name || draft.gameSlug} tournament={draft} />
              <View style={styles.draftActions}>
                <ActionButton onPress={() => handleSelectDraft(draft.slug)} variant={isSelected ? 'primary' : 'secondary'}>
                  {isSelected ? 'Selected' : 'Preview'}
                </ActionButton>
                <ActionButton onPress={() => handleCopyDraftPacket(draft)} variant="ghost">
                  Copy packet
                </ActionButton>
              </View>
            </View>
          );
        })}
        {!drafts.length ? (
          <EmptyState
            action={<ActionButton onPress={handleAddDraft}>Create first draft</ActionButton>}
            body="Add a new draft event and it will appear here immediately."
            title="No drafts yet"
          />
        ) : null}
      </Section>

      <Section
        description="This is the current draft snapshot, plus the check-in and bracket preview tied to it."
        title="Selected draft preview">
        {selectedDraft ? (
          <>
            <Surface style={styles.panel}>
              <View style={styles.metaRow}>
                <Badge tone="green">{selectedDraftIndex >= 0 ? `Draft ${selectedDraftIndex + 1}` : 'Selected draft'}</Badge>
                <Text style={styles.metaText}>
                  This preview stays in the browser-local admin shell and does not reach a production database.
                </Text>
              </View>
              <Text style={styles.copy}>Use this card to review the handoff packet before you sync the local allowlist server.</Text>
              <View style={styles.cardBlock}>
                <TournamentCard gameName={gameLookup.get(selectedDraft.gameSlug)?.name || selectedDraft.gameSlug} tournament={selectedDraft} />
              </View>
              <View style={styles.buttonRow}>
                <ActionButton onPress={handleCopySelectedPacket}>Copy packet</ActionButton>
                <ActionButton href={getGamePath(selectedDraft.gameSlug)} variant="secondary">
                  Open game page
                </ActionButton>
              </View>
            </Surface>

            <View style={styles.cardBlock}>
              <CheckInPanel checkIn={selectedDraft.checkIn} />
            </View>

            <View style={styles.cardBlock}>
              <BracketBoard bracket={selectedDraft.bracket} />
            </View>

            <Surface style={styles.editorCard}>
              <Text style={styles.copy}>Packet preview</Text>
              <TextInput
                editable={false}
                multiline
                scrollEnabled
                selectTextOnFocus
                style={styles.packetBox}
                value={selectedDraftPacketText}
              />
            </Surface>
          </>
        ) : (
          <EmptyState
            action={<ActionButton onPress={handleAddDraft}>Create first draft</ActionButton>}
            body="Select or create a draft to show the preview packet, check-in block, and bracket placeholder."
            title="No selected draft"
          />
        )}
      </Section>

      <Section description="Edit the local JSON payload directly if you want a quick placeholder workflow." title="JSON editor">
        <Surface style={styles.editorCard}>
          <Text style={styles.copy}>
            The editor keeps the data portable. Save the JSON locally, then move it into a real backend when the admin flow is ready.
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            onChangeText={setEditorValue}
            placeholder="Paste draft tournament JSON here"
            placeholderTextColor="#6B766F"
            scrollEnabled
            selectTextOnFocus
            spellCheck={false}
            style={styles.editor}
            value={editorValue}
          />
          <View style={styles.buttonRow}>
            <ActionButton onPress={handleSaveDrafts}>Save drafts</ActionButton>
            <ActionButton onPress={handleResetDrafts} variant="secondary">
              Reset seed
            </ActionButton>
          </View>
        </Surface>
      </Section>

      <Section description="The local admin server keeps the allowlist in a JSON file inside this hub folder." title="Server notes">
        <Surface style={styles.panel}>
          <Text style={styles.copy}>
            Run `npm run admin:server` to serve the allowlist JSON from `.data/admin-state.json`. Keep the account-ID unlock as the preferred path and use the browser passphrase only as a fallback.
          </Text>
          <View style={styles.metaRow}>
            <Badge tone="blue">{secretExists ? 'Fallback ready' : 'No fallback yet'}</Badge>
            <Text style={styles.metaText}>Account IDs live on the local server instead of in the browser secret store.</Text>
          </View>
          <View style={styles.buttonRow}>
            <ActionButton href={getTournamentPath(siteData.site.primaryTournamentSlug)} variant="secondary">
              Open featured event
            </ActionButton>
            <ActionButton href={getGamePath(siteData.site.primaryGameSlug)} variant="ghost">
              Open /spades
            </ActionButton>
          </View>
        </Surface>
      </Section>
    </HubScreen>
  );
}

const styles = StyleSheet.create({
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  cardBlock: {
    marginBottom: 14,
  },
  draftActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  copy: {
    color: '#AAB4AE',
    fontSize: 14,
    lineHeight: 21,
  },
  editor: {
    color: '#F4EFE6',
    minHeight: 260,
    marginTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(244, 239, 230, 0.12)',
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    fontFamily: CODE_FONT,
    fontSize: 12,
    lineHeight: 18,
    textAlignVertical: 'top',
  },
  serverEditor: {
    color: '#F4EFE6',
    minHeight: 160,
    marginTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(244, 239, 230, 0.12)',
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    fontFamily: CODE_FONT,
    fontSize: 12,
    lineHeight: 18,
    textAlignVertical: 'top',
  },
  editorCard: {
    borderColor: 'rgba(108, 199, 255, 0.24)',
  },
  packetBox: {
    color: '#F4EFE6',
    minHeight: 220,
    marginTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(244, 239, 230, 0.12)',
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    fontFamily: CODE_FONT,
    fontSize: 12,
    lineHeight: 18,
    textAlignVertical: 'top',
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
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  metaText: {
    color: '#AAB4AE',
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  panel: {
    borderColor: 'rgba(108, 199, 255, 0.24)',
  },
  rosterPanel: {
    borderColor: 'rgba(97, 210, 145, 0.30)',
  },
  bracketPanel: {
    borderColor: 'rgba(214, 162, 78, 0.30)',
  },
  bracketRounds: {
    marginTop: 16,
  },
  bracketRound: {
    marginBottom: 14,
  },
  bracketRoundTitle: {
    color: '#F4EFE6',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  bracketMatchCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
  },
  matchTitle: {
    color: '#F4EFE6',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
    marginTop: 8,
  },
  callbackText: {
    color: '#AAB4AE',
    fontFamily: CODE_FONT,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  rosterSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 18,
  },
  signupCopy: {
    flex: 1,
    minWidth: 0,
  },
  signupList: {
    marginTop: 14,
  },
  signupMeta: {
    color: '#AAB4AE',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  signupName: {
    color: '#F4EFE6',
    fontSize: 16,
    fontWeight: '800',
  },
  signupNotes: {
    color: '#D6A24E',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  signupRank: {
    alignItems: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.17)',
    borderColor: 'rgba(214, 162, 78, 0.30)',
    borderRadius: 999,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    marginRight: 12,
    width: 36,
  },
  signupRankText: {
    color: '#F4EFE6',
    fontFamily: CODE_FONT,
    fontSize: 13,
    fontWeight: '800',
  },
  signupRow: {
    alignItems: 'center',
    borderTopColor: 'rgba(244, 239, 230, 0.10)',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
  },
  successText: {
    color: '#61D291',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
    fontWeight: '700',
  },
  tournamentPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});

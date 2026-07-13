import { useEffect, useMemo, useState } from 'react';
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
import { getCheckInPath, getGamePath, getGames, getTournamentPath, siteData } from '../lib/siteData.js';
import { createTournamentRecord, mergeTournamentLists, slugifyTournamentTitle } from '../lib/tournamentCatalog.js';
import {
  canGenerateTournamentMode,
  getTournamentMode,
  TOURNAMENT_MODES,
} from '../lib/tournamentModes.js';
import {
  dateToScheduleFields,
  getRegistrationStatusMeta,
  getScheduleFieldDefaults,
  mergeTournamentSettings,
  REGISTRATION_STATUS_OPTIONS,
  zonedDateTimeToIso,
} from '../lib/tournamentSettings.js';
import {
  clearTournamentData,
  deleteTournamentEvent,
  fetchPlayerAccount,
  fetchTournamentBracket,
  fetchTournamentEvents,
  fetchTournamentRoster,
  fetchTournamentSettings,
  generateTournamentBracket,
  reportTournamentMatchWinner,
  resetTournamentSettings,
  resetTournamentBracket,
  fetchStreamCommands,
  resetStreamCommands,
  saveTournamentEvent,
  saveStreamCommands,
  saveTournamentSettings,
} from '../lib/tournamentHostingClient.js';
import { STREAM_COMMAND_ENDPOINT, buildDefaultStreamCommands } from '../lib/streamCommands.js';
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

function formatHostDateTime(tournament) {
  const startDate = new Date(tournament?.date);

  if (Number.isNaN(startDate.getTime())) {
    return 'Start time needs to be set';
  }

  return startDate.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tournament?.timeZone || 'America/New_York',
    timeZoneName: 'short',
  });
}

function getStartTimingLabel(tournament) {
  const startDate = new Date(tournament?.date);

  if (Number.isNaN(startDate.getTime())) {
    return 'No start time';
  }

  const diffMs = startDate.getTime() - Date.now();
  const absMinutes = Math.max(1, Math.round(Math.abs(diffMs) / 60000));

  if (diffMs < 0) {
    if (absMinutes < 60) return `Started ${absMinutes} min ago`;
    return `Started ${Math.round(absMinutes / 60)} hr ago`;
  }

  if (absMinutes < 60) return `Starts in ${absMinutes} min`;
  if (absMinutes < 1440) return `Starts in ${Math.round(absMinutes / 60)} hr`;
  return `Starts in ${Math.round(absMinutes / 1440)} days`;
}

function getBracketPreviewLabel(signupCount, tournament) {
  const minimumPlayers = tournament?.minimumPlayers || 2;
  const rosterCap = tournament?.rosterCap || 0;

  if (signupCount < minimumPlayers) {
    return `Needs ${minimumPlayers} players`;
  }

  if (signupCount <= 2) return '2-player final';
  if (signupCount <= 4) return '4-player bracket';
  if (!rosterCap || signupCount <= rosterCap) return `${rosterCap || signupCount}-player bracket`;
  return `${signupCount} signed up, over target`;
}

function getRosterPolicyLabel(tournament, mode) {
  if (mode?.value === 'four-player-double-elimination') {
    return 'Exactly 4 players enter. Lose twice and you are out.';
  }

  if (mode?.value === 'three-player-two-life') {
    return 'Exactly 3 players enter. Everyone starts with two lives.';
  }

  const rosterCap = tournament?.rosterCap || 'an open';
  const minimumPlayers = tournament?.minimumPlayers || mode?.minimumPlayers || 2;
  return `Advertise ${rosterCap}-player seats, run with ${minimumPlayers}+ players, and let the actual bracket flex to the roster that shows up.`;
}

function canGenerateWithSignupCount(mode, signupCount) {
  if (mode?.value === 'four-player-double-elimination') {
    return signupCount === 4;
  }

  if (mode?.value === 'three-player-two-life') {
    return signupCount === 3;
  }

  return signupCount >= (mode?.minimumPlayers || 2);
}

function getBracketReadiness({ bracket, hasHostCredential, selectedMode, selectedRoster, signupCount }) {
  const modeCanGenerate = canGenerateTournamentMode(selectedMode.value);
  const needsExactFour = selectedMode.value === 'four-player-double-elimination';
  const needsExactThree = selectedMode.value === 'three-player-two-life';
  const playerReady = needsExactFour
    ? signupCount === 4
    : needsExactThree
      ? signupCount === 3
    : signupCount >= selectedMode.minimumPlayers;
  const playerRequirement = needsExactFour
    ? 'Exactly 4 players'
    : needsExactThree
      ? 'Exactly 3 players'
    : `${selectedMode.minimumPlayers}+ players`;
  const checks = [
    {
      label: 'Host access',
      ready: hasHostCredential,
      body: hasHostCredential ? 'Host controls are unlocked.' : 'Sign in as host or paste the fallback token.',
    },
    {
      label: 'Roster',
      ready: Boolean(selectedRoster),
      body: selectedRoster ? 'Roster has been refreshed for this event.' : 'Refresh roster before generating.',
    },
    {
      label: 'Mode',
      ready: modeCanGenerate,
      body: modeCanGenerate ? `${selectedMode.label} can generate brackets.` : `${selectedMode.label} is saved but not wired yet.`,
    },
    {
      label: 'Players',
      ready: playerReady,
      body: needsExactFour
        ? `${signupCount}/4 registered. Double elimination needs exactly four.`
        : needsExactThree
          ? `${signupCount}/3 registered. Two-life needs exactly three.`
        : `${signupCount}/${selectedMode.minimumPlayers} minimum registered.`,
    },
  ];
  const firstBlocker = checks.find((check) => !check.ready);
  const ready = !bracket && !firstBlocker;

  if (bracket) {
    return {
      body: `${bracket.participantCount || signupCount} players seeded. Refresh the bracket after reporting match winners.`,
      checks,
      label: 'Published',
      ready: true,
      title: 'Bracket is live',
      tone: 'green',
    };
  }

  if (ready) {
    return {
      body: `${selectedMode.label} is ready with ${signupCount} registered players.`,
      checks,
      label: 'Ready',
      ready,
      title: 'Ready to generate',
      tone: 'green',
    };
  }

  return {
    body: firstBlocker?.body || 'Complete the setup checks before generating.',
    checks,
    label: playerRequirement,
    ready: false,
    title: firstBlocker ? `${firstBlocker.label} needed` : 'Setup needed',
    tone: 'accent',
  };
}

function numberField(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
  const initialScheduleDefaults = getScheduleFieldDefaults(
    siteData.tournaments.find((tournament) => tournament.slug === rosterSlug) || siteData.tournaments[0],
  );
  const [scheduleSettings, setScheduleSettings] = useState(null);
  const [scheduleDate, setScheduleDate] = useState(() => initialScheduleDefaults.date);
  const [scheduleTime, setScheduleTime] = useState(() => initialScheduleDefaults.time);
  const [scheduleTimeZone, setScheduleTimeZone] = useState(() => initialScheduleDefaults.timeZone);
  const [scheduleTimeZoneLabel, setScheduleTimeZoneLabel] = useState(() => initialScheduleDefaults.timeZoneLabel);
  const [scheduleRegistrationStatus, setScheduleRegistrationStatus] = useState(() => initialScheduleDefaults.registrationStatus);
  const [scheduleCheckInLeadMinutes, setScheduleCheckInLeadMinutes] = useState(() => initialScheduleDefaults.checkInLeadMinutes);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [hostedTournaments, setHostedTournaments] = useState([]);
  const [eventTitle, setEventTitle] = useState(() => initialScheduleDefaults.title || siteData.tournaments[0]?.title || '');
  const [eventSlug, setEventSlug] = useState(() => siteData.site.primaryTournamentSlug || siteData.tournaments[0]?.slug || '');
  const [eventSummary, setEventSummary] = useState(() => siteData.tournaments[0]?.detail || siteData.tournaments[0]?.summary || '');
  const [eventMode, setEventMode] = useState(() => siteData.tournaments[0]?.mode || 'single-elimination');
  const [eventRosterCap, setEventRosterCap] = useState(() => String(siteData.tournaments[0]?.rosterCap || 8));
  const [eventMinimumPlayers, setEventMinimumPlayers] = useState(() => String(siteData.tournaments[0]?.minimumPlayers || 2));
  const [eventSaving, setEventSaving] = useState(false);
  const [eventMessage, setEventMessage] = useState('');
  const [eventError, setEventError] = useState('');
  const [rosters, setRosters] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterMessage, setRosterMessage] = useState('');
  const [rosterError, setRosterError] = useState('');
  const [rosterLastRefreshedAt, setRosterLastRefreshedAt] = useState('');
  const [bracket, setBracket] = useState(null);
  const [bracketLoading, setBracketLoading] = useState(false);
  const [bracketMessage, setBracketMessage] = useState('');
  const [bracketError, setBracketError] = useState('');
  const [hostMessage, setHostMessage] = useState('');
  const [hostError, setHostError] = useState('');
  const [streamCommandText, setStreamCommandText] = useState(() => JSON.stringify(buildDefaultStreamCommands(), null, 2));
  const [streamCommandLoading, setStreamCommandLoading] = useState(false);
  const [streamCommandMessage, setStreamCommandMessage] = useState('');
  const [streamCommandError, setStreamCommandError] = useState('');
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [playerAccount, setPlayerAccount] = useState(null);
  const [playerAccountLoading, setPlayerAccountLoading] = useState(true);
  const [playerAccountError, setPlayerAccountError] = useState('');
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
    () => rosters.find((roster) => roster.tournamentSlug === rosterSlug) || null,
    [rosters, rosterSlug],
  );
  const adminTournaments = useMemo(
    () => mergeTournamentLists(siteData.tournaments, hostedTournaments),
    [hostedTournaments],
  );
  const selectedTournament = useMemo(
    () => adminTournaments.find((tournament) => tournament.slug === rosterSlug) || adminTournaments[0] || null,
    [adminTournaments, rosterSlug],
  );
  const liveTournament = useMemo(
    () => mergeTournamentSettings(selectedTournament, scheduleSettings),
    [selectedTournament, scheduleSettings],
  );
  const liveRegistrationMeta = getRegistrationStatusMeta(liveTournament?.registrationStatus);
  const isHostApproved = Boolean(playerAccount?.hostApproved);
  const hasPrivateAdminAccess = mode === 'unlocked';
  const showDraftTools = hasPrivateAdminAccess && !isHostApproved;
  const canShowHostConsole = isHostApproved || hasPrivateAdminAccess;
  const hasHostCredential = Boolean(isHostApproved || rosterToken.trim());
  const activeTournamentMode = getTournamentMode(liveTournament?.mode);
  const activeSignupCount = selectedRoster?.signups?.length || 0;
  const bracketReadiness = getBracketReadiness({
    bracket,
    hasHostCredential,
    selectedMode: activeTournamentMode,
    selectedRoster,
    signupCount: activeSignupCount,
  });

  useEffect(() => {
    let active = true;

    async function loadPlayerAccount() {
      setPlayerAccountLoading(true);
      setPlayerAccountError('');

      try {
        const result = await fetchPlayerAccount();

        if (active) {
          setPlayerAccount(result.account || null);
        }
      } catch (loadError) {
        if (active) {
          setPlayerAccount(null);
          setPlayerAccountError(loadError instanceof Error ? loadError.message : 'Player account could not be loaded.');
        }
      } finally {
        if (active) {
          setPlayerAccountLoading(false);
        }
      }
    }

    loadPlayerAccount();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadHostedTournaments() {
      try {
        const result = await fetchTournamentEvents();

        if (active) {
          setHostedTournaments(result.tournaments || []);
        }
      } catch {
        if (active) {
          setHostedTournaments([]);
        }
      }
    }

    loadHostedTournaments();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTournament) {
      return undefined;
    }

    let active = true;

    async function loadScheduleSettings() {
      setScheduleSettings(null);
      applyEventFields(selectedTournament);
      applyScheduleFields(selectedTournament, null);
      setScheduleLoading(true);
      setScheduleFeedback('', '');
      setEventFeedback('', '');

      try {
        const result = await fetchTournamentSettings({ slug: selectedTournament.slug });

        if (!active) {
          return;
        }

        setScheduleSettings(result.settings || null);
        applyScheduleFields(selectedTournament, result.settings || null);
        setScheduleFeedback(result.settings ? 'Loaded saved schedule settings.' : 'Using seeded schedule defaults.', '');
      } catch (loadError) {
        if (active) {
          setScheduleSettings(null);
          applyScheduleFields(selectedTournament, null);
          setScheduleFeedback('', loadError instanceof Error ? loadError.message : 'Could not load tournament schedule settings.');
        }
      } finally {
        if (active) {
          setScheduleLoading(false);
        }
      }
    }

    loadScheduleSettings();

    return () => {
      active = false;
    };
  }, [selectedTournament]);

  function setFeedback(nextMessage = '', nextError = '') {
    setMessage(nextMessage);
    setError(nextError);
  }

  function setServerFeedback(nextMessage = '', nextError = '') {
    setServerMessage(nextMessage);
    setServerError(nextError);
  }

  function setScheduleFeedback(nextMessage = '', nextError = '') {
    setScheduleMessage(nextMessage);
    setScheduleError(nextError);
  }

  function setEventFeedback(nextMessage = '', nextError = '') {
    setEventMessage(nextMessage);
    setEventError(nextError);
  }

  function setRosterFeedback(nextMessage = '', nextError = '') {
    setRosterMessage(nextMessage);
    setRosterError(nextError);
  }

  function setBracketFeedback(nextMessage = '', nextError = '') {
    setBracketMessage(nextMessage);
    setBracketError(nextError);
  }

  function setHostFeedback(nextMessage = '', nextError = '') {
    setHostMessage(nextMessage);
    setHostError(nextError);
  }

  function setStreamCommandFeedback(nextMessage = '', nextError = '') {
    setStreamCommandMessage(nextMessage);
    setStreamCommandError(nextError);
  }

  function applyScheduleFields(tournament, settings = null) {
    const mergedTournament = mergeTournamentSettings(tournament, settings);
    const fields = dateToScheduleFields(mergedTournament?.date, mergedTournament?.timeZone);

    setScheduleDate(fields.date);
    setScheduleTime(fields.time);
    setScheduleTimeZone(mergedTournament?.timeZone || 'America/New_York');
    setScheduleTimeZoneLabel(mergedTournament?.timeZoneLabel || 'ET');
    setScheduleRegistrationStatus(mergedTournament?.registrationStatus || 'open');
    setScheduleCheckInLeadMinutes(String(mergedTournament?.checkInLeadMinutes ?? 30));
  }

  function applyEventFields(tournament) {
    if (!tournament) {
      return;
    }

    setEventTitle(tournament.title || '');
    setEventSlug(tournament.slug || '');
    setEventSummary(tournament.detail || tournament.summary || '');
    setEventMode(getTournamentMode(tournament.mode).value);
    setEventRosterCap(String(tournament.rosterCap || 8));
    setEventMinimumPlayers(String(tournament.minimumPlayers || 2));
  }

  function handleChangeEventTitle(value) {
    setEventTitle(value);
    setEventSlug(slugifyTournamentTitle(value));
  }

  function handleNewTournamentDraft() {
    const draftTitle = `Spades tournament ${adminTournaments.length + 1}`;

    setEventTitle(draftTitle);
    setEventSlug(slugifyTournamentTitle(draftTitle));
    setEventSummary('A free-entry Spades bracket with account signup, hosted match links, and posted results.');
    setEventMode('single-elimination');
    setEventRosterCap('8');
    setEventMinimumPlayers('2');
    setScheduleDate('');
    setScheduleTime('20:00');
    setScheduleTimeZone('America/New_York');
    setScheduleTimeZoneLabel('ET');
    setScheduleRegistrationStatus('open');
    setScheduleCheckInLeadMinutes('30');
    setEventFeedback('Fill in the event title, date, and start time, then save the tournament.', '');
    setScheduleFeedback('', '');
  }

  function handleSelectEventMode(value) {
    const selectedMode = getTournamentMode(value);

    setEventMode(selectedMode.value);
    setEventRosterCap(String(selectedMode.rosterCap));
    setEventMinimumPlayers(String(selectedMode.minimumPlayers));
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

  async function handleSaveTournamentEvent() {
    const token = rosterToken.trim();
    const title = eventTitle.trim();
    const slug = slugifyTournamentTitle(eventSlug || title);

    if (!hasHostCredential) {
      setEventFeedback('', 'Sign in with a host-approved account or enter the fallback token before saving a tournament.');
      return;
    }

    if (!title) {
      setEventFeedback('', 'Enter a tournament title before saving.');
      return;
    }

    if (!slug) {
      setEventFeedback('', 'Enter a URL slug before saving.');
      return;
    }

    let date;

    try {
      date = zonedDateTimeToIso(scheduleDate, scheduleTime, scheduleTimeZone.trim() || 'America/New_York');
    } catch (saveError) {
      setEventFeedback('', saveError instanceof Error ? saveError.message : 'Enter a valid schedule date and time.');
      return;
    }

    setEventSaving(true);
    setEventFeedback('', '');
    setScheduleFeedback('', '');

    const selectedMode = getTournamentMode(eventMode);
    const rosterCap = numberField(eventRosterCap, selectedTournament?.rosterCap || 8);
    const minimumPlayers = Math.min(numberField(eventMinimumPlayers, selectedTournament?.minimumPlayers || 2), rosterCap);
    const tournamentPayload = createTournamentRecord({
      ...(selectedTournament || {}),
      bracketFlexPolicy: '',
      slug,
      title,
      mode: selectedMode.value,
      format: selectedMode.format,
      date,
      timeZone: scheduleTimeZone.trim() || 'America/New_York',
      timeZoneLabel: scheduleTimeZoneLabel.trim() || 'ET',
      registrationStatus: scheduleRegistrationStatus,
      checkInLeadMinutes: scheduleCheckInLeadMinutes,
      detail: eventSummary,
      summary: eventSummary,
      rosterCap,
      minimumPlayers,
      badge: selectedTournament?.badge || 'Host event',
      status: 'upcoming',
      links: [],
    });

    try {
      const eventResult = await saveTournamentEvent({
        token,
        tournament: tournamentPayload,
      });
      const settingsResult = await saveTournamentSettings({
        token,
        slug: tournamentPayload.slug,
        settings: {
          tournamentSlug: tournamentPayload.slug,
          date,
          timeZone: tournamentPayload.timeZone,
          timeZoneLabel: tournamentPayload.timeZoneLabel,
          registrationStatus: scheduleRegistrationStatus,
          checkInLeadMinutes: scheduleCheckInLeadMinutes,
        },
      });
      const savedTournament = eventResult.tournament || tournamentPayload;

      setHostedTournaments(eventResult.tournaments || [savedTournament]);
      setRosterSlug(savedTournament.slug);
      setEventSlug(savedTournament.slug);
      setScheduleSettings(settingsResult.settings || null);
      applyEventFields(savedTournament);
      applyScheduleFields(savedTournament, settingsResult.settings || null);
      setEventFeedback(`${savedTournament.title} is saved and public.`, '');
      setScheduleFeedback('Schedule and registration settings saved for this event.', '');
    } catch (saveError) {
      setEventFeedback('', saveError instanceof Error ? saveError.message : 'Could not save the tournament event.');
    } finally {
      setEventSaving(false);
    }
  }

  async function handleSaveScheduleSettings() {
    const token = rosterToken.trim();

    if (!hasHostCredential) {
      setScheduleFeedback('', 'Sign in with a host-approved account or enter the fallback token before saving schedule settings.');
      return;
    }

    let date;

    try {
      date = zonedDateTimeToIso(scheduleDate, scheduleTime, scheduleTimeZone.trim() || 'America/New_York');
    } catch (saveError) {
      setScheduleFeedback('', saveError instanceof Error ? saveError.message : 'Enter a valid schedule date and time.');
      return;
    }

    setScheduleLoading(true);
    setScheduleFeedback('', '');

    try {
      const result = await saveTournamentSettings({
        token,
        slug: rosterSlug,
        settings: {
          tournamentSlug: rosterSlug,
          date,
          timeZone: scheduleTimeZone.trim() || 'America/New_York',
          timeZoneLabel: scheduleTimeZoneLabel.trim() || 'ET',
          registrationStatus: scheduleRegistrationStatus,
          checkInLeadMinutes: scheduleCheckInLeadMinutes,
        },
      });

      setScheduleSettings(result.settings || null);
      applyScheduleFields(selectedTournament, result.settings || null);
      setScheduleFeedback('Schedule and registration settings saved.', '');
    } catch (saveError) {
      setScheduleFeedback('', saveError instanceof Error ? saveError.message : 'Could not save tournament schedule settings.');
    } finally {
      setScheduleLoading(false);
    }
  }

  async function handleResetScheduleSettings() {
    const token = rosterToken.trim();

    if (!hasHostCredential) {
      setScheduleFeedback('', 'Sign in with a host-approved account or enter the fallback token before resetting schedule settings.');
      return;
    }

    setScheduleLoading(true);
    setScheduleFeedback('', '');

    try {
      await resetTournamentSettings({ token, slug: rosterSlug });
      setScheduleSettings(null);
      applyScheduleFields(selectedTournament, null);
      setScheduleFeedback('Schedule override reset to the seeded tournament defaults.', '');
    } catch (resetError) {
      setScheduleFeedback('', resetError instanceof Error ? resetError.message : 'Could not reset tournament schedule settings.');
    } finally {
      setScheduleLoading(false);
    }
  }

  function handleRequestArchiveTournament() {
    if (!hasHostCredential) {
      setHostFeedback('', 'Sign in with a host-approved account or enter the fallback token before archiving a tournament.');
      return;
    }

    setArchiveConfirmOpen(true);
    setHostFeedback('', '');
  }

  function handleCancelArchiveTournament() {
    setArchiveConfirmOpen(false);
    setHostFeedback('', '');
  }

  async function handleArchiveTournament() {
    const token = rosterToken.trim();
    const tournament = liveTournament || selectedTournament;

    if (archiveLoading) {
      return;
    }

    if (!hasHostCredential) {
      setHostFeedback('', 'Sign in with a host-approved account or enter the fallback token before archiving a tournament.');
      return;
    }

    if (!tournament?.slug) {
      setHostFeedback('', 'Choose a tournament before archiving it.');
      return;
    }

    setArchiveLoading(true);
    setHostFeedback('', '');
    setEventFeedback('', '');
    setScheduleFeedback('', '');

    try {
      const archivedTournament = createTournamentRecord({
        ...tournament,
        status: 'archived',
        registrationStatus: 'closed',
      });
      const [eventResult, settingsResult] = await Promise.all([
        saveTournamentEvent({
          token,
          tournament: archivedTournament,
        }),
        saveTournamentSettings({
          token,
          slug: archivedTournament.slug,
          settings: {
            tournamentSlug: archivedTournament.slug,
            date: archivedTournament.date,
            timeZone: archivedTournament.timeZone,
            timeZoneLabel: archivedTournament.timeZoneLabel,
            registrationStatus: 'closed',
            checkInLeadMinutes: archivedTournament.checkInLeadMinutes,
          },
        }),
      ]);
      const savedTournament = eventResult.tournament || archivedTournament;

      setHostedTournaments(eventResult.tournaments || [savedTournament]);
      setRosterSlug(savedTournament.slug);
      setEventSlug(savedTournament.slug);
      setScheduleSettings(settingsResult.settings || null);
      applyEventFields(savedTournament);
      applyScheduleFields(savedTournament, settingsResult.settings || null);
      setArchiveConfirmOpen(false);
      setEventFeedback(`${savedTournament.title} is archived and hidden from upcoming tournament surfaces.`, '');
      setScheduleFeedback('Registration is closed for the archived event.', '');
      setHostFeedback('Tournament archived. Roster, bracket, results, and player accounts were kept.', '');
    } catch (archiveError) {
      setHostFeedback('', archiveError instanceof Error ? archiveError.message : 'Could not archive this tournament.');
    } finally {
      setArchiveLoading(false);
    }
  }

  function renderScheduleSection() {
    const tournament = liveTournament || selectedTournament;
    const isArchived = tournament?.status === 'archived';
    const signupCount = activeSignupCount;
    const rosterCap = tournament?.rosterCap || 0;
    const minimumPlayers = tournament?.minimumPlayers || 2;
    const tournamentPath = getTournamentPath(rosterSlug);
    const signupPath = getCheckInPath(rosterSlug);
    const bracketLabel = bracket?.participantCount
      ? `${bracket.participantCount} seeded`
      : getBracketPreviewLabel(signupCount, tournament);
    const playerCountReady = canGenerateWithSignupCount(activeTournamentMode, signupCount);
    const nextHostAction = !hasHostCredential
      ? 'Confirm host access first.'
      : isArchived
        ? 'Archived events are hidden from upcoming pages. Save event to publish it again.'
      : !playerCountReady
        ? 'Edit the event, save it, then share the signup link.'
        : bracket
          ? 'Send players to My Match and monitor results.'
          : bracketReadiness.ready
            ? 'Generate the bracket when the roster is ready.'
            : bracketReadiness.body;
    const publisherStats = [
      { label: 'Start', value: getStartTimingLabel(tournament), tone: 'accent' },
      { label: 'Registered', value: `${signupCount}${rosterCap ? ` / ${rosterCap}` : ''}`, tone: signupCount >= minimumPlayers ? 'green' : 'blue' },
      { label: 'Bracket', value: bracketLabel, tone: bracket ? 'green' : 'accent' },
      { label: 'Mode', value: activeTournamentMode.shortLabel, tone: canGenerateTournamentMode(activeTournamentMode.value) ? 'green' : 'accent' },
      { label: 'Visibility', value: isArchived ? 'Archived' : 'Public', tone: isArchived ? 'rose' : 'green' },
      { label: 'Status', value: liveRegistrationMeta.label, tone: liveRegistrationMeta.tone },
      { label: 'Check-in', value: `${scheduleCheckInLeadMinutes || 30} min`, tone: 'blue' },
    ];

    return (
      <Section
        action={<ActionButton href="/" variant="secondary">Home</ActionButton>}
        description="Pick the event, set the start time, open or close registration, then run the roster from the same screen."
        nativeID="edit-tournament"
        title="Edit selected tournament">
        <Surface style={styles.publisherPanel}>
          <View style={styles.publisherHero}>
            <View style={styles.publisherCopy}>
              <View style={styles.metaRow}>
                <Badge tone="accent">Host command center</Badge>
                <Text style={styles.publisherKicker}>{nextHostAction}</Text>
              </View>
              <Text style={styles.publisherTitle}>{tournament?.title || rosterSlug}</Text>
              <Text style={styles.publisherDate}>{formatHostDateTime(tournament)}</Text>
              <Text style={styles.copy}>
                {getRosterPolicyLabel(tournament, activeTournamentMode)}
              </Text>
            </View>

            <View style={styles.publisherStatGrid}>
              {publisherStats.map((stat) => (
                <View key={stat.label} style={[styles.publisherStat, styles[`publisherStat${stat.tone[0].toUpperCase()}${stat.tone.slice(1)}`]]}>
                  <Text style={styles.publisherStatLabel}>{stat.label}</Text>
                  <Text style={styles.publisherStatValue}>{stat.value}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Tournament to manage</Text>
            <View style={styles.tournamentPicker}>
              {adminTournaments.map((tournamentOption) => (
                <ActionButton
                  key={tournamentOption.slug}
                  onPress={() => setRosterSlug(tournamentOption.slug)}
                  variant={rosterSlug === tournamentOption.slug ? 'primary' : 'secondary'}>
                  {tournamentOption.title}
                </ActionButton>
              ))}
              <ActionButton onPress={handleNewTournamentDraft} variant="secondary">
                New tournament
              </ActionButton>
            </View>
          </View>

          <View style={styles.eventEditorPanel}>
            <View style={styles.metaRow}>
              <Badge tone="accent">Event details</Badge>
              <Text style={styles.metaText}>These fields control what players see on the homepage, signup page, and tournament page.</Text>
            </View>

            <View style={styles.scheduleGrid}>
              <View style={styles.scheduleField}>
                <Text style={styles.fieldLabel}>Tournament title</Text>
                <TextInput
                  autoCapitalize="words"
                  autoCorrect
                  onChangeText={handleChangeEventTitle}
                  placeholder="Spades Friday Night Cup"
                  placeholderTextColor="#6B766F"
                  style={styles.input}
                  value={eventTitle}
                />
              </View>
              <View style={styles.scheduleField}>
                <Text style={styles.fieldLabel}>Public URL slug</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setEventSlug}
                  placeholder="spades-friday-night-cup"
                  placeholderTextColor="#6B766F"
                  style={styles.input}
                  value={eventSlug}
                />
              </View>
              <View style={styles.scheduleField}>
                <Text style={styles.fieldLabel}>Advertised seats</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  inputMode="numeric"
                  onChangeText={setEventRosterCap}
                  placeholder="8"
                  placeholderTextColor="#6B766F"
                  style={styles.input}
                  value={eventRosterCap}
                />
              </View>
              <View style={styles.scheduleField}>
                <Text style={styles.fieldLabel}>Minimum to run</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  inputMode="numeric"
                  onChangeText={setEventMinimumPlayers}
                  placeholder="2"
                  placeholderTextColor="#6B766F"
                  style={styles.input}
                  value={eventMinimumPlayers}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Tournament mode</Text>
              <View style={styles.tournamentPicker}>
                {TOURNAMENT_MODES.map((option) => (
                  <ActionButton
                    key={option.value}
                    onPress={() => handleSelectEventMode(option.value)}
                    variant={eventMode === option.value ? 'primary' : 'secondary'}>
                    {option.shortLabel}
                  </ActionButton>
                ))}
              </View>
              <View style={styles.modeInfoGrid}>
                {TOURNAMENT_MODES.map((option) => (
                  <View key={option.value} style={[styles.modeInfoCard, eventMode === option.value && styles.modeInfoCardActive]}>
                    <View style={styles.metaRow}>
                      <Badge tone={option.generation === 'live' ? 'green' : 'blue'}>
                        {option.generation === 'live' ? 'Ready now' : 'Wire next'}
                      </Badge>
                      <Text style={styles.modeInfoTitle}>{option.label}</Text>
                    </View>
                    <Text style={styles.metaText}>{option.summary}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Public event summary</Text>
              <TextInput
                multiline
                onChangeText={setEventSummary}
                placeholder="What players should know before they sign up"
                placeholderTextColor="#6B766F"
                style={styles.notesInput}
                value={eventSummary}
              />
            </View>
          </View>

          <View style={styles.scheduleGrid}>
            <View style={styles.scheduleField}>
              <Text style={styles.fieldLabel}>Date</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setScheduleDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#6B766F"
                style={styles.input}
                value={scheduleDate}
              />
            </View>
            <View style={styles.scheduleField}>
              <Text style={styles.fieldLabel}>Start time</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setScheduleTime}
                placeholder="18:00"
                placeholderTextColor="#6B766F"
                style={styles.input}
                value={scheduleTime}
              />
            </View>
            <View style={styles.scheduleField}>
              <Text style={styles.fieldLabel}>Time zone</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setScheduleTimeZone}
                placeholder="America/New_York"
                placeholderTextColor="#6B766F"
                style={styles.input}
                value={scheduleTimeZone}
              />
            </View>
            <View style={styles.scheduleField}>
              <Text style={styles.fieldLabel}>Time label</Text>
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                onChangeText={setScheduleTimeZoneLabel}
                placeholder="ET"
                placeholderTextColor="#6B766F"
                style={styles.input}
                value={scheduleTimeZoneLabel}
              />
            </View>
            <View style={styles.scheduleField}>
              <Text style={styles.fieldLabel}>Check-in lead minutes</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                inputMode="numeric"
                onChangeText={setScheduleCheckInLeadMinutes}
                placeholder="30"
                placeholderTextColor="#6B766F"
                style={styles.input}
                value={scheduleCheckInLeadMinutes}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Registration state</Text>
            <View style={styles.tournamentPicker}>
              {REGISTRATION_STATUS_OPTIONS.map((option) => (
                <ActionButton
                  key={option.value}
                  onPress={() => setScheduleRegistrationStatus(option.value)}
                  variant={scheduleRegistrationStatus === option.value ? 'primary' : 'secondary'}>
                  {option.label}
                </ActionButton>
              ))}
            </View>
          </View>

          <View style={styles.publisherWorkflow}>
            <View style={styles.workflowStep}>
              <Badge tone="accent">1</Badge>
              <Text style={styles.workflowText}>Save the event date and registration state.</Text>
            </View>
            <View style={styles.workflowStep}>
              <Badge tone="blue">2</Badge>
              <Text style={styles.workflowText}>Share the signup page until enough players are registered.</Text>
            </View>
            <View style={styles.workflowStep}>
              <Badge tone="green">3</Badge>
              <Text style={styles.workflowText}>Generate the bracket, then players use My Match.</Text>
            </View>
          </View>

          <View style={styles.rosterSummary}>
            <Badge tone={scheduleSettings ? 'green' : 'blue'}>{scheduleSettings ? 'Saved override' : 'Seed default'}</Badge>
            <Text style={styles.metaText}>
              {scheduleSettings?.updatedAt ? `Last saved ${new Date(scheduleSettings.updatedAt).toLocaleString()}` : 'No live override saved yet.'}
            </Text>
          </View>

          {scheduleError ? <Text style={styles.errorText}>{scheduleError}</Text> : null}
          {scheduleMessage ? <Text style={styles.successText}>{scheduleMessage}</Text> : null}
          {eventError ? <Text style={styles.errorText}>{eventError}</Text> : null}
          {eventMessage ? <Text style={styles.successText}>{eventMessage}</Text> : null}

          <View style={styles.buttonRow}>
            <ActionButton disabled={!hasHostCredential || eventSaving} onPress={handleSaveTournamentEvent}>
              {eventSaving ? 'Saving...' : 'Save event'}
            </ActionButton>
            <ActionButton disabled={!hasHostCredential || scheduleLoading} onPress={handleSaveScheduleSettings} variant="secondary">
              {scheduleLoading ? 'Saving...' : 'Save schedule only'}
            </ActionButton>
            <ActionButton href={signupPath} variant="secondary">
              Open signup page
            </ActionButton>
            <ActionButton href={tournamentPath} variant="secondary">
              Open tournament page
            </ActionButton>
            <ActionButton disabled={!hasHostCredential || !playerCountReady || bracketLoading} onPress={handleGenerateBracket} variant="secondary">
              {bracketLoading ? 'Generating...' : 'Generate bracket'}
            </ActionButton>
            <ActionButton disabled={!hasHostCredential || scheduleLoading} onPress={handleResetScheduleSettings} variant="ghost">
              Reset schedule
            </ActionButton>
          </View>

          <View style={styles.editorLifecycleNote}>
            <Badge tone="blue">Lifecycle controls moved up</Badge>
            <Text style={styles.editorLifecycleText}>
              Archive, clear/delete, bracket generation, and roster refresh now live in Tournament controls at the top of this page.
            </Text>
          </View>
        </Surface>
      </Section>
    );
  }

  async function handleLoadRoster() {
    const token = rosterToken.trim();

    if (!hasHostCredential) {
      setRosterFeedback('', 'Sign in with a host-approved account or enter the fallback token before viewing the private roster.');
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
      setRosterLastRefreshedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      setRosterFeedback(`Roster refreshed: ${signupCount} registered player${signupCount === 1 ? '' : 's'}.`, '');
    } catch (error) {
      setRosterFeedback('', error instanceof Error ? error.message : 'Could not refresh the private roster.');
    } finally {
      setRosterLoading(false);
    }
  }

  useEffect(() => {
    if (!isHostApproved) {
      return undefined;
    }

    let active = true;

    async function refreshHostRoster() {
      setRosterLoading(true);
      setRosterError('');
      setRosterMessage('Refreshing roster...');

      try {
        const result = await fetchTournamentRoster({
          token: '',
          slug: rosterSlug,
        });
        const nextRosters = result.rosters || [];
        const signupCount = nextRosters.reduce((total, roster) => total + (roster.signups?.length || 0), 0);

        if (!active) {
          return;
        }

        setRosters(nextRosters);
        setBracket(null);
        setRosterLastRefreshedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
        setRosterMessage(`Roster refreshed automatically: ${signupCount} registered player${signupCount === 1 ? '' : 's'}.`);
      } catch (error) {
        if (active) {
          setRosterError(error instanceof Error ? error.message : 'Could not refresh the private roster.');
          setRosterMessage('');
        }
      } finally {
        if (active) {
          setRosterLoading(false);
        }
      }
    }

    refreshHostRoster();

    return () => {
      active = false;
    };
  }, [isHostApproved, rosterSlug]);

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
    const selectedMode = getTournamentMode(liveTournament?.mode);

    if (!hasHostCredential) {
      setBracketFeedback('', 'Sign in with a host-approved account or enter the tournament admin token before generating a bracket.');
      return;
    }

    if (!canGenerateTournamentMode(selectedMode.value)) {
      setBracketFeedback('', `${selectedMode.label} is saved for the event, but bracket generation for that mode is the next wiring phase.`);
      return;
    }

    setBracketLoading(true);
    setBracketFeedback('', '');

    try {
      const result = await generateTournamentBracket({ token, slug: rosterSlug });
      setBracket(result.bracket || null);
      setBracketFeedback('Generated and published the bracket from the registered player roster.', '');
    } catch (error) {
      setBracketFeedback('', error instanceof Error ? error.message : 'Could not generate the tournament bracket.');
    } finally {
      setBracketLoading(false);
    }
  }

  async function handleResetBracket() {
    const token = rosterToken.trim();

    if (!hasHostCredential) {
      setBracketFeedback('', 'Sign in with a host-approved account or enter the tournament admin token before resetting a bracket.');
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

  function handleRequestClearTournamentData() {
    if (!hasHostCredential) {
      setHostFeedback('', 'Sign in with a host-approved account or enter the fallback token before clearing tournament data.');
      return;
    }

    setClearConfirmOpen(true);
    setHostFeedback('', '');
  }

  function handleCancelClearTournamentData() {
    setClearConfirmOpen(false);
    setHostFeedback('', '');
  }

  async function handleClearTournamentData() {
    const token = rosterToken.trim();

    if (clearLoading) {
      return;
    }

    if (!hasHostCredential) {
      setHostFeedback('', 'Sign in with a host-approved account or enter the fallback token before clearing tournament data.');
      return;
    }

    setClearLoading(true);
    setHostFeedback('', '');

    try {
      const result = await clearTournamentData({ token, slug: rosterSlug });
      const [settingsResult, eventResult] = await Promise.allSettled([
        resetTournamentSettings({ token, slug: rosterSlug }),
        deleteTournamentEvent({ token, slug: rosterSlug }),
      ]);
      const emptyRoster = result.rosters?.[0] || { tournamentSlug: rosterSlug, signups: [] };
      const deletedSignupCount = result.deletedSignupCount || 0;
      const deletedHostedEvent = eventResult.status === 'fulfilled' ? Boolean(eventResult.value.deleted) : false;
      const nextHostedTournaments = eventResult.status === 'fulfilled'
        ? eventResult.value.tournaments || []
        : hostedTournaments.filter((tournament) => tournament.slug !== rosterSlug);

      setRosters([emptyRoster]);
      setBracket(null);
      setScheduleSettings(null);
      setHostedTournaments(nextHostedTournaments);
      setClearConfirmOpen(false);
      setRosterLastRefreshedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      setRosterFeedback(`Roster cleared: ${deletedSignupCount} registered player${deletedSignupCount === 1 ? '' : 's'} removed.`, '');
      setBracketFeedback('Bracket cleared for this tournament.', '');
      setScheduleFeedback(
        settingsResult.status === 'fulfilled'
          ? 'Schedule override cleared for this tournament.'
          : '',
        settingsResult.status === 'rejected'
          ? settingsResult.reason instanceof Error
            ? settingsResult.reason.message
            : 'Could not clear schedule override.'
          : '',
      );
      setEventFeedback(
        eventResult.status === 'fulfilled'
          ? deletedHostedEvent
            ? 'Hosted event record deleted.'
            : 'No hosted event record existed for this slug.'
          : '',
        eventResult.status === 'rejected'
          ? eventResult.reason instanceof Error
            ? eventResult.reason.message
            : 'Could not delete hosted event record.'
          : '',
      );
      setHostFeedback(
        deletedHostedEvent
          ? 'Tournament cleared, including hosted event record. Player accounts were kept.'
          : 'Tournament data cleared. No hosted event record existed for this slug. Player accounts were kept.',
        '',
      );
    } catch (error) {
      setHostFeedback('', error instanceof Error ? error.message : 'Could not clear tournament test data.');
    } finally {
      setClearLoading(false);
    }
  }

  function renderHostQuickControls() {
    if (showDraftTools) {
      return null;
    }

    const tournament = liveTournament || selectedTournament;
    const tournamentPath = getTournamentPath(rosterSlug);
    const signupPath = getCheckInPath(rosterSlug);
    const isArchived = tournament?.status === 'archived';
    const playerCountReady = canGenerateWithSignupCount(activeTournamentMode, activeSignupCount);
    const nextHostMove = !hasHostCredential
      ? 'Sign in as host to unlock editing, clearing, and bracket actions.'
      : isArchived
        ? 'This event is archived. Publish it again before promoting it.'
      : bracket?.winner
        ? `Winner posted: ${bracket.winner.name}. Archive the event when you are done.`
        : bracket
          ? 'Bracket is live. Send players to My Match and monitor results.'
          : playerCountReady
            ? 'Roster is ready. Generate the bracket when you want to start.'
            : activeSignupCount
              ? 'Keep signups open until the roster reaches the bracket minimum.'
              : 'Save the event, then share the signup page.';
    const quickStats = [
      { label: 'Selected', value: tournament?.title || rosterSlug, tone: 'accent' },
      { label: 'Start', value: getStartTimingLabel(tournament), tone: 'blue' },
      { label: 'Roster', value: `${activeSignupCount}${tournament?.rosterCap ? ` / ${tournament.rosterCap}` : ''}`, tone: activeSignupCount ? 'green' : 'blue' },
      { label: 'Bracket', value: bracket ? `${bracket.participantCount || 0} seeded` : 'Not generated', tone: bracket ? 'green' : 'accent' },
      { label: 'Status', value: isArchived ? 'Archived' : liveRegistrationMeta.label, tone: isArchived ? 'rose' : liveRegistrationMeta.tone },
    ];

    return (
      <Section
        description="The host controls you need most are first: edit the event, open player pages, seed the bracket, archive, or clear test data."
        nativeID="host-quick-controls"
        title="Tournament controls">
        <Surface style={styles.quickControlPanel}>
          <View style={styles.quickControlHeader}>
            <View style={styles.quickControlCopy}>
              <Badge tone={hasHostCredential ? 'green' : 'accent'}>{hasHostCredential ? 'Host ready' : 'Host access needed'}</Badge>
              <Text style={styles.quickControlTitle}>{tournament?.title || rosterSlug}</Text>
              <Text style={styles.quickControlBody}>
                {nextHostMove}
              </Text>
            </View>

            <View style={styles.quickStatGrid}>
              {quickStats.map((stat) => (
                <View key={stat.label} style={[styles.quickStat, styles[`quickStat${stat.tone[0].toUpperCase()}${stat.tone.slice(1)}`]]}>
                  <Text style={styles.quickStatLabel}>{stat.label}</Text>
                  <Text numberOfLines={2} style={styles.quickStatValue}>{stat.value}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.quickPickerBlock}>
            <Text style={styles.quickPickerLabel}>Select tournament</Text>
            <View style={styles.quickPickerRow}>
              {adminTournaments.map((tournamentOption) => (
                <ActionButton
                  key={tournamentOption.slug}
                  onPress={() => setRosterSlug(tournamentOption.slug)}
                  style={styles.quickPickerButton}
                  variant={rosterSlug === tournamentOption.slug ? 'primary' : 'secondary'}>
                  {tournamentOption.title}
                </ActionButton>
              ))}
              <ActionButton onPress={handleNewTournamentDraft} style={styles.quickPickerButton} variant="secondary">
                New tournament
              </ActionButton>
            </View>
          </View>

          <View style={styles.quickFlowStrip}>
            <View style={styles.quickFlowStep}>
              <Badge tone="accent">1</Badge>
              <Text style={styles.quickFlowText}>Edit date and registration</Text>
            </View>
            <View style={styles.quickFlowStep}>
              <Badge tone="blue">2</Badge>
              <Text style={styles.quickFlowText}>Share signup and refresh roster</Text>
            </View>
            <View style={styles.quickFlowStep}>
              <Badge tone="green">3</Badge>
              <Text style={styles.quickFlowText}>Generate bracket and send My Match</Text>
            </View>
            <View style={styles.quickFlowStep}>
              <Badge tone="green">4</Badge>
              <Text style={styles.quickFlowText}>Review results or archive event</Text>
            </View>
          </View>

          <View style={styles.quickActionGrid}>
            <ActionButton href="/admin#edit-tournament" style={styles.quickActionButton}>
              Edit selected event
            </ActionButton>
            <ActionButton href={tournamentPath} style={styles.quickActionButton} variant="secondary">
              Open event page
            </ActionButton>
            <ActionButton href={signupPath} style={styles.quickActionButton} variant="secondary">
              Open signup
            </ActionButton>
            <ActionButton
              disabled={!hasHostCredential || !playerCountReady || bracketLoading}
              onPress={handleGenerateBracket}
              style={styles.quickActionButton}
              variant="secondary">
              {bracketLoading ? 'Generating...' : 'Generate bracket'}
            </ActionButton>
            <ActionButton onPress={handleLoadRoster} style={styles.quickActionButton} variant="secondary">
              {rosterLoading ? 'Refreshing...' : 'Refresh roster'}
            </ActionButton>
            <ActionButton
              disabled={!hasHostCredential || archiveLoading || isArchived}
              onPress={handleRequestArchiveTournament}
              style={styles.quickActionButton}
              variant="secondary">
              {isArchived ? 'Archived' : 'Archive event'}
            </ActionButton>
            <ActionButton
              disabled={!hasHostCredential || clearLoading}
              onPress={handleRequestClearTournamentData}
              style={styles.quickActionButton}
              variant="danger">
              Clear/delete tournament
            </ActionButton>
          </View>

          {archiveConfirmOpen ? (
            <View style={styles.quickConfirmPanel}>
              <Text style={styles.archiveBody}>
                Archive {tournament?.title || rosterSlug}? It disappears from upcoming pages but keeps roster, bracket, results, and player accounts.
              </Text>
              <View style={styles.buttonRow}>
                <ActionButton disabled={archiveLoading} onPress={handleArchiveTournament}>
                  {archiveLoading ? 'Archiving...' : 'Yes, archive event'}
                </ActionButton>
                <ActionButton onPress={handleCancelArchiveTournament} variant="ghost">
                  Cancel
                </ActionButton>
              </View>
            </View>
          ) : null}

          {clearConfirmOpen ? (
            <View style={styles.quickDangerConfirmPanel}>
              <View style={styles.quickDangerHeader}>
                <Badge tone="rose">Deletes selected event data</Badge>
                <Badge tone="green">Keeps player accounts</Badge>
              </View>
              <Text style={styles.resetDangerBody}>
                Clear {tournament?.title || rosterSlug}? This deletes the tournament roster, bracket, schedule override, and hosted event record. Player accounts stay.
              </Text>
              <View style={styles.buttonRow}>
                <ActionButton disabled={clearLoading} onPress={handleClearTournamentData} variant="danger">
                  {clearLoading ? 'Clearing...' : 'Yes, clear tournament'}
                </ActionButton>
                <ActionButton onPress={handleCancelClearTournamentData} variant="ghost">
                  Cancel
                </ActionButton>
              </View>
            </View>
          ) : null}
        </Surface>
      </Section>
    );
  }

  async function handleReportWinner(match, player) {
    const token = rosterToken.trim();

    if (!hasHostCredential) {
      setBracketFeedback('', 'Sign in with a host-approved account or enter the tournament admin token before reporting a winner.');
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

  async function handleCopyPlayerInstructions() {
    const tournamentPath = getTournamentPath(rosterSlug);
    const tournament = liveTournament || selectedTournament;
    const text = [
      `${tournament?.title || '1v1 tournament'} player link:`,
      `https://1v1tournaments.org${tournamentPath}`,
      '',
      'What to do:',
      '1. Open that tournament page.',
      '2. Create or sign in to your player account.',
      '3. Sign up if you have not already.',
      '4. After the bracket is live, use "Your tournament status" and press "Play my match."',
      '',
      'Do not join from bare Spades room links. Player seats are account-gated from the tournament page.',
    ].join('\n');

    try {
      if (canUseClipboard()) {
        await globalThis.navigator.clipboard.writeText(text);
        setHostFeedback('Player instructions copied to the clipboard.', '');
        return;
      }

      Alert.alert('Copy player instructions', text);
      setHostFeedback('Clipboard is not available here, so the player instructions were shown in an alert.', '');
    } catch {
      setHostFeedback('', 'Could not copy player instructions from this browser.');
    }
  }

  async function handleLoadStreamCommands() {
    setStreamCommandLoading(true);
    setStreamCommandFeedback('', '');

    try {
      const result = await fetchStreamCommands();
      setStreamCommandText(JSON.stringify(result.commands || buildDefaultStreamCommands(), null, 2));
      setStreamCommandFeedback(`Loaded ${result.source || 'saved'} stream commands.`, '');
    } catch (error) {
      setStreamCommandFeedback('', error instanceof Error ? error.message : 'Could not load stream commands.');
    } finally {
      setStreamCommandLoading(false);
    }
  }

  async function handleSaveStreamCommands() {
    const token = rosterToken.trim();

    if (!hasHostCredential) {
      setStreamCommandFeedback('', 'Sign in with a host-approved account or enter the fallback token before saving stream commands.');
      return;
    }

    let commands;

    try {
      commands = JSON.parse(streamCommandText);
    } catch {
      setStreamCommandFeedback('', 'Stream commands must be valid JSON.');
      return;
    }

    setStreamCommandLoading(true);
    setStreamCommandFeedback('', '');

    try {
      const result = await saveStreamCommands({ token, commands });
      const savedCommands = result.commands || commands;
      setStreamCommandText(JSON.stringify(savedCommands, null, 2));
      setStreamCommandFeedback(`Saved ${savedCommands.length} stream command${savedCommands.length === 1 ? '' : 's'}.`, '');
    } catch (error) {
      setStreamCommandFeedback('', error instanceof Error ? error.message : 'Could not save stream commands.');
    } finally {
      setStreamCommandLoading(false);
    }
  }

  async function handleResetStreamCommands() {
    const token = rosterToken.trim();

    if (!hasHostCredential) {
      setStreamCommandFeedback('', 'Sign in with a host-approved account or enter the fallback token before resetting stream commands.');
      return;
    }

    setStreamCommandLoading(true);
    setStreamCommandFeedback('', '');

    try {
      const result = await resetStreamCommands({ token });
      setStreamCommandText(JSON.stringify(result.commands || buildDefaultStreamCommands(), null, 2));
      setStreamCommandFeedback('Reset stream commands to defaults.', '');
    } catch (error) {
      setStreamCommandFeedback('', error instanceof Error ? error.message : 'Could not reset stream commands.');
    } finally {
      setStreamCommandLoading(false);
    }
  }

  async function handleCopyStreamCommandEndpoint() {
    const endpoint = `https://1v1tournaments.org${STREAM_COMMAND_ENDPOINT}`;

    try {
      if (canUseClipboard()) {
        await globalThis.navigator.clipboard.writeText(endpoint);
        setStreamCommandFeedback('Bot command endpoint copied.', '');
        return;
      }

      Alert.alert('Bot command endpoint', endpoint);
      setStreamCommandFeedback('Clipboard is not available here, so the endpoint was shown in an alert.', '');
    } catch {
      setStreamCommandFeedback('', 'Could not copy the bot command endpoint.');
    }
  }

  function renderRunStatusItem({ label, value, tone = 'blue', body }) {
    return (
      <View style={styles.runStatusItem}>
        <View style={styles.metaRow}>
          <Badge tone={tone}>{value}</Badge>
          <Text style={styles.runStatusLabel}>{label}</Text>
        </View>
        {body ? <Text style={styles.runStatusBody}>{body}</Text> : null}
      </View>
    );
  }

  function renderHostRunSection() {
    const tournament = liveTournament || selectedTournament;
    const tournamentPath = getTournamentPath(rosterSlug);
    const signupCount = activeSignupCount;
    const matches = bracket?.rounds?.flatMap((round) =>
      round.matches.map((match) => ({ ...match, roundTitle: round.title })),
    ) || [];
    const readyMatches = matches.filter((match) => match.status === 'ready');
    const finalMatches = matches.filter((match) => match.status === 'final');
    const pendingMatches = matches.filter((match) => match.status !== 'final');
    const firstReadyMatch = readyMatches[0];
    const runPhase = !hasHostCredential
      ? { label: 'Access', tone: 'accent' }
      : !selectedRoster
        ? { label: 'Roster', tone: 'blue' }
        : !bracket
          ? { label: bracketReadiness.ready ? 'Seed bracket' : 'Setup', tone: bracketReadiness.ready ? 'green' : 'accent' }
          : bracket.winner
            ? { label: 'Complete', tone: 'green' }
            : readyMatches.length
              ? { label: 'Match live', tone: 'green' }
              : { label: 'Waiting', tone: 'blue' };
    const modeRunNote = activeTournamentMode.value === 'four-player-double-elimination'
      ? '4-man test flow: save this mode, refresh until the roster shows exactly 4, generate once, then report every winner from this panel.'
      : activeTournamentMode.value === 'three-player-two-life'
        ? '3-man two-life flow: refresh until the roster shows exactly 3, generate once, then report each lost-life match from this panel.'
        : 'Run flow: refresh roster, generate when ready, then report winners from the bracket manager.';
    let nextAction = 'Sign in as an approved host or enter the fallback token to view the roster.';

    if (hasHostCredential && !selectedRoster) {
      nextAction = rosterLoading ? 'Refreshing the registered player roster.' : 'Refresh the roster for the selected tournament.';
    } else if (!bracket && !bracketReadiness.ready) {
      nextAction = bracketReadiness.body;
    } else if (!bracket && bracketReadiness.ready) {
      nextAction = 'Generate the bracket, then send players the tournament page.';
    } else if (readyMatches.length) {
      nextAction = 'Tell players to open the tournament page and press Play my match.';
    } else if (bracket?.winner) {
      nextAction = `Tournament complete. Winner: ${bracket.winner.name}.`;
    } else if (bracket) {
      nextAction = 'Waiting for match results or next-round opponents.';
    }

    return (
      <Section
        description="Use this during a live tournament so the host flow is obvious at a glance."
        title="Host checklist">
        <Surface style={styles.runPanel}>
          <View style={styles.metaRow}>
            <Badge tone={runPhase.tone}>{runPhase.label}</Badge>
            <Text style={styles.metaText}>{tournament?.title || rosterSlug}</Text>
          </View>
          <Text style={styles.runTitle}>{nextAction}</Text>
          <Text style={styles.copy}>
            {modeRunNote}
          </Text>

          <View style={styles.runStatusGrid}>
            {renderRunStatusItem({
              label: 'Host access',
              value: hasHostCredential ? 'ready' : 'needed',
              tone: hasHostCredential ? 'green' : 'accent',
              body: playerAccount?.hostApproved
                ? `Signed in as host ${playerAccount.playerName}.`
                : 'Paste the fallback token before viewing rosters or generating brackets.',
            })}
            {renderRunStatusItem({
              label: 'Roster',
              value: selectedRoster ? String(signupCount) : rosterLoading ? 'refreshing' : 'not refreshed',
              tone: bracketReadiness.checks.find((check) => check.label === 'Players')?.ready ? 'green' : signupCount ? 'accent' : 'blue',
              body: selectedRoster
                ? `${signupCount} registered player${signupCount === 1 ? '' : 's'} for this event.`
                : 'Refresh the roster before bracket generation.',
            })}
            {renderRunStatusItem({
              label: 'Readiness',
              value: bracketReadiness.label,
              tone: bracketReadiness.tone,
              body: bracketReadiness.title,
            })}
            {renderRunStatusItem({
              label: 'Ready matches',
              value: String(readyMatches.length),
              tone: readyMatches.length ? 'green' : 'blue',
              body: firstReadyMatch
                ? `${firstReadyMatch.roundTitle}: ${firstReadyMatch.label}`
                : 'Ready matches appear after both seats are assigned.',
            })}
          </View>

          {bracket ? (
            <View style={styles.rosterSummary}>
              <Badge tone="green">{finalMatches.length} final</Badge>
              <Badge tone="blue">{pendingMatches.length} open</Badge>
              {bracket.winner ? <Badge tone="green">Winner: {bracket.winner.name}</Badge> : null}
            </View>
          ) : null}

          {hostError ? <Text style={styles.errorText}>{hostError}</Text> : null}
          {hostMessage ? <Text style={styles.successText}>{hostMessage}</Text> : null}

          <View style={styles.buttonRow}>
            <ActionButton href={tournamentPath}>Open tournament page</ActionButton>
            <ActionButton href="/stream" variant="secondary">
              Open stream view
            </ActionButton>
            <ActionButton onPress={handleCopyPlayerInstructions} variant="secondary">
              Copy player instructions
            </ActionButton>
            <ActionButton onPress={handleLoadRoster} variant="secondary">
              {rosterLoading ? 'Refreshing...' : 'Refresh roster'}
            </ActionButton>
            <ActionButton onPress={handleLoadBracket} variant="ghost">
              {bracketLoading ? 'Loading...' : 'Refresh bracket'}
            </ActionButton>
          </View>
        </Surface>
      </Section>
    );
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
    const signupCount = activeSignupCount;
    const rosterEmptyTitle = hasHostCredential ? 'No registered players yet' : 'Host access needed';
    const rosterEmptyBody = hasHostCredential
      ? 'This tournament roster is refreshed and empty. New player signups will appear here after you refresh.'
      : 'Sign in with a host-approved account or enter the fallback token to view names, emails, and account IDs.';

    return (
      <Section
        description="Private account-linked registrations appear here for the host before a bracket is seeded."
        title="Registered players">
        <Surface style={styles.rosterPanel}>
          <View style={styles.metaRow}>
            <Badge tone={hasHostCredential ? 'green' : 'accent'}>{hasHostCredential ? 'Host roster' : 'Private roster'}</Badge>
            <Text style={styles.metaText}>
              {isHostApproved
                ? 'Your host-approved account can view this roster. It refreshes automatically when you open the page.'
                : 'Use a host-approved account or the fallback token to view private player registrations.'}
            </Text>
          </View>

          <View style={styles.hostAccountPanel}>
            <View style={styles.metaRow}>
              <Badge tone={playerAccount?.hostApproved ? 'green' : playerAccount ? 'accent' : 'blue'}>
                {playerAccountLoading ? 'Checking' : playerAccount?.hostApproved ? 'Host approved' : playerAccount ? 'Signed in' : 'No account'}
              </Badge>
              <Text style={styles.metaText}>
                {playerAccount?.email || (playerAccountLoading ? 'Checking player account...' : 'Sign in on the public signup page first.')}
              </Text>
            </View>
            {playerAccount && !playerAccount.hostApproved ? (
              <Text style={styles.hostAccountCopy}>
                This player account is signed in, but it is not on the Netlify host allowlist yet.
              </Text>
            ) : null}
            {playerAccountError ? <Text style={styles.errorText}>{playerAccountError}</Text> : null}
          </View>

          {isHostApproved ? (
            <View style={styles.hostReadyPanel}>
              <Badge tone="green">Token not needed</Badge>
              <Text style={styles.metaText}>Your approved account unlocks roster, bracket, and winner controls.</Text>
            </View>
          ) : (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Fallback admin token</Text>
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
          )}

          <View style={styles.selectedTournamentNotice}>
            <Badge tone="accent">Selected event</Badge>
            <Text style={styles.metaText}>
              {liveTournament?.title || rosterSlug}. Change the selected event in Post tournament at the top.
            </Text>
          </View>

          <View style={styles.buttonRow}>
            <ActionButton onPress={handleLoadRoster}>{rosterLoading ? 'Refreshing...' : 'Refresh roster'}</ActionButton>
            <ActionButton onPress={handleCopyRoster} variant="secondary">
              Copy roster JSON
            </ActionButton>
          </View>

          {rosterError ? <Text style={styles.errorText}>{rosterError}</Text> : null}
          {rosterMessage ? <Text style={styles.successText}>{rosterMessage}</Text> : null}

          <View style={styles.rosterSummary}>
            <Badge tone={signupCount ? 'green' : 'blue'}>{signupCount} registered</Badge>
            <Text style={styles.metaText}>{selectedRoster?.tournamentSlug || rosterSlug}</Text>
            {rosterLastRefreshedAt ? <Text style={styles.refreshText}>Refreshed {rosterLastRefreshedAt}</Text> : null}
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
                    <Text style={styles.signupMeta}>
                      {signup.accountId ? `Account linked: ${signup.accountId}` : 'Legacy signup: no account linked'}
                    </Text>
                    {signup.notes ? <Text style={styles.signupNotes}>{signup.notes}</Text> : null}
                  </View>
                  <Badge tone="green">{signup.status || 'registered'}</Badge>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              body={rosterEmptyBody}
              title={rosterLoading ? 'Refreshing roster' : rosterEmptyTitle}
            />
          )}
        </Surface>
      </Section>
    );
  }

  function renderBracketReadinessPanel() {
    return (
      <View style={styles.readinessPanel}>
        <View style={styles.metaRow}>
          <Badge tone={bracketReadiness.tone}>{bracketReadiness.label}</Badge>
          <Text style={styles.readinessTitle}>{bracketReadiness.title}</Text>
        </View>
        <Text style={styles.readinessBody}>{bracketReadiness.body}</Text>
        <View style={styles.readinessGrid}>
          {bracketReadiness.checks.map((check) => (
            <View
              key={check.label}
              style={[
                styles.readinessItem,
                check.ready ? styles.readinessItemReady : styles.readinessItemBlocked,
              ]}>
              <Badge tone={check.ready ? 'green' : 'accent'}>{check.ready ? 'OK' : 'Fix'}</Badge>
              <Text style={styles.readinessLabel}>{check.label}</Text>
              <Text style={styles.readinessCheckBody}>{check.body}</Text>
            </View>
          ))}
        </View>
      </View>
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
        description="Create the public bracket from the registered player roster and give each match a Spades room link."
        title="Bracket manager">
        <Surface style={styles.bracketPanel}>
          <View style={styles.metaRow}>
            <Badge tone={bracket ? 'green' : 'blue'}>{bracket ? bracket.status : 'Not generated'}</Badge>
            <Text style={styles.metaText}>
              Matches open in 1v1spades.com rooms while this hub tracks bracket state and winners.
            </Text>
          </View>

          {renderBracketReadinessPanel()}

          <View style={styles.buttonRow}>
            <ActionButton onPress={handleLoadBracket} variant="secondary">
              {bracketLoading ? 'Loading...' : 'Refresh bracket'}
            </ActionButton>
            <ActionButton disabled={!bracketReadiness.ready || bracketLoading} onPress={handleGenerateBracket}>
              Generate bracket from roster
            </ActionButton>
            <ActionButton onPress={handleResetBracket} variant="secondary">
              Reset bracket only
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
                            <ActionButton href={`${getTournamentPath(rosterSlug)}#my-match`} variant="secondary">
                              Player match page
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

  function renderStreamCommandSection() {
    return (
      <Section
        description="Edit the public commands used by Twitch chat bots, Discord helpers, and the Live page."
        title="Stream commands">
        <Surface style={styles.panel}>
          <View style={styles.metaRow}>
            <Badge tone="accent">Bot endpoint</Badge>
            <Text style={styles.metaText}>https://1v1tournaments.org{STREAM_COMMAND_ENDPOINT}</Text>
          </View>
          <Text style={styles.copy}>
            Save command JSON here, then point a Twitch or Discord bot at the public endpoint. Commands are read-only for bots and require host access to edit.
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            onChangeText={setStreamCommandText}
            placeholder="Stream command JSON"
            placeholderTextColor="#6B766F"
            scrollEnabled
            selectTextOnFocus
            spellCheck={false}
            style={styles.serverEditor}
            value={streamCommandText}
          />
          {streamCommandError ? <Text style={styles.errorText}>{streamCommandError}</Text> : null}
          {streamCommandMessage ? <Text style={styles.successText}>{streamCommandMessage}</Text> : null}
          <View style={styles.buttonRow}>
            <ActionButton onPress={handleLoadStreamCommands} variant="secondary">
              {streamCommandLoading ? 'Loading...' : 'Load commands'}
            </ActionButton>
            <ActionButton disabled={!hasHostCredential || streamCommandLoading} onPress={handleSaveStreamCommands}>
              Save commands
            </ActionButton>
            <ActionButton disabled={!hasHostCredential || streamCommandLoading} onPress={handleResetStreamCommands} variant="secondary">
              Reset defaults
            </ActionButton>
            <ActionButton onPress={handleCopyStreamCommandEndpoint} variant="ghost">
              Copy endpoint
            </ActionButton>
          </View>
        </Surface>
      </Section>
    );
  }

  const actions = [
    { label: 'Home', href: '/' },
    { label: 'Sponsors', href: '/admin/sponsors', variant: 'secondary' },
    { label: 'Spades', href: getGamePath(siteData.site.primaryGameSlug), variant: 'secondary' },
    { label: 'Rules', href: '/rules', variant: 'ghost' },
  ];

  const modeTone = mode === 'unlocked' ? 'green' : mode === 'locked' ? 'rose' : 'blue';

  if (mode === 'unsupported' && !canShowHostConsole) {
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

  if (mode === 'setup' && !canShowHostConsole) {
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

  if (mode !== 'unlocked' && !canShowHostConsole) {
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
      eyebrow={showDraftTools ? 'Private admin' : 'Host controls'}
      footerNote={
        showDraftTools
          ? 'The server allowlist is the preferred path. Browser-local passphrase access stays as the fallback.'
          : 'Approved host accounts unlock tournament controls. Browser-local passphrases are only for draft fallback tools.'
      }
      lead={
        showDraftTools
          ? 'Draft tournaments can be edited here without changing the public Spades and Euchre gameplay files.'
          : 'View registered players, generate brackets, and run matches from your host-approved account.'
      }
      stats={
        showDraftTools
          ? [
              { label: 'Mode', value: getModeLabel(mode), tone: modeTone },
              { label: 'Drafts', value: String(drafts.length), tone: 'accent' },
              { label: 'Storage', value: 'Browser local', tone: 'green' },
            ]
          : [
              { label: 'Host', value: isHostApproved ? 'Approved' : 'Token', tone: 'green' },
              { label: 'Roster', value: selectedRoster ? String(selectedRoster.signups?.length || 0) : rosterLoading ? 'Refreshing' : 'Ready', tone: 'blue' },
              { label: 'Bracket', value: bracket?.status || 'Not loaded', tone: bracket ? 'green' : 'accent' },
            ]
      }
      subtitle={showDraftTools ? 'Draft tournament editor' : 'Tournament host dashboard'}
      title={showDraftTools ? 'Private admin console' : 'Host control center'}>
      {renderHostQuickControls()}

      <Section
        action={
          <View style={styles.headerActions}>
            <ActionButton href="/" variant="secondary">
              Home
            </ActionButton>
            {showDraftTools ? (
              <>
              <ActionButton onPress={handleAddDraft} variant="secondary">
                Add draft
              </ActionButton>
              <ActionButton onPress={handleCopyDrafts} variant="secondary">
                Copy JSON
              </ActionButton>
              <ActionButton onPress={handleLock} variant="ghost">
                Lock
              </ActionButton>
              </>
            ) : null}
          </View>
        }
        description={
          showDraftTools
            ? 'These drafts stay private on this device until you are ready to publish an event.'
            : 'Your approved account is the main key for tournament operations.'
        }
        title={showDraftTools ? 'Access and tools' : 'Host access'}>
        <Surface style={styles.panel}>
          <View style={styles.metaRow}>
            <Badge tone="green">{showDraftTools ? 'Unlocked' : 'Host approved'}</Badge>
            <Text style={styles.metaText}>
              {showDraftTools
                ? 'Session stays in browser storage until you lock it or clear site data.'
                : `${playerAccount?.email || 'Your host account'} can view private rosters and run brackets.`}
            </Text>
          </View>
          <Text style={styles.copy}>
            {showDraftTools
              ? 'Use this page to prepare draft tournaments, then keep the local server allowlist updated so the account-ID unlock stays private.'
              : 'Use the registered players section as your source of truth. Player names, emails, and account IDs stay hidden until host access is confirmed.'}
          </Text>
          {showDraftTools && error ? <Text style={styles.errorText}>{error}</Text> : null}
          {showDraftTools && message ? <Text style={styles.successText}>{message}</Text> : null}
        </Surface>
      </Section>

      {renderScheduleSection()}

      {renderHostRunSection()}

      {renderLiveRosterSection()}

      {renderBracketManagerSection()}

      {renderStreamCommandSection()}

      {showDraftTools ? (
        <>
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
                The editor keeps draft event data portable while the host workflow grows.
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
        </>
      ) : null}
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
    color: '#A7A29A',
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
    borderColor: 'rgba(94, 127, 163, 0.24)',
  },
  eventEditorPanel: {
    backgroundColor: 'rgba(214, 162, 78, 0.06)',
    borderColor: 'rgba(214, 162, 78, 0.20)',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
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
    color: '#8F1D2C',
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
  notesInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(244, 239, 230, 0.12)',
    borderRadius: 18,
    borderWidth: 1,
    color: '#F4EFE6',
    fontSize: 15,
    lineHeight: 22,
    minHeight: 96,
    padding: 14,
    textAlignVertical: 'top',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  metaText: {
    color: '#A7A29A',
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  modeInfoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: 230,
    flexGrow: 1,
    padding: 12,
  },
  modeInfoCardActive: {
    backgroundColor: 'rgba(214, 162, 78, 0.10)',
    borderColor: 'rgba(214, 162, 78, 0.34)',
  },
  modeInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  modeInfoTitle: {
    color: '#F4EFE6',
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  panel: {
    borderColor: 'rgba(94, 127, 163, 0.24)',
  },
  rosterPanel: {
    borderColor: 'rgba(214, 162, 78, 0.30)',
  },
  hostAccountPanel: {
    backgroundColor: 'rgba(214, 162, 78, 0.08)',
    borderColor: 'rgba(214, 162, 78, 0.24)',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  hostAccountCopy: {
    color: '#A7A29A',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 8,
  },
  hostReadyPanel: {
    alignItems: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.08)',
    borderColor: 'rgba(214, 162, 78, 0.18)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
    padding: 12,
  },
  selectedTournamentNotice: {
    alignItems: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.08)',
    borderColor: 'rgba(214, 162, 78, 0.20)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
    padding: 12,
  },
  bracketPanel: {
    borderColor: 'rgba(214, 162, 78, 0.30)',
  },
  publisherPanel: {
    borderColor: 'rgba(214, 162, 78, 0.42)',
    shadowColor: '#D6A24E',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 26,
  },
  publisherHero: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  publisherCopy: {
    flex: 1.4,
    minWidth: 280,
  },
  publisherKicker: {
    color: '#D6A24E',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  publisherTitle: {
    color: '#F4EFE6',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
    marginTop: 12,
  },
  publisherDate: {
    color: '#D6A24E',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 22,
    marginBottom: 10,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  publisherStatGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    minWidth: 260,
  },
  publisherStat: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: 132,
    flexGrow: 1,
    padding: 12,
  },
  publisherStatAccent: {
    borderColor: 'rgba(214, 162, 78, 0.42)',
  },
  publisherStatBlue: {
    borderColor: 'rgba(94, 127, 163, 0.32)',
  },
  publisherStatGreen: {
    borderColor: 'rgba(214, 162, 78, 0.38)',
  },
  publisherStatRose: {
    borderColor: 'rgba(143, 29, 44, 0.36)',
  },
  publisherStatLabel: {
    color: '#A7A29A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  publisherStatValue: {
    color: '#F4EFE6',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
    marginTop: 4,
  },
  publisherWorkflow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  workflowStep: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: 250,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 10,
    padding: 12,
  },
  workflowText: {
    color: '#D4DDD7',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  editorLifecycleNote: {
    alignItems: 'center',
    backgroundColor: 'rgba(94, 127, 163, 0.08)',
    borderColor: 'rgba(94, 127, 163, 0.24)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
    padding: 12,
  },
  editorLifecycleText: {
    color: '#C8D8E8',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    minWidth: 220,
  },
  schedulePanel: {
    borderColor: 'rgba(94, 127, 163, 0.26)',
  },
  scheduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginRight: -10,
    marginTop: 4,
  },
  scheduleField: {
    flexBasis: 220,
    flexGrow: 1,
    marginRight: 10,
    marginTop: 14,
  },
  runPanel: {
    borderColor: 'rgba(214, 162, 78, 0.34)',
  },
  runTitle: {
    color: '#F4EFE6',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    marginTop: 10,
  },
  runStatusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
  },
  runStatusItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 220,
    flexGrow: 1,
    marginBottom: 10,
    marginRight: 10,
    padding: 12,
  },
  runStatusLabel: {
    color: '#F4EFE6',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  runStatusBody: {
    color: '#A7A29A',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  quickControlPanel: {
    borderColor: 'rgba(214, 162, 78, 0.48)',
    shadowColor: '#D6A24E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  quickControlHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  quickControlCopy: {
    flex: 1.2,
    minWidth: 260,
  },
  quickControlTitle: {
    color: '#F4EFE6',
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
    marginTop: 12,
  },
  quickControlBody: {
    color: '#D4DDD7',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 8,
  },
  quickPickerBlock: {
    backgroundColor: 'rgba(0, 0, 0, 0.14)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    padding: 14,
  },
  quickPickerLabel: {
    color: '#A7A29A',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 15,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  quickPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickPickerButton: {
    minWidth: 170,
  },
  quickFlowStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  quickFlowStep: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 210,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 10,
    padding: 12,
  },
  quickFlowText: {
    color: '#D4DDD7',
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  quickStatGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    minWidth: 260,
  },
  quickStat: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 130,
    flexGrow: 1,
    padding: 12,
  },
  quickStatAccent: {
    borderColor: 'rgba(214, 162, 78, 0.42)',
  },
  quickStatBlue: {
    borderColor: 'rgba(94, 127, 163, 0.34)',
  },
  quickStatGreen: {
    borderColor: 'rgba(76, 201, 127, 0.34)',
  },
  quickStatRose: {
    borderColor: 'rgba(143, 29, 44, 0.42)',
  },
  quickStatLabel: {
    color: '#A7A29A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  quickStatValue: {
    color: '#F4EFE6',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
    marginTop: 5,
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  quickActionButton: {
    minWidth: 188,
  },
  quickConfirmPanel: {
    backgroundColor: 'rgba(94, 127, 163, 0.08)',
    borderColor: 'rgba(94, 127, 163, 0.28)',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  quickDangerConfirmPanel: {
    backgroundColor: 'rgba(143, 29, 44, 0.10)',
    borderColor: 'rgba(143, 29, 44, 0.32)',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  quickDangerHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  archiveBody: {
    color: '#C8D8E8',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 4,
  },
  resetDangerBody: {
    color: '#E3B2A9',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 4,
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
    color: '#A7A29A',
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
  readinessPanel: {
    backgroundColor: 'rgba(244, 239, 230, 0.04)',
    borderColor: 'rgba(214, 162, 78, 0.24)',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginTop: 16,
    padding: 14,
  },
  readinessTitle: {
    color: '#F4EFE6',
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 22,
  },
  readinessBody: {
    color: '#A7A29A',
    fontSize: 14,
    lineHeight: 20,
  },
  readinessGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  readinessItem: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    minWidth: 190,
    padding: 12,
  },
  readinessItemReady: {
    backgroundColor: 'rgba(56, 189, 128, 0.08)',
    borderColor: 'rgba(56, 189, 128, 0.24)',
  },
  readinessItemBlocked: {
    backgroundColor: 'rgba(214, 162, 78, 0.08)',
    borderColor: 'rgba(214, 162, 78, 0.28)',
  },
  readinessLabel: {
    color: '#F4EFE6',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  readinessCheckBody: {
    color: '#A7A29A',
    fontSize: 13,
    lineHeight: 18,
  },
  refreshText: {
    color: '#5E7FA3',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  signupCopy: {
    flex: 1,
    minWidth: 0,
  },
  signupList: {
    marginTop: 14,
  },
  signupMeta: {
    color: '#A7A29A',
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
    color: '#D6A24E',
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

import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  ActionButton,
  Badge,
  EmptyState,
  HubScreen,
  Section,
  StepStrip,
  Surface,
} from '../components/hub-ui.jsx';
import { formatDateLine } from '../lib/format.js';
import { getGameBySlug, getTournamentBySlug, getTournamentPath } from '../lib/siteData.js';
import { getEffectiveRegistrationStatus, mergeTournamentSettings } from '../lib/tournamentSettings.js';
import {
  createPlayerAccount,
  fetchPlayerAccount,
  fetchSignupSummary,
  fetchTournamentBracket,
  fetchTournamentEvent,
  loginPlayerAccount,
  logoutPlayerAccount,
  submitTournamentSignup,
} from '../lib/tournamentHostingClient.js';

function signupCountLabel(count, loading = false) {
  if (loading) return 'Loading';
  return `${count} signed up`;
}

const PASSWORD_REQUIREMENT_ITEMS = [
  {
    key: 'length',
    label: 'At least 8 characters',
    isMet: (value) => value.length >= 8,
  },
  {
    key: 'mix',
    label: 'Includes a number or symbol',
    isMet: (value) => /[0-9\W_]/.test(value),
  },
];

function getPasswordRequirements(password, confirmPassword) {
  return [
    ...PASSWORD_REQUIREMENT_ITEMS.map((item) => ({
      key: item.key,
      label: item.label,
      met: item.isMet(password),
    })),
    {
      key: 'match',
      label: 'Passwords match',
      met: Boolean(confirmPassword) && password === confirmPassword,
    },
  ];
}

function getPasswordError(password, confirmPassword) {
  if (password.length < 8) {
    return 'Use at least 8 characters for your account password.';
  }

  if (!/[0-9\W_]/.test(password)) {
    return 'Include at least one number or symbol in your account password.';
  }

  if (password !== confirmPassword) {
    return 'Enter the same password in both password fields.';
  }

  return '';
}

function normalizeAccountMode(value) {
  return value === 'signin' || value === 'login' ? 'login' : 'create';
}

const PLAYER_ACCOUNT_CHANGED_EVENT = 'one-v-one-tournaments-player-account-changed';

function notifyPlayerAccountChanged() {
  if (typeof globalThis.dispatchEvent !== 'function' || typeof globalThis.Event !== 'function') {
    return;
  }

  globalThis.dispatchEvent(new Event(PLAYER_ACCOUNT_CHANGED_EVENT));
}

export default function CheckInScreen({ slug, initialAccountMode = 'create' }) {
  const seededTournament = getTournamentBySlug(slug);
  const [hostedTournament, setHostedTournament] = useState(null);
  const [tournamentLookup, setTournamentLookup] = useState({ loading: true, error: '' });
  const tournament = useMemo(
    () => (hostedTournament ? { ...(seededTournament || {}), ...hostedTournament } : seededTournament),
    [hostedTournament, seededTournament],
  );
  const tournamentSlug = tournament?.slug || '';
  const accountLoadIdRef = useRef(0);
  const [playerName, setPlayerName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [playerHandle, setPlayerHandle] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signup, setSignup] = useState(null);
  const [error, setError] = useState('');
  const [account, setAccount] = useState(null);
  const [accountMode, setAccountMode] = useState(() => normalizeAccountMode(initialAccountMode));
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const [accountMessage, setAccountMessage] = useState('');
  const [accountError, setAccountError] = useState('');
  const [signupSummary, setSignupSummary] = useState({ count: 0, signups: [], loading: true, error: '' });
  const [liveBracket, setLiveBracket] = useState(null);
  const [tournamentSettings, setTournamentSettings] = useState(null);
  const liveTournament = useMemo(
    () => mergeTournamentSettings(tournament, tournamentSettings),
    [tournament, tournamentSettings],
  );

  useEffect(() => {
    let active = true;

    async function loadTournamentRecord() {
      if (!slug) {
        setTournamentLookup({ loading: false, error: '' });
        setHostedTournament(null);
        return;
      }

      setTournamentLookup({ loading: !seededTournament, error: '' });

      try {
        const result = await fetchTournamentEvent({ slug });

        if (active) {
          setHostedTournament(result.tournament || null);
          setTournamentLookup({ loading: false, error: '' });
        }
      } catch (loadError) {
        if (active) {
          setHostedTournament(null);
          setTournamentLookup({
            loading: false,
            error: loadError instanceof Error ? loadError.message : 'Tournament record could not be loaded.',
          });
        }
      }
    }

    loadTournamentRecord();

    return () => {
      active = false;
    };
  }, [slug, seededTournament]);

  useEffect(() => {
    let active = true;

    async function loadPlayerAccount() {
      const loadId = accountLoadIdRef.current + 1;
      accountLoadIdRef.current = loadId;
      setAccountLoading(true);
      setAccountError('');

      try {
        const result = await fetchPlayerAccount();

        if (active && loadId === accountLoadIdRef.current) {
          const nextAccount = result.account || null;
          setAccount(nextAccount);

          if (nextAccount) {
            notifyPlayerAccountChanged();
          }
        }
      } catch (loadError) {
        if (active && loadId === accountLoadIdRef.current) {
          setAccount(null);
          setAccountError(loadError instanceof Error ? loadError.message : 'Player account could not be loaded.');
        }
      } finally {
        if (active && loadId === accountLoadIdRef.current) {
          setAccountLoading(false);
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

    async function loadSignupSummary() {
      if (!tournamentSlug) {
        setTournamentSettings(null);
        setSignupSummary({ count: 0, signups: [], loading: false, error: '' });
        return;
      }

      setSignupSummary((current) => ({ ...current, loading: true, error: '' }));

      try {
        const result = await fetchSignupSummary({ slug: tournamentSlug });

        if (active) {
          setTournamentSettings(result.settings || null);
          setSignupSummary({
            count: result.signupCount || 0,
            signups: result.signups || [],
            loading: false,
            error: '',
          });
        }
      } catch (summaryError) {
        if (active) {
          setTournamentSettings(null);
          setSignupSummary({
            count: 0,
            signups: [],
            loading: false,
            error: summaryError instanceof Error ? summaryError.message : 'Signup count could not be loaded.',
          });
        }
      }
    }

    loadSignupSummary();

    async function loadBracket() {
      if (!tournamentSlug) {
        setLiveBracket(null);
        return;
      }

      try {
        const result = await fetchTournamentBracket({ slug: tournamentSlug });

        if (active) {
          setLiveBracket(result.bracket || null);
        }
      } catch {
        if (active) {
          setLiveBracket(null);
        }
      }
    }

    loadBracket();

    return () => {
      active = false;
    };
  }, [tournamentSlug, account?.id]);

  function applySignupResult(result) {
    setSignup(result.signup);
    setSignupSummary((current) => ({
      count: result.summary?.signupCount || current.count + 1,
      signups: result.summary?.signups || current.signups || [],
      loading: false,
      error: '',
    }));
    setNotes('');
  }

  async function saveSignupWithCurrentSession() {
    if (!liveTournament) {
      throw new Error('Choose a valid tournament before signing up.');
    }

    const effectiveRegistrationMeta = getEffectiveRegistrationStatus(liveTournament, { hasLiveBracket: Boolean(liveBracket) });

    if (effectiveRegistrationMeta.value !== 'open') {
      throw new Error(effectiveRegistrationMeta.actionCopy);
    }

    const result = await submitTournamentSignup({
      tournamentSlug: liveTournament.slug,
      tournamentDate: liveTournament.date,
      notes,
    });

    applySignupResult(result);
    return result.signup;
  }

  async function handleSubmitSignup() {
    if (!account) {
      setError('Create or sign in to a player account before signing up.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSignup(null);

    try {
      await saveSignupWithCurrentSession();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Signup could not be saved.');
    } finally {
      setSubmitting(false);
    }
  }

  async function loadConfirmedAccount(fallbackAccount) {
    try {
      const refreshed = await fetchPlayerAccount();
      return refreshed.account || fallbackAccount;
    } catch {
      return fallbackAccount;
    }
  }

  async function handleCreateAccount() {
    const passwordError = getPasswordError(password, confirmPassword);

    if (passwordError) {
      setAccountError(passwordError);
      setAccountMessage('');
      return;
    }

    accountLoadIdRef.current += 1;
    setAccountSubmitting(true);
    setAccountError('');
    setAccountMessage('');
    setError('');
    setSignup(null);

    try {
      const result = await createPlayerAccount({
        playerName,
        contactEmail,
        playerHandle,
        password,
        confirmPassword,
      });
      const nextAccount = await loadConfirmedAccount(result.account);
      const accountDisplayName = nextAccount?.playerName || result.account?.playerName || playerName || 'your account';

      setAccount(nextAccount);
      notifyPlayerAccountChanged();
      setPlayerName(nextAccount?.playerName || playerName);
      setContactEmail(nextAccount?.email || contactEmail);
      setPlayerHandle(nextAccount?.playerHandle || playerHandle);
      setPassword('');
      setConfirmPassword('');

      if (registrationOpen) {
        try {
          const savedSignup = await saveSignupWithCurrentSession();
          setAccountMessage(`Account created. ${savedSignup.playerName} is signed up for this tournament.`);
        } catch (signupError) {
          setAccountMessage(`Account created. You are signed in as ${accountDisplayName}.`);
          setError(signupError instanceof Error ? signupError.message : 'Tap Sign up to reserve your spot.');
        }
      } else {
        setAccountMessage(`Account created. You are signed in as ${accountDisplayName}.`);
      }
    } catch (createError) {
      setAccountError(createError instanceof Error ? createError.message : 'Player account could not be created.');
    } finally {
      setAccountSubmitting(false);
      setAccountLoading(false);
    }
  }

  async function handleLoginAccount() {
    accountLoadIdRef.current += 1;
    setAccountSubmitting(true);
    setAccountError('');
    setAccountMessage('');
    setError('');
    setSignup(null);

    try {
      const result = await loginPlayerAccount({
        contactEmail,
        password,
      });
      const nextAccount = await loadConfirmedAccount(result.account);
      const accountDisplayName = nextAccount?.playerName || result.account?.playerName || contactEmail || 'your account';

      setAccount(nextAccount);
      notifyPlayerAccountChanged();
      setPlayerName(nextAccount?.playerName || '');
      setContactEmail(nextAccount?.email || contactEmail);
      setPlayerHandle(nextAccount?.playerHandle || '');
      setPassword('');
      setConfirmPassword('');

      if (registrationOpen) {
        try {
          const savedSignup = await saveSignupWithCurrentSession();
          setAccountMessage(`Signed in. ${savedSignup.playerName} is on the tournament roster.`);
        } catch (signupError) {
          setAccountMessage(`Signed in as ${accountDisplayName}.`);
          setError(signupError instanceof Error ? signupError.message : 'Tap Sign up to reserve your spot.');
        }
      } else {
        setAccountMessage(`Signed in as ${accountDisplayName}.`);
      }
    } catch (loginError) {
      setAccountError(loginError instanceof Error ? loginError.message : 'Player account could not be opened.');
    } finally {
      setAccountSubmitting(false);
      setAccountLoading(false);
    }
  }

  async function handleLogoutAccount() {
    accountLoadIdRef.current += 1;
    setAccountSubmitting(true);
    setAccountError('');
    setAccountMessage('');
    setSignup(null);

    try {
      await logoutPlayerAccount();
      setAccount(null);
      notifyPlayerAccountChanged();
      setAccountMessage('Signed out. Sign back in before joining another tournament.');
    } catch (logoutError) {
      setAccountError(logoutError instanceof Error ? logoutError.message : 'Player account could not be signed out.');
    } finally {
      setAccountSubmitting(false);
      setAccountLoading(false);
    }
  }

  if (!tournament) {
    if (tournamentLookup.loading) {
      return (
        <HubScreen
          actions={[{ label: 'Home', href: '/' }]}
          eyebrow="Loading check-in"
          lead="Looking up this hosted tournament signup page."
          subtitle="Host-posted events load from the tournament catalog."
          title="Loading signup">
          <EmptyState
            body="One moment while the event details load."
            title="Checking tournament"
          />
        </HubScreen>
      );
    }

    return (
      <HubScreen
        actions={[{ label: 'Home', href: '/' }]}
        eyebrow="Check-in not found"
        lead="That tournament signup page is not available."
        subtitle="Use the tournament page if you were looking for an event."
        title="Unknown check-in page">
        <EmptyState
          action={<ActionButton href="/">Back home</ActionButton>}
          body={tournamentLookup.error || 'The signup route is ready, but the matching public tournament record still needs to be added.'}
          title="Nothing to display"
        />
      </HubScreen>
    );
  }

  const visibleTournament = liveTournament || tournament;
  const game = getGameBySlug(visibleTournament.gameSlug);
  const checkIn = visibleTournament.checkIn;
  const registrationMeta = getEffectiveRegistrationStatus(visibleTournament, { hasLiveBracket: Boolean(liveBracket) });
  const registrationOpen = registrationMeta.value === 'open';
  const passwordRequirements = getPasswordRequirements(password, confirmPassword);
  const hasSignupConfirmation = Boolean(signup);
  const wantsAccountSwitch = Boolean(account && accountMode === 'login');
  const mainTitle = hasSignupConfirmation
    ? 'You are on the roster'
    : wantsAccountSwitch
      ? 'This browser is already signed in.'
    : account
      ? 'Account ready. Join this event.'
      : 'Create account and join in one step';
  const mainCopy = hasSignupConfirmation
    ? 'You are signed up. Come back here or use My Match when the bracket is published.'
    : wantsAccountSwitch
      ? 'If this is not the player who is joining, sign out first, then sign in with the correct account.'
    : account
      ? 'Your account is signed in. One more tap reserves your tournament spot.'
      : 'New players create an account once. If registration is open, this also reserves the tournament spot.';
  const authActionLabel = accountMode === 'create'
    ? registrationOpen
      ? 'Create account + join tournament'
      : 'Create account'
    : registrationOpen
      ? 'Sign in + join tournament'
      : 'Sign in';

  return (
    <HubScreen
      actions={[
        { label: 'Tournament page', href: getTournamentPath(visibleTournament.slug) },
        { label: 'Rules', href: '/rules', variant: 'secondary' },
        { label: 'Live', href: '/live', variant: 'ghost' },
      ]}
      eyebrow="Tournament signup"
      footerNote="Player accounts are required for tournament signups. Entry is free and no wagering is allowed."
      lead="Create or sign in to a player account, then reserve your spot. This keeps match seats tied to real tournament accounts."
      stats={[
        { label: 'Registration', value: registrationMeta.label, tone: registrationMeta.tone },
        { label: 'Account', value: account ? 'Signed in' : 'Required', tone: account ? 'green' : 'accent' },
        { label: 'Signed up', value: signupCountLabel(signupSummary.count, signupSummary.loading), tone: signupSummary.count ? 'green' : 'blue' },
        { label: 'Check-in', value: checkIn?.preview || 'TBD', tone: 'accent' },
        { label: 'Entry', value: 'Free', tone: 'green' },
      ]}
      subtitle={`${game?.name || 'Tournament'} • ${formatDateLine(visibleTournament.date, visibleTournament.timeZone, visibleTournament.timeZoneLabel)}`}
      title={`Sign up for ${visibleTournament.title}`}>
      <Section
        description="Public roster names appear here as soon as signups are saved. Signed-in players see themselves marked."
        title="Current roster">
        <SignupRosterPanel
          account={account}
          latestSignup={signup}
          signupSummary={signupSummary}
        />
      </Section>

      <Section description="One clear path: account first, roster second, match link after the bracket goes live." title="Join this tournament">
        <Surface style={styles.signupCard}>
          <View style={styles.summaryTopRow}>
            <Badge tone="green">{signupCountLabel(signupSummary.count, signupSummary.loading)}</Badge>
            <Text style={styles.summaryWindow}>{registrationMeta.label}</Text>
          </View>
          <Text style={styles.summaryTitle}>{mainTitle}</Text>
          <Text style={styles.summaryCopy}>{mainCopy}</Text>
          <Text style={styles.timelineCopy}>
            {registrationMeta.actionCopy} {checkIn?.window || 'The host publishes the bracket and match links when the event is ready.'}
          </Text>
          {signupSummary.error ? <Text style={styles.mutedWarning}>{signupSummary.error}</Text> : null}

          <View style={styles.flowSteps}>
            <View style={[styles.flowStep, (account || hasSignupConfirmation) && styles.flowStepComplete]}>
              <Badge tone={account || hasSignupConfirmation ? 'green' : 'accent'}>1</Badge>
              <View style={styles.flowStepCopy}>
                <Text style={styles.flowStepTitle}>Account</Text>
                <Text style={styles.flowStepText}>{account ? account.playerName : 'Create or sign in'}</Text>
              </View>
            </View>
            <View style={[styles.flowStep, hasSignupConfirmation && styles.flowStepComplete]}>
              <Badge tone={hasSignupConfirmation ? 'green' : account ? 'accent' : 'blue'}>2</Badge>
              <View style={styles.flowStepCopy}>
                <Text style={styles.flowStepTitle}>Roster</Text>
                <Text style={styles.flowStepText}>{hasSignupConfirmation ? 'Spot reserved' : 'Join tournament'}</Text>
              </View>
            </View>
            <View style={styles.flowStep}>
              <Badge tone="blue">3</Badge>
              <View style={styles.flowStepCopy}>
                <Text style={styles.flowStepTitle}>Match</Text>
                <Text style={styles.flowStepText}>Open when bracket is live</Text>
              </View>
            </View>
          </View>

          {accountLoading ? <Text style={styles.summaryCopy}>Checking account status...</Text> : null}

          {account ? (
            <>
              {wantsAccountSwitch ? (
                <View style={styles.switchAccountPanel}>
                  <Badge tone="accent">Signed in</Badge>
                  <Text style={styles.switchAccountTitle}>{account.playerName}</Text>
                  <Text style={styles.switchAccountCopy}>
                    This is the active account in this browser. Sign out before another player signs in on this device.
                  </Text>
                  <View style={styles.buttonRow}>
                    <ActionButton onPress={handleLogoutAccount}>
                      {accountSubmitting ? 'Signing out...' : 'Sign out to switch'}
                    </ActionButton>
                    <ActionButton href={getTournamentPath(visibleTournament.slug)} variant="secondary">
                      Continue as {account.playerName}
                    </ActionButton>
                  </View>
                </View>
              ) : null}

              <View style={[styles.accountPanel, hasSignupConfirmation && styles.accountPanelComplete]}>
                <View style={styles.summaryTopRow}>
                  <Badge tone="green">{hasSignupConfirmation ? 'Roster confirmed' : 'Account linked'}</Badge>
                  <Text style={styles.accountEmail}>{account.email}</Text>
                </View>
                <Text style={styles.accountName}>{account.playerName}</Text>
                {account.playerHandle ? <Text style={styles.summaryCopy}>{account.playerHandle}</Text> : null}
                <Text style={styles.accountStatusCopy}>
                  {hasSignupConfirmation
                    ? `Signed up for ${visibleTournament.title}.`
                    : 'Your account is ready for this tournament roster.'}
                </Text>
              </View>

              {hasSignupConfirmation ? null : (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Notes</Text>
                  <TextInput
                    multiline
                    onChangeText={setNotes}
                    placeholder="Optional availability note"
                    placeholderTextColor="#6B766F"
                    style={styles.notesInput}
                    value={notes}
                  />
                </View>
              )}

              <View style={styles.buttonRow}>
                {wantsAccountSwitch ? null : hasSignupConfirmation ? (
                  <ActionButton href={`${getTournamentPath(visibleTournament.slug)}#my-match`}>
                    Find my match
                  </ActionButton>
                ) : (
                  <ActionButton disabled={!registrationOpen || submitting} onPress={handleSubmitSignup}>
                    {registrationOpen ? (submitting ? 'Saving...' : 'Join tournament roster') : registrationMeta.label}
                  </ActionButton>
                )}
                {wantsAccountSwitch ? null : (
                  <ActionButton href={getTournamentPath(visibleTournament.slug)} variant="secondary">
                    Tournament page
                  </ActionButton>
                )}
                {wantsAccountSwitch ? null : (
                  <ActionButton onPress={handleLogoutAccount} variant="ghost">
                    {accountSubmitting ? 'Signing out...' : 'Sign out'}
                  </ActionButton>
                )}
              </View>
            </>
          ) : (
            <>
              <View style={styles.modeRow}>
                <ActionButton
                  disabled={accountSubmitting}
                  onPress={() => {
                    setAccountMode('create');
                    setAccountError('');
                    setAccountMessage('');
                  }}
                  variant={accountMode === 'create' ? 'primary' : 'secondary'}>
                  New player
                </ActionButton>
                <ActionButton
                  disabled={accountSubmitting}
                  onPress={() => {
                    setAccountMode('login');
                    setConfirmPassword('');
                    setAccountError('');
                    setAccountMessage('');
                  }}
                  variant={accountMode === 'login' ? 'primary' : 'secondary'}>
                  Already have account
                </ActionButton>
              </View>
              <Text style={styles.modeHint}>
                {accountMode === 'create'
                  ? 'Create the player account once. The same button will try to reserve the tournament spot.'
                  : 'Sign in with the account email and password, then we will try to reserve the spot.'}
              </Text>

              {accountMode === 'create' ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Player name</Text>
                  <TextInput
                    autoCapitalize="words"
                    onChangeText={setPlayerName}
                    placeholder="Your tournament name"
                    placeholderTextColor="#6B766F"
                    style={styles.input}
                    value={playerName}
                  />
                </View>
              ) : null}

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Account email</Text>
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
                <Text style={styles.fieldLabel}>Password</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  placeholderTextColor="#6B766F"
                  secureTextEntry
                  style={styles.input}
                  value={password}
                />
              </View>

              {accountMode === 'create' ? (
                <>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Confirm password</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={setConfirmPassword}
                      placeholder="Type it again"
                      placeholderTextColor="#6B766F"
                      secureTextEntry
                      style={styles.input}
                      value={confirmPassword}
                    />
                  </View>

                  <View style={styles.passwordRequirements}>
                    <Text style={styles.requirementTitle}>Password requirements</Text>
                    {passwordRequirements.map((item) => (
                      <View key={item.key} style={styles.requirementRow}>
                        <Badge style={styles.requirementBadge} tone={item.met ? 'green' : 'accent'}>
                          {item.met ? 'OK' : 'Needed'}
                        </Badge>
                        <Text style={styles.requirementText}>{item.label}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}

              {accountMode === 'create' ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Player handle</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setPlayerHandle}
                    placeholder="Optional Spades name, Discord, or YouTube"
                    placeholderTextColor="#6B766F"
                    style={styles.input}
                    value={playerHandle}
                  />
                </View>
              ) : null}

              <View style={styles.buttonRow}>
                {accountMode === 'create' ? (
                  <ActionButton disabled={accountSubmitting || accountLoading} onPress={handleCreateAccount}>
                    {accountSubmitting ? 'Creating...' : authActionLabel}
                  </ActionButton>
                ) : (
                  <ActionButton disabled={accountSubmitting || accountLoading} onPress={handleLoginAccount}>
                    {accountSubmitting ? 'Opening...' : authActionLabel}
                  </ActionButton>
                )}
              </View>
            </>
          )}

          {accountMessage ? <Text style={styles.successText}>{accountMessage}</Text> : null}
          {accountError ? <Text style={styles.errorText}>{accountError}</Text> : null}
          {signup ? (
            <View style={styles.confirmationPanel}>
              <Badge tone="green">Signup saved</Badge>
              <Text style={styles.confirmationTitle}>{signup.playerName} is registered.</Text>
              <Text style={styles.confirmationCopy}>Confirmation ID: {signup.id}</Text>
            </View>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </Surface>
      </Section>

      <Section description="What happens after your signup is saved." title="What happens next">
        <StepStrip
          steps={[
            { title: 'Join roster', body: 'Your account becomes the tournament identity for this event.' },
            { title: 'Wait for bracket', body: 'The host publishes match IDs from the live signup roster near start time.' },
            { title: 'Open match link', body: 'Your match card opens the Spades room when the bracket is ready.' },
          ]}
        />
      </Section>
    </HubScreen>
  );
}

function isOwnSignup(signup, account, latestSignup) {
  if (!signup) return false;
  if (signup.currentPlayer) return true;
  if (latestSignup?.id && signup.id === latestSignup.id) return true;

  const accountName = String(account?.playerName || '').trim().toLowerCase();
  const signupName = String(signup.playerName || '').trim().toLowerCase();
  return Boolean(accountName && signupName && accountName === signupName);
}

function SignupRosterPanel({ account, latestSignup, signupSummary }) {
  const signups = signupSummary.signups || [];
  const ownSignup = signups.find((signupItem) => isOwnSignup(signupItem, account, latestSignup)) || latestSignup || null;

  return (
    <Surface style={styles.rosterCard}>
      <View style={styles.rosterHeroRow}>
        <View style={styles.rosterHeroTile}>
          <Text style={styles.rosterHeroLabel}>Registered</Text>
          <Text style={styles.rosterHeroValue}>{signupSummary.loading ? '--' : signupSummary.count}</Text>
          <Text style={styles.rosterHeroMeta}>public roster</Text>
        </View>
        <View style={[styles.rosterHeroTile, ownSignup && styles.rosterHeroTileCurrent]}>
          <Text style={styles.rosterHeroLabel}>Your status</Text>
          <Text style={styles.rosterHeroValueSmall}>{ownSignup ? 'You are in' : account ? 'Not joined' : 'Sign in'}</Text>
          <Text style={styles.rosterHeroMeta}>{ownSignup?.playerName || account?.playerName || 'Open your account'}</Text>
        </View>
      </View>

      <View style={styles.rosterHeader}>
        <Badge tone={signupSummary.count ? 'green' : 'blue'}>
          {signupCountLabel(signupSummary.count, signupSummary.loading)}
        </Badge>
        <Text style={styles.rosterHeaderText}>
          {account ? `Signed in as ${account.playerName}` : 'Sign in to mark your own roster row.'}
        </Text>
      </View>

      {signupSummary.error ? <Text style={styles.rosterWarning}>{signupSummary.error}</Text> : null}

      {signupSummary.loading ? (
        <Text style={styles.rosterEmptyText}>Loading registered players...</Text>
      ) : signups.length ? (
        <View style={styles.rosterList}>
          {signups.map((signupItem, index) => {
            const ownRow = isOwnSignup(signupItem, account, latestSignup);

            return (
              <View
                key={signupItem.id || `${signupItem.playerName}-${index}`}
                style={[styles.rosterRow, ownRow && styles.rosterRowCurrent]}>
                <View style={[styles.rosterRank, ownRow && styles.rosterRankCurrent]}>
                  <Text style={[styles.rosterRankText, ownRow && styles.rosterRankTextCurrent]}>{index + 1}</Text>
                </View>
                <View style={styles.rosterPlayerCopy}>
                  <View style={styles.rosterNameRow}>
                    <Text style={styles.rosterPlayerName}>{signupItem.playerName || 'Unnamed player'}</Text>
                    {ownRow ? <Badge tone="green">You</Badge> : null}
                  </View>
                  <Text style={styles.rosterPlayerMeta}>
                    {signupItem.playerHandle ? signupItem.playerHandle : 'No handle added'} • {signupItem.status || 'registered'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.rosterEmptyText}>
          No players are registered yet. Create an account and join to become the first name on the roster.
        </Text>
      )}
    </Surface>
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
  signupCard: {
    borderColor: 'rgba(97, 210, 145, 0.30)',
  },
  rosterCard: {
    borderColor: 'rgba(97, 210, 145, 0.30)',
  },
  rosterHeroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  rosterHeroTile: {
    backgroundColor: 'rgba(97, 210, 145, 0.08)',
    borderColor: 'rgba(97, 210, 145, 0.30)',
    borderRadius: 16,
    borderWidth: 1,
    flexGrow: 1,
    flexBasis: 170,
    padding: 14,
  },
  rosterHeroTileCurrent: {
    backgroundColor: 'rgba(214, 162, 78, 0.12)',
    borderColor: 'rgba(214, 162, 78, 0.50)',
  },
  rosterHeroLabel: {
    color: '#AAB4AE',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  rosterHeroValue: {
    color: '#F4EFE6',
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
    marginTop: 3,
  },
  rosterHeroValueSmall: {
    color: '#F4EFE6',
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 27,
    marginTop: 5,
  },
  rosterHeroMeta: {
    color: '#61D291',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 2,
  },
  rosterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14,
  },
  rosterHeaderText: {
    color: '#AAB4AE',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    minWidth: 220,
  },
  rosterWarning: {
    color: '#FFB4A8',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginBottom: 12,
  },
  rosterEmptyText: {
    color: '#AAB4AE',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  rosterList: {
    gap: 10,
  },
  rosterRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 12,
  },
  rosterRowCurrent: {
    backgroundColor: 'rgba(97, 210, 145, 0.11)',
    borderColor: 'rgba(97, 210, 145, 0.44)',
  },
  rosterRank: {
    alignItems: 'center',
    backgroundColor: 'rgba(97, 210, 145, 0.14)',
    borderColor: 'rgba(97, 210, 145, 0.42)',
    borderRadius: 999,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    marginRight: 12,
    width: 36,
  },
  rosterRankCurrent: {
    backgroundColor: 'rgba(214, 162, 78, 0.18)',
    borderColor: 'rgba(214, 162, 78, 0.60)',
  },
  rosterRankText: {
    color: '#61D291',
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '900',
  },
  rosterRankTextCurrent: {
    color: '#D6A24E',
  },
  rosterPlayerCopy: {
    flex: 1,
    minWidth: 0,
  },
  rosterNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rosterPlayerName: {
    color: '#F4EFE6',
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 23,
  },
  rosterPlayerMeta: {
    color: '#AAB4AE',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 2,
  },
  flowSteps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  flowStep: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    flexBasis: 220,
    gap: 10,
    padding: 12,
  },
  flowStepComplete: {
    backgroundColor: 'rgba(97, 210, 145, 0.09)',
    borderColor: 'rgba(97, 210, 145, 0.34)',
  },
  flowStepCopy: {
    flex: 1,
    minWidth: 0,
  },
  flowStepTitle: {
    color: '#F4EFE6',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  flowStepText: {
    color: '#AAB4AE',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  switchAccountPanel: {
    borderWidth: 1,
    borderColor: 'rgba(214, 162, 78, 0.38)',
    borderRadius: 18,
    backgroundColor: 'rgba(214, 162, 78, 0.09)',
    marginTop: 16,
    padding: 14,
  },
  switchAccountTitle: {
    color: '#F4EFE6',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
    marginTop: 10,
  },
  switchAccountCopy: {
    color: '#D4DDD7',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 6,
  },
  accountPanel: {
    borderWidth: 1,
    borderColor: 'rgba(97, 210, 145, 0.30)',
    borderRadius: 18,
    backgroundColor: 'rgba(97, 210, 145, 0.08)',
    marginTop: 16,
    padding: 14,
  },
  accountPanelComplete: {
    borderColor: 'rgba(214, 162, 78, 0.44)',
    backgroundColor: 'rgba(214, 162, 78, 0.08)',
  },
  accountEmail: {
    color: '#6CC7FF',
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'right',
  },
  accountName: {
    color: '#F4EFE6',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  accountStatusCopy: {
    color: '#AAB4AE',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 8,
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
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  modeHint: {
    color: '#D6A24E',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 12,
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
  passwordRequirements: {
    borderWidth: 1,
    borderColor: 'rgba(108, 199, 255, 0.26)',
    borderRadius: 16,
    backgroundColor: 'rgba(108, 199, 255, 0.08)',
    marginTop: 12,
    padding: 12,
  },
  requirementBadge: {
    minWidth: 74,
  },
  requirementRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 10,
  },
  requirementText: {
    color: '#F4EFE6',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  requirementTitle: {
    color: '#6CC7FF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
  timelineCopy: {
    color: '#6CC7FF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 8,
  },
  mutedWarning: {
    color: '#D6A24E',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    fontWeight: '700',
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
  confirmationPanel: {
    backgroundColor: 'rgba(97, 210, 145, 0.10)',
    borderColor: 'rgba(97, 210, 145, 0.36)',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  confirmationTitle: {
    color: '#F4EFE6',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
    marginTop: 10,
  },
  confirmationCopy: {
    color: '#AAB4AE',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 4,
  },
});

import { useEffect, useMemo, useState } from 'react';
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

export default function CheckInScreen({ slug, initialAccountMode = 'create' }) {
  const tournament = getTournamentBySlug(slug);
  const tournamentSlug = tournament?.slug || '';
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
  const [signupSummary, setSignupSummary] = useState({ count: 0, loading: true, error: '' });
  const [liveBracket, setLiveBracket] = useState(null);
  const [tournamentSettings, setTournamentSettings] = useState(null);
  const liveTournament = useMemo(
    () => mergeTournamentSettings(tournament, tournamentSettings),
    [tournament, tournamentSettings],
  );

  useEffect(() => {
    let active = true;

    async function loadPlayerAccount() {
      setAccountLoading(true);
      setAccountError('');

      try {
        const result = await fetchPlayerAccount();

        if (active) {
          setAccount(result.account || null);
        }
      } catch (loadError) {
        if (active) {
          setAccount(null);
          setAccountError(loadError instanceof Error ? loadError.message : 'Player account could not be loaded.');
        }
      } finally {
        if (active) {
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
        setSignupSummary({ count: 0, loading: false, error: '' });
        return;
      }

      setSignupSummary((current) => ({ ...current, loading: true, error: '' }));

      try {
        const result = await fetchSignupSummary({ slug: tournamentSlug });

        if (active) {
          setTournamentSettings(result.settings || null);
          setSignupSummary({
            count: result.signupCount || 0,
            loading: false,
            error: '',
          });
        }
      } catch (summaryError) {
        if (active) {
          setTournamentSettings(null);
          setSignupSummary({
            count: 0,
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
  }, [tournamentSlug]);

  async function handleSubmitSignup() {
    if (!liveTournament) {
      setError('Choose a valid tournament before signing up.');
      return;
    }

    const effectiveRegistrationMeta = getEffectiveRegistrationStatus(liveTournament, { hasLiveBracket: Boolean(liveBracket) });

    if (effectiveRegistrationMeta.value !== 'open') {
      setError(effectiveRegistrationMeta.actionCopy);
      return;
    }

    if (!account) {
      setError('Create or sign in to a player account before signing up.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSignup(null);

    try {
      const result = await submitTournamentSignup({
        tournamentSlug: liveTournament.slug,
        tournamentDate: liveTournament.date,
        notes,
      });

      setSignup(result.signup);
      setSignupSummary((current) => ({
        count: result.summary?.signupCount || current.count + 1,
        loading: false,
        error: '',
      }));
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

  async function handleCreateAccount() {
    const passwordError = getPasswordError(password, confirmPassword);

    if (passwordError) {
      setAccountError(passwordError);
      setAccountMessage('');
      return;
    }

    setAccountSubmitting(true);
    setAccountError('');
    setAccountMessage('');

    try {
      const result = await createPlayerAccount({
        playerName,
        contactEmail,
        playerHandle,
        password,
        confirmPassword,
      });

      setAccount(result.account);
      setPassword('');
      setConfirmPassword('');
      setAccountMessage(`Signed in as ${result.account.playerName}.`);
    } catch (createError) {
      setAccountError(createError instanceof Error ? createError.message : 'Player account could not be created.');
    } finally {
      setAccountSubmitting(false);
    }
  }

  async function handleLoginAccount() {
    setAccountSubmitting(true);
    setAccountError('');
    setAccountMessage('');

    try {
      const result = await loginPlayerAccount({
        contactEmail,
        password,
      });

      setAccount(result.account);
      setPlayerName(result.account.playerName || '');
      setPlayerHandle(result.account.playerHandle || '');
      setPassword('');
      setConfirmPassword('');
      setAccountMessage(`Signed in as ${result.account.playerName}.`);
    } catch (loginError) {
      setAccountError(loginError instanceof Error ? loginError.message : 'Player account could not be opened.');
    } finally {
      setAccountSubmitting(false);
    }
  }

  async function handleLogoutAccount() {
    setAccountSubmitting(true);
    setAccountError('');
    setAccountMessage('');

    try {
      await logoutPlayerAccount();
      setAccount(null);
      setAccountMessage('Signed out. Sign back in before joining another tournament.');
    } catch (logoutError) {
      setAccountError(logoutError instanceof Error ? logoutError.message : 'Player account could not be signed out.');
    } finally {
      setAccountSubmitting(false);
    }
  }

  if (!tournament) {
    return (
      <HubScreen
        actions={[{ label: 'Home', href: '/' }]}
        eyebrow="Check-in not found"
        lead="That tournament signup page is not available."
        subtitle="Use the tournament page if you were looking for an event."
        title="Unknown check-in page">
        <EmptyState
          action={<ActionButton href="/">Back home</ActionButton>}
          body="The signup route is ready, but the matching public tournament record still needs to be added."
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
      <Section description="Create or open your player account, then join the event roster." title="Sign up now">
        <Surface style={styles.signupCard}>
          <View style={styles.summaryTopRow}>
            <Badge tone="green">{signupCountLabel(signupSummary.count, signupSummary.loading)}</Badge>
            <Text style={styles.summaryWindow}>{checkIn?.window || 'Registration open'}</Text>
          </View>
          <Text style={styles.summaryTitle}>{account ? 'Reserve your spot' : 'Start with a player account'}</Text>
          <Text style={styles.summaryCopy}>
            Your account connects the roster, bracket, and future match-room access.
          </Text>
          <Text style={styles.timelineCopy}>
            {registrationMeta.actionCopy} The host publishes the bracket and match links when the event is ready to run.
          </Text>
          {signupSummary.error ? <Text style={styles.mutedWarning}>{signupSummary.error}</Text> : null}

          {accountLoading ? <Text style={styles.summaryCopy}>Checking account status...</Text> : null}

          {account ? (
            <>
              <View style={styles.accountPanel}>
                <View style={styles.summaryTopRow}>
                  <Badge tone="green">Account linked</Badge>
                  <Text style={styles.accountEmail}>{account.email}</Text>
                </View>
                <Text style={styles.accountName}>{account.playerName}</Text>
                {account.playerHandle ? <Text style={styles.summaryCopy}>{account.playerHandle}</Text> : null}
              </View>

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

              <View style={styles.buttonRow}>
                <ActionButton disabled={!registrationOpen || submitting} onPress={handleSubmitSignup}>
                  {registrationOpen ? (submitting ? 'Saving...' : 'Sign up') : registrationMeta.label}
                </ActionButton>
                <ActionButton href={getTournamentPath(visibleTournament.slug)} variant="secondary">
                  Event details
                </ActionButton>
                <ActionButton onPress={handleLogoutAccount} variant="ghost">
                  {accountSubmitting ? 'Signing out...' : 'Sign out'}
                </ActionButton>
              </View>
            </>
          ) : (
            <>
              <View style={styles.modeRow}>
                <ActionButton
                  onPress={() => {
                    setAccountMode('create');
                    setAccountError('');
                    setAccountMessage('');
                  }}
                  variant={accountMode === 'create' ? 'primary' : 'secondary'}>
                  Create account
                </ActionButton>
                <ActionButton
                  onPress={() => {
                    setAccountMode('login');
                    setConfirmPassword('');
                    setAccountError('');
                    setAccountMessage('');
                  }}
                  variant={accountMode === 'login' ? 'primary' : 'secondary'}>
                  Sign in
                </ActionButton>
              </View>

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
                  <ActionButton onPress={handleCreateAccount}>
                    {accountSubmitting ? 'Saving...' : 'Create account and continue'}
                  </ActionButton>
                ) : (
                  <ActionButton onPress={handleLoginAccount}>
                    {accountSubmitting ? 'Opening...' : 'Sign in and continue'}
                  </ActionButton>
                )}
              </View>
            </>
          )}

          {accountMessage ? <Text style={styles.successText}>{accountMessage}</Text> : null}
          {accountError ? <Text style={styles.errorText}>{accountError}</Text> : null}
          {signup ? (
            <Text style={styles.successText}>
              Signup saved for {signup.playerName}. Confirmation ID: {signup.id}
            </Text>
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
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  accountPanel: {
    borderWidth: 1,
    borderColor: 'rgba(97, 210, 145, 0.30)',
    borderRadius: 18,
    backgroundColor: 'rgba(97, 210, 145, 0.08)',
    marginTop: 16,
    padding: 14,
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
});

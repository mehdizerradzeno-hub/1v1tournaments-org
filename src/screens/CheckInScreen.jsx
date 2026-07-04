import { useEffect, useState } from 'react';
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
import { getGameBySlug, getTournamentBySlug, getTournamentPath } from '../lib/siteData.js';
import {
  createPlayerAccount,
  fetchPlayerAccount,
  fetchSignupSummary,
  loginPlayerAccount,
  logoutPlayerAccount,
  submitTournamentSignup,
} from '../lib/tournamentHostingClient.js';

function signupCountLabel(count, loading = false) {
  if (loading) return 'Loading';
  return `${count} signed up`;
}

export default function CheckInScreen({ slug }) {
  const tournament = getTournamentBySlug(slug);
  const tournamentSlug = tournament?.slug || '';
  const [playerName, setPlayerName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [playerHandle, setPlayerHandle] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signup, setSignup] = useState(null);
  const [error, setError] = useState('');
  const [account, setAccount] = useState(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const [accountMessage, setAccountMessage] = useState('');
  const [accountError, setAccountError] = useState('');
  const [signupSummary, setSignupSummary] = useState({ count: 0, loading: true, error: '' });

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
        setSignupSummary({ count: 0, loading: false, error: '' });
        return;
      }

      setSignupSummary((current) => ({ ...current, loading: true, error: '' }));

      try {
        const result = await fetchSignupSummary({ slug: tournamentSlug });

        if (active) {
          setSignupSummary({
            count: result.signupCount || 0,
            loading: false,
            error: '',
          });
        }
      } catch (summaryError) {
        if (active) {
          setSignupSummary({
            count: 0,
            loading: false,
            error: summaryError instanceof Error ? summaryError.message : 'Signup count could not be loaded.',
          });
        }
      }
    }

    loadSignupSummary();

    return () => {
      active = false;
    };
  }, [tournamentSlug]);

  async function handleSubmitSignup() {
    if (!tournament) {
      setError('Choose a valid tournament before signing up.');
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
        tournamentSlug: tournament.slug,
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
    setAccountSubmitting(true);
    setAccountError('');
    setAccountMessage('');

    try {
      const result = await createPlayerAccount({
        playerName,
        contactEmail,
        playerHandle,
        password,
      });

      setAccount(result.account);
      setPassword('');
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
        lead="That tournament slug is not present in the current public content file."
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

  const game = getGameBySlug(tournament.gameSlug);
  const checkIn = tournament.checkIn;

  return (
    <HubScreen
      actions={[
        { label: 'Tournament page', href: getTournamentPath(tournament.slug) },
        { label: 'Rules', href: '/rules', variant: 'secondary' },
        { label: 'Live', href: '/live', variant: 'ghost' },
      ]}
      eyebrow="Tournament signup"
      footerNote="Player accounts are required for tournament signups. Entry is free and no wagering is allowed."
      lead="Create or sign in to a player account, then reserve your spot. This keeps match seats tied to real tournament accounts."
      stats={[
        { label: 'Status', value: 'Open', tone: 'green' },
        { label: 'Account', value: account ? 'Signed in' : 'Required', tone: account ? 'green' : 'accent' },
        { label: 'Signed up', value: signupCountLabel(signupSummary.count, signupSummary.loading), tone: signupSummary.count ? 'green' : 'blue' },
        { label: 'Window', value: checkIn?.preview || 'TBD', tone: 'accent' },
        { label: 'Entry', value: 'Free', tone: 'green' },
      ]}
      subtitle={`${game?.name || 'Tournament'} • ${formatDateLine(tournament.date, tournament.timeZone, tournament.timeZoneLabel)}`}
      title={`Sign up for ${tournament.title}`}>
      <Section description="Account first, then one tap to join the roster." title="Sign up now">
        <Surface style={styles.signupCard}>
          <View style={styles.summaryTopRow}>
            <Badge tone="green">{signupCountLabel(signupSummary.count, signupSummary.loading)}</Badge>
            <Text style={styles.summaryWindow}>{checkIn?.window || 'Registration open'}</Text>
          </View>
          <Text style={styles.summaryTitle}>Reserve your spot</Text>
          <Text style={styles.summaryCopy}>
            Your account is what lets the hub know whether you are allowed to sit in a future match room.
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
                <ActionButton onPress={handleSubmitSignup}>{submitting ? 'Saving...' : 'Sign up'}</ActionButton>
                <ActionButton href={getTournamentPath(tournament.slug)} variant="secondary">
                  Event details
                </ActionButton>
                <ActionButton onPress={handleLogoutAccount} variant="ghost">
                  {accountSubmitting ? 'Signing out...' : 'Sign out'}
                </ActionButton>
              </View>
            </>
          ) : (
            <>
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

              <View style={styles.buttonRow}>
                <ActionButton onPress={handleCreateAccount}>
                  {accountSubmitting ? 'Saving...' : 'Create account'}
                </ActionButton>
                <ActionButton onPress={handleLoginAccount} variant="secondary">
                  {accountSubmitting ? 'Opening...' : 'Sign in'}
                </ActionButton>
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
        <Surface style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <Badge tone="blue">{checkIn?.status || 'Registration flow'}</Badge>
            <Text style={styles.summaryWindow}>{checkIn?.window || 'TBD'}</Text>
          </View>
          <Text style={styles.summaryTitle}>Play from the match link</Text>
          {checkIn?.note ? <Text style={styles.summaryCopy}>{checkIn.note}</Text> : null}
          <BulletList
            items={[
              'The host loads the roster and generates the bracket.',
              'Your match card links to the Spades room.',
              'When the game reports a winner, the hub advances the bracket.',
            ]}
            tone="blue"
          />
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

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ActionButton, Badge, Surface } from '../components/hub-ui.jsx';
import {
  createPlayerAccount,
  fetchPlayerAccount,
  loginPlayerAccount,
  requestPlayerPasswordReset,
  resetPlayerPassword,
} from '../lib/tournamentHostingClient.js';
import {
  prepareSpadesAccountReturn,
  SPADES_ACCOUNT_DESTINATION,
  SPADES_SIGNED_OUT_ACCOUNT_ACTIONS,
} from '../lib/spadesAccountConnect.js';
import { theme } from '../lib/theme.js';

function inputProps(setValue) {
  return {
    autoCapitalize: 'none',
    autoCorrect: false,
    onChangeText: setValue,
    placeholderTextColor: '#6B766F',
    style: styles.input,
  };
}

export default function SpadesAccountConnectScreen({ initialMode = 'signin' }) {
  const [mode, setMode] = useState(initialMode);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [playerHandle, setPlayerHandle] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const handoffStartedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void fetchPlayerAccount()
      .then((result) => {
        if (!active) return;
        setAccount(result.account || null);
        if (result.account) setMode('manage');
      })
      .catch(() => {
        if (active) setAccount(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setMessage('');
    if (nextMode !== 'reset') setRecoveryRequested(false);
  };

  const returnToSpades = async () => {
    if (handoffStartedRef.current) return;
    handoffStartedRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const launch = await prepareSpadesAccountReturn();
      if (!launch.authorized || typeof globalThis.location?.assign !== 'function') {
        throw new Error('Spades authorization could not be opened.');
      }
      globalThis.location.assign(launch.url);
    } catch (handoffError) {
      handoffStartedRef.current = false;
      setSubmitting(false);
      setError(handoffError instanceof Error ? handoffError.message : 'Spades authorization could not be opened.');
    }
  };

  const signIn = async () => {
    setSubmitting(true);
    setError('');
    try {
      const result = await loginPlayerAccount({ contactEmail, password });
      setAccount(result.account || null);
      await returnToSpades();
    } catch (signInError) {
      setSubmitting(false);
      setError(signInError instanceof Error ? signInError.message : 'Sign in could not be completed.');
    }
  };

  const createAccount = async () => {
    if (password !== confirmPassword) {
      setError('Passwords must match.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await createPlayerAccount({
        playerName,
        playerHandle,
        contactEmail,
        password,
        confirmPassword,
      });
      setAccount(result.account || null);
      await returnToSpades();
    } catch (createError) {
      setSubmitting(false);
      setError(createError instanceof Error ? createError.message : 'Account creation could not be completed.');
    }
  };

  const requestReset = async () => {
    setSubmitting(true);
    setError('');
    try {
      const result = await requestPlayerPasswordReset({ contactEmail });
      setRecoveryRequested(Boolean(result.configured));
      setMessage(result.message || 'If that account exists, password reset instructions were sent.');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Password reset could not be requested.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async () => {
    if (recoveryPassword !== recoveryConfirmPassword) {
      setError('Passwords must match.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await resetPlayerPassword({
        contactEmail,
        code: recoveryCode,
        password: recoveryPassword,
        confirmPassword: recoveryConfirmPassword,
      });
      setPassword('');
      setRecoveryCode('');
      setRecoveryPassword('');
      setRecoveryConfirmPassword('');
      setRecoveryRequested(false);
      setMode('signin');
      setMessage('Password updated. Sign in with your new password.');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Password reset could not be completed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
        <Text style={styles.muted}>Opening your shared 1v1 account...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.heading}>
        <Badge tone="accent">1V1 SPADES</Badge>
        <Text style={styles.title}>{account ? 'Manage Account' : 'Connect your shared account'}</Text>
        <Text style={styles.subtitle}>
          {account
            ? 'Your verified 1v1 account is ready to return to Spades.'
            : 'Sign in, create an account, or reset your password without leaving the Spades app.'}
        </Text>
      </View>

      <Surface style={styles.card}>
        {account ? (
          <>
            <Text style={styles.sectionTitle}>{account.playerName || 'Shared 1v1 account'}</Text>
            <Text style={styles.muted}>{account.email || 'Account identity verified'}</Text>
            <ActionButton disabled={submitting} onPress={returnToSpades}>
              {submitting ? 'Connecting...' : 'Continue to Spades'}
            </ActionButton>
          </>
        ) : (
          <>
            <View style={styles.actionRow}>
              {SPADES_SIGNED_OUT_ACCOUNT_ACTIONS.map((action) => (
                <ActionButton
                  accessibilityState={{ selected: mode === action.id }}
                  disabled={submitting}
                  key={action.id}
                  onPress={() => selectMode(action.id)}
                  style={styles.modeButton}
                  variant={mode === action.id ? 'primary' : 'secondary'}>
                  {action.label}
                </ActionButton>
              ))}
            </View>

            {mode === 'create' ? (
              <>
                <Text style={styles.fieldLabel}>Display name</Text>
                <TextInput {...inputProps(setPlayerName)} autoCapitalize="words" placeholder="Name shown across 1v1" value={playerName} />
                <Text style={styles.fieldLabel}>Optional handle</Text>
                <TextInput {...inputProps(setPlayerHandle)} placeholder="Spades or Discord handle" value={playerHandle} />
              </>
            ) : null}

            <Text style={styles.fieldLabel}>Account email</Text>
            <TextInput {...inputProps(setContactEmail)} inputMode="email" placeholder="you@example.com" value={contactEmail} />

            {mode === 'signin' || mode === 'create' ? (
              <>
                <Text style={styles.fieldLabel}>Password</Text>
                <TextInput {...inputProps(setPassword)} placeholder="At least 8 characters" secureTextEntry value={password} />
              </>
            ) : null}

            {mode === 'create' ? (
              <>
                <Text style={styles.fieldLabel}>Confirm password</Text>
                <TextInput {...inputProps(setConfirmPassword)} placeholder="Type it again" secureTextEntry value={confirmPassword} />
                <ActionButton disabled={submitting} onPress={createAccount}>
                  {submitting ? 'Creating...' : 'Create Account'}
                </ActionButton>
              </>
            ) : null}

            {mode === 'signin' ? (
              <ActionButton disabled={submitting} onPress={signIn}>
                {submitting ? 'Signing in...' : 'Sign In'}
              </ActionButton>
            ) : null}

            {mode === 'reset' ? (
              <>
                {!recoveryRequested ? (
                  <ActionButton disabled={submitting} onPress={requestReset}>
                    {submitting ? 'Sending...' : 'Send Reset Code'}
                  </ActionButton>
                ) : (
                  <>
                    <Text style={styles.fieldLabel}>Reset code</Text>
                    <TextInput {...inputProps(setRecoveryCode)} inputMode="numeric" maxLength={6} placeholder="000000" value={recoveryCode} />
                    <Text style={styles.fieldLabel}>New password</Text>
                    <TextInput {...inputProps(setRecoveryPassword)} placeholder="At least 8 characters" secureTextEntry value={recoveryPassword} />
                    <Text style={styles.fieldLabel}>Confirm new password</Text>
                    <TextInput {...inputProps(setRecoveryConfirmPassword)} placeholder="Type it again" secureTextEntry value={recoveryConfirmPassword} />
                    <ActionButton disabled={submitting} onPress={resetPassword}>
                      {submitting ? 'Updating...' : 'Reset Password'}
                    </ActionButton>
                  </>
                )}
              </>
            ) : null}
          </>
        )}

        {message ? <Text style={styles.message}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <ActionButton
          onPress={() => globalThis.location?.assign?.(SPADES_ACCOUNT_DESTINATION)}
          variant="ghost">
          Cancel and return to Spades
        </ActionButton>
      </Surface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { minHeight: '100%', backgroundColor: theme.colors.background, padding: 20, paddingTop: 32, gap: 18 },
  loading: { flex: 1, minHeight: 480, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: theme.colors.background },
  heading: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 10 },
  title: { color: theme.colors.text, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  subtitle: { color: theme.colors.muted, fontSize: 15, lineHeight: 22 },
  card: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 12 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  modeButton: { flexGrow: 1 },
  sectionTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '800' },
  fieldLabel: { color: theme.colors.text, fontSize: 13, fontWeight: '700', marginTop: 4 },
  input: { minHeight: 48, borderWidth: 1, borderColor: theme.colors.lineStrong, borderRadius: 12, backgroundColor: theme.colors.backgroundAlt, color: theme.colors.text, paddingHorizontal: 14, fontSize: 16 },
  muted: { color: theme.colors.muted, fontSize: 14, lineHeight: 20 },
  message: { color: theme.colors.success, fontSize: 14, lineHeight: 20 },
  error: { color: '#FF9A9A', fontSize: 14, lineHeight: 20 },
});

import { createElement, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ActionButton, Badge, HubScreen, Surface } from '../components/hub-ui.jsx';
import {
  createPlayerAccount,
  deletePlayerAccount,
  fetchPlayerAccount,
  loginPlayerAccount,
  logoutPlayerAccount,
  requestPlayerPasswordReset,
  resetPlayerPassword,
} from '../lib/tournamentHostingClient.js';
import {
  prepareSpadesAccountReturn,
  SPADES_ACCOUNT_DESTINATION,
  SPADES_SIGNED_OUT_ACCOUNT_ACTIONS,
} from '../lib/spadesAccountConnect.js';
import {
  clearPasswordRecoveryFragment,
  resolveAccountConnectMode,
  returnToGameWithoutAccountChange,
  runAccountHandoffOnce,
  signOutAccountConnectSession,
  verifiedAccountReturnCopy,
} from '../lib/accountConnect.js';
import { theme } from '../lib/theme.js';
import { clearDevReturnStatus, classifyReturnTarget, DEFAULT_RETURN_STATUS, isQaReturnTelemetryEnvironment, loadDevReturnStatus, persistDevReturnStatus, safeReturnFailureClass } from '../lib/returnTelemetry.js';

function inputProps(setValue, {
  autoComplete = 'off',
  label,
  name,
  textContentType = 'none',
} = {}) {
  return {
    accessibilityLabel: label,
    autoCapitalize: 'none',
    autoComplete,
    autoCorrect: false,
    nativeID: name ? `account-${name}` : undefined,
    onChangeText: setValue,
    placeholderTextColor: '#6B766F',
    style: styles.input,
    textContentType,
    ...(Platform.OS === 'web' && name ? { name } : {}),
  };
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function AccountForm({ children, onSubmit }) {
  if (Platform.OS === 'web') {
    return createElement('form', {
      onSubmit: (event) => {
        event.preventDefault();
        onSubmit?.();
      },
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      },
    }, children);
  }

  return <View style={styles.accountForm}>{children}</View>;
}

export function GameAccountConnectScreen({
  initialMode = 'signin',
  initialEmail = '',
  initialRecoveryToken = '',
  gameName = 'Spades',
  badgeLabel = '1V1 SPADES',
  destination = SPADES_ACCOUNT_DESTINATION,
  accountActions = SPADES_SIGNED_OUT_ACCOUNT_ACTIONS,
  prepareReturn = prepareSpadesAccountReturn,
  returnAfterSignOut = false,
  signedOutManageFallback = false,
  useHubShell = false,
}) {
  const searchParams = useLocalSearchParams();
  const [mode, setMode] = useState(initialMode);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [playerHandle, setPlayerHandle] = useState('');
  const [contactEmail, setContactEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryRequested, setRecoveryRequested] = useState(Boolean(initialRecoveryToken));
  const [recoveryToken, setRecoveryToken] = useState(initialRecoveryToken);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteExpanded, setDeleteExpanded] = useState(false);
  const handoffStartedRef = useRef(false);
  const nativeContextPresent = Boolean(searchParams.source && searchParams.redirectUri && searchParams.state);
  const [returnStatus, setReturnStatus] = useState(() => loadDevReturnStatus() || {
    ...DEFAULT_RETURN_STATUS,
    sourceClass: searchParams.source === 'spades-native' ? 'spades-native' : searchParams.source ? 'other' : 'none',
    nativeContextPresent,
    statePresent: Boolean(searchParams.state),
  });

  const updateReturnStatus = (patch) => setReturnStatus((current) => {
    const next = { ...current, ...patch };
    persistDevReturnStatus(next);
    return next;
  });

  useEffect(() => {
    let active = true;
    void fetchPlayerAccount()
      .then((result) => {
        if (!active) return;
        setAccount(result.account || null);
        if (result.account || (initialMode === 'manage' && signedOutManageFallback)) {
          setMode(resolveAccountConnectMode(initialMode, {
            hasAccount: Boolean(result.account),
            signedOutManageFallback,
          }));
        }
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
  }, [initialMode, signedOutManageFallback]);

  const selectMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setMessage('');
    if (nextMode !== 'reset') {
      setRecoveryRequested(false);
      setRecoveryToken('');
      clearPasswordRecoveryFragment();
    }
  };

  const submitAccountForm = () => {
    if (submitting) return;

    if (mode === 'create') {
      void createAccount();
      return;
    }

    if (mode === 'reset') {
      void (recoveryRequested ? resetPassword() : requestReset());
      return;
    }

    void signIn();
  };

  const returnToGame = async () => {
    setSubmitting(true);
    setError('');
    try {
      await runAccountHandoffOnce(handoffStartedRef, async () => {
        const isNativeSpadesHandoff = gameName === 'Spades' && searchParams.source === 'spades-native';
        updateReturnStatus({ returnClicked: true });
        updateReturnStatus({
          sourceClass: searchParams.source === 'spades-native' ? 'spades-native' : searchParams.source ? 'other' : 'none',
          nativeContextPresent: isNativeSpadesHandoff && nativeContextPresent,
          statePresent: Boolean(searchParams.state),
          authorizationIssueAttempted: true,
          safeFailureClass: '',
        });
        const launch = isNativeSpadesHandoff
          ? await prepareReturn({
            redirectUri: firstQueryValue(searchParams.redirectUri),
            source: firstQueryValue(searchParams.source),
            state: firstQueryValue(searchParams.state),
          })
          : await prepareReturn();
        updateReturnStatus({
          authorizationIssueSucceeded: true,
          authorizationCodePresent: Boolean(new URL(launch.url).searchParams.get('sharedAccountCode')),
          returnedStatePresent: Boolean(launch.state),
          finalTargetClass: classifyReturnTarget(launch.url),
        });
        if (!launch.authorized || typeof globalThis.location?.assign !== 'function') {
          throw new Error(`${gameName} authorization could not be opened.`);
        }
        updateReturnStatus({ navigationAttempted: true, navigationMethod: 'location.assign' });
        globalThis.location.assign(launch.url);
      });
    } catch (handoffError) {
      setSubmitting(false);
      updateReturnStatus({ safeFailureClass: safeReturnFailureClass(handoffError) });
      setError(handoffError instanceof Error ? handoffError.message : `${gameName} authorization could not be opened.`);
    }
  };

  const signIn = async () => {
    setSubmitting(true);
    setError('');
    try {
      const result = await loginPlayerAccount({ contactEmail, password });
      setAccount(result.account || null);
      await returnToGame();
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
      await returnToGame();
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
      if (result.configured) {
        setMessage(result.message || 'If that account exists, password reset instructions were sent.');
      } else {
        setMessage('');
        setError(result.message || 'Email recovery is not configured. Contact the tournament host.');
      }
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
        token: recoveryToken,
        password: recoveryPassword,
        confirmPassword: recoveryConfirmPassword,
      });
      setPassword('');
      setRecoveryToken('');
      setRecoveryPassword('');
      setRecoveryConfirmPassword('');
      setRecoveryRequested(false);
      setMode('signin');
      clearPasswordRecoveryFragment();
      setMessage('Password updated. Sign in with your new password.');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Password reset could not be completed.');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteAccount = async () => {
    if (deleteConfirmation.trim().toUpperCase() !== 'DELETE') {
      setError('Type DELETE to confirm permanent account deletion.');
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      const result = await deletePlayerAccount(deleteConfirmation);

      if (!result?.deleted || result?.account) {
        throw new Error('Account deletion could not be confirmed.');
      }

      handoffStartedRef.current = false;
      setAccount(null);
      setMode('signin');
      setPlayerName('');
      setPlayerHandle('');
      setContactEmail('');
      setPassword('');
      setConfirmPassword('');
      setRecoveryRequested(false);
      setRecoveryToken('');
      setRecoveryPassword('');
      setRecoveryConfirmPassword('');
      setDeleteConfirmation('');
      setDeleteExpanded(false);
      setMessage(
        'Your 1v1 account has been deleted. Historical competitive results may remain without your identifying account information.',
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Account deletion could not be completed.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      const nextState = await signOutAccountConnectSession(logoutPlayerAccount);
      handoffStartedRef.current = false;
      setAccount(nextState.account);
      setMode(nextState.mode);
      setPlayerName('');
      setPlayerHandle('');
      setContactEmail('');
      setPassword('');
      setConfirmPassword('');
      setRecoveryRequested(false);
      setRecoveryToken('');
      setRecoveryPassword('');
      setRecoveryConfirmPassword('');
      setDeleteConfirmation('');
      setDeleteExpanded(false);
      setMessage(`Signed out. Sign in with the account you want to use with ${gameName}.`);
      if (returnAfterSignOut) {
        returnToGameWithoutAccountChange(destination);
      }
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : 'Player account could not be signed out.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    if (useHubShell) {
      return (
        <HubScreen
          accountOverride={null}
          accountHref="/account"
          actions={[{ label: 'Next tournament', href: '/next' }]}
          eyebrow="Player profile"
          heroVariant="compact"
          lead="Opening your shared account and competitive identity."
          stickyActions={false}
          subtitle="One account for tournaments, leagues, and game access"
          title="Profile">
          <Surface style={styles.hubLoading}>
            <ActivityIndicator color={theme.colors.accent} size="large" />
            <Text accessibilityLiveRegion="polite" style={styles.muted}>Opening your shared 1v1 account...</Text>
          </Surface>
        </HubScreen>
      );
    }

    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
        <Text style={styles.muted}>Opening your shared 1v1 account...</Text>
      </View>
    );
  }

  const accountContent = (
    <>
      <View style={styles.heading}>
        <Badge tone="accent">{badgeLabel}</Badge>
        <Text style={styles.title}>{account ? 'Manage Account' : 'Connect your shared account'}</Text>
        <Text style={styles.subtitle}>
          {account
            ? verifiedAccountReturnCopy(gameName)
            : `Sign in, create an account, or reset your password without leaving the ${gameName} app.`}
        </Text>
      </View>

      <Surface style={styles.card}>
        {account ? (
          <>
            <Text style={styles.sectionTitle}>{account.playerName || 'Shared 1v1 account'}</Text>
            <Text style={styles.muted}>{account.email || 'Account identity verified'}</Text>
            <ActionButton disabled={submitting} onPress={returnToGame}>
              {submitting ? 'Connecting...' : `Continue to ${gameName}`}
            </ActionButton>
            <Text style={styles.muted}>Sign out here only to switch the shared 1v1 account used by this browser.</Text>
            <ActionButton disabled={submitting} onPress={signOut} variant="danger">
              {submitting ? 'Signing out...' : 'Sign Out'}
            </ActionButton>

            <View style={styles.deleteSection}>
              <Text style={styles.deleteTitle}>Danger zone</Text>
              <Text style={styles.muted}>
                Permanently deleting your account cannot be undone.
              </Text>
              {deleteExpanded ? (
                <>
                  <Text style={styles.muted}>
                    This removes shared 1v1 account credentials and identifying account information from retained competitive history.
                  </Text>
                  <Text style={styles.fieldLabel}>Type DELETE to confirm</Text>
                  <TextInput
                    {...inputProps(setDeleteConfirmation, {
                      autoComplete: 'off',
                      label: 'Type DELETE to confirm permanent account deletion',
                      name: 'delete-confirmation',
                    })}
                    autoCapitalize="characters"
                    placeholder="DELETE"
                    value={deleteConfirmation}
                  />
                  <View style={styles.actionRow}>
                    <ActionButton
                      disabled={
                        submitting
                        || deleteConfirmation.trim().toUpperCase() !== 'DELETE'
                      }
                      onPress={deleteAccount}
                      variant="danger">
                      {submitting ? 'Deleting...' : 'Delete Account Permanently'}
                    </ActionButton>
                    <ActionButton
                      disabled={submitting}
                      onPress={() => {
                        setDeleteConfirmation('');
                        setDeleteExpanded(false);
                      }}
                      variant="ghost">
                      Cancel
                    </ActionButton>
                  </View>
                </>
              ) : (
                <ActionButton onPress={() => setDeleteExpanded(true)} variant="ghost">
                  Review account deletion
                </ActionButton>
              )}
            </View>
          </>
        ) : (
          <AccountForm onSubmit={submitAccountForm}>
            <View style={styles.actionRow}>
              {accountActions.map((action) => (
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
                <TextInput
                  {...inputProps(setPlayerName, {
                    autoComplete: 'name',
                    label: 'Display name',
                    name: 'display-name',
                    textContentType: 'name',
                  })}
                  autoCapitalize="words"
                  placeholder="Name shown across 1v1"
                  value={playerName}
                />
                <Text style={styles.fieldLabel}>Optional handle</Text>
                <TextInput
                  {...inputProps(setPlayerHandle, {
                    autoComplete: 'nickname',
                    label: 'Optional handle',
                    name: 'player-handle',
                    textContentType: 'nickname',
                  })}
                  placeholder="Spades or Discord handle"
                  value={playerHandle}
                />
              </>
            ) : null}

            <Text style={styles.fieldLabel}>Account email</Text>
            <TextInput
              {...inputProps(setContactEmail, {
                autoComplete: 'email',
                label: 'Account email',
                name: 'email',
                textContentType: 'emailAddress',
              })}
              inputMode="email"
              placeholder="you@example.com"
              value={contactEmail}
            />

            {mode === 'signin' || mode === 'create' ? (
              <>
                <Text style={styles.fieldLabel}>Password</Text>
                <TextInput
                  {...inputProps(setPassword, {
                    autoComplete: mode === 'create' ? 'new-password' : 'current-password',
                    label: 'Password',
                    name: 'password',
                    textContentType: mode === 'create' ? 'newPassword' : 'password',
                  })}
                  placeholder="At least 8 characters"
                  secureTextEntry
                  value={password}
                />
              </>
            ) : null}

            {mode === 'create' ? (
              <>
                <Text style={styles.fieldLabel}>Confirm password</Text>
                <TextInput
                  {...inputProps(setConfirmPassword, {
                    autoComplete: 'new-password',
                    label: 'Confirm password',
                    name: 'confirm-password',
                    textContentType: 'newPassword',
                  })}
                  placeholder="Type it again"
                  secureTextEntry
                  value={confirmPassword}
                />
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
                {!recoveryToken ? (
                  <ActionButton disabled={submitting} onPress={requestReset}>
                    {submitting ? 'Sending...' : recoveryRequested ? 'Send Another Reset Link' : 'Send Reset Link'}
                  </ActionButton>
                ) : (
                  <>
                    <Text style={styles.fieldLabel}>New password</Text>
                    <TextInput
                      {...inputProps(setRecoveryPassword, {
                        autoComplete: 'new-password',
                        label: 'New password',
                        name: 'new-password',
                        textContentType: 'newPassword',
                      })}
                      placeholder="At least 8 characters"
                      secureTextEntry
                      value={recoveryPassword}
                    />
                    <Text style={styles.fieldLabel}>Confirm new password</Text>
                    <TextInput
                      {...inputProps(setRecoveryConfirmPassword, {
                        autoComplete: 'new-password',
                        label: 'Confirm new password',
                        name: 'confirm-new-password',
                        textContentType: 'newPassword',
                      })}
                      placeholder="Type it again"
                      secureTextEntry
                      value={recoveryConfirmPassword}
                    />
                    <ActionButton disabled={submitting} onPress={resetPassword}>
                      {submitting ? 'Updating...' : 'Reset Password'}
                    </ActionButton>
                    <ActionButton
                      disabled={submitting}
                      onPress={() => {
                        setRecoveryRequested(false);
                        setRecoveryToken('');
                        setError('');
                        setMessage('Request a new reset link for this account email.');
                        clearPasswordRecoveryFragment();
                      }}
                      variant="secondary">
                      Request a New Reset Link
                    </ActionButton>
                  </>
                )}
              </>
            ) : null}
          </AccountForm>
        )}

        {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
        {error ? <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {isQaReturnTelemetryEnvironment() ? (
          <View style={styles.devStatusPanel}>
            <Text style={styles.devStatusTitle}>DEV RETURN STATUS</Text>
            <Text style={styles.devStatusText}>{JSON.stringify(returnStatus, null, 2)}</Text>
            <ActionButton onPress={() => { clearDevReturnStatus(); setReturnStatus({ ...DEFAULT_RETURN_STATUS }); }} variant="ghost">Reset return telemetry</ActionButton>
          </View>
        ) : null}
        <ActionButton
          disabled={submitting}
          onPress={() => returnToGameWithoutAccountChange(destination)}
          variant="ghost">
          Return to {gameName}
        </ActionButton>
      </Surface>
    </>
  );

  if (useHubShell) {
    return (
      <HubScreen
        accountOverride={account}
        accountHref="/account"
        actions={[
          { label: 'Next tournament', href: '/next' },
          { label: 'Leagues', href: '/leagues', variant: 'secondary' },
          { label: 'Results', href: '/results', variant: 'ghost' },
        ]}
        eyebrow="Player profile"
        heroVariant="compact"
        lead="Manage the shared identity used for tournament registration, league membership, and match access."
        stickyActions={false}
        subtitle="One account across competitive play"
        title="Profile">
        <View style={styles.hubAccountContent}>{accountContent}</View>
      </HubScreen>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      {accountContent}
    </ScrollView>
  );
}

export default function SpadesAccountConnectScreen({ initialMode = 'signin' }) {
  return <GameAccountConnectScreen initialMode={initialMode} />;
}

const styles = StyleSheet.create({
  page: { minHeight: '100%', backgroundColor: theme.colors.background, padding: 20, paddingTop: 32, gap: 18 },
  hubAccountContent: { gap: 18 },
  hubLoading: { alignItems: 'center', gap: 14, justifyContent: 'center', minHeight: 240 },
  loading: { flex: 1, minHeight: 480, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: theme.colors.background },
  heading: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 10 },
  title: { color: theme.colors.text, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  subtitle: { color: theme.colors.muted, fontSize: 15, lineHeight: 22 },
  card: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 12 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  accountForm: { gap: 12 },
  modeButton: { flexGrow: 1 },
  sectionTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '800' },
  fieldLabel: { color: theme.colors.text, fontSize: 13, fontWeight: '700', marginTop: 4 },
  input: { minHeight: 48, borderWidth: 1, borderColor: theme.colors.lineStrong, borderRadius: 12, backgroundColor: theme.colors.backgroundAlt, color: theme.colors.text, paddingHorizontal: 14, fontSize: 16 },
  muted: { color: theme.colors.muted, fontSize: 14, lineHeight: 20 },
  message: { color: theme.colors.success, fontSize: 14, lineHeight: 20 },
  error: { color: '#FF9A9A', fontSize: 14, lineHeight: 20 },
  deleteSection: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#6D3131',
    gap: 10,
  },
  deleteTitle: {
    color: '#FF9A9A',
    fontSize: 16,
    fontWeight: '800',
  },
});

import { createElement, useCallback, useEffect, useRef, useState } from 'react';
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
  changePlayerUsername,
  createPlayerAccount,
  deletePlayerAccount,
  fetchPlayerAccount,
  loginPlayerAccount,
  logoutPlayerAccount,
  requestPlayerPasswordReset,
  requestPlayerEmailVerification,
  resetPlayerPassword,
  verifyPlayerEmail,
} from '../lib/tournamentHostingClient.js';
import {
  prepareSpadesAccountReturn,
  resolveSpadesAccountDestination,
  SPADES_ACCOUNT_DESTINATION,
  SPADES_SIGNED_OUT_ACCOUNT_ACTIONS,
} from '../lib/spadesAccountConnect.js';
import {
  clearPasswordRecoveryFragment,
  accountEmailVerificationStatus,
  resolveAccountConnectMode,
  returnToGameWithoutAccountChange,
  runAccountHandoffOnce,
  signOutAccountConnectSession,
  shouldShowConnectedAccount,
  verifiedAccountReturnCopy,
} from '../lib/accountConnect.js';
import { theme } from '../lib/theme.js';

const UI_FONT = Platform.select({ ios: 'System', android: 'sans-serif', default: 'DM Sans, Arial, sans-serif' });

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
    placeholderTextColor: theme.colors.muted,
    style: styles.input,
    textContentType,
    ...(Platform.OS === 'web' && name ? { name } : {}),
  };
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
        gap: 18,
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
  passwordRecoveryPath = '/account',
  requireAccountSelection = false,
  returnAfterSignOut = false,
  signedOutManageFallback = false,
  useHubShell = false,
}) {
  const [mode, setMode] = useState(initialMode);
  const [account, setAccount] = useState(null);
  const hostingReturnRedirectRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [playerHandle, setPlayerHandle] = useState('');
  const [usernameDraft, setUsernameDraft] = useState('');
  const [contactEmail, setContactEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryRequested, setRecoveryRequested] = useState(Boolean(initialRecoveryToken));
  const [recoveryToken, setRecoveryToken] = useState(initialRecoveryToken);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteExpanded, setDeleteExpanded] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const handoffStartedRef = useRef(false);
  const accountSubmissionRef = useRef(false);
  const usernameSubmissionRef = useRef(false);
  const showSignInWhileAccountLoads = useHubShell
    && !requireAccountSelection
    && initialMode === 'signin'
    && !initialRecoveryToken;

  const beginAccountSubmission = () => {
    if (submitting || accountSubmissionRef.current) return false;
    accountSubmissionRef.current = true;
    setSubmitting(true);
    return true;
  };

  const finishAccountSubmission = () => {
    accountSubmissionRef.current = false;
    setSubmitting(false);
  };

  useEffect(() => {
    let active = true;
    void fetchPlayerAccount()
      .then((result) => {
        if (!active) return;
        setAccount(result.account || null);
        setUsernameDraft(result.account?.playerHandle || '');
        if (
          result.account
          || initialRecoveryToken
          || (initialMode === 'manage' && signedOutManageFallback)
        ) {
          setMode(resolveAccountConnectMode(initialMode, {
            hasAccount: Boolean(result.account),
            hasRecoveryCredential: Boolean(initialRecoveryToken),
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
  }, [initialMode, initialRecoveryToken, signedOutManageFallback]);

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
    if (submitting || accountSubmissionRef.current) return;

    if (mode === 'create') {
      void createAccount();
      return;
    }

    if (mode === 'reset') {
      void (recoveryToken ? resetPassword() : requestReset());
      return;
    }

    void signIn();
  };

  const returnToGame = useCallback(async () => {
    if (account?.emailVerified === false) {
      setError('Verify your email before continuing to a game.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await runAccountHandoffOnce(handoffStartedRef, async () => {
        const launch = await prepareReturn();
        if (!launch.authorized || typeof globalThis.location?.assign !== 'function') {
          throw new Error(`${gameName} authorization could not be opened.`);
        }
        globalThis.location.assign(launch.url);
      });
    } catch (handoffError) {
      setSubmitting(false);
      setError(handoffError instanceof Error ? handoffError.message : `${gameName} authorization could not be opened.`);
    }
  }, [account?.emailVerified, gameName, prepareReturn]);

  useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      requireAccountSelection ||
      !account ||
      account.emailVerified === false ||
      !destination ||
      destination === '/' ||
      hostingReturnRedirectRef.current
    ) {
      return;
    }

    hostingReturnRedirectRef.current = true;
    void returnToGame();
  }, [account, destination, requireAccountSelection, returnToGame]);

  const signIn = async () => {
    if (!beginAccountSubmission()) return;
    setError('');
    try {
      const result = await loginPlayerAccount({ contactEmail, password });
      setAccount(result.account || null);
      setUsernameDraft(result.account?.playerHandle || '');
      if (result.account?.emailVerified !== false) await returnToGame();
      else setMessage('Sign-in succeeded. Verify your email with the code sent to your account email.');
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Sign in could not be completed.');
    } finally {
      finishAccountSubmission();
    }
  };

  const createAccount = async () => {
    if (!playerHandle.trim()) {
      setError('Choose a username with 3-20 letters, numbers, or underscores.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords must match.');
      return;
    }
    if (!beginAccountSubmission()) return;
    setError('');
    try {
      const result = await createPlayerAccount({
        username: playerHandle,
        contactEmail,
        password,
        confirmPassword,
      });
      setAccount(result.account || null);
      setUsernameDraft(result.account?.playerHandle || playerHandle);
      setMessage(result.verificationDelivery?.ok
        ? 'Account created. Enter the verification code sent to your email.'
        : 'Account created. Request a verification code below before continuing to a game.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Account creation could not be completed.');
    } finally {
      finishAccountSubmission();
    }
  };

  const requestVerification = async () => {
    if (!account || !beginAccountSubmission()) return;
    setError('');
    setMessage('');
    try {
      const result = await requestPlayerEmailVerification({ contactEmail: account.email });
      if (!result.configured) throw new Error('Email verification is not configured. Contact the tournament host.');
      setMessage(result.message || 'If that account exists, a verification code was sent.');
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : 'Verification email could not be requested.');
    } finally {
      finishAccountSubmission();
    }
  };

  const verifyEmail = async () => {
    if (!account || !/^\d{6}$/.test(verificationCode.trim()) || !beginAccountSubmission()) return;
    setError('');
    setMessage('');
    try {
      const result = await verifyPlayerEmail({ contactEmail: account.email, code: verificationCode.trim() });
      setAccount(result.account || null);
      setVerificationCode('');
      setMessage('Email verified. Your account identity and existing game history are unchanged.');
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : 'Email verification could not be completed.');
    } finally {
      finishAccountSubmission();
    }
  };

  const requestReset = async () => {
    if (!beginAccountSubmission()) return;
    setError('');
    try {
      const result = await requestPlayerPasswordReset({
        contactEmail,
        recoveryPath: passwordRecoveryPath,
      });
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
      finishAccountSubmission();
    }
  };

  const resetPassword = async () => {
    if (recoveryPassword !== recoveryConfirmPassword) {
      setError('Passwords must match.');
      return;
    }
    if (!beginAccountSubmission()) return;
    setError('');
    try {
      await resetPlayerPassword({
        contactEmail,
        token: recoveryToken,
        password: recoveryPassword,
        confirmPassword: recoveryConfirmPassword,
      });
      handoffStartedRef.current = false;
      setAccount(null);
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
      finishAccountSubmission();
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
      setPlayerHandle('');
      setUsernameDraft('');
      setContactEmail('');
      setPassword('');
      setConfirmPassword('');
      setRecoveryRequested(false);
      setRecoveryToken('');
      setRecoveryPassword('');
      setRecoveryConfirmPassword('');
      setDeleteConfirmation('');
      setDeleteExpanded(false);
      setVerificationCode('');
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

  const saveUsername = async () => {
    if (submitting || usernameSubmissionRef.current) return;
    if (!usernameDraft.trim()) {
      setError('Choose a username with 3-20 letters, numbers, or underscores.');
      return;
    }
    if (account && usernameDraft.trim() === account.playerHandle) return;

    usernameSubmissionRef.current = true;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const result = await changePlayerUsername(usernameDraft);
      const updated = result.account || null;
      setAccount(updated);
      setPlayerHandle(updated?.playerHandle || usernameDraft);
      setUsernameDraft(updated?.playerHandle || usernameDraft);
      setMessage('Username updated across your 1v1 account.');
    } catch (usernameError) {
      setError(usernameError instanceof Error ? usernameError.message : 'Username could not be updated.');
    } finally {
      usernameSubmissionRef.current = false;
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
      setPlayerHandle('');
      setUsernameDraft('');
      setContactEmail('');
      setPassword('');
      setConfirmPassword('');
      setRecoveryRequested(false);
      setRecoveryToken('');
      setRecoveryPassword('');
      setRecoveryConfirmPassword('');
      setDeleteConfirmation('');
      setDeleteExpanded(false);
      setVerificationCode('');
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

  if (loading && !showSignInWhileAccountLoads) {
    if (useHubShell) {
      return (
        <HubScreen
          accountOverride={null}
          accountHref="/account"
          actions={[{ label: 'Next tournament', href: '/next', variant: 'secondary' }]}
          eyebrow="Player profile"
          heroVariant="compact"
          lead="Your games, tournaments, and leagues in one place."
          stickyActions={false}
          title="Profile">
          <Surface style={styles.hubLoading}>
            <ActivityIndicator color={theme.colors.accent} size="large" />
            <Text accessibilityLiveRegion="polite" style={styles.muted}>Loading your account...</Text>
          </Surface>
        </HubScreen>
      );
    }

    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
        <Text style={styles.muted}>Loading your account...</Text>
      </View>
    );
  }

  const accountContent = (
    <>
      {!useHubShell ? (
        <View style={styles.heading}>
          <Badge tone="neutral">{badgeLabel}</Badge>
          <Text accessibilityRole="header" style={styles.title}>Your 1V1 account</Text>
          <Text style={styles.subtitle}>
            {account
              ? verifiedAccountReturnCopy(gameName)
              : `Sign in to continue to ${gameName}.`}
          </Text>
        </View>
      ) : null}

      <Surface style={styles.card}>
        {shouldShowConnectedAccount(account, mode) ? (
          <>
            <View style={styles.identity}>
              <Text style={styles.identityLabel}>Signed in as</Text>
              <Text accessibilityRole="header" aria-level={2} style={styles.sectionTitle}>{account.playerName || 'Shared 1v1 account'}</Text>
              <Text style={styles.muted}>{account.email || 'Account identity verified'}</Text>
            </View>
            {accountEmailVerificationStatus(account) !== 'verified' ? (
              <View style={styles.field}>
                <Text accessibilityRole="header" aria-level={3} style={styles.fieldLabel}>
                  {account.emailVerified === false ? 'Verify your email' : 'Verify your email to host'}
                </Text>
                <Text style={styles.hint}>
                  {account.emailVerified === false
                    ? 'Complete the email challenge before connecting to a game.'
                    : 'Your existing sign-in and game access stay available. A fresh email challenge is required before a new hosting license can be issued to this account.'}
                </Text>
                <ActionButton disabled={submitting} onPress={requestVerification} style={styles.formAction} variant="secondary">
                  Send verification code
                </ActionButton>
                <TextInput
                  {...inputProps(setVerificationCode, { autoComplete: 'one-time-code', label: 'Email verification code', name: 'verification-code', textContentType: 'oneTimeCode' })}
                  inputMode="numeric"
                  maxLength={6}
                  onSubmitEditing={verifyEmail}
                  placeholder="6-digit code"
                  value={verificationCode}
                />
                <ActionButton disabled={submitting || !/^\d{6}$/.test(verificationCode.trim())} onPress={verifyEmail} style={styles.formAction} variant="secondary">
                  Verify email
                </ActionButton>
              </View>
            ) : <Text style={styles.hint}>Email verified through an account-bound challenge.</Text>}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Username</Text>
              <TextInput
                {...inputProps(setUsernameDraft, {
                  autoComplete: 'nickname',
                  label: 'Username',
                  name: 'username',
                  textContentType: 'nickname',
                })}
                onSubmitEditing={saveUsername}
                placeholder="Choose a username"
                returnKeyType="done"
                value={usernameDraft}
              />
              <Text style={styles.hint}>3–20 letters, numbers, or underscores. Your public name across 1V1. Changing it keeps your game and tournament history.</Text>
              <ActionButton disabled={submitting || usernameDraft.trim() === account.playerHandle} onPress={saveUsername} style={styles.formAction} variant="secondary">
                {submitting ? 'Saving...' : 'Save Username'}
              </ActionButton>
            </View>
            <ActionButton disabled={submitting || account.emailVerified === false} onPress={returnToGame} style={styles.formAction}>
              {submitting ? 'Connecting...' : `Continue to ${gameName}`}
            </ActionButton>
            <Text style={styles.hint}>Switch accounts by signing out of this browser.</Text>
            <ActionButton disabled={submitting} onPress={signOut} style={styles.formAction} variant="secondary">
              {submitting ? 'Signing out...' : 'Sign Out'}
            </ActionButton>

            <View style={styles.deleteSection}>
              <Text accessibilityRole="header" aria-level={3} style={styles.deleteTitle}>Delete account</Text>
              <Text style={styles.muted}>
                Permanently deleting your account cannot be undone.
              </Text>
              {deleteExpanded ? (
                <>
                  <Text style={styles.muted}>
                    This removes your sign-in details and identifying information from retained competitive history.
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
                      style={styles.formAction}
                      variant="danger">
                      {submitting ? 'Deleting...' : 'Delete Account Permanently'}
                    </ActionButton>
                    <ActionButton
                      disabled={submitting}
                      onPress={() => {
                        setDeleteConfirmation('');
                        setDeleteExpanded(false);
                      }}
                      style={styles.formAction}
                      variant="ghost">
                      Cancel
                    </ActionButton>
                  </View>
                </>
              ) : (
                <ActionButton onPress={() => setDeleteExpanded(true)} style={styles.formAction} variant="ghost">
                  Review account deletion
                </ActionButton>
              )}
            </View>
          </>
        ) : (
          <AccountForm onSubmit={submitAccountForm}>
            <View style={styles.formHeading}>
              <Text accessibilityRole="header" aria-level={2} style={styles.sectionTitle}>
                {mode === 'create' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back'}
              </Text>
              <Text style={styles.muted}>
                {mode === 'create'
                  ? 'One account for your games, events, and results.'
                  : mode === 'reset'
                    ? recoveryToken ? 'Choose a new password for your account.' : 'Enter your account email to request a reset link.'
                    : 'Sign in with your 1V1 account to continue.'}
              </Text>
            </View>
            <View accessibilityLabel="Account options" style={styles.modeRow}>
              {accountActions.map((action) => (
                <ActionButton
                  accessibilityState={{ selected: mode === action.id }}
                  disabled={submitting}
                  key={action.id}
                  onPress={() => selectMode(action.id)}
                  style={[styles.modeButton, mode === action.id && styles.modeButtonSelected]}
                  variant={mode === action.id ? 'secondary' : 'ghost'}>
                  {action.label}
                </ActionButton>
              ))}
            </View>

            {mode === 'create' ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Username</Text>
                <TextInput
                  {...inputProps(setPlayerHandle, {
                    autoComplete: 'nickname',
                    label: 'Username',
                    name: 'username',
                    textContentType: 'nickname',
                  })}
                  placeholder="Choose a username"
                  value={playerHandle}
                />
                <Text style={styles.hint}>3–20 letters, numbers, or underscores. Your public name across 1V1. You can change it later.</Text>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Account email</Text>
              <TextInput
                {...inputProps(setContactEmail, {
                  autoComplete: 'email',
                  label: 'Account email',
                  name: 'email',
                  textContentType: 'emailAddress',
                })}
                inputMode="email"
                onSubmitEditing={submitAccountForm}
                placeholder="you@example.com"
                value={contactEmail}
              />
            </View>

            {mode === 'signin' || mode === 'create' ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Password</Text>
                <TextInput
                  {...inputProps(setPassword, {
                    autoComplete: mode === 'create' ? 'new-password' : 'current-password',
                    label: 'Password',
                    name: 'password',
                    textContentType: mode === 'create' ? 'newPassword' : 'password',
                  })}
                  onSubmitEditing={submitAccountForm}
                  placeholder="At least 8 characters"
                  secureTextEntry
                  value={password}
                />
              </View>
            ) : null}

            {mode === 'create' ? (
              <>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Confirm password</Text>
                  <TextInput
                    {...inputProps(setConfirmPassword, {
                      autoComplete: 'new-password',
                      label: 'Confirm password',
                      name: 'confirm-password',
                      textContentType: 'newPassword',
                    })}
                    onSubmitEditing={submitAccountForm}
                    placeholder="Type it again"
                    secureTextEntry
                    value={confirmPassword}
                  />
                </View>
                <ActionButton disabled={submitting} onPress={submitAccountForm} style={styles.formAction}>
                  {submitting ? 'Creating...' : 'Create Account'}
                </ActionButton>
              </>
            ) : null}

            {mode === 'signin' ? (
              <ActionButton disabled={submitting} onPress={submitAccountForm} style={styles.formAction}>
                {submitting ? 'Signing in...' : 'Sign In'}
              </ActionButton>
            ) : null}

            {mode === 'reset' ? (
              <>
                {!recoveryToken ? (
                  <ActionButton disabled={submitting} onPress={submitAccountForm} style={styles.formAction}>
                    {submitting ? 'Sending...' : recoveryRequested ? 'Send Another Reset Link' : 'Send Reset Link'}
                  </ActionButton>
                ) : (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>New password</Text>
                      <TextInput
                        {...inputProps(setRecoveryPassword, {
                          autoComplete: 'new-password',
                          label: 'New password',
                          name: 'new-password',
                          textContentType: 'newPassword',
                        })}
                        onSubmitEditing={submitAccountForm}
                        placeholder="At least 8 characters"
                        secureTextEntry
                        value={recoveryPassword}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Confirm new password</Text>
                      <TextInput
                        {...inputProps(setRecoveryConfirmPassword, {
                          autoComplete: 'new-password',
                          label: 'Confirm new password',
                          name: 'confirm-new-password',
                          textContentType: 'newPassword',
                        })}
                        onSubmitEditing={submitAccountForm}
                        placeholder="Type it again"
                        secureTextEntry
                        value={recoveryConfirmPassword}
                      />
                    </View>
                    <ActionButton disabled={submitting} onPress={submitAccountForm} style={styles.formAction}>
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
                      style={styles.formAction}
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
        <ActionButton
          disabled={submitting}
          onPress={() => returnToGameWithoutAccountChange(destination)}
          style={styles.formAction}
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
          { label: 'Next tournament', href: '/next', variant: 'secondary' },
          { label: 'Leagues', href: '/leagues', variant: 'ghost' },
          { label: 'Results', href: '/results', variant: 'ghost' },
        ]}
        eyebrow="Player profile"
        heroVariant="compact"
        lead="Your games, tournaments, and leagues in one place."
        stickyActions={false}
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
  let requestedDestination = null;

  try {
    requestedDestination = new URLSearchParams(
      globalThis.location?.search || '',
    ).get('returnTo');
  } catch {
    requestedDestination = null;
  }

  const destination = resolveSpadesAccountDestination(requestedDestination);

  return (
    <GameAccountConnectScreen
      initialMode={initialMode}
      destination={destination}
      prepareReturn={() =>
        prepareSpadesAccountReturn(globalThis.fetch, destination)
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { minHeight: '100%', backgroundColor: theme.colors.background, padding: 20, paddingTop: 32, gap: 24 },
  hubAccountContent: { gap: 20, paddingTop: 8, paddingBottom: 12 },
  hubLoading: { width: '100%', maxWidth: 600, alignSelf: 'center', alignItems: 'center', gap: 14, justifyContent: 'center', minHeight: 200 },
  loading: { flex: 1, minHeight: 480, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: theme.colors.background },
  heading: { width: '100%', maxWidth: 600, alignSelf: 'center', alignItems: 'flex-start', gap: 10 },
  title: { color: theme.colors.text, fontFamily: UI_FONT, fontSize: 28, lineHeight: 35, fontWeight: '700', letterSpacing: -0.6 },
  subtitle: { color: theme.colors.muted, fontFamily: UI_FONT, fontSize: 15, lineHeight: 23 },
  card: { width: '100%', maxWidth: 600, alignSelf: 'center', backgroundColor: theme.colors.surface, borderColor: theme.colors.lineStrong, borderRadius: theme.radius.md, gap: 18, padding: 24 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accountForm: { gap: 18 },
  formHeading: { gap: 6 },
  formAction: { width: '100%', minWidth: 0, marginRight: 0, marginBottom: 0 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 2 },
  modeButton: { flexGrow: 1, flexBasis: 128, minWidth: 0, minHeight: 44, marginRight: 0, marginBottom: 0, paddingBottom: 3, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  modeButtonSelected: { borderBottomColor: theme.colors.accent },
  identity: { gap: 5, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  identityLabel: { color: theme.colors.muted, fontFamily: UI_FONT, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  sectionTitle: { color: theme.colors.text, fontFamily: UI_FONT, fontSize: 23, lineHeight: 30, fontWeight: '700', letterSpacing: -0.4 },
  field: { gap: 8, minWidth: 0 },
  fieldLabel: { color: theme.colors.text, fontFamily: UI_FONT, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  input: { width: '100%', minWidth: 0, minHeight: 52, borderWidth: 1, borderColor: theme.colors.lineStrong, borderRadius: theme.radius.sm, backgroundColor: theme.colors.backgroundAlt, color: theme.colors.text, fontFamily: UI_FONT, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  muted: { color: theme.colors.muted, fontFamily: UI_FONT, fontSize: 14, lineHeight: 22 },
  hint: { color: theme.colors.muted, fontFamily: UI_FONT, fontSize: 13, lineHeight: 20 },
  message: { color: theme.colors.success, backgroundColor: theme.colors.successSoft, borderRadius: theme.radius.sm, padding: 14, fontFamily: UI_FONT, fontSize: 14, lineHeight: 22 },
  error: { color: '#FFB4B4', backgroundColor: theme.colors.roseSoft, borderWidth: 1, borderColor: theme.colors.rose, borderRadius: theme.radius.sm, padding: 14, fontFamily: UI_FONT, fontSize: 14, lineHeight: 22 },
  deleteSection: {
    marginTop: 10,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: theme.colors.rose,
    gap: 12,
  },
  deleteTitle: {
    color: theme.colors.text,
    fontFamily: UI_FONT,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
  },
});

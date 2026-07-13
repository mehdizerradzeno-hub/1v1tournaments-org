import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  ActionButton,
  Badge,
  EmptyState,
  HubScreen,
  Section,
  Surface,
} from '../components/hub-ui.jsx';
import { formatDateLine } from '../lib/format.js';
import { getGameBySlug, getTournamentBySlug, getTournamentPath } from '../lib/siteData.js';
import { getEffectiveRegistrationStatus, mergeTournamentSettings } from '../lib/tournamentSettings.js';
import { getTournamentMode } from '../lib/tournamentModes.js';
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

function getSignupFormatDetails(tournament) {
  const mode = getTournamentMode(tournament?.mode);

  if (mode.value === 'four-player-double-elimination') {
    return {
      mode,
      requirement: 'Exactly 4 players',
      body: 'A compact second-chance bracket: lose once and move to losers bracket; lose twice and you are out.',
      footnote: 'If the losers-side finalist wins grand final, a reset final decides the tournament.',
    };
  }

  if (mode.value === 'three-player-two-life') {
    return {
      mode,
      requirement: 'Exactly 3 players',
      body: 'Three players start with two lives. Each loss removes one life, and the last player with lives remaining wins.',
      footnote: 'The waiting player rotates into the next match so the stream keeps moving.',
    };
  }

  if (mode.value === 'single-elimination') {
    return {
      mode,
      requirement: `${mode.minimumPlayers}+ players`,
      body: 'Fast bracket flow: one loss knocks a player out and winners advance until one champion remains.',
      footnote: 'Open bracket seats can become byes when the host seeds the roster.',
    };
  }

  return {
    mode,
    requirement: `${mode.minimumPlayers}+ players`,
    body: mode.summary,
    footnote: 'The host will confirm this format before the bracket is published.',
  };
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
const SIGNUP_AUTH_RETRY_DELAY_MS = 450;
const SESSION_CONFIRM_RETRY_DELAYS_MS = [0, 300, 700, 1200, 1800];
const SIGNUP_AUTH_RETRY_DELAYS_MS = [350, 800, 1400, 2200];
const ACCOUNT_ACCESS_SECTION_ID = 'account-access';

function waitForSignupRetry(delay = SIGNUP_AUTH_RETRY_DELAY_MS) {
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}

function isAuthSignupError(error) {
  return error instanceof Error && /create or sign in to a player account/i.test(error.message);
}

function isExistingAccountError(error) {
  return error instanceof Error && /already has a player account/i.test(error.message);
}

function accountsMatch(left, right) {
  if (!left || !right) return false;

  const leftId = String(left.id || '').trim();
  const rightId = String(right.id || '').trim();

  if (leftId && rightId && leftId === rightId) {
    return true;
  }

  const leftEmail = String(left.email || '').trim().toLowerCase();
  const rightEmail = String(right.email || '').trim().toLowerCase();

  return Boolean(leftEmail && rightEmail && leftEmail === rightEmail);
}

function isSameSignup(left, right) {
  if (!left || !right) return false;
  if (left.id && right.id) return left.id === right.id;

  const leftName = String(left.playerName || '').trim().toLowerCase();
  const rightName = String(right.playerName || '').trim().toLowerCase();

  return Boolean(leftName && rightName && leftName === rightName && left.tournamentSlug === right.tournamentSlug);
}

function includeConfirmedSignup(signups = [], confirmedSignup) {
  const rows = Array.isArray(signups) ? [...signups] : [];

  if (!confirmedSignup) {
    return rows;
  }

  const confirmedRow = {
    ...confirmedSignup,
    currentPlayer: true,
  };

  if (rows.some((signup) => isSameSignup(signup, confirmedRow))) {
    return rows.map((signup) => (isSameSignup(signup, confirmedRow) ? { ...signup, currentPlayer: true } : signup));
  }

  return [confirmedRow, ...rows];
}

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

function getAccountFormStatus({
  accountLoading,
  accountMode,
  accountSubmitting,
  confirmPassword,
  contactEmail,
  password,
  playerName,
  registrationOpen,
}) {
  if (accountLoading) {
    return {
      body: 'Checking this browser for an existing player account.',
      ready: false,
      title: 'Checking account',
      tone: 'blue',
    };
  }

  if (accountSubmitting) {
    return {
      body: accountMode === 'create' ? 'Creating your player account.' : 'Opening your player account.',
      ready: false,
      title: 'Working...',
      tone: 'blue',
    };
  }

  const missingFields = [];

  if (accountMode === 'create' && !playerName.trim()) {
    missingFields.push('display name');
  }

  if (!contactEmail.trim()) {
    missingFields.push('email');
  }

  if (!password) {
    missingFields.push('password');
  }

  if (accountMode === 'create' && !confirmPassword) {
    missingFields.push('confirm password');
  }

  if (missingFields.length) {
    return {
      body: `Finish: ${missingFields.join(', ')}.`,
      ready: false,
      title: 'Almost ready',
      tone: 'accent',
    };
  }

  if (accountMode === 'create') {
    const passwordError = getPasswordError(password, confirmPassword);

    if (passwordError) {
      return {
        body: passwordError,
        ready: false,
        title: 'Password needs attention',
        tone: 'accent',
      };
    }
  }

  const actionCopy = accountMode === 'create' ? 'create your account' : 'sign you in';

  return {
    body: registrationOpen
      ? `This will ${actionCopy}. Join Tournament is the next separate step.`
      : `This will ${actionCopy}. Registration is not open right now.`,
    ready: true,
    title: accountMode === 'create' ? 'Ready to create account' : 'Ready to sign in',
    tone: 'green',
  };
}

function getSignupProgressSteps({ account, confirmedSignup, liveBracket }) {
  const signedUpName = confirmedSignup?.playerName || account?.playerName || 'Player';
  const accountReady = Boolean(account || confirmedSignup);
  const signedUp = Boolean(confirmedSignup);
  const matchReady = Boolean(signedUp && liveBracket);

  return [
    {
      body: accountReady ? `${signedUpName} is signed in.` : 'Create or sign in once.',
      complete: accountReady,
      current: !accountReady,
      title: 'Account',
    },
    {
      body: signedUp ? 'Roster spot saved.' : 'Join the tournament roster.',
      complete: signedUp,
      current: accountReady && !signedUp,
      title: 'Signed Up',
    },
    {
      body: matchReady ? 'Open your assigned table.' : 'Wait for the bracket to go live.',
      complete: matchReady,
      current: signedUp && !matchReady,
      title: 'Match Ready',
    },
    {
      body: 'Return here after the game.',
      complete: false,
      current: matchReady,
      title: 'Results',
    },
  ];
}

function getSignupStepTone(step) {
  if (step.complete) return 'green';
  if (step.current) return 'accent';
  return 'blue';
}

function normalizeAccountMode(value) {
  return value === 'signin' || value === 'login' ? 'login' : 'create';
}

const PLAYER_ACCOUNT_CHANGED_EVENT = 'one-v-one-tournaments-player-account-changed';

function notifyPlayerAccountChanged(account) {
  if (typeof globalThis.dispatchEvent !== 'function') {
    return;
  }

  if (typeof globalThis.CustomEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent(PLAYER_ACCOUNT_CHANGED_EVENT, { detail: { account } }));
    return;
  }

  if (typeof globalThis.Event === 'function') {
    const event = new Event(PLAYER_ACCOUNT_CHANGED_EVENT);
    event.detail = { account };
    globalThis.dispatchEvent(event);
  }
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
  const [showOptionalHandle, setShowOptionalHandle] = useState(false);
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
    if (typeof globalThis.document === 'undefined' || globalThis.location?.hash !== `#${ACCOUNT_ACCESS_SECTION_ID}`) {
      return undefined;
    }

    const timeoutId = globalThis.setTimeout(() => {
      globalThis.document?.getElementById(ACCOUNT_ACCESS_SECTION_ID)?.scrollIntoView({
        block: 'start',
        behavior: 'smooth',
      });
    }, 80);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [accountMode, initialAccountMode]);

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
            notifyPlayerAccountChanged(nextAccount);
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
      count: Math.max(
        Number.isFinite(Number(result.summary?.signupCount)) ? Number(result.summary.signupCount) : current.count + 1,
        includeConfirmedSignup(result.summary?.signups || current.signups || [], result.signup).length,
      ),
      signups: includeConfirmedSignup(result.summary?.signups || current.signups || [], result.signup),
      loading: false,
      error: '',
    }));
    setNotes('');
  }

  async function saveSignupWithCurrentSession({ retryAuth = false, accountHint = null } = {}) {
    if (!liveTournament) {
      throw new Error('Choose a valid tournament before signing up.');
    }

    const effectiveRegistrationMeta = getEffectiveRegistrationStatus(liveTournament, { hasLiveBracket: Boolean(liveBracket) });

    if (effectiveRegistrationMeta.value !== 'open') {
      throw new Error(effectiveRegistrationMeta.actionCopy);
    }

    try {
      const result = await submitTournamentSignup({
        tournamentSlug: liveTournament.slug,
        tournamentDate: liveTournament.date,
        notes,
      });

      applySignupResult(result);
      return result.signup;
    } catch (signupError) {
      if (!retryAuth || !isAuthSignupError(signupError)) {
        throw signupError;
      }

      let lastAuthError = signupError;

      for (const delay of SIGNUP_AUTH_RETRY_DELAYS_MS) {
        await waitForSignupRetry(delay);
        await loadConfirmedAccount(accountHint);

        try {
          const retriedResult = await submitTournamentSignup({
            tournamentSlug: liveTournament.slug,
            tournamentDate: liveTournament.date,
            notes,
          });

          applySignupResult(retriedResult);
          return retriedResult.signup;
        } catch (retryError) {
          if (!isAuthSignupError(retryError)) {
            throw retryError;
          }

          lastAuthError = retryError;
        }
      }

      throw lastAuthError;
    }
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
      await saveSignupWithCurrentSession({ retryAuth: true, accountHint: account });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Signup could not be saved.');
    } finally {
      setSubmitting(false);
    }
  }

  async function loadConfirmedAccount(fallbackAccount) {
    let confirmedAccount = null;

    for (const delay of SESSION_CONFIRM_RETRY_DELAYS_MS) {
      if (delay) {
        await waitForSignupRetry(delay);
      }

      try {
        const refreshed = await fetchPlayerAccount();

        if (refreshed.account && (!fallbackAccount || accountsMatch(refreshed.account, fallbackAccount))) {
          confirmedAccount = refreshed.account;
          break;
        }
      } catch {
        // Keep trying briefly. Netlify Blob session writes can lag the account response by a moment.
      }
    }

    return confirmedAccount || fallbackAccount;
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
      notifyPlayerAccountChanged(nextAccount);
      setPlayerName(nextAccount?.playerName || playerName);
      setContactEmail(nextAccount?.email || contactEmail);
      setPlayerHandle(nextAccount?.playerHandle || playerHandle);
      setShowOptionalHandle(false);
      setPassword('');
      setConfirmPassword('');

      setAccountMessage(
        registrationOpen
          ? `Account created for ${accountDisplayName}. Next: tap Join Tournament to reserve your roster spot.`
          : `Account created. You are signed in as ${accountDisplayName}.`,
      );
    } catch (createError) {
      if (isExistingAccountError(createError)) {
        setAccountMode('login');
        setConfirmPassword('');
        setShowOptionalHandle(false);
        setAccountError('That email already has an account. I switched this form to Sign in so you can continue.');
      } else {
        setAccountError(createError instanceof Error ? createError.message : 'Player account could not be created.');
      }
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
      notifyPlayerAccountChanged(nextAccount);
      setPlayerName(nextAccount?.playerName || '');
      setContactEmail(nextAccount?.email || contactEmail);
      setPlayerHandle(nextAccount?.playerHandle || '');
      setShowOptionalHandle(false);
      setPassword('');
      setConfirmPassword('');

      setAccountMessage(
        registrationOpen
          ? `Signed in as ${accountDisplayName}. Next: tap Join Tournament to reserve your roster spot.`
          : `Signed in as ${accountDisplayName}.`,
      );
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
      notifyPlayerAccountChanged(null);
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
  const formatDetails = getSignupFormatDetails(visibleTournament);
  const registrationMeta = getEffectiveRegistrationStatus(visibleTournament, { hasLiveBracket: Boolean(liveBracket) });
  const registrationOpen = registrationMeta.value === 'open';
  const passwordRequirements = getPasswordRequirements(password, confirmPassword);
  const confirmedSignup = signup
    || signupSummary.signups?.find((signupItem) => isOwnSignup(signupItem, account, signup))
    || null;
  const hasSignupConfirmation = Boolean(confirmedSignup);
  const isLoginMode = accountMode === 'login';
  const wantsAccountSwitch = Boolean(account && accountMode === 'login');
  const mainTitle = hasSignupConfirmation
    ? 'You are on the roster'
    : wantsAccountSwitch
      ? 'This browser is already signed in.'
    : account
      ? 'Account ready. Join this tournament.'
    : isLoginMode
        ? 'Sign in to your player account.'
        : 'Create your player account';
  const mainCopy = hasSignupConfirmation
    ? 'Your player account is linked to this tournament. Use My Match when the bracket is published.'
    : wantsAccountSwitch
      ? 'If this is not the player who is joining, sign out first, then sign in with the correct account.'
    : account
      ? 'Your account is signed in. One clear tap reserves your tournament spot.'
    : isLoginMode
        ? 'Use your account email and password. After sign-in, tap Join Tournament to reserve the roster spot.'
        : 'Enter your player name, email, and password. After the account opens, tap Join Tournament to reserve the roster spot.';
  const authActionLabel = accountMode === 'create'
    ? 'Create Account'
    : 'Sign In';
  const accountFormStatus = getAccountFormStatus({
    accountLoading,
    accountMode,
    accountSubmitting,
    confirmPassword,
    contactEmail,
    password,
    playerName,
    registrationOpen,
  });
  const tournamentPath = getTournamentPath(visibleTournament.slug);
  const accountAccessPath = account
    ? `/check-in/${visibleTournament.slug}#${ACCOUNT_ACCESS_SECTION_ID}`
    : `/check-in/${visibleTournament.slug}?mode=signin#${ACCOUNT_ACCESS_SECTION_ID}`;
  const matchStatusPath = `${tournamentPath}#my-match`;
  const rosterPath = `/check-in/${visibleTournament.slug}#registered-players`;
  const signupProgressSteps = getSignupProgressSteps({ account, confirmedSignup, liveBracket });
  const screenActions = hasSignupConfirmation
    ? [
        { label: 'My Match', href: matchStatusPath },
        { label: 'Roster', href: rosterPath, variant: 'secondary' },
        { label: 'Event', href: tournamentPath, variant: 'secondary' },
      ]
    : [
        { label: 'Event', href: tournamentPath },
        { label: 'Rules', href: '/rules', variant: 'secondary' },
        { label: 'Watch', href: '/stream', variant: 'ghost' },
      ];

  return (
    <HubScreen
      accountHref={accountAccessPath}
      actions={screenActions}
      eyebrow="Tournament registration"
      footerNote="Player accounts are required for tournament signups. Entry is free and no wagering is allowed."
      lead="Create or sign in to a player account, then reserve your spot. This keeps match seats tied to real tournament accounts."
      stats={[
        { label: 'Registration', value: registrationMeta.label, tone: registrationMeta.tone },
        { label: 'Account', value: account ? 'Signed in' : 'Required', tone: account ? 'green' : 'accent' },
        { label: 'Signed up', value: signupCountLabel(signupSummary.count, signupSummary.loading), tone: signupSummary.count ? 'green' : 'blue' },
        { label: 'Format', value: formatDetails.mode.shortLabel, tone: 'accent' },
        { label: 'Check-in', value: checkIn?.preview || 'TBD', tone: 'accent' },
        { label: 'Entry', value: 'Free', tone: 'green' },
      ]}
      subtitle={`${game?.name || 'Tournament'} • ${formatDateLine(visibleTournament.date, visibleTournament.timeZone, visibleTournament.timeZoneLabel)}`}
      title={`Join ${visibleTournament.title}`}>
      <Section
        description={hasSignupConfirmation
          ? 'Your seat is saved. The next useful action is My Match after the host seeds the bracket.'
          : isLoginMode
            ? 'Sign in first. Joining the roster is a separate button after the account opens.'
            : 'One clear path: create your account, join the roster, then use My Match when the bracket goes live.'}
        nativeID={ACCOUNT_ACCESS_SECTION_ID}
        title={hasSignupConfirmation ? 'You are in' : isLoginMode ? 'Sign in' : 'Create account'}>
        <Surface style={[styles.signupCard, hasSignupConfirmation && styles.signupCardComplete]}>
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

          <SignupProgressStrip steps={signupProgressSteps} />

          {accountLoading ? <Text style={styles.summaryCopy}>Checking account status...</Text> : null}

          {hasSignupConfirmation ? (
            <SignupCompleteState
              account={account}
              accountMessage={accountMessage}
              accountSubmitting={accountSubmitting}
              confirmedSignup={confirmedSignup}
              error={error}
              liveBracket={liveBracket}
              matchStatusPath={matchStatusPath}
              onLogout={handleLogoutAccount}
              rosterPath={rosterPath}
              tournament={visibleTournament}
              tournamentPath={tournamentPath}
            />
          ) : account ? (
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
                    <ActionButton href={tournamentPath} variant="secondary">
                      Continue as {account.playerName}
                    </ActionButton>
                  </View>
                </View>
              ) : null}

              {wantsAccountSwitch ? null : (
                <View style={styles.joinActionPanel}>
                  <View style={styles.summaryTopRow}>
                    <Badge tone={registrationOpen ? 'green' : 'accent'}>{registrationOpen ? 'Next step' : 'Registration'}</Badge>
                    <Text style={styles.summaryWindow}>{registrationMeta.label}</Text>
                  </View>
                  <Text style={styles.joinActionTitle}>
                    {registrationOpen ? `Reserve ${account.playerName}'s spot.` : 'Registration is not open right now.'}
                  </Text>
                  <Text style={styles.joinActionCopy}>
                    {registrationOpen
                      ? 'One tap adds this account to the public roster. After the host seeds the bracket, My Match opens the assigned Spades table.'
                      : registrationMeta.actionCopy}
                  </Text>
                  <View style={styles.buttonRow}>
                    <ActionButton disabled={!registrationOpen || submitting} onPress={handleSubmitSignup}>
                      {registrationOpen ? (submitting ? 'Saving spot...' : 'Join Tournament') : registrationMeta.label}
                    </ActionButton>
                    <ActionButton href={tournamentPath} variant="secondary">
                      Event
                    </ActionButton>
                    <ActionButton onPress={handleLogoutAccount} variant="ghost">
                      {accountSubmitting ? 'Signing out...' : 'Sign out'}
                    </ActionButton>
                  </View>
                </View>
              )}

              <View style={styles.accountPanel}>
                <View style={styles.summaryTopRow}>
                  <Badge tone="green">Account linked</Badge>
                  <Text style={styles.accountEmail}>{account.email}</Text>
                </View>
                <Text style={styles.accountName}>{account.playerName}</Text>
                {account.playerHandle ? <Text style={styles.summaryCopy}>{account.playerHandle}</Text> : null}
                <Text style={styles.accountStatusCopy}>
                  Your account is ready for this tournament roster.
                </Text>
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
                    setShowOptionalHandle(Boolean(playerHandle.trim()));
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
                    setShowOptionalHandle(false);
                  }}
                  variant={accountMode === 'login' ? 'primary' : 'secondary'}>
                  Already have account
                </ActionButton>
              </View>
              <Text style={styles.modeHint}>
                {accountMode === 'create'
                  ? 'Create the player account first. Then use Join Tournament as a deliberate second step.'
                  : 'Sign in with the account email and password first. Then choose whether to join the tournament.'}
              </Text>

              {accountMode === 'create' ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Tournament display name</Text>
                  <TextInput
                    autoCapitalize="words"
                    onChangeText={setPlayerName}
                    placeholder="Name shown on roster and bracket"
                    placeholderTextColor="#6B766F"
                    style={styles.input}
                    value={playerName}
                  />
                  <Text style={styles.fieldHint}>This is the public name people see in the roster, bracket, and results.</Text>
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
                <Text style={styles.fieldHint}>Used for sign-in. The public roster shows your display name, not your email.</Text>
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

              {accountMode === 'create' && (showOptionalHandle || playerHandle.trim()) ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Optional handle</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setPlayerHandle}
                    placeholder="Discord or Spades name, if different"
                    placeholderTextColor="#6B766F"
                    style={styles.input}
                    value={playerHandle}
                  />
                  <Text style={styles.fieldHint}>Skip this if your display name is enough. It is just extra context for the host.</Text>
                </View>
              ) : accountMode === 'create' ? (
                <View style={styles.optionalFieldPrompt}>
                  <View style={styles.optionalFieldCopy}>
                    <Text style={styles.optionalFieldTitle}>Handle is optional</Text>
                    <Text style={styles.optionalFieldBody}>Most players can skip this. Use it only if your Discord or Spades name is different.</Text>
                  </View>
                  <ActionButton onPress={() => setShowOptionalHandle(true)} variant="ghost">
                    Add handle
                  </ActionButton>
                </View>
              ) : null}

              <View style={[styles.submitReadiness, accountFormStatus.ready && styles.submitReadinessReady]}>
                <Badge tone={accountFormStatus.tone}>{accountFormStatus.ready ? 'Ready' : 'Next'}</Badge>
                <View style={styles.submitReadinessCopy}>
                  <Text style={styles.submitReadinessTitle}>{accountFormStatus.title}</Text>
                  <Text style={styles.submitReadinessBody}>{accountFormStatus.body}</Text>
                </View>
              </View>

              <View style={styles.buttonRow}>
                {accountMode === 'create' ? (
                  <ActionButton disabled={!accountFormStatus.ready} onPress={handleCreateAccount}>
                    {accountSubmitting ? 'Creating...' : authActionLabel}
                  </ActionButton>
                ) : (
                  <ActionButton disabled={!accountFormStatus.ready} onPress={handleLoginAccount}>
                    {accountSubmitting ? 'Opening...' : authActionLabel}
                  </ActionButton>
                )}
              </View>
            </>
          )}

          {!hasSignupConfirmation && accountMessage ? <Text style={styles.successText}>{accountMessage}</Text> : null}
          {accountError ? <Text style={styles.errorText}>{accountError}</Text> : null}
          {!hasSignupConfirmation && error ? <Text style={styles.errorText}>{error}</Text> : null}
        </Surface>
      </Section>

      <Section
        description="Public roster names appear here as soon as signups are saved. Signed-in players see themselves marked."
        nativeID="registered-players"
        title="Current roster">
        <SignupRosterPanel
          account={account}
          latestSignup={confirmedSignup}
          signupSummary={signupSummary}
        />
      </Section>

      <Section description="Know the bracket style and player requirement before reserving a spot." title="Tournament format">
        <SignupFormatPanel
          formatDetails={formatDetails}
          liveBracket={liveBracket}
          signupSummary={signupSummary}
          tournament={visibleTournament}
        />
      </Section>

    </HubScreen>
  );
}

function SignupFormatPanel({ formatDetails, liveBracket, signupSummary, tournament }) {
  const signupValue = signupSummary.loading ? 'Loading' : `${signupSummary.count}/${tournament.rosterCap || formatDetails.mode.rosterCap}`;
  const statusLabel = liveBracket ? 'Bracket live' : 'Before seeding';

  return (
    <Surface style={styles.formatPanel}>
      <View style={styles.formatTopRow}>
        <View style={styles.formatCopy}>
          <Badge tone={liveBracket ? 'green' : 'accent'}>{statusLabel}</Badge>
          <Text style={styles.formatTitle}>{formatDetails.mode.label}</Text>
          <Text style={styles.formatBody}>{formatDetails.body}</Text>
        </View>
        <View style={styles.formatStats}>
          <View style={styles.formatStat}>
            <Text style={styles.formatStatLabel}>Requirement</Text>
            <Text style={styles.formatStatValue}>{formatDetails.requirement}</Text>
          </View>
          <View style={styles.formatStat}>
            <Text style={styles.formatStatLabel}>Signed up</Text>
            <Text style={styles.formatStatValue}>{signupValue}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.formatFootnote}>{formatDetails.footnote}</Text>
    </Surface>
  );
}

function SignupCompleteState({
  account,
  accountMessage,
  accountSubmitting,
  confirmedSignup,
  error,
  liveBracket,
  matchStatusPath,
  onLogout,
  rosterPath,
  tournament,
  tournamentPath,
}) {
  const playerName = confirmedSignup?.playerName || account?.playerName || 'your player account';
  const nextStep = liveBracket
    ? 'Your match can be opened from My Match.'
    : 'The host will publish the bracket, then My Match opens your table.';

  return (
    <View style={styles.confirmationState}>
      <View style={styles.confirmationTopRow}>
        <Badge tone="green">You are in</Badge>
        <Text style={styles.confirmationKicker}>Roster spot saved</Text>
      </View>
      <Text style={styles.confirmationTitle}>You are signed up for {tournament.title}.</Text>
      <Text style={styles.confirmationCopy}>
        Signed up as {playerName}. Your name is in Current roster. Come back when the bracket is live, open My Match, play, then return here for results.
      </Text>
      {accountMessage ? <Text style={styles.successText}>{accountMessage}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.confirmationStatusGrid}>
        <View style={styles.confirmationStatusItem}>
          <Text style={styles.confirmationStatusLabel}>Account</Text>
          <Text style={styles.confirmationStatusValue}>{account?.email || 'Signed in'}</Text>
        </View>
        <View style={styles.confirmationStatusItem}>
          <Text style={styles.confirmationStatusLabel}>Roster</Text>
          <Text style={styles.confirmationStatusValue}>Spot reserved</Text>
        </View>
        <View style={styles.confirmationStatusItem}>
          <Text style={styles.confirmationStatusLabel}>Next step</Text>
          <Text style={styles.confirmationStatusValue}>{nextStep}</Text>
        </View>
      </View>

      {confirmedSignup?.id ? <Text style={styles.confirmationMeta}>Confirmation ID: {confirmedSignup.id}</Text> : null}

      <View style={styles.confirmationActions}>
        <ActionButton href={matchStatusPath}>My Match</ActionButton>
        <ActionButton href={rosterPath} variant="secondary">See Roster</ActionButton>
        <ActionButton href={tournamentPath} variant="secondary">Event Page</ActionButton>
        {onLogout ? (
          <ActionButton onPress={onLogout} variant="ghost">
            {accountSubmitting ? 'Signing out...' : 'Sign out'}
          </ActionButton>
        ) : null}
      </View>
    </View>
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

function SignupProgressStrip({ steps }) {
  return (
    <View style={styles.flowSteps}>
      {steps.map((step, index) => (
        <View
          key={step.title}
          style={[
            styles.flowStep,
            step.complete && styles.flowStepComplete,
            step.current && styles.flowStepCurrent,
          ]}>
          <Badge tone={getSignupStepTone(step)}>{index + 1}</Badge>
          <View style={styles.flowStepCopy}>
            <Text style={styles.flowStepTitle}>{step.title}</Text>
            <Text style={styles.flowStepText}>{step.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function SignupRosterPanel({ account, latestSignup, signupSummary }) {
  const signups = includeConfirmedSignup(signupSummary.signups || [], latestSignup);
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
    color: '#A7A29A',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
  signupCard: {
    borderColor: 'rgba(214, 162, 78, 0.30)',
  },
  signupCardComplete: {
    backgroundColor: 'rgba(9, 31, 25, 0.94)',
    borderColor: 'rgba(77, 217, 133, 0.44)',
  },
  rosterCard: {
    borderColor: 'rgba(214, 162, 78, 0.30)',
  },
  formatPanel: {
    backgroundColor: 'rgba(8, 25, 21, 0.90)',
    borderColor: 'rgba(214, 162, 78, 0.30)',
  },
  formatTopRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  formatCopy: {
    flex: 1.25,
    minWidth: 240,
  },
  formatTitle: {
    color: '#F4EFE6',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: 10,
  },
  formatBody: {
    color: '#A7A29A',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 6,
  },
  formatStats: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    minWidth: 220,
  },
  formatStat: {
    backgroundColor: 'rgba(244, 239, 230, 0.045)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 130,
    flexGrow: 1,
    padding: 12,
  },
  formatStatLabel: {
    color: '#A7A29A',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  formatStatValue: {
    color: '#F4EFE6',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
    marginTop: 5,
  },
  formatFootnote: {
    backgroundColor: 'rgba(214, 162, 78, 0.08)',
    borderColor: 'rgba(214, 162, 78, 0.22)',
    borderRadius: 8,
    borderWidth: 1,
    color: '#D6A24E',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 14,
    padding: 12,
  },
  rosterHeroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  rosterHeroTile: {
    backgroundColor: 'rgba(214, 162, 78, 0.08)',
    borderColor: 'rgba(214, 162, 78, 0.30)',
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
    color: '#A7A29A',
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
    color: '#D6A24E',
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
    color: '#A7A29A',
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
    color: '#A7A29A',
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
    backgroundColor: 'rgba(214, 162, 78, 0.11)',
    borderColor: 'rgba(214, 162, 78, 0.44)',
  },
  rosterRank: {
    alignItems: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.14)',
    borderColor: 'rgba(214, 162, 78, 0.42)',
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
    color: '#D6A24E',
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
    color: '#A7A29A',
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
    backgroundColor: 'rgba(214, 162, 78, 0.09)',
    borderColor: 'rgba(214, 162, 78, 0.34)',
  },
  flowStepCurrent: {
    backgroundColor: 'rgba(94, 127, 163, 0.10)',
    borderColor: 'rgba(214, 162, 78, 0.42)',
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
    color: '#A7A29A',
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
  joinActionPanel: {
    backgroundColor: 'rgba(77, 217, 133, 0.08)',
    borderColor: 'rgba(77, 217, 133, 0.38)',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  joinActionTitle: {
    color: '#F4EFE6',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
  },
  joinActionCopy: {
    color: '#D4DDD7',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 6,
  },
  accountPanel: {
    borderWidth: 1,
    borderColor: 'rgba(214, 162, 78, 0.30)',
    borderRadius: 18,
    backgroundColor: 'rgba(214, 162, 78, 0.08)',
    marginTop: 16,
    padding: 14,
  },
  accountEmail: {
    color: '#5E7FA3',
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
    color: '#A7A29A',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 8,
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
  fieldHint: {
    color: '#A7A29A',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 7,
  },
  optionalFieldPrompt: {
    alignItems: 'center',
    backgroundColor: 'rgba(244, 239, 230, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 14,
    padding: 12,
  },
  optionalFieldCopy: {
    flex: 1,
    minWidth: 220,
  },
  optionalFieldTitle: {
    color: '#F4EFE6',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  optionalFieldBody: {
    color: '#A7A29A',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 3,
  },
  passwordRequirements: {
    borderWidth: 1,
    borderColor: 'rgba(94, 127, 163, 0.26)',
    borderRadius: 16,
    backgroundColor: 'rgba(94, 127, 163, 0.08)',
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
    color: '#5E7FA3',
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
  submitReadiness: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(214, 162, 78, 0.08)',
    borderColor: 'rgba(214, 162, 78, 0.28)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
    padding: 12,
  },
  submitReadinessReady: {
    backgroundColor: 'rgba(77, 217, 133, 0.08)',
    borderColor: 'rgba(77, 217, 133, 0.32)',
  },
  submitReadinessCopy: {
    flex: 1,
    minWidth: 220,
  },
  submitReadinessTitle: {
    color: '#F4EFE6',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  submitReadinessBody: {
    color: '#D4DDD7',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 3,
  },
  summaryCopy: {
    color: '#A7A29A',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  timelineCopy: {
    color: '#5E7FA3',
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
    color: '#5E7FA3',
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
    color: '#D6A24E',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
    fontWeight: '700',
  },
  confirmationState: {
    marginTop: 18,
  },
  confirmationTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  confirmationKicker: {
    color: '#4DD985',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  confirmationTitle: {
    color: '#F4EFE6',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: 12,
  },
  confirmationCopy: {
    color: '#D4DDD7',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 6,
  },
  confirmationStatusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  confirmationStatusItem: {
    backgroundColor: 'rgba(244, 239, 230, 0.045)',
    borderColor: 'rgba(244, 239, 230, 0.12)',
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: 180,
    flexGrow: 1,
    padding: 12,
  },
  confirmationStatusLabel: {
    color: '#4DD985',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  confirmationStatusValue: {
    color: '#F4EFE6',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 5,
  },
  confirmationMeta: {
    color: '#A7A29A',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 8,
  },
  confirmationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
  },
});

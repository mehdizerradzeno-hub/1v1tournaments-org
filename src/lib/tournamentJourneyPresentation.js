export const TOURNAMENT_MASTER_JOURNEY = Object.freeze([
  Object.freeze({
    number: '1',
    label: 'SIGN UP',
    description: 'Join the tournament.',
  }),
  Object.freeze({
    number: '2',
    label: 'CHECK IN',
    description: "Return near start time. We'll show your match when the bracket is ready.",
  }),
  Object.freeze({
    number: '3',
    label: 'PLAY',
    description: "Your match appears when it's ready.",
  }),
]);

export const TOURNAMENT_PLAYER_PRESENTATION_STATES = Object.freeze({
  SIGNED_OUT: 'signed-out',
  SIGN_UP: 'sign-up',
  REGISTERED: 'registered',
  WAITING: 'waiting',
  PENDING_MATCH: 'pending-match',
  READY_MATCH: 'ready-match',
  ELIMINATED: 'eliminated',
  CHAMPION: 'champion',
  COMPLETE: 'complete',
});

function cleanStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function presentation({
  state,
  label,
  title,
  description,
  primaryAction = null,
}) {
  return {
    state,
    label,
    title,
    description,
    primaryAction,
  };
}

export function getTournamentDiscoveryPresentation({
  hasBracket = false,
  registrationStatus,
  signupSummary,
  signupPath = '/tournaments',
  tournamentPath = '/tournaments',
} = {}) {
  const registered = Boolean(
    signupSummary?.signups?.some((signup) => signup?.currentPlayer),
  );
  const registration = cleanStatus(registrationStatus);

  if (registered) {
    return {
      registered: true,
      statusLabel: 'REGISTERED',
      primaryAction: { label: 'VIEW TOURNAMENT', href: tournamentPath },
      secondaryAction: hasBracket
        ? { label: 'VIEW BRACKET', href: `${tournamentPath}#live-bracket` }
        : null,
    };
  }

  if (!hasBracket && registration === 'open') {
    return {
      registered: false,
      statusLabel: 'REGISTRATION OPEN',
      primaryAction: { label: 'REGISTER', href: signupPath },
      secondaryAction: { label: 'VIEW TOURNAMENT', href: tournamentPath },
    };
  }

  return {
    registered: false,
    statusLabel: hasBracket ? 'LIVE' : 'WAITING',
    primaryAction: { label: 'VIEW TOURNAMENT', href: tournamentPath },
    secondaryAction: hasBracket
      ? { label: 'VIEW BRACKET', href: `${tournamentPath}#live-bracket` }
      : null,
  };
}

/**
 * Maps the existing player-status response to concise player-facing copy.
 *
 * The current Hub does not expose a per-player check-in mutation. A tournament
 * in its check-in window therefore remains a waiting state; this helper never
 * invents a CHECK IN action. Match launch is only offered when the authoritative
 * response contains currentMatch.
 */
export function getTournamentPlayerPresentation({
  playerStatus,
  tournamentStatus,
  registrationStatus,
  hasBracket = false,
  signInPath = '/account',
  signupPath = '/tournaments',
  matchPath = '/tournaments',
  bracketPath = '/tournaments',
} = {}) {
  const data = playerStatus?.data || playerStatus || {};
  const account = data.account || null;
  const signup = data.signup || null;
  const currentMatch = data.currentMatch || null;
  const waitingMatch = data.waitingMatch || null;
  const nextStep = cleanStatus(data.nextStep);
  const eventStatus = cleanStatus(tournamentStatus || data.bracketStatus);
  const registration = cleanStatus(registrationStatus);
  const bracketIsComplete =
    eventStatus === 'complete' || eventStatus === 'completed';
  const bracketIsVisible = Boolean(
    hasBracket ||
      data.bracketStatus ||
      currentMatch ||
      waitingMatch ||
      ['ready-match', 'wait-opponent', 'eliminated', 'champion', 'complete'].includes(
        nextStep,
      ),
  );
  const viewBracketAction = {
    label: 'VIEW BRACKET',
    href: bracketPath,
  };

  if (nextStep === 'champion') {
    return presentation({
      state: TOURNAMENT_PLAYER_PRESENTATION_STATES.CHAMPION,
      label: 'CHAMPION',
      title: 'TOURNAMENT COMPLETE',
      description: 'You won this tournament.',
      primaryAction: viewBracketAction,
    });
  }

  if (nextStep === 'eliminated') {
    return presentation({
      state: TOURNAMENT_PLAYER_PRESENTATION_STATES.ELIMINATED,
      label: 'MATCH COMPLETE',
      title: 'YOUR RUN IS COMPLETE',
      description: 'Review the bracket to see the remaining tournament.',
      primaryAction: viewBracketAction,
    });
  }

  if (nextStep === 'complete' || bracketIsComplete) {
    return presentation({
      state: TOURNAMENT_PLAYER_PRESENTATION_STATES.COMPLETE,
      label: 'COMPLETE',
      title: 'TOURNAMENT COMPLETE',
      description: 'Review the final bracket and results.',
      primaryAction: viewBracketAction,
    });
  }

  if (currentMatch) {
    return presentation({
      state: TOURNAMENT_PLAYER_PRESENTATION_STATES.READY_MATCH,
      label: 'MATCH READY',
      title: 'YOUR MATCH IS READY',
      description: 'Open your assigned match when you are ready to play.',
      primaryAction: {
        label: 'PLAY MATCH',
        href: matchPath,
      },
    });
  }

  if (waitingMatch || nextStep === 'wait-opponent' || nextStep === 'ready-match') {
    return presentation({
      state: TOURNAMENT_PLAYER_PRESENTATION_STATES.PENDING_MATCH,
      label: 'WAITING',
      title: 'YOUR MATCH',
      description: 'Preparing match…',
    });
  }

  if (!account || nextStep === 'sign-in') {
    return presentation({
      state: TOURNAMENT_PLAYER_PRESENTATION_STATES.SIGNED_OUT,
      label: 'SIGN IN',
      title: 'SIGN IN TO COMPETE',
      description: 'Use your player account to sign up and see assigned matches.',
      primaryAction: {
        label: 'SIGN IN',
        href: signInPath,
      },
    });
  }

  if (!signup || nextStep === 'sign-up') {
    if (registration === 'open') {
      return presentation({
        state: TOURNAMENT_PLAYER_PRESENTATION_STATES.SIGN_UP,
        label: 'SIGN UP',
        title: 'JOIN THIS TOURNAMENT',
        description: 'Reserve your spot with your signed-in player account.',
        primaryAction: {
          label: 'SIGN UP',
          href: signupPath,
        },
      });
    }

    return presentation({
      state: TOURNAMENT_PLAYER_PRESENTATION_STATES.WAITING,
      label: bracketIsVisible ? 'BRACKET LIVE' : 'WAITING',
      title: bracketIsVisible ? 'REGISTRATION CLOSED' : 'SIGNUPS ARE NOT OPEN',
      description: bracketIsVisible
        ? 'This tournament is underway. You can follow the bracket.'
        : 'Check back when registration opens.',
      primaryAction: bracketIsVisible ? viewBracketAction : null,
    });
  }

  if (registration === 'open') {
    return presentation({
      state: TOURNAMENT_PLAYER_PRESENTATION_STATES.REGISTERED,
      label: 'REGISTERED',
      title: "YOU'RE REGISTERED",
      description: "You're on the roster. Return near start time for your match.",
    });
  }

  return presentation({
    state: TOURNAMENT_PLAYER_PRESENTATION_STATES.WAITING,
    label: 'WAITING',
    title: "YOU'RE REGISTERED",
    description: "We'll show your match here when the bracket is ready.",
  });
}

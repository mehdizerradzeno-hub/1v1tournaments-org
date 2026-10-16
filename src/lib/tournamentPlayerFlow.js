function buildStep({ id, title, body, complete, current }) {
  return { id, title, body, complete, current };
}

export function getTournamentPlayerSteps({ account, currentMatch, signup }) {
  const accountReady = Boolean(account);
  const joined = Boolean(accountReady && signup);
  const matchReady = Boolean(joined && currentMatch);

  return [
    buildStep({
      id: 'account',
      title: 'Account',
      body: accountReady ? `${account.playerName || 'Player'} is signed in.` : 'Create or sign in to your player account.',
      complete: accountReady,
      current: !accountReady,
    }),
    buildStep({
      id: 'join',
      title: 'Join',
      body: joined ? 'Your roster spot is saved.' : 'Join this tournament with your account.',
      complete: joined,
      current: accountReady && !joined,
    }),
    buildStep({
      id: 'match',
      title: 'Open match',
      body: matchReady ? 'Your assigned table is ready.' : 'Your assigned table appears after seeding.',
      complete: matchReady,
      current: joined && !matchReady,
    }),
  ];
}

export function getTournamentPlayerAction({
  account,
  checkInPath,
  currentMatch,
  isBracketLive,
  matchStatusPath,
  registrationOpen,
  signup,
  tournamentPath,
}) {
  if (account?.hostApproved) {
    return { label: 'Open Host Controls', href: '/admin', state: 'host' };
  }

  if (currentMatch) {
    return { label: 'Open My Match', href: matchStatusPath, state: 'match' };
  }

  if (signup) {
    return {
      label: isBracketLive ? 'View My Match' : 'View My Signup',
      href: matchStatusPath,
      state: isBracketLive ? 'match-waiting' : 'joined',
    };
  }

  if (!account) {
    return { label: 'Create or sign in', href: checkInPath, state: 'account' };
  }

  if (registrationOpen) {
    return { label: 'Join Tournament', href: checkInPath, state: 'join' };
  }

  if (isBracketLive) {
    return { label: 'View Bracket', href: `${tournamentPath}#live-bracket`, state: 'bracket-live' };
  }

  return { label: 'View Roster', href: `${tournamentPath}#registered-players`, state: 'roster' };
}

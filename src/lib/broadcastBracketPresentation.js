const SAFE_STATUS = new Set(['registration', 'upcoming', 'check-in', 'live', 'complete']);

function cleanText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function roundTitle(round, index, count) {
  if (count === 1) return 'Championship';
  if (count === 2) return index === 0 ? 'Semifinals' : 'Championship';
  if (count === 3) return ['Quarterfinals', 'Semifinals', 'Championship'][index];
  if (index === count - 1) return 'Championship';
  return cleanText(round?.title, `Round ${index + 1}`);
}

function eventStatus(event, bracket, now) {
  if (bracket?.winner || bracket?.status === 'complete' || event?.status === 'complete') return 'complete';
  if (Array.isArray(bracket?.rounds) && bracket.rounds.length) return 'live';

  const requested = cleanText(event?.status || event?.registrationStatus).toLowerCase();
  if (requested === 'registration' || requested === 'open') return 'registration';
  if (requested === 'check-in' || requested === 'checkin') return 'check-in';
  if (SAFE_STATUS.has(requested)) return requested;

  const startAt = Date.parse(event?.date || '');
  const leadMs = Math.max(0, Number(event?.checkInLeadMinutes || 0)) * 60_000;
  if (Number.isFinite(startAt) && now >= startAt - leadMs && now < startAt) return 'check-in';
  return 'upcoming';
}

function publicPlayer(player, index, match) {
  const scoreValues = Object.values(match?.completion?.scores || {})
    .map(safeNumber)
    .filter((score) => score !== null);
  const winner = Boolean(
    (match?.winnerId && player?.id && match.winnerId === player.id)
      || (match?.winnerName && cleanText(match.winnerName) === cleanText(player?.name)),
  );

  return {
    name: cleanText(player?.name || player?.handle, 'TBD'),
    seed: safeNumber(player?.seed),
    score: scoreValues[index] ?? null,
    winner,
  };
}

function publicMatch(match, roundIndex, matchIndex) {
  const players = Array.isArray(match?.players) ? match.players.slice(0, 2) : [];
  const isBye = match?.status === 'bye' || (players.length === 1 && match?.status === 'final');
  const slots = players.map((player, index) => publicPlayer(player, index, match));
  while (slots.length < 2) slots.push({ name: isBye ? 'Bye' : 'TBD', seed: null, score: null, winner: false });

  return {
    key: `${roundIndex + 1}-${matchIndex + 1}`,
    label: cleanText(match?.label, `Match ${matchIndex + 1}`),
    status: cleanText(match?.status, 'pending').toLowerCase(),
    players: slots,
    winnerName: cleanText(match?.winnerName),
    isBye,
    hasNextMatch: Boolean(match?.nextMatchId),
  };
}

function championPanelName(value, handle) {
  const name = cleanText(value, 'Champion pending');
  const normalizedHandle = cleanText(handle).replace(/^@/, '');
  if (!normalizedHandle) return name;

  const escapedHandle = normalizedHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withoutHandle = name.replace(
    new RegExp(`\\s*(?:\\(\\s*)?@${escapedHandle}(?:\\s*\\))?\\s*$`, 'i'),
    '',
  ).trim();
  return withoutHandle || name;
}

function featuredPanel(status, event, bracket, rounds) {
  if (status === 'complete') {
    const finalRound = rounds.at(-1);
    const finalMatch = finalRound?.matches?.at(-1);
    const finalWinner = finalMatch?.players?.find((player) => player.winner);
    const champion = championPanelName(
      finalWinner?.name || bracket?.winner?.name || finalMatch?.winnerName,
      bracket?.winner?.handle,
    );
    const opponent = finalWinner
      ? finalMatch?.players?.find((player) => !player.winner && player.name !== 'TBD' && player.name !== 'Bye')
      : null;
    return {
      kind: 'champion',
      eyebrow: 'Tournament complete',
      title: champion,
      detail: opponent ? `Final opponent: ${opponent.name}` : 'Official champion',
      match: null,
    };
  }

  if (rounds.length) {
    const candidates = rounds.flatMap((round) => round.matches.map((match) => ({ ...match, roundTitle: round.title })));
    const match = candidates.find((candidate) => ['active', 'live', 'in-progress', 'ready'].includes(candidate.status))
      || candidates.find((candidate) => !['final', 'complete', 'bye'].includes(candidate.status))
      || candidates.at(-1);
    return {
      kind: 'featured-match',
      eyebrow: cleanText(match?.roundTitle, 'Live bracket'),
      title: match?.players?.map((player) => player.name).join(' vs ') || 'Match pending',
      detail: match?.hasNextMatch ? 'Winner advances to the next round' : 'Championship match',
      match: match || null,
    };
  }

  const registered = safeNumber(bracket?.participantCount || event?.participantCount || event?.registeredCount) ?? 0;
  const cap = safeNumber(event?.rosterCap);
  return {
    kind: 'pre-bracket',
    eyebrow: status === 'check-in' ? 'Check-in open' : 'Registration open',
    title: cleanText(event?.title, 'Tournament bracket'),
    detail: 'Bracket generates after check-in',
    registered,
    cap,
  };
}

export function buildBroadcastBracketModel({ event, bracket, now = Date.now() } = {}) {
  if (!event) return null;
  const sourceRounds = Array.isArray(bracket?.rounds) ? bracket.rounds : [];
  const rounds = sourceRounds.map((round, roundIndex) => ({
    key: String(roundIndex + 1),
    title: roundTitle(round, roundIndex, sourceRounds.length),
    matches: (Array.isArray(round?.matches) ? round.matches : []).map((match, matchIndex) => publicMatch(match, roundIndex, matchIndex)),
  }));
  const status = eventStatus(event, bracket, now);
  const gameSlug = cleanText(event?.gameSlug || bracket?.gameSlug, 'spades').toLowerCase() === 'euchre' ? 'euchre' : 'spades';

  return {
    title: cleanText(event.title, '1V1 Tournament'),
    slug: cleanText(event.slug || bracket?.tournamentSlug),
    gameSlug,
    gameName: gameSlug === 'euchre' ? 'Euchre' : 'Spades',
    series: /reddit/i.test(`${event.title || ''} ${event.badge || ''}`) ? 'Reddit Community Cup' : '',
    status,
    statusLabel: status === 'check-in' ? 'Check-in' : `${status.charAt(0).toUpperCase()}${status.slice(1)}`,
    date: cleanText(event.date),
    timeZoneLabel: cleanText(event.timeZoneLabel, 'ET'),
    freeEntry: /free/i.test(`${event.entryLine || ''} ${event.summary || ''}`),
    rounds,
    currentRound: rounds.find((round) => round.matches.some((match) => !['final', 'complete', 'bye'].includes(match.status)))?.title
      || rounds.at(-1)?.title
      || 'Bracket pending',
    featured: featuredPanel(status, event, bracket, rounds),
  };
}

export function formatBroadcastDate(value, timeZoneLabel = 'ET') {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} / ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ${timeZoneLabel}`;
}

/** Read-only labels: a published bracket is not itself confirmation of live play. */
export function getPublicBracketPresentation({ hasBracket = false, isLive = false, isComplete = false } = {}) {
  if (!hasBracket) return { state: 'preview', label: 'Bracket preview', statusLabel: 'Preview' };
  if (isComplete) return { state: 'complete', label: 'Final bracket', statusLabel: 'Complete' };
  if (isLive) return { state: 'live', label: 'Live bracket', statusLabel: 'Live' };
  return { state: 'published', label: 'Published bracket', statusLabel: 'Published' };
}

export function getPublicMatchPlayerLabel(player) {
  if (!player) return 'TBD';
  return player.handle ? `${player.name} (${player.handle})` : player.name;
}

export function isPublicMatchWinner(match, playerIndex) {
  const players = match?.players || [];
  const player = players[playerIndex];

  if (!player) return false;
  if (match.winnerId) return player.id === match.winnerId;

  // Older brackets may only have a winner name. Never highlight both players
  // when that display name is ambiguous.
  const winnerName = String(match.winnerName || '').trim();
  if (!winnerName) return false;

  const matchingIndices = players.flatMap((candidate, index) => (
    candidate && getPublicMatchPlayerLabel(candidate) === winnerName ? [index] : []
  ));
  return matchingIndices.length === 1 && matchingIndices[0] === playerIndex;
}

export function getPublicMatchWinnerLabel(match) {
  const winnerName = String(match?.winnerName || '').trim();
  if (!winnerName) return '';

  const players = (match.players || []).filter(Boolean);
  const sameNamePlayers = players.filter((player) => getPublicMatchPlayerLabel(player) === winnerName);
  if (sameNamePlayers.length < 2) return winnerName;

  const winner = players.find((player) => player.id === match.winnerId);
  if (!winner) return `${winnerName} (identity not recorded)`;
  return `${winnerName} · Seed #${winner.seed || players.indexOf(winner) + 1}`;
}

export function getPublicChampionLabel(bracket) {
  const winner = bracket?.winner;
  if (!winner) return '';

  const winnerName = String(winner.name || '').trim();
  const participants = bracket.participants || [];
  const sameNamePlayers = participants.filter((player) => getPublicMatchPlayerLabel(player) === winnerName);
  if (sameNamePlayers.length < 2) return winnerName;

  const champion = participants.find((player) => player.id === winner.id);
  if (!champion) return `${winnerName} (identity not recorded)`;
  return `${winnerName} · Seed #${champion.seed || participants.indexOf(champion) + 1}`;
}

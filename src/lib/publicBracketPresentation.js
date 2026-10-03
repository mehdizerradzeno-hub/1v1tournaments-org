/** Read-only labels: a published bracket is not itself confirmation of live play. */
export function getPublicBracketPresentation({ hasBracket = false, isLive = false, isComplete = false } = {}) {
  if (!hasBracket) return { state: 'preview', label: 'Bracket preview', statusLabel: 'Preview' };
  if (isComplete) return { state: 'complete', label: 'Final bracket', statusLabel: 'Complete' };
  if (isLive) return { state: 'live', label: 'Live bracket', statusLabel: 'Live' };
  return { state: 'published', label: 'Published bracket', statusLabel: 'Published' };
}

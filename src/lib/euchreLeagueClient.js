const ENDPOINT = '/.netlify/functions/euchre-leagues';

/** Show actual scheduled times across every division, without mutating persisted fixtures. */
export function selectEuchreLeagueSchedule(matches = [], { phase = 'regular', week = 'all', division = 'all' } = {}) {
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  return matches.filter(match => match.phase === phase
    && (week === 'all' || String(match.week) === String(week))
    && (division === 'all' || match.divisionId === division))
    .sort((a, b) => compare(a.scheduledFor || '', b.scheduledFor || '') || compare(a.id, b.id));
}

export async function requestEuchreLeagues({ admin = false, leagueId = '', token = '', action = '', ...payload } = {}, fetchImpl = globalThis.fetch) {
  const query = new URLSearchParams();
  if (admin) query.set('admin', 'true');
  if (leagueId && !action) query.set('leagueId', leagueId);
  const response = await fetchImpl(`${ENDPOINT}${query.size ? `?${query}` : ''}`, {
    method: action ? 'POST' : 'GET', credentials: 'include', cache: 'no-store',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(action ? { 'Content-Type': 'application/json' } : {}) },
    ...(action ? { body: JSON.stringify({ action, leagueId, ...payload }) } : {}),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Euchre leagues could not be loaded.');
    error.code = result.code;
    throw error;
  }
  return result;
}

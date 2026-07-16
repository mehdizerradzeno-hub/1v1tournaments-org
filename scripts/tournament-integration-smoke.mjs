import { randomBytes } from 'node:crypto';

const HUB_ORIGIN = process.env.TOURNAMENT_HUB_ORIGIN || 'https://1v1tournaments.org';
const SPADES_ORIGIN = process.env.SPADES_ORIGIN || 'https://1v1spades.com';
const ADMIN_TOKEN = process.env.TOURNAMENT_ADMIN_TOKEN || '';
const RESULT_TOKEN = process.env.TOURNAMENT_MATCH_RESULT_TOKEN || '';
const ALLOW_WRITES = process.env.ALLOW_PRODUCTION_SMOKE_WRITES === '1';

if (!ALLOW_WRITES) {
  throw new Error('Set ALLOW_PRODUCTION_SMOKE_WRITES=1 to run the disposable production tournament smoke.');
}

if (!ADMIN_TOKEN || !RESULT_TOKEN) {
  throw new Error('TOURNAMENT_ADMIN_TOKEN and TOURNAMENT_MATCH_RESULT_TOKEN are required.');
}

const runId = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
const slug = `spades-integration-smoke-${runId}`;
const password = `${randomBytes(18).toString('base64url')}!9`;
const results = [];
const accounts = [];
let eventCreated = false;

function record(name, detail = '') {
  results.push({ name, detail, ok: true });
  console.log(`PASS ${name}${detail ? ` - ${detail}` : ''}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cookieFrom(response) {
  const values = response.headers.getSetCookie?.() || [];
  const combined = response.headers.get('set-cookie') || '';
  const value = values.find((item) => item.startsWith('one_v_one_player_session='))
    || combined.match(/one_v_one_player_session=[^;,]+/)?.[0]
    || '';
  return value.split(';', 1)[0];
}

async function request(path, {
  body,
  cookie = '',
  expected = 200,
  method = body === undefined ? 'GET' : 'POST',
  origin = HUB_ORIGIN,
  token = '',
} = {}) {
  const response = await fetch(new URL(path, origin), {
    method,
    redirect: 'follow',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Tournament-Smoke': runId,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { text };
  }

  const expectedStatuses = Array.isArray(expected) ? expected : [expected];

  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${method} ${path} returned ${response.status}: ${payload.error || text.slice(0, 160)}`);
  }

  return { payload, response, text };
}

function findMatch(bracket, matchId) {
  for (const round of bracket?.rounds || []) {
    const match = round.matches.find((item) => item.id === matchId);
    if (match) return match;
  }
  return null;
}

async function createPlayer(index) {
  const email = `hub-smoke-${runId}-${index}@example.invalid`;
  const playerName = `Integration Smoke ${index}`;
  const { payload, response } = await request('/.netlify/functions/player-account', {
    body: {
      action: 'create',
      confirmPassword: password,
      contactEmail: email,
      password,
      playerHandle: `smoke-${runId}-${index}`,
      playerName,
    },
    expected: 201,
  });
  const cookie = cookieFrom(response);

  assert(cookie, `Player ${index} account did not receive a signed session cookie.`);
  assert(payload.account?.id, `Player ${index} account did not return an account id.`);
  assert(!payload.verificationRequired, 'Production currently requires email verification; use controlled verified smoke accounts.');

  const sessionCheck = await request('/.netlify/functions/player-account', { cookie });
  assert(sessionCheck.payload.account?.id === payload.account.id, `Player ${index} signed session did not persist.`);

  return { account: payload.account, cookie, email, playerName };
}

async function reportWinner(matchId, winnerId, token, label) {
  const { payload } = await request(`/.netlify/functions/tournament-bracket?slug=${encodeURIComponent(slug)}`, {
    body: { action: 'report-winner', matchId, winnerId },
    token,
  });
  const match = findMatch(payload.bracket, matchId);

  assert(match?.status === 'final', `${label} did not finalize ${matchId}.`);
  assert(match?.winnerId === winnerId, `${label} saved the wrong winner for ${matchId}.`);
  record(label, matchId);
  return payload.bracket;
}

async function cleanup() {
  if (!eventCreated) return;

  const cleanupErrors = [];

  try {
    await request(`/.netlify/functions/admin-roster?slug=${encodeURIComponent(slug)}`, {
      body: { action: 'clear-tournament', tournamentSlug: slug },
      token: ADMIN_TOKEN,
    });
  } catch (error) {
    cleanupErrors.push(error.message);
  }

  try {
    await request(`/.netlify/functions/tournament-events?slug=${encodeURIComponent(slug)}`, {
      body: { action: 'delete', tournamentSlug: slug },
      token: ADMIN_TOKEN,
    });
  } catch (error) {
    cleanupErrors.push(error.message);
  }

  if (cleanupErrors.length) {
    throw new Error(`Smoke cleanup failed: ${cleanupErrors.join(' | ')}`);
  }

  const eventCheck = await request(`/.netlify/functions/tournament-events?slug=${encodeURIComponent(slug)}`, {
    expected: 404,
  });
  assert(eventCheck.payload.error, 'Deleted smoke event still loaded publicly.');
  record('Disposable event cleanup', slug);
}

try {
  const startAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await request('/.netlify/functions/tournament-events', {
    body: {
      action: 'save',
      tournament: {
        badge: 'Integration smoke',
        checkInLeadMinutes: 30,
        date: startAt,
        detail: 'Disposable end-to-end smoke event. Safe to delete automatically.',
        entryLine: 'Free test event.',
        gameSlug: 'spades',
        location: 'Online',
        minimumPlayers: 4,
        mode: 'four-player-double-elimination',
        registrationStatus: 'open',
        rosterCap: 4,
        slug,
        status: 'upcoming',
        summary: 'Disposable hub-to-Spades integration smoke.',
        timeZone: 'America/New_York',
        timeZoneLabel: 'ET',
        title: `Spades Integration Smoke ${runId}`,
      },
    },
    token: ADMIN_TOKEN,
  });
  eventCreated = true;
  record('Temporary four-player event created', slug);

  for (let index = 1; index <= 4; index += 1) {
    accounts.push(await createPlayer(index));
  }
  record('Signed player sessions created', '4 accounts');

  for (const player of accounts) {
    const { payload } = await request('/.netlify/functions/tournament-signup', {
      body: { tournamentSlug: slug },
      cookie: player.cookie,
      expected: 201,
    });
    assert(payload.signup?.currentPlayer, `${player.playerName} was not marked as the current roster player.`);
  }

  const signupSummary = await request(`/.netlify/functions/tournament-signup?slug=${encodeURIComponent(slug)}`);
  assert(signupSummary.payload.signupCount === 4, 'The public roster did not contain four players.');
  record('Public roster and own-name linkage', '4/4 players');

  const generated = await request(`/.netlify/functions/tournament-bracket?slug=${encodeURIComponent(slug)}`, {
    body: { action: 'generate' },
    expected: 201,
    token: ADMIN_TOKEN,
  });
  let bracket = generated.payload.bracket;
  assert(bracket?.format === 'four-player-double-elimination', 'The generated bracket used the wrong format.');
  assert(bracket?.participantCount === 4, 'The generated bracket did not seed four players.');
  record('Four-player double-elimination bracket generated', '5 possible rounds');

  const r1m1 = findMatch(bracket, `${slug}-r1-m1`);
  const r1m2 = findMatch(bracket, `${slug}-r1-m2`);
  assert(r1m1?.status === 'ready' && r1m2?.status === 'ready', 'First-round matches were not ready.');

  const ticketPayloads = [];
  for (const player of accounts.slice(0, 2)) {
    const issued = await request('/.netlify/functions/tournament-match-access', {
      body: { action: 'issue-ticket', tournamentSlug: slug, matchId: r1m1.id },
      cookie: player.cookie,
      expected: 201,
    });
    ticketPayloads.push(issued.payload);
  }

  assert(ticketPayloads[0].seatIndex !== ticketPayloads[1].seatIndex, 'Assigned players received the same seat.');
  assert(new URL(ticketPayloads[0].roomUrl).pathname === new URL(ticketPayloads[1].roomUrl).pathname, 'Players received different room ids.');
  assert(new URL(ticketPayloads[0].roomUrl).pathname === `/match/${r1m1.id}`, 'The room id did not use the stable match id.');

  for (const access of ticketPayloads) {
    const verified = await request('/.netlify/functions/tournament-match-access', {
      body: { action: 'verify-ticket', matchId: r1m1.id, ticket: access.ticket },
    });
    assert(verified.payload.seatIndex === access.seatIndex, 'A ticket did not preserve its assigned seat.');
    const roomResponse = await fetch(access.roomUrl, { redirect: 'follow' });
    assert(roomResponse.ok, `Spades room route returned ${roomResponse.status}.`);
    assert(new URL(roomResponse.url).origin === SPADES_ORIGIN, 'Match link did not resolve on the configured Spades origin.');
  }
  record('Two assigned tickets share one protected Spades room', r1m1.id);

  await request('/.netlify/functions/tournament-match-access', {
    body: { action: 'issue-ticket', tournamentSlug: slug, matchId: r1m2.id },
    cookie: accounts[0].cookie,
    expected: 403,
  });
  await request('/.netlify/functions/tournament-match-access', {
    body: { action: 'verify-ticket', matchId: r1m1.id, ticket: 'not-a-real-ticket' },
    expected: 401,
  });
  record('Unassigned and invalid match access rejected', '403/401');

  bracket = await reportWinner(r1m1.id, r1m1.players[0].id, RESULT_TOKEN, 'Normal game result callback');
  bracket = await reportWinner(r1m2.id, r1m2.players[0].id, RESULT_TOKEN, 'Forfeit result callback');

  const r2m1 = findMatch(bracket, `${slug}-r2-m1`);
  const r2m2 = findMatch(bracket, `${slug}-r2-m2`);
  assert(r2m1?.status === 'ready' && r2m2?.status === 'ready', 'Round-two matches did not advance automatically.');
  assert(r2m1.players[0].id === r1m1.players[0].id, 'The first winner did not reach the winners final.');
  assert(r2m2.players[0].id === r1m1.players[1].id, 'The first loser did not reach the elimination match.');
  record('Winners and losers advanced automatically', 'round 2 ready');

  for (const [index, expectedMatch] of [[0, r2m1.id], [1, r2m2.id]]) {
    const status = await request(`/.netlify/functions/tournament-player-status?slug=${encodeURIComponent(slug)}`, {
      cookie: accounts[index].cookie,
    });
    assert(status.payload.currentMatch?.id === expectedMatch, `Player ${index + 1} did not return to the correct next match.`);
    assert(status.payload.nextStep === 'ready-match', `Player ${index + 1} did not receive ready-match status.`);
  }
  record('Hub return status points players to their next match');

  bracket = await reportWinner(r2m2.id, r2m2.players[0].id, ADMIN_TOKEN, 'Host manual winner override');
  bracket = await reportWinner(r2m1.id, r2m1.players[0].id, RESULT_TOKEN, 'Winners-final game callback');

  const r3m1 = findMatch(bracket, `${slug}-r3-m1`);
  assert(r3m1?.status === 'ready', 'Losers final was not ready.');
  bracket = await reportWinner(r3m1.id, r3m1.players[1].id, RESULT_TOKEN, 'Losers-final game callback');

  const r4m1 = findMatch(bracket, `${slug}-r4-m1`);
  assert(r4m1?.status === 'ready', 'Grand final was not ready.');
  bracket = await reportWinner(r4m1.id, r4m1.players[0].id, RESULT_TOKEN, 'Grand-final game callback');

  assert(bracket.status === 'complete', 'The bracket did not complete after the winners-side champion won the grand final.');
  assert(bracket.winner?.id === r4m1.players[0].id, 'The completed bracket recorded the wrong champion.');
  assert(findMatch(bracket, `${slug}-r5-m1`)?.status === 'pending', 'The unnecessary reset final should remain pending.');

  const championIndex = accounts.findIndex((player) => player.account.id === bracket.winner.accountId);
  assert(championIndex >= 0, 'The champion account could not be mapped back to a player session.');
  const championStatus = await request(`/.netlify/functions/tournament-player-status?slug=${encodeURIComponent(slug)}`, {
    cookie: accounts[championIndex].cookie,
  });
  assert(championStatus.payload.nextStep === 'champion', 'The winner did not receive champion return status.');
  record('Completed bracket returns champion and public final state');

  console.log(`\nTournament integration smoke passed: ${results.length} checks.`);
} finally {
  await cleanup();
}

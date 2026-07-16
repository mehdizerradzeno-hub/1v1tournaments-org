import { performance } from 'node:perf_hooks';

const baseUrl = String(process.env.SMOKE_BASE_URL || 'https://1v1tournaments.org').replace(/\/$/, '');

const pageChecks = [
  { path: '/', markers: ['Next tournament', 'Checking schedule'] },
  { path: '/next', markers: ['Next tournament'] },
  { path: '/live', markers: ['Control room', 'Broadcast hub'] },
  { path: '/admin', markers: ['Private admin unavailable', 'Sponsors'] },
  { path: '/admin/sponsors', markers: ['Sponsor CRM', 'Host access required'] },
  { path: '/sponsors', markers: ['Sponsor 1v1 Tournaments', 'Sponsor inquiry'] },
  { path: '/media-kit', markers: ['Media Kit', 'Sponsorship packages'] },
  { path: '/results', markers: ['Results archive'] },
  { path: '/leaderboard', markers: ['Tournament rankings'] },
  { path: '/rules', markers: ['Rules'] },
  { path: '/stream', markers: ['Stream'] },
];

const apiChecks = [
  {
    path: '/.netlify/functions/stream-commands',
    expectedStatus: 200,
    validate: (body) => {
      const json = parseJson(body);
      return Array.isArray(json.commands) && json.commands.some((item) => item.command === '!join');
    },
  },
  {
    path: '/.netlify/functions/sponsor-prospects',
    expectedStatus: 401,
    validate: (body) => parseJson(body).error?.includes('host-approved'),
  },
  {
    path: '/.netlify/functions/sponsor-inquiries',
    expectedStatus: 401,
    validate: (body) => parseJson(body).error?.includes('host-approved'),
  },
  {
    path: '/.netlify/functions/sponsor-collateral',
    expectedStatus: 401,
    validate: (body) => parseJson(body).error?.includes('host-approved'),
  },
];

function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

async function fetchText(path) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      'user-agent': '1v1tournaments-production-smoke/1.0',
    },
  });
  const body = await response.text();

  return {
    body,
    ms: Number((performance.now() - startedAt).toFixed(1)),
    path,
    status: response.status,
  };
}

function assertMarkers(body, markers) {
  return markers.filter((marker) => !body.includes(marker));
}

const results = [];

for (const check of pageChecks) {
  const result = await fetchText(check.path);
  const missingMarkers = assertMarkers(result.body, check.markers);
  const ok = result.status === 200 && missingMarkers.length === 0;

  results.push({
    kind: 'page',
    path: check.path,
    status: result.status,
    ms: result.ms,
    ok,
    detail: missingMarkers.length ? `missing: ${missingMarkers.join(', ')}` : 'ok',
  });
}

for (const check of apiChecks) {
  const result = await fetchText(check.path);
  const bodyOk = check.validate(result.body);
  const ok = result.status === check.expectedStatus && bodyOk;

  results.push({
    kind: 'api',
    path: check.path,
    status: result.status,
    ms: result.ms,
    ok,
    detail: ok ? 'ok' : `expected ${check.expectedStatus}, body valid: ${bodyOk}`,
  });
}

const eventResult = await fetchText('/.netlify/functions/tournament-events');
const eventPayload = parseJson(eventResult.body);
const hostedTournament = eventPayload.tournaments?.find((item) => item?.slug && !item.deleted) || null;
const eventListOk = eventResult.status === 200 && eventPayload.ok === true && Array.isArray(eventPayload.tournaments);

results.push({
  kind: 'api',
  path: '/.netlify/functions/tournament-events',
  status: eventResult.status,
  ms: eventResult.ms,
  ok: eventListOk,
  detail: eventListOk ? `${eventPayload.tournaments.length} stored event(s)` : 'event list is invalid',
});

if (hostedTournament) {
  const slug = hostedTournament.slug;
  const dynamicChecks = [
    {
      kind: 'page',
      path: `/tournaments/${encodeURIComponent(slug)}`,
      expectedStatus: 200,
      validate: (body) => body.includes('Looking up this hosted tournament'),
    },
    {
      kind: 'page',
      path: `/check-in/${encodeURIComponent(slug)}`,
      expectedStatus: 200,
      validate: (body) => body.includes('Looking up this hosted tournament signup page'),
    },
    {
      kind: 'api',
      path: `/.netlify/functions/tournament-signup?slug=${encodeURIComponent(slug)}`,
      expectedStatus: 200,
      validate: (body) => {
        const json = parseJson(body);
        return json.tournamentSlug === slug && Number.isFinite(json.signupCount);
      },
    },
    {
      kind: 'api',
      path: `/.netlify/functions/tournament-bracket?slug=${encodeURIComponent(slug)}`,
      expectedStatus: 200,
      validate: (body) => {
        const json = parseJson(body);
        return json.ok === true && Object.hasOwn(json, 'bracket');
      },
    },
  ];

  for (const check of dynamicChecks) {
    const result = await fetchText(check.path);
    const bodyOk = check.validate(result.body);
    const ok = result.status === check.expectedStatus && bodyOk;

    results.push({
      kind: check.kind,
      path: check.path,
      status: result.status,
      ms: result.ms,
      ok,
      detail: ok ? `ok (${slug})` : `expected ${check.expectedStatus}, body valid: ${bodyOk}`,
    });
  }
}

console.log(`Production smoke: ${baseUrl}`);
console.table(results.map(({ body, ...result }) => result));

const failures = results.filter((result) => !result.ok);

if (failures.length) {
  console.error(`Production smoke failed: ${failures.length} check(s).`);
  process.exitCode = 1;
} else {
  console.log(`Production smoke passed: ${results.length} check(s).`);
}

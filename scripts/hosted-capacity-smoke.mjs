import { performance } from 'node:perf_hooks';

const baseUrl = String(process.env.CAPACITY_BASE_URL || 'https://1v1tournaments.org').replace(/\/$/, '');
const rounds = positiveInteger(process.env.CAPACITY_ROUNDS, 2);
const concurrency = positiveInteger(process.env.CAPACITY_CONCURRENCY, 4);
const paths = [
  '/',
  '/live',
  '/tournaments/spades-summer-series',
  '/check-in/spades-summer-series',
  '/.netlify/functions/tournament-signup?slug=spades-summer-series',
  '/.netlify/functions/tournament-bracket?slug=spades-summer-series',
];

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function percentile(values, target) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((target / 100) * sorted.length) - 1);
  return sorted[index];
}

async function requestPath(path) {
  const url = `${baseUrl}${path}`;
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        'user-agent': '1v1tournaments-capacity-smoke/1.0',
      },
    });
    await response.arrayBuffer();

    return {
      ok: response.ok,
      path,
      status: response.status,
      ms: performance.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      path,
      status: 'network-error',
      ms: performance.now() - startedAt,
      error: error instanceof Error ? error.message : 'Request failed.',
    };
  }
}

async function runBatch(batchPaths) {
  const queue = [...batchPaths];
  const results = [];
  const workerCount = Math.min(concurrency, queue.length);

  async function worker() {
    while (queue.length) {
      const path = queue.shift();
      results.push(await requestPath(path));
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

const plannedRequests = Array.from({ length: rounds * concurrency }, () => paths).flat();
const results = await runBatch(plannedRequests);
const byPath = new Map();

results.forEach((result) => {
  const existing = byPath.get(result.path) || [];
  existing.push(result);
  byPath.set(result.path, existing);
});

const summary = [...byPath.entries()].map(([path, pathResults]) => {
  const timings = pathResults.map((result) => result.ms);
  const failures = pathResults.filter((result) => !result.ok);

  return {
    path,
    requests: pathResults.length,
    failures: failures.length,
    avgMs: Number((timings.reduce((total, value) => total + value, 0) / timings.length).toFixed(1)),
    p95Ms: Number(percentile(timings, 95).toFixed(1)),
    maxMs: Number(Math.max(...timings).toFixed(1)),
    statuses: [...new Set(pathResults.map((result) => result.status))].join(', '),
  };
});

console.log(`Hosted capacity smoke: ${baseUrl}`);
console.log(`Read-only requests: ${results.length} total, concurrency ${concurrency}, rounds ${rounds}`);
console.table(summary);

const failures = results.filter((result) => !result.ok);

if (failures.length) {
  console.error(`Failures: ${failures.length}`);
  failures.slice(0, 8).forEach((failure) => {
    console.error(`${failure.path} -> ${failure.status}${failure.error ? ` (${failure.error})` : ''}`);
  });
  process.exitCode = 1;
}

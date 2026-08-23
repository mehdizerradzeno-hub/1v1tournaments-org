import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applySiteAnalyticsEvent,
  createDailySiteAnalytics,
  normalizeSiteAnalyticsEvent,
  summarizeSiteAnalytics,
} from '../netlify/functions/_site-analytics-utils.mjs';
import { updateDailyAggregate } from '../netlify/functions/site-analytics.mjs';

test('site analytics receiver keeps only the anonymous allowlisted event contract', () => {
  const normalized = normalizeSiteAnalyticsEvent({
    event: 'link_click',
    properties: {
      external: true,
      from: '/check-in/event?email=player@example.com#account',
      to: 'https://example.com/private/path?token=secret',
      accountId: 'acct_private',
      playerName: 'Private Player',
    },
    timestamp: '1999-01-01T00:00:00.000Z',
  });

  assert.deepEqual(normalized, {
    event: 'link_click',
    properties: {
      external: true,
      from: '/check-in/event',
      to: 'https://example.com',
    },
  });
  assert.equal(normalizeSiteAnalyticsEvent({ event: 'player_identity' }), null);
});

test('site analytics recomputes vital ratings instead of trusting the browser label', () => {
  assert.deepEqual(normalizeSiteAnalyticsEvent({
    event: 'web_vital',
    properties: {
      metric: 'LCP',
      path: '/leaderboard?private=true',
      rating: 'good',
      value: 4_800,
    },
  }), {
    event: 'web_vital',
    properties: {
      metric: 'LCP',
      path: '/leaderboard',
      rating: 'poor',
      value: 4_800,
    },
  });
});

test('site analytics derives external links and rejects protocol-relative path disguises', () => {
  assert.deepEqual(normalizeSiteAnalyticsEvent({
    event: 'link_click',
    properties: {
      external: false,
      from: '//example.com/private',
      to: 'https://example.com/private?token=secret',
    },
  }), {
    event: 'link_click',
    properties: {
      external: true,
      from: '/',
      to: 'https://example.com',
    },
  });
});

test('site analytics stores daily aggregates rather than raw events', () => {
  const now = new Date('2026-08-22T15:30:00.000Z');
  let record = createDailySiteAnalytics('2026-08-22');

  record = applySiteAnalyticsEvent(record, normalizeSiteAnalyticsEvent({
    event: 'page_view',
    properties: { path: '/leaderboard?account=private' },
  }), { now });
  record = applySiteAnalyticsEvent(record, normalizeSiteAnalyticsEvent({
    event: 'page_view',
    properties: { path: '/leaderboard' },
  }), { now });
  record = applySiteAnalyticsEvent(record, normalizeSiteAnalyticsEvent({
    event: 'web_vital',
    properties: { metric: 'CLS', path: '/leaderboard', value: 0.08 },
  }), { now });

  assert.equal(record.counts.pageViews, 2);
  assert.equal(record.counts.vitalSamples, 1);
  assert.equal(record.pages['/leaderboard'], 2);
  assert.equal(record.vitals.CLS['/leaderboard'].ratings.good, 1);
  assert.equal(record.vitals.CLS['/leaderboard'].sum, 0.08);
  assert.doesNotMatch(JSON.stringify(record), /account=private|player@example|rawEvents/);
});

test('site analytics summaries merge daily counts and vital distributions', () => {
  const firstDay = {
    ...createDailySiteAnalytics('2026-08-21'),
    counts: { pageViews: 4, linkClicks: 1, vitalSamples: 1 },
    pages: { '/leaderboard': 3, '/results': 1 },
    links: [{ external: false, from: '/leaderboard', to: '/results', count: 1 }],
    vitals: {
      LCP: {
        '/leaderboard': {
          count: 1,
          sum: 2200,
          min: 2200,
          max: 2200,
          ratings: { good: 1, 'needs-improvement': 0, poor: 0 },
        },
      },
    },
  };
  const secondDay = {
    ...createDailySiteAnalytics('2026-08-22'),
    counts: { pageViews: 5, linkClicks: 2, vitalSamples: 1 },
    pages: { '/leaderboard': 2, '/results': 3 },
    links: [{ external: false, from: '/leaderboard', to: '/results', count: 2 }],
    vitals: {
      LCP: {
        '/leaderboard': {
          count: 1,
          sum: 4200,
          min: 4200,
          max: 4200,
          ratings: { good: 0, 'needs-improvement': 0, poor: 1 },
        },
      },
    },
  };

  const summary = summarizeSiteAnalytics([secondDay, firstDay], { days: 30 });

  assert.deepEqual(summary.totals, { pageViews: 9, linkClicks: 3, vitalSamples: 2 });
  assert.deepEqual(summary.pages[0], { path: '/leaderboard', views: 5 });
  assert.equal(summary.links[0].count, 3);
  assert.equal(summary.vitalMetrics[0].average, 3200);
  assert.deepEqual(summary.vitalMetrics[0].ratings, { good: 1, 'needs-improvement': 0, poor: 1 });
  assert.deepEqual(summary.daily.map((day) => day.date), ['2026-08-21', '2026-08-22']);
});

test('site analytics caps distinct daily link buckets without losing click totals', () => {
  const now = new Date('2026-08-22T15:30:00.000Z');
  let record = createDailySiteAnalytics('2026-08-22');

  for (let index = 0; index < 205; index += 1) {
    record = applySiteAnalyticsEvent(record, normalizeSiteAnalyticsEvent({
      event: 'link_click',
      properties: { external: false, from: '/', to: `/destination-${index}` },
    }), { now });
  }

  assert.equal(record.counts.linkClicks, 205);
  assert.equal(record.links.length, 200);
  assert.equal(record.links.find((link) => link.to === '/other')?.count, 6);
});

test('site analytics uses supported cached reads and retries ETag conflicts', async () => {
  const reads = [];
  const writes = [];
  let attempt = 0;
  const store = {
    async getWithMetadata(key, options) {
      reads.push({ key, options });
      return attempt === 0
        ? null
        : { data: createDailySiteAnalytics('2026-08-22'), etag: 'current-etag' };
    },
    async setJSON(key, value, options) {
      writes.push({ key, options, value });
      attempt += 1;
      return { modified: attempt > 1 };
    },
  };
  const event = normalizeSiteAnalyticsEvent({
    event: 'page_view',
    properties: { path: '/leaderboard' },
  });

  const aggregate = await updateDailyAggregate(
    store,
    event,
    new Date('2026-08-22T21:30:00.000Z'),
    { retryDelays: [0, 0] },
  );

  assert.deepEqual(reads.map((read) => read.options), [{ type: 'json' }, { type: 'json' }]);
  assert.equal(writes[0].options.onlyIfNew, true);
  assert.equal(writes[1].options.onlyIfMatch, 'current-etag');
  assert.equal(aggregate.pages['/leaderboard'], 1);
});

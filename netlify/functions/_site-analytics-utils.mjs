const EVENT_NAMES = new Set(['page_view', 'link_click', 'web_vital']);
const METRIC_NAMES = new Set(['CLS', 'INP', 'LCP', 'TTFB']);
const RATING_NAMES = ['good', 'needs-improvement', 'poor'];
const VITAL_THRESHOLDS = {
  CLS: [0.1, 0.25],
  INP: [200, 500],
  LCP: [2500, 4000],
  TTFB: [800, 1800],
};
const MAX_PATH_LENGTH = 160;
const MAX_PAGE_BUCKETS = 100;
const MAX_LINK_BUCKETS = 200;
const MAX_VITAL_PATHS = 100;

function cleanText(value, maxLength = MAX_PATH_LENGTH) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeAnalyticsPath(value) {
  const path = cleanText(value).split(/[?#]/, 1)[0];

  return path.startsWith('/') && !path.startsWith('//') ? path || '/' : '/';
}

export function sanitizeAnalyticsDestination(value) {
  const destination = cleanText(value);

  if (destination.startsWith('/')) {
    return sanitizeAnalyticsPath(destination);
  }

  try {
    const url = new URL(destination);
    return /^https?:$/.test(url.protocol) ? `${url.protocol}//${url.hostname}` : '';
  } catch {
    return '';
  }
}

function getVitalRating(metric, value) {
  const thresholds = VITAL_THRESHOLDS[metric];

  if (value <= thresholds[0]) return 'good';
  if (value <= thresholds[1]) return 'needs-improvement';
  return 'poor';
}

function normalizeVitalValue(metric, value) {
  const numericValue = Number(value);
  const maximum = metric === 'CLS' ? 10 : 120_000;

  if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > maximum) {
    return null;
  }

  const precision = metric === 'CLS' ? 1000 : 1;
  return Math.round(numericValue * precision) / precision;
}

export function normalizeSiteAnalyticsEvent(payload) {
  const event = cleanText(payload?.event, 32);

  if (!EVENT_NAMES.has(event)) {
    return null;
  }

  if (event === 'page_view') {
    return {
      event,
      properties: {
        path: sanitizeAnalyticsPath(payload?.properties?.path),
      },
    };
  }

  if (event === 'link_click') {
    const to = sanitizeAnalyticsDestination(payload?.properties?.to);

    if (!to) {
      return null;
    }

    return {
      event,
      properties: {
        external: !to.startsWith('/'),
        from: sanitizeAnalyticsPath(payload?.properties?.from),
        to,
      },
    };
  }

  const metric = cleanText(payload?.properties?.metric, 8).toUpperCase();

  if (!METRIC_NAMES.has(metric)) {
    return null;
  }

  const value = normalizeVitalValue(metric, payload?.properties?.value);

  if (value === null) {
    return null;
  }

  return {
    event,
    properties: {
      metric,
      path: sanitizeAnalyticsPath(payload?.properties?.path),
      rating: getVitalRating(metric, value),
      value,
    },
  };
}

export function createDailySiteAnalytics(date) {
  return {
    version: 1,
    date,
    counts: {
      linkClicks: 0,
      pageViews: 0,
      vitalSamples: 0,
    },
    pages: {},
    links: [],
    vitals: {},
    updatedAt: null,
  };
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeDailyRecord(record, date) {
  const counts = ensureObject(record?.counts);

  return {
    version: 1,
    date,
    counts: {
      linkClicks: Math.max(0, Number(counts.linkClicks) || 0),
      pageViews: Math.max(0, Number(counts.pageViews) || 0),
      vitalSamples: Math.max(0, Number(counts.vitalSamples) || 0),
    },
    pages: { ...ensureObject(record?.pages) },
    links: Array.isArray(record?.links) ? record.links.map((link) => ({ ...link })) : [],
    vitals: structuredClone(ensureObject(record?.vitals)),
    updatedAt: record?.updatedAt || null,
  };
}

function limitedBucketKey(collection, key, limit, fallback) {
  if (Object.prototype.hasOwnProperty.call(collection, key) || Object.keys(collection).length < limit) {
    return key;
  }

  return fallback;
}

function applyPageView(record, properties) {
  const path = limitedBucketKey(record.pages, properties.path, MAX_PAGE_BUCKETS, '/other');
  record.counts.pageViews += 1;
  record.pages[path] = Math.max(0, Number(record.pages[path]) || 0) + 1;
}

function applyLinkClick(record, properties) {
  const existing = record.links.find((link) => (
    link.from === properties.from
    && link.to === properties.to
    && Boolean(link.external) === properties.external
  ));

  record.counts.linkClicks += 1;

  if (existing) {
    existing.count = Math.max(0, Number(existing.count) || 0) + 1;
    return;
  }

  if (record.links.length < MAX_LINK_BUCKETS - 1) {
    record.links.push({ ...properties, count: 1 });
    return;
  }

  const fallback = record.links.find((link) => link.from === '/other' && link.to === '/other');
  if (fallback) {
    fallback.count += 1;
  } else if (record.links.length < MAX_LINK_BUCKETS) {
    record.links.push({ external: false, from: '/other', to: '/other', count: 1 });
  } else {
    const replaced = record.links.at(-1);
    record.links[record.links.length - 1] = {
      external: false,
      from: '/other',
      to: '/other',
      count: Math.max(0, Number(replaced?.count) || 0) + 1,
    };
  }
}

function createVitalBucket() {
  return {
    count: 0,
    max: null,
    min: null,
    ratings: Object.fromEntries(RATING_NAMES.map((rating) => [rating, 0])),
    sum: 0,
  };
}

function applyVital(record, properties) {
  record.vitals[properties.metric] = ensureObject(record.vitals[properties.metric]);
  const metricBuckets = record.vitals[properties.metric];
  const path = limitedBucketKey(metricBuckets, properties.path, MAX_VITAL_PATHS, '/other');
  const bucket = {
    ...createVitalBucket(),
    ...ensureObject(metricBuckets[path]),
    ratings: {
      ...createVitalBucket().ratings,
      ...ensureObject(metricBuckets[path]?.ratings),
    },
  };

  record.counts.vitalSamples += 1;
  bucket.count = Math.max(0, Number(bucket.count) || 0) + 1;
  bucket.sum = (Number(bucket.sum) || 0) + properties.value;
  bucket.min = bucket.min === null ? properties.value : Math.min(Number(bucket.min), properties.value);
  bucket.max = bucket.max === null ? properties.value : Math.max(Number(bucket.max), properties.value);
  bucket.ratings[properties.rating] = Math.max(0, Number(bucket.ratings[properties.rating]) || 0) + 1;
  metricBuckets[path] = bucket;
}

export function applySiteAnalyticsEvent(record, normalizedEvent, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const date = now.toISOString().slice(0, 10);
  const next = normalizeDailyRecord(record || createDailySiteAnalytics(date), date);

  if (normalizedEvent.event === 'page_view') {
    applyPageView(next, normalizedEvent.properties);
  } else if (normalizedEvent.event === 'link_click') {
    applyLinkClick(next, normalizedEvent.properties);
  } else if (normalizedEvent.event === 'web_vital') {
    applyVital(next, normalizedEvent.properties);
  }

  next.updatedAt = now.toISOString();
  return next;
}

function mergeVitalBucket(target, source) {
  target.count += Number(source?.count) || 0;
  target.sum += Number(source?.sum) || 0;
  target.min = source?.min === null || source?.min === undefined
    ? target.min
    : target.min === null
      ? Number(source.min)
      : Math.min(target.min, Number(source.min));
  target.max = source?.max === null || source?.max === undefined
    ? target.max
    : target.max === null
      ? Number(source.max)
      : Math.max(target.max, Number(source.max));
  RATING_NAMES.forEach((rating) => {
    target.ratings[rating] += Number(source?.ratings?.[rating]) || 0;
  });
}

function presentVital(metric, path, bucket) {
  const average = bucket.count ? bucket.sum / bucket.count : 0;

  return {
    metric,
    path,
    samples: bucket.count,
    average: metric === 'CLS' ? Math.round(average * 1000) / 1000 : Math.round(average),
    min: bucket.min,
    max: bucket.max,
    ratings: bucket.ratings,
  };
}

export function summarizeSiteAnalytics(records = [], options = {}) {
  const daysRequested = Math.max(1, Math.min(90, Number(options.days) || 30));
  const pages = {};
  const links = new Map();
  const vitalMetrics = {};
  const vitalPaths = [];
  const validRecords = records
    .filter((record) => record?.date)
    .sort((left, right) => left.date.localeCompare(right.date));
  const totals = { linkClicks: 0, pageViews: 0, vitalSamples: 0 };

  validRecords.forEach((record) => {
    totals.linkClicks += Number(record.counts?.linkClicks) || 0;
    totals.pageViews += Number(record.counts?.pageViews) || 0;
    totals.vitalSamples += Number(record.counts?.vitalSamples) || 0;

    Object.entries(ensureObject(record.pages)).forEach(([path, views]) => {
      pages[path] = (pages[path] || 0) + (Number(views) || 0);
    });

    (Array.isArray(record.links) ? record.links : []).forEach((link) => {
      const key = JSON.stringify([link.from, link.to, Boolean(link.external)]);
      const current = links.get(key) || { ...link, external: Boolean(link.external), count: 0 };
      current.count += Number(link.count) || 0;
      links.set(key, current);
    });

    Object.entries(ensureObject(record.vitals)).forEach(([metric, paths]) => {
      vitalMetrics[metric] ||= createVitalBucket();

      Object.entries(ensureObject(paths)).forEach(([path, bucket]) => {
        mergeVitalBucket(vitalMetrics[metric], bucket);
        const existing = vitalPaths.find((item) => item.metric === metric && item.path === path);

        if (existing) {
          mergeVitalBucket(existing.bucket, bucket);
        } else {
          const nextBucket = createVitalBucket();
          mergeVitalBucket(nextBucket, bucket);
          vitalPaths.push({ metric, path, bucket: nextBucket });
        }
      });
    });
  });

  return {
    period: {
      daysRequested,
      daysWithData: validRecords.length,
      startDate: validRecords[0]?.date || null,
      endDate: validRecords.at(-1)?.date || null,
    },
    totals,
    pages: Object.entries(pages)
      .map(([path, views]) => ({ path, views }))
      .sort((left, right) => right.views - left.views || left.path.localeCompare(right.path)),
    links: [...links.values()]
      .sort((left, right) => right.count - left.count || left.to.localeCompare(right.to)),
    vitalMetrics: Object.entries(vitalMetrics)
      .map(([metric, bucket]) => presentVital(metric, 'all', bucket))
      .sort((left, right) => left.metric.localeCompare(right.metric)),
    vitalPaths: vitalPaths
      .map(({ metric, path, bucket }) => presentVital(metric, path, bucket))
      .sort((left, right) => right.samples - left.samples || left.metric.localeCompare(right.metric)),
    daily: validRecords.map((record) => ({
      date: record.date,
      linkClicks: Number(record.counts?.linkClicks) || 0,
      pageViews: Number(record.counts?.pageViews) || 0,
      vitalSamples: Number(record.counts?.vitalSamples) || 0,
    })),
  };
}

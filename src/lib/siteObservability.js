const SITE_EVENT_NAME = 'one-v-one-tournaments:analytics';
const ALLOWED_EVENT_PROPERTIES = {
  link_click: ['external', 'from', 'to'],
  page_view: ['path'],
  web_vital: ['metric', 'path', 'rating', 'value'],
};
const VITAL_THRESHOLDS = {
  CLS: [0.1, 0.25],
  INP: [200, 500],
  LCP: [2500, 4000],
  TTFB: [800, 1800],
};

let performanceTrackingStarted = false;

function configuredTelemetryEndpoint() {
  const value = typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_SITE_TELEMETRY_ENDPOINT || ''
    : '';

  if (value.startsWith('/')) {
    return value;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function sanitizeSitePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    return '/';
  }

  return value.split(/[?#]/, 1)[0] || '/';
}

export function sanitizeLinkDestination(value) {
  if (typeof value !== 'string') {
    return '';
  }

  if (value.startsWith('/')) {
    return sanitizeSitePath(value);
  }

  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? `${url.protocol}//${url.hostname}` : '';
  } catch {
    return '';
  }
}

function sanitizeProperties(eventName, properties) {
  const allowedKeys = ALLOWED_EVENT_PROPERTIES[eventName] || [];

  return Object.fromEntries(
    allowedKeys.flatMap((key) => {
      const value = properties?.[key];

      if (key === 'path' || key === 'from') {
        return [[key, sanitizeSitePath(value)]];
      }

      if (key === 'to') {
        const destination = sanitizeLinkDestination(value);
        return destination ? [[key, destination]] : [];
      }

      if (key === 'external') {
        return [[key, Boolean(value)]];
      }

      if (key === 'value' && Number.isFinite(value)) {
        return [[key, value]];
      }

      if ((key === 'metric' || key === 'rating') && typeof value === 'string') {
        return [[key, value.slice(0, 32)]];
      }

      return [];
    }),
  );
}

export function buildSiteEvent(eventName, properties = {}) {
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_EVENT_PROPERTIES, eventName)) {
    return null;
  }

  return {
    event: eventName,
    properties: sanitizeProperties(eventName, properties),
    timestamp: new Date().toISOString(),
  };
}

export function trackSiteEvent(eventName, properties = {}) {
  const event = buildSiteEvent(eventName, properties);

  if (!event) {
    return false;
  }

  if (typeof globalThis.CustomEvent === 'function' && typeof globalThis.dispatchEvent === 'function') {
    globalThis.dispatchEvent(new globalThis.CustomEvent(SITE_EVENT_NAME, { detail: event }));
  }

  const endpoint = configuredTelemetryEndpoint();

  if (endpoint && typeof globalThis.fetch === 'function') {
    globalThis.fetch(endpoint, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => {});
  }

  return true;
}

function getRating(metric, value) {
  const thresholds = VITAL_THRESHOLDS[metric];

  if (!thresholds) return 'unknown';
  if (value <= thresholds[0]) return 'good';
  if (value <= thresholds[1]) return 'needs-improvement';
  return 'poor';
}

function reportVital(path, metric, rawValue) {
  const precision = metric === 'CLS' ? 1000 : 1;
  const value = Math.round(rawValue * precision) / precision;

  trackSiteEvent('web_vital', {
    metric,
    path,
    rating: getRating(metric, value),
    value,
  });
}

export function ensureSitePerformanceTracking(path = '/') {
  if (performanceTrackingStarted || typeof globalThis.PerformanceObserver !== 'function') {
    return false;
  }

  performanceTrackingStarted = true;
  const observedPath = sanitizeSitePath(path);
  const observers = [];
  let clsValue = 0;
  let inpValue = 0;
  let lcpValue = 0;
  let flushed = false;

  function observe(type, callback, options = {}) {
    try {
      const observer = new globalThis.PerformanceObserver((list) => callback(list.getEntries()));
      observer.observe({ type, buffered: true, ...options });
      observers.push(observer);
    } catch {
      // Older browsers simply skip unsupported performance entry types.
    }
  }

  observe('largest-contentful-paint', (entries) => {
    const entry = entries.at(-1);
    if (entry) lcpValue = entry.startTime;
  });
  observe('layout-shift', (entries) => {
    entries.forEach((entry) => {
      if (!entry.hadRecentInput) clsValue += entry.value;
    });
  });
  observe('event', (entries) => {
    entries.forEach((entry) => {
      if (entry.interactionId && entry.duration > inpValue) inpValue = entry.duration;
    });
  }, { durationThreshold: 40 });

  const navigation = globalThis.performance?.getEntriesByType?.('navigation')?.[0];
  if (navigation?.responseStart >= 0) {
    reportVital(observedPath, 'TTFB', navigation.responseStart);
  }

  function flush() {
    if (flushed) return;
    flushed = true;
    if (lcpValue > 0) reportVital(observedPath, 'LCP', lcpValue);
    reportVital(observedPath, 'CLS', clsValue);
    if (inpValue > 0) reportVital(observedPath, 'INP', inpValue);
    observers.forEach((observer) => observer.disconnect());
  }

  function handleVisibilityChange() {
    if (globalThis.document?.visibilityState === 'hidden') flush();
  }

  globalThis.addEventListener?.('pagehide', flush, { once: true });
  globalThis.document?.addEventListener?.('visibilitychange', handleVisibilityChange);
  return true;
}

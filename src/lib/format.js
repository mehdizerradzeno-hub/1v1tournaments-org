const DEFAULT_TIME_ZONE = 'America/New_York';

function toDate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatByOptions(value, options) {
  const date = toDate(value);

  if (!date) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat('en-US', options).format(date);
  } catch {
    return '';
  }
}

export function formatLongDate(value, timeZone = DEFAULT_TIME_ZONE) {
  return formatByOptions(value, {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatShortDate(value, timeZone = DEFAULT_TIME_ZONE) {
  return formatByOptions(value, {
    timeZone,
    month: 'short',
    day: 'numeric',
  });
}

export function formatTime(value, timeZone = DEFAULT_TIME_ZONE) {
  return formatByOptions(value, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDateLine(value, timeZone = DEFAULT_TIME_ZONE, timeZoneLabel = 'ET') {
  const date = formatLongDate(value, timeZone);
  const time = formatTime(value, timeZone);

  if (!date || !time) {
    return 'Schedule TBD';
  }

  return `${date} • ${time} ${timeZoneLabel}`;
}

export function formatDateHeader(value, timeZone = DEFAULT_TIME_ZONE) {
  return formatByOptions(value, {
    timeZone,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatMonthDay(value, timeZone = DEFAULT_TIME_ZONE) {
  return formatByOptions(value, {
    timeZone,
    month: 'long',
    day: 'numeric',
  });
}

export function formatResultDate(value, timeZone = DEFAULT_TIME_ZONE) {
  return formatByOptions(value, {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatPlacement(place) {
  if (place === 1) return '1st';
  if (place === 2) return '2nd';
  if (place === 3) return '3rd';
  return `${place}th`;
}

export function formatSlugLabel(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export { DEFAULT_TIME_ZONE };

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_OCCURRENCES = 52;
const MIN_OCCURRENCES = 2;

export const TOURNAMENT_REPEAT_OPTIONS = Object.freeze([
  { label: 'Does not repeat', value: 'none' },
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
]);

export const TOURNAMENT_WEEKDAYS = Object.freeze([
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
]);

function cleanText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function parseLocalDate(value) {
  const text = cleanText(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (!match) {
    throw new Error('Use a local date in YYYY-MM-DD format.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error('Choose a valid local calendar date.');
  }

  return { date, day, month, text, year };
}

function parseLocalTime(value) {
  const text = cleanText(value);
  const match = /^(\d{2}):(\d{2})$/.exec(text);

  if (!match) {
    throw new Error('Use a local start time in HH:MM format.');
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) {
    throw new Error('Choose a valid local start time.');
  }

  return { hour, minute, text };
}

function dateText(date) {
  return date.toISOString().slice(0, 10);
}

function addLocalDays(localDate, days) {
  const parsed = parseLocalDate(localDate);
  return dateText(new Date(parsed.date.getTime() + (days * DAY_MS)));
}

function compareLocalDates(left, right) {
  return left.localeCompare(right);
}

function formattedLocalParts(instant, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const hour = parts.hour === '24' ? '00' : parts.hour;

  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

export function resolveZonedLocalDateTime(localDate, localTime, timeZone) {
  const parsedDate = parseLocalDate(localDate);
  const parsedTime = parseLocalTime(localTime);
  const zone = cleanText(timeZone);

  if (!zone) {
    throw new Error('Choose an IANA time zone, such as America/New_York.');
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
  } catch {
    throw new Error('Choose a valid IANA time zone, such as America/New_York.');
  }

  const requested = `${parsedDate.text}T${parsedTime.text}`;
  const approximateUtc = Date.UTC(
    parsedDate.year,
    parsedDate.month - 1,
    parsedDate.day,
    parsedTime.hour,
    parsedTime.minute,
  );
  const matches = [];

  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 1) {
    const candidate = new Date(approximateUtc + (offsetMinutes * 60 * 1000));

    if (formattedLocalParts(candidate, zone) === requested) {
      matches.push(candidate);
    }
  }

  if (matches.length === 0) {
    throw new Error(`${requested} does not exist in ${zone} because of a time-zone transition.`);
  }

  if (matches.length > 1) {
    throw new Error(`${requested} is ambiguous in ${zone} because of a time-zone transition.`);
  }

  return matches[0].toISOString();
}

function normalizeWeekdays(values = []) {
  const normalized = [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
  )].sort((left, right) => left - right);

  return normalized;
}

export function normalizeTournamentRecurrence(value = {}) {
  const frequency = ['daily', 'weekly'].includes(value.frequency) ? value.frequency : 'none';

  if (frequency === 'none') {
    return {
      frequency,
      limitMode: 'count',
      count: 1,
      endLocalDate: '',
      weekdays: [],
    };
  }

  const limitMode = value.limitMode === 'end-date' ? 'end-date' : 'count';
  const count = Number.parseInt(value.count, 10);
  const endLocalDate = cleanText(value.endLocalDate);
  const weekdays = normalizeWeekdays(value.weekdays);

  if (frequency === 'weekly' && weekdays.length === 0) {
    throw new Error('Choose at least one weekday for a weekly tournament series.');
  }

  if (limitMode === 'count' && (!Number.isInteger(count) || count < MIN_OCCURRENCES || count > MAX_OCCURRENCES)) {
    throw new Error(`Tournament series must contain ${MIN_OCCURRENCES}-${MAX_OCCURRENCES} occurrences.`);
  }

  if (limitMode === 'end-date' && !endLocalDate) {
    throw new Error('Choose an inclusive end date for this tournament series.');
  }

  if (endLocalDate) {
    parseLocalDate(endLocalDate);
  }

  return {
    frequency,
    limitMode,
    count: limitMode === 'count' ? count : null,
    endLocalDate: limitMode === 'end-date' ? endLocalDate : '',
    weekdays,
  };
}

export function generateTournamentOccurrences({
  baseSlug,
  baseTournament = {},
  idSuffix,
  localTime,
  recurrence,
  startLocalDate,
  timeZone,
} = {}) {
  const title = cleanText(baseTournament.title);
  const slug = cleanText(baseSlug || baseTournament.slug);
  const suffix = cleanText(idSuffix).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(-10);
  const start = parseLocalDate(startLocalDate).text;
  const time = parseLocalTime(localTime).text;
  const zone = cleanText(timeZone);
  const rule = normalizeTournamentRecurrence(recurrence);

  if (!title || !slug || !suffix) {
    throw new Error('Tournament title, slug, and series identifier are required.');
  }

  if (rule.frequency === 'none') {
    throw new Error('Choose Daily or Weekly before previewing a tournament series.');
  }

  if (rule.endLocalDate && compareLocalDates(rule.endLocalDate, start) < 0) {
    throw new Error('The recurrence end date must be on or after the first local date.');
  }

  const occurrences = [];
  let cursor = start;
  let scannedDays = 0;

  while (occurrences.length < MAX_OCCURRENCES && scannedDays < 3700) {
    const parsed = parseLocalDate(cursor);
    const matchesFrequency = rule.frequency === 'daily' || rule.weekdays.includes(parsed.date.getUTCDay());

    if (matchesFrequency) {
      if (rule.limitMode === 'end-date' && compareLocalDates(cursor, rule.endLocalDate) > 0) {
        break;
      }

      const date = resolveZonedLocalDateTime(cursor, time, zone);
      const compactDate = cursor.replaceAll('-', '');

      occurrences.push({
        date,
        gameSlug: baseTournament.gameSlug || 'spades',
        index: occurrences.length + 1,
        localDate: cursor,
        localTime: time,
        slug: `${slug}-${compactDate}-${suffix}`,
        timeZone: zone,
        title,
      });

      if (rule.limitMode === 'count' && occurrences.length === rule.count) {
        break;
      }
    }

    cursor = addLocalDays(cursor, 1);
    scannedDays += 1;
  }

  if (occurrences.length < MIN_OCCURRENCES) {
    throw new Error(`Tournament series must contain at least ${MIN_OCCURRENCES} occurrences.`);
  }

  if (
    rule.limitMode === 'end-date'
    && occurrences.length === MAX_OCCURRENCES
  ) {
    let nextCandidate = addLocalDays(occurrences.at(-1).localDate, 1);

    while (compareLocalDates(nextCandidate, rule.endLocalDate) <= 0) {
      const parsed = parseLocalDate(nextCandidate);
      const matchesFrequency = rule.frequency === 'daily' || rule.weekdays.includes(parsed.date.getUTCDay());

      if (matchesFrequency) {
        throw new Error(`Tournament series cannot contain more than ${MAX_OCCURRENCES} occurrences.`);
      }

      nextCandidate = addLocalDays(nextCandidate, 1);
    }
  }

  return {
    localTime: time,
    occurrences,
    recurrence: rule,
    startLocalDate: start,
    timeZone: zone,
  };
}

export function recurrenceOccurrenceIsIndividuallyManaged(tournament = {}) {
  return Boolean(
    tournament?.recurrence?.individuallyEditedAt
    || tournament?.recurrence?.cancelledAt
    || tournament?.cancelledAt,
  );
}

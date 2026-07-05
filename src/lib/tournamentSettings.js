import { formatTime } from './format.js';

export const REGISTRATION_STATUS_OPTIONS = [
  {
    value: 'open',
    label: 'Registration open',
    tone: 'green',
    actionCopy: 'Registration is open now.',
  },
  {
    value: 'closed',
    label: 'Registration closed',
    tone: 'rose',
    actionCopy: 'Registration is closed by the host.',
  },
  {
    value: 'coming-soon',
    label: 'Coming soon',
    tone: 'blue',
    actionCopy: 'Registration is not open yet.',
  },
];

const DEFAULT_CHECK_IN_LEAD_MINUTES = 30;
const DEFAULT_TIME_ZONE = 'America/New_York';
const DEFAULT_TIME_ZONE_LABEL = 'ET';

function cleanText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

export function normalizeRegistrationStatus(value) {
  const status = cleanText(value).toLowerCase();
  return REGISTRATION_STATUS_OPTIONS.some((option) => option.value === status) ? status : 'open';
}

export function getRegistrationStatusMeta(value) {
  const status = normalizeRegistrationStatus(value);
  return REGISTRATION_STATUS_OPTIONS.find((option) => option.value === status) || REGISTRATION_STATUS_OPTIONS[0];
}

export function normalizeCheckInLeadMinutes(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_CHECK_IN_LEAD_MINUTES;
  }

  return Math.min(Math.max(parsed, 0), 1440);
}

function formatLeadMinutes(minutes) {
  if (minutes <= 0) {
    return 'At start';
  }

  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? '' : 's'} early`;
  }

  return `${minutes} min early`;
}

function formatLeadWindow(minutes) {
  if (minutes <= 0) {
    return 'Check-in opens at the start time.';
  }

  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `Opens ${hours} hour${hours === 1 ? '' : 's'} before the start time.`;
  }

  return `Opens ${minutes} minutes before the start time.`;
}

function formatCallout(minutes, status) {
  if (status === 'closed') {
    return 'Registration is closed by the host.';
  }

  if (status === 'coming-soon') {
    return 'Registration opens when the host is ready.';
  }

  return `Check-in ${formatLeadWindow(minutes).toLowerCase()}`;
}

function dateParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));

  return parts.reduce((result, part) => {
    if (part.type !== 'literal') {
      result[part.type] = part.value;
    }

    return result;
  }, {});
}

export function dateToScheduleFields(value, timeZone = DEFAULT_TIME_ZONE) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return { date: '', time: '' };
  }

  const parts = dateParts(parsed, timeZone);

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function zonedDateTimeToIso(dateValue, timeValue, timeZone = DEFAULT_TIME_ZONE) {
  const dateMatch = String(dateValue || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(timeValue || '').trim().match(/^(\d{2}):(\d{2})$/);

  if (!dateMatch || !timeMatch) {
    throw new Error('Use YYYY-MM-DD for date and HH:MM for time.');
  }

  const [, yearText, monthText, dayText] = dateMatch;
  const [, hourText, minuteText] = timeMatch;
  const target = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
  };

  if (target.hour > 23 || target.minute > 59) {
    throw new Error('Use a 24-hour time like 18:00.');
  }

  const targetUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  let guess = targetUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = dateParts(guess, timeZone);
    const renderedUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    guess += targetUtc - renderedUtc;
  }

  return new Date(guess).toISOString();
}

function buildAgenda(tournament, date, timeZone, timeZoneLabel, checkInLeadMinutes) {
  const startDate = new Date(date);

  if (Number.isNaN(startDate.getTime())) {
    return tournament.agenda;
  }

  const checkInDate = new Date(startDate.getTime() - checkInLeadMinutes * 60 * 1000);

  return [
    { time: `${formatTime(checkInDate, timeZone)} ${timeZoneLabel}`, label: 'Check-in opens' },
    { time: `${formatTime(startDate, timeZone)} ${timeZoneLabel}`, label: 'Bracket begins' },
    { time: 'After final table', label: 'Results posted' },
  ];
}

export function mergeTournamentSettings(tournament, settings) {
  if (!tournament) {
    return null;
  }

  const nextSettings = settings || {};
  const date = cleanText(nextSettings.date, tournament.date);
  const timeZone = cleanText(nextSettings.timeZone, tournament.timeZone || DEFAULT_TIME_ZONE);
  const timeZoneLabel = cleanText(nextSettings.timeZoneLabel, tournament.timeZoneLabel || DEFAULT_TIME_ZONE_LABEL);
  const registrationStatus = normalizeRegistrationStatus(nextSettings.registrationStatus || tournament.registrationStatus);
  const checkInLeadMinutes = normalizeCheckInLeadMinutes(
    nextSettings.checkInLeadMinutes ?? tournament.checkInLeadMinutes ?? DEFAULT_CHECK_IN_LEAD_MINUTES,
  );
  const statusMeta = getRegistrationStatusMeta(registrationStatus);

  return {
    ...tournament,
    date,
    timeZone,
    timeZoneLabel,
    registrationStatus,
    checkInLeadMinutes,
    callout: formatCallout(checkInLeadMinutes, registrationStatus),
    checkIn: {
      ...tournament.checkIn,
      status: statusMeta.label,
      preview: formatLeadMinutes(checkInLeadMinutes),
      window: registrationStatus === 'open' ? formatLeadWindow(checkInLeadMinutes) : statusMeta.actionCopy,
    },
    agenda: buildAgenda(tournament, date, timeZone, timeZoneLabel, checkInLeadMinutes),
    liveSettings: settings || null,
  };
}

export function getScheduleFieldDefaults(tournament) {
  const merged = mergeTournamentSettings(tournament, null);
  const fields = dateToScheduleFields(merged?.date, merged?.timeZone);

  return {
    date: fields.date,
    time: fields.time,
    timeZone: merged?.timeZone || DEFAULT_TIME_ZONE,
    timeZoneLabel: merged?.timeZoneLabel || DEFAULT_TIME_ZONE_LABEL,
    registrationStatus: merged?.registrationStatus || 'open',
    checkInLeadMinutes: String(merged?.checkInLeadMinutes ?? DEFAULT_CHECK_IN_LEAD_MINUTES),
  };
}


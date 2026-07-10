import { createAuditEvent } from './audit.js';

export const SPONSOR_INTEREST_OPTIONS = Object.freeze([
  'Tournament sponsorship',
  'Product partnership',
  'In-kind support',
  'Local business sponsorship',
  'Media kit request',
  'Other',
]);

export const SPONSOR_BUDGET_RANGES = Object.freeze([
  'Not sure yet',
  'Under $250',
  '$250-$500',
  '$500-$1,000',
  '$1,000-$2,500',
  '$2,500+',
  'In-kind only',
]);

function cleanText(value, maxLength = 500) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function validUrl(value) {
  const raw = String(value || '').trim();

  if (!raw) return true;

  try {
    const url = raw.startsWith('http://') || raw.startsWith('https://') ? new URL(raw) : new URL(`https://${raw}`);
    return Boolean(url.hostname.includes('.'));
  } catch {
    return false;
  }
}

export function normalizeSponsorInquiry(input = {}) {
  return {
    name: cleanText(input.name, 100),
    company: cleanText(input.company, 120),
    workEmail: cleanText(input.workEmail, 160).toLowerCase(),
    website: cleanText(input.website, 240),
    sponsorshipInterest: SPONSOR_INTEREST_OPTIONS.includes(input.sponsorshipInterest)
      ? input.sponsorshipInterest
      : 'Other',
    estimatedBudgetRange: SPONSOR_BUDGET_RANGES.includes(input.estimatedBudgetRange)
      ? input.estimatedBudgetRange
      : 'Not sure yet',
    desiredTiming: cleanText(input.desiredTiming, 120),
    message: cleanText(input.message, 1000),
    consent: Boolean(input.consent),
    sourcePage: cleanText(input.sourcePage || '/sponsors', 120),
    receivedAt: input.receivedAt || new Date().toISOString(),
  };
}

export function validateSponsorInquiry(input = {}) {
  const inquiry = normalizeSponsorInquiry(input);
  const errors = [];

  if (!inquiry.name) errors.push('Name is required.');
  if (!inquiry.company) errors.push('Company is required.');
  if (!validEmail(inquiry.workEmail)) errors.push('A valid work email is required.');
  if (!validUrl(inquiry.website)) errors.push('Website must be a valid URL.');
  if (!inquiry.sponsorshipInterest) errors.push('Sponsorship interest is required.');
  if (!inquiry.message || inquiry.message.length < 10) errors.push('Message must be at least 10 characters.');
  if (!inquiry.consent) errors.push('Consent is required before submitting.');

  const spamSignals = [
    /casino bonus/i,
    /crypto pump/i,
    /guaranteed roi/i,
    /buy followers/i,
  ].filter((pattern) => pattern.test(`${inquiry.company} ${inquiry.message}`));

  if (spamSignals.length) errors.push('Inquiry needs manual spam review.');

  return {
    inquiry,
    errors,
    accepted: errors.length === 0,
  };
}

export function createSponsorInquiryRecord(input = {}, { actorId = 'public-sponsor-form' } = {}) {
  const validation = validateSponsorInquiry(input);

  if (!validation.accepted) {
    return {
      inquiry: validation.inquiry,
      errors: validation.errors,
      auditEvent: null,
    };
  }

  return {
    inquiry: {
      ...validation.inquiry,
      id: `sponsor-inquiry-${validation.inquiry.receivedAt}`,
      status: 'NEW',
    },
    errors: [],
    auditEvent: createAuditEvent({
      actorId,
      action: 'sponsor.inquiry.received',
      entityType: 'SponsorInquiry',
      entityId: `sponsor-inquiry-${validation.inquiry.receivedAt}`,
      afterData: {
        company: validation.inquiry.company,
        sponsorshipInterest: validation.inquiry.sponsorshipInterest,
      },
      createdAt: validation.inquiry.receivedAt,
    }),
  };
}

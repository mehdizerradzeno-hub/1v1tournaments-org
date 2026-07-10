export const SPONSOR_STORE_NAMES = Object.freeze({
  prospects: 'sponsor-prospects',
  interactions: 'sponsor-interactions',
  outreachDrafts: 'sponsor-outreach-drafts',
  approvals: 'sponsor-approval-requests',
  packages: 'sponsor-packages',
  deals: 'sponsor-deals',
  metrics: 'sponsor-metrics',
  assets: 'sponsor-assets',
  researchRuns: 'sponsor-research-runs',
  auditEvents: 'sponsor-audit-events',
});

export const PROSPECT_STATUSES = Object.freeze([
  'NEW',
  'RESEARCHED',
  'QUALIFIED',
  'DRAFT_READY',
  'CONTACTED',
  'REPLIED',
  'MEETING',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
  'PAUSED',
  'DO_NOT_CONTACT',
]);

export const OUTREACH_STATUSES = Object.freeze([
  'DRAFT',
  'NEEDS_REVIEW',
  'APPROVED',
  'REJECTED',
  'SENT',
  'FAILED',
  'ARCHIVED',
]);

export const APPROVAL_STATUSES = Object.freeze([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'ARCHIVED',
]);

export const RISK_STATUSES = Object.freeze([
  'CLEAR',
  'NEEDS_REVIEW',
  'RESTRICTED',
  'DO_NOT_CONTACT',
]);

export const SPONSOR_TIERS = Object.freeze({
  A: 'A',
  B: 'B',
  C: 'C',
});

export const SPONSOR_CATEGORIES = Object.freeze({
  playingCards: { tier: 'A', label: 'Playing-card companies' },
  cardTables: { tier: 'A', label: 'Card-table and game-room brands' },
  gamingAccessories: { tier: 'A', label: 'Gaming accessories' },
  streamingHardware: { tier: 'A', label: 'Streaming hardware' },
  creatorSoftware: { tier: 'A', label: 'Creator software' },
  gamingAudio: { tier: 'A', label: 'Gaming audio' },
  competitiveGaming: { tier: 'A', label: 'Competitive gaming platforms' },
  networking: { tier: 'A', label: 'Internet and networking products' },
  localNc: { tier: 'A', label: 'Local Raleigh, Cary, Durham, and North Carolina businesses' },
  apparel: { tier: 'B', label: 'Apparel' },
  foodDelivery: { tier: 'B', label: 'Food delivery' },
  nonAlcoholicBeverages: { tier: 'B', label: 'Non-alcoholic beverages' },
  restaurants: { tier: 'B', label: 'Restaurants' },
  barbershops: { tier: 'B', label: 'Barbershops' },
  entertainmentVenues: { tier: 'B', label: 'Entertainment venues' },
  mobileAccessories: { tier: 'B', label: 'Mobile accessories' },
  smallBusinessServices: { tier: 'B', label: 'Small-business services' },
  hostingDeveloperTools: { tier: 'B', label: 'Web-hosting and developer tools' },
  financialServices: { tier: 'C', label: 'Financial services' },
  sweepstakes: { tier: 'C', label: 'Sweepstakes brands' },
  fantasySports: { tier: 'C', label: 'Fantasy sports' },
  casinosBetting: { tier: 'C', label: 'Casinos and betting companies' },
  alcohol: { tier: 'C', label: 'Alcohol' },
  tobaccoNicotineCannabis: { tier: 'C', label: 'Tobacco, nicotine, hemp, or cannabis' },
  crypto: { tier: 'C', label: 'Crypto products' },
  minors: { tier: 'C', label: 'Products marketed primarily to minors' },
});

export const STARTER_SPONSORSHIP_PACKAGES = Object.freeze([
  {
    id: 'community-supporter',
    name: 'Community Supporter',
    price: 250,
    currency: 'USD',
    billingType: 'one-time',
    inventoryLimit: null,
    public: true,
    active: true,
    sortOrder: 10,
    benefits: [
      'Logo on sponsor page',
      'Discord acknowledgment',
      'One social thank-you',
      'Tournament-results acknowledgment',
    ],
  },
  {
    id: 'tournament-sponsor',
    name: 'Tournament Sponsor',
    price: 500,
    currency: 'USD',
    billingType: 'one-time',
    inventoryLimit: null,
    public: true,
    active: true,
    sortOrder: 20,
    benefits: [
      'Named weekly tournament',
      'Logo on tournament promotional material',
      'Stream mentions',
      'Discord announcement',
      'Sponsor-page placement',
    ],
  },
  {
    id: 'featured-partner',
    name: 'Featured Partner',
    price: 1000,
    currency: 'USD',
    billingType: 'one-time',
    inventoryLimit: null,
    public: true,
    active: true,
    sortOrder: 30,
    benefits: [
      'Multiple sponsored events',
      'Featured website placement',
      'Branded tournament graphic',
      'Stream acknowledgment',
      'Social content',
      'Results recap inclusion',
    ],
  },
  {
    id: 'presenting-sponsor',
    name: 'Presenting Sponsor',
    price: 2500,
    currency: 'USD',
    billingType: 'custom',
    inventoryLimit: null,
    public: true,
    active: true,
    sortOrder: 40,
    benefits: [
      'Naming rights for a season or major event',
      'Premium website placement',
      'Custom campaign',
      'Multiple stream integrations',
      'Co-branded promotional assets',
      'Performance recap',
    ],
  },
  {
    id: 'in-kind-sponsor',
    name: 'In-Kind Sponsor',
    price: null,
    currency: 'USD',
    billingType: 'in-kind',
    inventoryLimit: null,
    public: true,
    active: true,
    sortOrder: 50,
    benefits: [
      'Equipment',
      'Gift cards',
      'Food',
      'Venue space',
      'Streaming products',
      'Tournament prizes',
      'Marketing support',
    ],
  },
]);

export function isAllowedProspectStatus(status) {
  return PROSPECT_STATUSES.includes(status);
}

export function isAllowedOutreachStatus(status) {
  return OUTREACH_STATUSES.includes(status);
}

export function isTierCCategory(categoryKey) {
  return SPONSOR_CATEGORIES[categoryKey]?.tier === SPONSOR_TIERS.C;
}

export function normalizeCompanyName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(llc|inc|incorporated|co|company|corp|corporation|ltd|limited)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDomain(value) {
  const raw = String(value || '').trim().toLowerCase();

  if (!raw) return '';

  try {
    const url = raw.startsWith('http://') || raw.startsWith('https://')
      ? new URL(raw)
      : new URL(`https://${raw}`);

    return url.hostname.replace(/^www\./, '');
  } catch {
    return raw
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .trim();
  }
}

export function prospectDeduplicationKey(prospect) {
  const domain = normalizeDomain(prospect?.domain || prospect?.website);

  if (domain) return `domain:${domain}`;

  return `company:${normalizeCompanyName(prospect?.companyName)}`;
}

export function createEmptySponsorProspect(overrides = {}) {
  const companyName = String(overrides.companyName || '').trim();
  const normalizedCompanyName = normalizeCompanyName(overrides.normalizedCompanyName || companyName);
  const domain = normalizeDomain(overrides.domain || overrides.website);
  const now = overrides.createdAt || new Date().toISOString();

  return {
    id: overrides.id || '',
    companyName,
    normalizedCompanyName,
    website: overrides.website || '',
    domain,
    companyDescription: overrides.companyDescription || '',
    industry: overrides.industry || '',
    headquarters: overrides.headquarters || '',
    companySizeEstimate: overrides.companySizeEstimate || '',
    audienceSummary: overrides.audienceSummary || 'Not yet provided',
    partnershipPageUrl: overrides.partnershipPageUrl || '',
    contactPageUrl: overrides.contactPageUrl || '',
    publicContactName: overrides.publicContactName || '',
    publicContactRole: overrides.publicContactRole || '',
    publicContactEmail: overrides.publicContactEmail || '',
    publicContactFormUrl: overrides.publicContactFormUrl || '',
    publicContactSourceUrl: overrides.publicContactSourceUrl || '',
    sourceType: overrides.sourceType || 'manual',
    sourceUrls: Array.isArray(overrides.sourceUrls) ? overrides.sourceUrls : [],
    researchedAt: overrides.researchedAt || '',
    researchConfidence: overrides.researchConfidence || 'low',
    dataQualityStatus: overrides.dataQualityStatus || 'NEEDS_REVIEW',
    fitScore: Number.isFinite(overrides.fitScore) ? overrides.fitScore : 0,
    fitExplanation: overrides.fitExplanation || 'Not yet scored.',
    estimatedDealSize: overrides.estimatedDealSize || '',
    priority: overrides.priority || 'normal',
    brandSafetyStatus: overrides.brandSafetyStatus || 'NEEDS_REVIEW',
    legalRiskStatus: overrides.legalRiskStatus || 'NEEDS_REVIEW',
    ageRestricted: Boolean(overrides.ageRestricted),
    gamblingRelated: Boolean(overrides.gamblingRelated),
    duplicateOfId: overrides.duplicateOfId || '',
    ownerUserId: overrides.ownerUserId || '',
    status: isAllowedProspectStatus(overrides.status) ? overrides.status : 'NEW',
    nextAction: overrides.nextAction || '',
    nextActionAt: overrides.nextActionAt || '',
    createdAt: now,
    updatedAt: overrides.updatedAt || now,
  };
}

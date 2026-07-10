import {
  createEmptySponsorProspect,
  isTierCCategory,
  normalizeCompanyName,
  normalizeDomain,
  prospectDeduplicationKey,
} from './schema.js';
import { inferSponsorCategory, markDuplicateProspects, sponsorCategoryLabel } from './crm.js';

export const RESEARCH_FACT_TYPES = Object.freeze([
  'company-description',
  'product-fit',
  'geography',
  'sponsorship-history',
  'contact-method',
  'partnership-instructions',
  'risk-signal',
]);

export const FIT_SCORE_WEIGHTS = Object.freeze({
  audienceAlignment: 20,
  gamingCardRelevance: 15,
  sponsorshipHistory: 15,
  companySizeBudgetLikelihood: 10,
  geographicRelevance: 10,
  productIntegrationPotential: 10,
  communityValueAlignment: 10,
  contactability: 5,
  campaignRelevance: 5,
});

const APPROVED_MOCK_COMPANIES = Object.freeze([
  {
    companyName: 'Example Playing Cards',
    website: 'https://exampleplayingcards.test',
    industry: 'Playing cards',
    headquarters: 'Raleigh, NC',
    companyDescription: 'Makes premium playing cards and card-game accessories for competitive players.',
    contactPageUrl: 'https://exampleplayingcards.test/contact',
    partnershipPageUrl: 'https://exampleplayingcards.test/partners',
    publicContactFormUrl: 'https://exampleplayingcards.test/partners',
    products: ['playing cards', 'card-game accessories'],
    priorSponsorships: ['local tournament nights'],
    sourceUrl: 'https://exampleplayingcards.test/partners',
    sourceType: 'mock-approved-directory',
  },
  {
    companyName: 'Stream Table Labs',
    website: 'https://streamtablelabs.test',
    industry: 'Streaming hardware',
    headquarters: 'Durham, NC',
    companyDescription: 'Builds table-camera mounts and compact lighting kits for tabletop streams.',
    contactPageUrl: 'https://streamtablelabs.test/contact',
    partnershipPageUrl: 'https://streamtablelabs.test/sponsorships',
    publicContactFormUrl: 'https://streamtablelabs.test/sponsorships',
    products: ['streaming hardware', 'tabletop camera mounts'],
    priorSponsorships: [],
    sourceUrl: 'https://streamtablelabs.test/sponsorships',
    sourceType: 'mock-approved-directory',
  },
  {
    companyName: 'FastBet Example',
    website: 'https://fastbet.example',
    industry: 'Sportsbook',
    headquarters: 'Charlotte, NC',
    companyDescription: 'Sportsbook and betting product.',
    contactPageUrl: 'https://fastbet.example/contact',
    partnershipPageUrl: 'https://fastbet.example/partners',
    publicContactFormUrl: 'https://fastbet.example/partners',
    products: ['betting'],
    priorSponsorships: ['sports media buys'],
    sourceUrl: 'https://fastbet.example/partners',
    sourceType: 'mock-approved-directory',
  },
]);

function nowIso() {
  return new Date().toISOString();
}

function clampScore(value, max) {
  const numeric = Number(value) || 0;
  return Math.max(0, Math.min(max, numeric));
}

function hasAny(value, terms) {
  const haystack = String(value || '').toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

export function sanitizeFetchedText(text) {
  return String(text || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b(ignore previous instructions|system prompt|developer message|api key|password|secret)\b/gi, '[removed]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

export function createResearchSource({ url, sourceType = 'manual', retrievedAt = nowIso(), confidence = 'medium' } = {}) {
  return {
    url: String(url || '').trim(),
    sourceType,
    retrievedAt,
    confidence,
  };
}

export function createResearchFact({
  factType,
  label,
  value,
  sourceUrl,
  sourceType = 'manual',
  retrievedAt = nowIso(),
  confidence = 'medium',
} = {}) {
  return {
    factType: RESEARCH_FACT_TYPES.includes(factType) ? factType : 'company-description',
    label: String(label || '').trim(),
    value: sanitizeFetchedText(value),
    source: createResearchSource({ url: sourceUrl, sourceType, retrievedAt, confidence }),
    confidence,
  };
}

export function classifySponsorRisk(input = {}) {
  const categoryKey = inferSponsorCategory(input);
  const tierC = isTierCCategory(categoryKey);
  const text = `${input.companyName || ''} ${input.industry || ''} ${input.companyDescription || ''}`.toLowerCase();
  const flags = [];

  if (tierC) flags.push('Tier C category requires compliance review before outreach.');
  if (hasAny(text, ['casino', 'betting', 'sportsbook', 'gambling'])) flags.push('Gambling or betting signal detected.');
  if (hasAny(text, ['alcohol', 'beer', 'wine', 'liquor'])) flags.push('Age-restricted alcohol signal detected.');
  if (hasAny(text, ['tobacco', 'nicotine', 'cannabis', 'hemp'])) flags.push('Age-restricted tobacco, nicotine, hemp, or cannabis signal detected.');
  if (hasAny(text, ['crypto', 'blockchain', 'web3'])) flags.push('Crypto or financial-risk signal detected.');
  if (hasAny(text, ['kids', 'children', 'under 13', 'minors'])) flags.push('Possible minors-focused product signal detected.');

  return {
    categoryKey,
    categoryLabel: sponsorCategoryLabel(categoryKey),
    tier: tierC ? 'C' : 'A/B',
    brandSafetyStatus: flags.length ? 'NEEDS_REVIEW' : 'CLEAR',
    legalRiskStatus: flags.length ? 'NEEDS_REVIEW' : 'CLEAR',
    ageRestricted: flags.some((flag) => /Age-restricted|minors/i.test(flag)),
    gamblingRelated: flags.some((flag) => /Gambling|betting/i.test(flag)),
    flags,
  };
}

export function scoreSponsorFit(input = {}) {
  const text = `${input.companyName || ''} ${input.industry || ''} ${input.companyDescription || ''} ${(input.products || []).join(' ')}`.toLowerCase();
  const risk = classifySponsorRisk(input);
  const hasContact = Boolean(input.publicContactEmail || input.publicContactFormUrl || input.contactPageUrl);
  const hasSource = Boolean(input.sourceUrl || input.partnershipPageUrl || input.contactPageUrl || input.website);
  const hasPriorSponsorships = Array.isArray(input.priorSponsorships) && input.priorSponsorships.length > 0;

  const dimensions = {
    audienceAlignment: clampScore(hasAny(text, ['card', 'gaming', 'competitive', 'stream']) ? 18 : 8, FIT_SCORE_WEIGHTS.audienceAlignment),
    gamingCardRelevance: clampScore(hasAny(text, ['spades', 'card', 'tabletop', 'gaming']) ? 14 : 4, FIT_SCORE_WEIGHTS.gamingCardRelevance),
    sponsorshipHistory: clampScore(hasPriorSponsorships ? 12 : 4, FIT_SCORE_WEIGHTS.sponsorshipHistory),
    companySizeBudgetLikelihood: clampScore(hasAny(text, ['premium', 'hardware', 'platform', 'software']) ? 8 : 5, FIT_SCORE_WEIGHTS.companySizeBudgetLikelihood),
    geographicRelevance: clampScore(hasAny(`${input.headquarters || ''} ${text}`, ['raleigh', 'cary', 'durham', 'north carolina', ' nc']) ? 10 : 3, FIT_SCORE_WEIGHTS.geographicRelevance),
    productIntegrationPotential: clampScore(hasAny(text, ['card', 'stream', 'hardware', 'audio', 'accessor']) ? 9 : 4, FIT_SCORE_WEIGHTS.productIntegrationPotential),
    communityValueAlignment: clampScore(hasAny(text, ['community', 'competitive', 'local', 'players']) ? 8 : 5, FIT_SCORE_WEIGHTS.communityValueAlignment),
    contactability: clampScore(hasContact ? 5 : 0, FIT_SCORE_WEIGHTS.contactability),
    campaignRelevance: clampScore(hasSource ? 4 : 1, FIT_SCORE_WEIGHTS.campaignRelevance),
  };

  const penalties = [];
  let penaltyTotal = 0;

  if (!hasContact) {
    penalties.push({ label: 'No legitimate public contact route found.', value: 12 });
    penaltyTotal += 12;
  }
  if (!hasSource) {
    penalties.push({ label: 'Missing source URL for material claims.', value: 10 });
    penaltyTotal += 10;
  }
  if (risk.flags.length) {
    penalties.push({ label: 'Compliance or brand-safety review required.', value: 25 });
    penaltyTotal += 25;
  }
  if (input.duplicateOfId) {
    penalties.push({ label: 'Duplicate company record.', value: 20 });
    penaltyTotal += 20;
  }

  const rawScore = Object.values(dimensions).reduce((sum, value) => sum + value, 0);
  const score = Math.max(0, Math.min(100, rawScore - penaltyTotal));

  return {
    score,
    dimensions,
    penalties,
    explanation: [
      `Score ${score}/100 based on deterministic sponsor-fit criteria.`,
      `Category: ${risk.categoryLabel}.`,
      penalties.length ? `Penalties: ${penalties.map((penalty) => penalty.label).join(' ')}` : 'No major penalties detected.',
    ].join(' '),
    risk,
  };
}

export function createResearchCandidate(input = {}, existingProspects = []) {
  const sourceUrl = input.sourceUrl || input.partnershipPageUrl || input.contactPageUrl || input.website || '';
  const sourceType = input.sourceType || 'manual';
  const retrievedAt = input.retrievedAt || nowIso();
  const sourceUrls = [sourceUrl, input.contactPageUrl, input.partnershipPageUrl]
    .filter(Boolean)
    .filter((url, index, urls) => urls.indexOf(url) === index)
    .map((url) => createResearchSource({ url, sourceType, retrievedAt, confidence: 'medium' }));
  const scoring = scoreSponsorFit({ ...input, sourceUrl });

  const prospect = createEmptySponsorProspect({
    companyName: input.companyName,
    website: input.website,
    companyDescription: input.companyDescription,
    industry: input.industry,
    headquarters: input.headquarters,
    partnershipPageUrl: input.partnershipPageUrl,
    contactPageUrl: input.contactPageUrl,
    publicContactName: input.publicContactName,
    publicContactRole: input.publicContactRole,
    publicContactEmail: input.publicContactEmail,
    publicContactFormUrl: input.publicContactFormUrl,
    publicContactSourceUrl: sourceUrl,
    sourceType,
    sourceUrls,
    researchedAt: retrievedAt,
    researchConfidence: sourceUrls.length ? 'medium' : 'low',
    dataQualityStatus: sourceUrls.length ? 'NEEDS_REVIEW' : 'MISSING_SOURCES',
    fitScore: scoring.score,
    fitExplanation: scoring.explanation,
    brandSafetyStatus: scoring.risk.brandSafetyStatus,
    legalRiskStatus: scoring.risk.legalRiskStatus,
    ageRestricted: scoring.risk.ageRestricted,
    gamblingRelated: scoring.risk.gamblingRelated,
    status: scoring.risk.flags.length ? 'RESEARCHED' : scoring.score >= 65 ? 'QUALIFIED' : 'RESEARCHED',
  });

  const [dedupedProspect] = markDuplicateProspects([prospect], existingProspects);

  return {
    id: `candidate-${prospectDeduplicationKey(dedupedProspect)}`,
    status: dedupedProspect.duplicateOfId ? 'DUPLICATE_REVIEW' : scoring.score >= 65 && !scoring.risk.flags.length ? 'READY_FOR_REVIEW' : 'NEEDS_REVIEW',
    prospect: {
      ...dedupedProspect,
      fitScore: dedupedProspect.duplicateOfId ? Math.max(0, scoring.score - 20) : scoring.score,
    },
    facts: [
      createResearchFact({
        factType: 'company-description',
        label: 'Company description',
        value: input.companyDescription || 'Not yet provided',
        sourceUrl,
        sourceType,
        retrievedAt,
        confidence: sourceUrl ? 'medium' : 'low',
      }),
      createResearchFact({
        factType: 'contact-method',
        label: 'Public contact route',
        value: input.publicContactEmail || input.publicContactFormUrl || input.contactPageUrl || 'Not yet provided',
        sourceUrl: input.contactPageUrl || sourceUrl,
        sourceType,
        retrievedAt,
        confidence: input.publicContactEmail || input.publicContactFormUrl || input.contactPageUrl ? 'medium' : 'low',
      }),
    ],
    scoreBreakdown: scoring,
    sourceUrls,
    retrievalStartedAt: retrievedAt,
    retrievalCompletedAt: nowIso(),
  };
}

export function createMockResearchProvider(seedCompanies = APPROVED_MOCK_COMPANIES) {
  return {
    id: 'mock-approved-sponsor-directory',
    displayName: 'Mock approved sponsor directory',
    async search({ query = '', limit = 5 } = {}) {
      const normalizedQuery = normalizeCompanyName(query);
      const matches = seedCompanies.filter((company) => {
        if (!normalizedQuery) return true;
        return normalizeCompanyName(`${company.companyName} ${company.industry} ${company.headquarters}`).includes(normalizedQuery);
      });

      return matches.slice(0, limit).map((company) => ({
        ...company,
        domain: normalizeDomain(company.website),
      }));
    },
  };
}

export async function runResearchPreparation({
  query = '',
  provider = createMockResearchProvider(),
  existingProspects = [],
  limit = 5,
} = {}) {
  const startedAt = nowIso();
  const candidates = await provider.search({ query, limit });
  const researchCandidates = candidates.map((candidate) => createResearchCandidate(candidate, existingProspects));

  return {
    id: `research-run-${startedAt}`,
    runType: 'daily-research-preparation',
    status: 'COMPLETED',
    startedAt,
    completedAt: nowIso(),
    queriesUsed: [query || 'approved-category-defaults'],
    candidatesFound: researchCandidates.length,
    candidatesAccepted: 0,
    candidatesRejected: 0,
    errorSummary: '',
    providerId: provider.id || 'unknown-provider',
    candidates: researchCandidates,
  };
}

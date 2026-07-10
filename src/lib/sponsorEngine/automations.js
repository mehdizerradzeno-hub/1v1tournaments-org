import { prepareFollowUpDraft } from './outreach.js';
import { runResearchPreparation } from './research.js';

const STALE_RESEARCH_DAYS = 60;

function daysBetween(a, b) {
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;

  return Math.floor((end - start) / 86400000);
}

export async function prepareDailySponsorResearch({
  query = 'playing cards streaming hardware local nc',
  existingProspects = [],
  provider,
  limit = 5,
} = {}) {
  const run = await runResearchPreparation({ query, existingProspects, provider, limit });

  return {
    ...run,
    automationPolicy: 'Preparation only. Do not contact companies automatically.',
  };
}

export function prepareDailySponsorFollowUps({
  prospects = [],
  drafts = [],
  interactions = [],
  now = new Date().toISOString(),
} = {}) {
  const tasks = [];
  const skipped = [];

  prospects.forEach((prospect) => {
    const latestDraft = drafts
      .filter((draft) => draft.prospectId === prospect.id)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];

    if (!latestDraft) {
      skipped.push({ prospectId: prospect.id, reason: 'No prior outreach draft.' });
      return;
    }

    const result = prepareFollowUpDraft({
      prospect,
      parentDraft: latestDraft,
      interactions: interactions.filter((interaction) => interaction.prospectId === prospect.id),
      now,
    });

    if (result.draft) {
      tasks.push({
        prospectId: prospect.id,
        draft: result.draft,
        dueAt: now,
        policy: 'Draft only. Requires approval before any send action.',
      });
    } else {
      skipped.push({ prospectId: prospect.id, reason: result.reason });
    }
  });

  return { tasks, skipped };
}

export function createWeeklySponsorPipelineReview({
  prospects = [],
  drafts = [],
  deals = [],
  interactions = [],
  now = new Date().toISOString(),
} = {}) {
  const sentDrafts = drafts.filter((draft) => draft.status === 'SENT');
  const replies = interactions.filter((interaction) => interaction.direction === 'INBOUND');
  const meetings = interactions.filter((interaction) => interaction.interactionType === 'MEETING');
  const wonDeals = deals.filter((deal) => deal.stage === 'WON');
  const lostDeals = deals.filter((deal) => deal.stage === 'LOST');
  const overdueActions = prospects.filter((prospect) => (
    prospect.nextActionAt && new Date(prospect.nextActionAt).getTime() < new Date(now).getTime()
  ));

  return {
    generatedAt: now,
    newProspects: prospects.filter((prospect) => prospect.status === 'NEW').length,
    draftsPrepared: drafts.length,
    messagesSent: sentDrafts.length,
    replies: replies.length,
    meetings: meetings.length,
    proposals: deals.filter((deal) => ['PROPOSAL_DRAFT', 'PROPOSAL_SENT', 'NEGOTIATION'].includes(deal.stage)).length,
    wonDeals: wonDeals.length,
    lostDeals: lostDeals.length,
    overdueActions: overdueActions.length,
    dataQualityProblems: prospects.filter((prospect) => (
      prospect.dataQualityStatus !== 'VERIFIED'
      || prospect.duplicateOfId
      || prospect.legalRiskStatus === 'NEEDS_REVIEW'
      || prospect.brandSafetyStatus === 'NEEDS_REVIEW'
    )).length,
    recommendedNextPriorities: [
      overdueActions.length ? 'Review overdue next actions.' : '',
      prospects.some((prospect) => prospect.dataQualityStatus === 'MISSING_SOURCES') ? 'Add missing source URLs before outreach.' : '',
      drafts.some((draft) => draft.status === 'NEEDS_REVIEW') ? 'Review prepared outreach drafts.' : '',
    ].filter(Boolean),
  };
}

export function createMonthlySponsorDataHygieneReport({
  prospects = [],
  interactions = [],
  now = new Date().toISOString(),
} = {}) {
  const domains = new Map();

  prospects.forEach((prospect) => {
    if (!prospect.domain) return;
    const existing = domains.get(prospect.domain) || [];
    existing.push(prospect.id || prospect.companyName);
    domains.set(prospect.domain, existing);
  });

  return {
    generatedAt: now,
    staleResearch: prospects.filter((prospect) => (
      prospect.researchedAt && daysBetween(prospect.researchedAt, now) > STALE_RESEARCH_DAYS
    )).map((prospect) => prospect.id || prospect.companyName),
    missingSourceUrls: prospects.filter((prospect) => !prospect.sourceUrls?.length).map((prospect) => prospect.id || prospect.companyName),
    duplicateDomains: [...domains.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([domain, ids]) => ({ domain, ids })),
    bouncedContacts: interactions
      .filter((interaction) => interaction.interactionType === 'BOUNCE')
      .map((interaction) => interaction.prospectId),
    noActivity: prospects
      .filter((prospect) => !interactions.some((interaction) => interaction.prospectId === prospect.id))
      .map((prospect) => prospect.id || prospect.companyName),
    deletionPolicy: 'Never delete records automatically.',
  };
}

export function sponsorSecurityChecklist() {
  return [
    'Admin routes require host-approved sign-in.',
    'Outbound communication defaults to draft-only mode.',
    'Sending requires provider credentials, admin setting, approval metadata, and explicit send action.',
    'Researched webpage text is sanitized and treated as untrusted data.',
    'Unsupported claims and missing source URLs block draft approval.',
    'Public pages omit unverified metrics and private CRM data.',
    'Audit events redact secrets recursively.',
    'Tier C sponsor categories are flagged for compliance review.',
  ];
}

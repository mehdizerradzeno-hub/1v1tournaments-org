import { createAuditEvent } from './audit.js';
import { isSponsorSendingAllowed } from './permissions.js';

export const OUTREACH_TEMPLATE_TYPES = Object.freeze([
  'initial-introduction',
  'local-business-sponsorship',
  'tournament-sponsorship',
  'product-partnership',
  'in-kind-sponsorship',
  'follow-up-1',
  'follow-up-2',
  'final-closeout',
  'reply-interested',
  'meeting-confirmation',
  'proposal-delivery',
  'post-meeting-recap',
  'thank-you',
]);

const STOP_FOLLOW_UP_STATUSES = new Set(['REPLIED', 'WON', 'LOST', 'PAUSED', 'DO_NOT_CONTACT']);
const APP_STORE_FACT = '1v1 Competitive Spades is live on the Apple App Store.';

function isoNow() {
  return new Date().toISOString();
}

function compactLines(lines) {
  return lines.filter(Boolean).join('\n\n');
}

function publicContact(prospect) {
  return prospect.publicContactEmail || prospect.publicContactFormUrl || prospect.contactPageUrl || '';
}

function sourceUrlsForProspect(prospect) {
  return [
    ...(Array.isArray(prospect.sourceUrls) ? prospect.sourceUrls.map((source) => source.url || source) : []),
    prospect.publicContactSourceUrl,
    prospect.contactPageUrl,
    prospect.partnershipPageUrl,
    prospect.website,
  ].filter(Boolean).filter((url, index, urls) => urls.indexOf(url) === index);
}

function verifiedFactsForProspect(prospect) {
  const sources = sourceUrlsForProspect(prospect);

  return [
    prospect.companyDescription ? {
      label: 'Company description',
      value: prospect.companyDescription,
      sourceUrl: sources[0] || '',
    } : null,
    prospect.industry ? {
      label: 'Industry',
      value: prospect.industry,
      sourceUrl: sources[0] || '',
    } : null,
    prospect.headquarters ? {
      label: 'Headquarters',
      value: prospect.headquarters,
      sourceUrl: sources[0] || '',
    } : null,
  ].filter(Boolean);
}

function templateSubject(prospect, templateType) {
  if (templateType === 'local-business-sponsorship') return `Local sponsorship idea for ${prospect.companyName}`;
  if (templateType === 'tournament-sponsorship') return `Tournament sponsorship idea for ${prospect.companyName}`;
  if (templateType === 'product-partnership') return `Product partnership idea for ${prospect.companyName}`;
  if (templateType === 'in-kind-sponsorship') return `In-kind sponsorship idea for ${prospect.companyName}`;
  if (templateType === 'follow-up-1') return `Following up on 1v1 Competitive Spades`;
  if (templateType === 'follow-up-2') return `One more follow-up on 1v1 Competitive Spades`;
  if (templateType === 'final-closeout') return `Closing the loop`;
  return `Sponsorship idea for ${prospect.companyName}`;
}

function templateBody(prospect, templateType, personalizationFacts) {
  const contactName = prospect.publicContactName || 'there';
  const firstFact = personalizationFacts[0]?.value;
  const categoryLine = firstFact
    ? `I noticed ${prospect.companyName} focuses on ${firstFact}.`
    : `I found ${prospect.companyName} through public business information.`;
  const localLine = prospect.headquarters
    ? `Your ${prospect.headquarters} presence also makes this feel relevant for our tournament community.`
    : '';
  const offerLine = templateType === 'in-kind-sponsorship'
    ? 'I wanted to ask whether an in-kind prize, equipment, or community support partnership would be worth discussing.'
    : 'I wanted to ask whether a tournament sponsorship or community partnership would be worth discussing.';

  if (templateType === 'follow-up-1' || templateType === 'follow-up-2' || templateType === 'final-closeout') {
    return compactLines([
      `Hi ${contactName},`,
      `I wanted to follow up on my note about 1v1 Competitive Spades and ${prospect.companyName}.`,
      templateType === 'final-closeout'
        ? 'If sponsorship is not a fit right now, no problem. I appreciate you taking a look.'
        : 'If this is relevant, I would be glad to send a short sponsorship overview.',
      'Thanks,\n1V1 SPADES LLC',
      'If this is not relevant, reply with “no thanks” and I will not follow up again.',
    ]);
  }

  return compactLines([
    `Hi ${contactName},`,
    categoryLine,
    localLine,
    `${APP_STORE_FACT} We are creating a focused head-to-head competitive spades category: no partner, no excuses.`,
    offerLine,
    'Would you be open to a quick look at a one-page sponsorship overview?',
    'Thanks,\n1V1 SPADES LLC',
    'If this is not relevant, reply with “no thanks” and I will not follow up again.',
  ]);
}

export function createOutreachDraft({
  prospect = {},
  templateType = 'initial-introduction',
  createdAt = isoNow(),
  followUpNumber = 0,
  parentDraftId = '',
} = {}) {
  const personalizationFacts = verifiedFactsForProspect(prospect);
  const sourceUrls = sourceUrlsForProspect(prospect);
  const subject = templateSubject(prospect, templateType);
  const body = templateBody(prospect, templateType, personalizationFacts);
  const factualClaims = [
    ...personalizationFacts.map((fact) => ({
      claim: `${fact.label}: ${fact.value}`,
      sourceUrl: fact.sourceUrl,
      supported: Boolean(fact.sourceUrl),
    })),
    {
      claim: APP_STORE_FACT,
      sourceUrl: 'App Store availability confirmed by product owner.',
      supported: true,
    },
  ];

  const draft = {
    id: `draft-${prospect.id || prospect.companyName || 'prospect'}-${templateType}-${createdAt}`,
    prospectId: prospect.id || '',
    templateId: templateType,
    recipient: publicContact(prospect),
    recipientSourceUrl: prospect.publicContactSourceUrl || prospect.contactPageUrl || prospect.partnershipPageUrl || '',
    subject,
    body,
    personalizationFacts,
    factualClaims,
    sourceUrls,
    qualityScore: 0,
    validation: null,
    status: 'DRAFT',
    approvedBy: '',
    approvedAt: '',
    sentAt: '',
    explicitSendRequested: false,
    followUpNumber,
    parentDraftId,
    createdAt,
    updatedAt: createdAt,
  };

  const validation = validateOutreachDraft(draft, prospect);

  return {
    ...draft,
    qualityScore: validation.overallQualityScore,
    validation,
    status: validation.eligibleForApproval ? 'NEEDS_REVIEW' : 'DRAFT',
  };
}

export function validateOutreachDraft(draft = {}, prospect = {}) {
  const warnings = [];
  const body = `${draft.subject || ''} ${draft.body || ''}`.toLowerCase();
  const hasOptOut = /no thanks|not relevant|will not follow up/i.test(draft.body || '');
  const hasRecipientProvenance = Boolean(draft.recipientSourceUrl || prospect.publicContactSourceUrl || prospect.contactPageUrl);
  const unsupportedClaims = (draft.factualClaims || []).filter((claim) => !claim.supported || !claim.sourceUrl);

  if (!draft.recipient) warnings.push('Missing public recipient route.');
  if (!hasRecipientProvenance) warnings.push('Missing public source for recipient route.');
  if (unsupportedClaims.length) warnings.push('Unsupported factual claims detected.');
  if (!hasOptOut) warnings.push('Missing opt-out sentence.');
  if (prospect.legalRiskStatus === 'NEEDS_REVIEW' || prospect.brandSafetyStatus === 'NEEDS_REVIEW') {
    warnings.push('Prospect requires compliance review before approval.');
  }
  if (prospect.status === 'DO_NOT_CONTACT') warnings.push('Prospect is marked DO_NOT_CONTACT.');
  if (/guaranteed roi|guaranteed impressions|we loved reconnecting|as discussed/.test(body)) {
    warnings.push('Draft contains risky familiarity or guaranteed-results language.');
  }
  if (!draft.personalizationFacts?.length) warnings.push('Draft has weak personalization.');

  const personalizationScore = Math.max(0, Math.min(100, (draft.personalizationFacts?.length || 0) * 34));
  const factualConfidenceScore = Math.max(0, 100 - unsupportedClaims.length * 35 - (draft.sourceUrls?.length ? 0 : 35));
  const spamRiskScore = Math.max(0, 100 - (body.match(/free|urgent|act now|limited time/g) || []).length * 20);
  const brandSafetyScore = prospect.legalRiskStatus === 'NEEDS_REVIEW' || prospect.brandSafetyStatus === 'NEEDS_REVIEW' ? 35 : 90;
  const overallQualityScore = Math.round((personalizationScore + factualConfidenceScore + spamRiskScore + brandSafetyScore) / 4);

  return {
    warnings,
    unsupportedClaims,
    personalizationScore,
    factualConfidenceScore,
    spamRiskScore,
    brandSafetyScore,
    overallQualityScore,
    eligibleForApproval: warnings.length === 0 && overallQualityScore >= 70,
  };
}

export function approveOutreachDraft(draft, { approvedBy = 'local-admin', approvedAt = isoNow() } = {}) {
  if (draft.status !== 'NEEDS_REVIEW') {
    return {
      draft,
      auditEvent: null,
      errors: ['Only NEEDS_REVIEW drafts can be approved.'],
    };
  }

  const approvedDraft = {
    ...draft,
    status: 'APPROVED',
    approvedBy,
    approvedAt,
    updatedAt: approvedAt,
  };

  return {
    draft: approvedDraft,
    auditEvent: createAuditEvent({
      actorId: approvedBy,
      action: 'sponsor.outreach.approved',
      entityType: 'OutreachDraft',
      entityId: draft.id,
      beforeData: { status: draft.status },
      afterData: { status: approvedDraft.status },
      createdAt: approvedAt,
    }),
    errors: [],
  };
}

export function createMockEmailProvider() {
  return {
    id: 'mock-email-provider',
    configured: false,
    async send({ draft }) {
      return {
        provider: 'mock',
        sent: false,
        externalMessageId: '',
        message: `Mock provider did not send draft ${draft?.id || 'unknown'}.`,
      };
    },
  };
}

export async function sendApprovedDraft({
  roles = [],
  settings = {},
  draft = {},
  prospect = {},
  provider = createMockEmailProvider(),
} = {}) {
  const gate = isSponsorSendingAllowed({
    roles,
    settings: {
      ...settings,
      providerConfigured: Boolean(settings.providerConfigured && provider.configured),
    },
    draft,
    prospect,
  });

  if (!gate.allowed) {
    return {
      sent: false,
      blockers: gate.blockers,
      providerResult: null,
    };
  }

  const providerResult = await provider.send({ draft, prospect });

  return {
    sent: Boolean(providerResult.sent),
    blockers: [],
    providerResult,
  };
}

export function shouldStopFollowUps(prospect = {}, interactions = []) {
  if (STOP_FOLLOW_UP_STATUSES.has(prospect.status)) return true;
  if (prospect.optedOut || prospect.bounced) return true;

  return interactions.some((interaction) => (
    interaction.direction === 'INBOUND'
    || interaction.interactionType === 'OPT_OUT'
    || interaction.interactionType === 'BOUNCE'
  ));
}

export function prepareFollowUpDraft({
  prospect = {},
  parentDraft = {},
  interactions = [],
  now = isoNow(),
} = {}) {
  if (shouldStopFollowUps(prospect, interactions)) {
    return { draft: null, reason: 'Follow-up stopped by prospect status, reply, opt-out, or bounce.' };
  }

  const nextNumber = Math.min(2, (parentDraft.followUpNumber || 0) + 1);

  if (nextNumber > 2 || parentDraft.followUpNumber >= 2) {
    return { draft: null, reason: 'Maximum unanswered follow-ups reached.' };
  }

  return {
    draft: createOutreachDraft({
      prospect,
      templateType: nextNumber === 1 ? 'follow-up-1' : 'follow-up-2',
      createdAt: now,
      followUpNumber: nextNumber,
      parentDraftId: parentDraft.id || '',
    }),
    reason: '',
  };
}

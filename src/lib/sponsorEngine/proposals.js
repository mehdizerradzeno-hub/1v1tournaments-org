import { STARTER_SPONSORSHIP_PACKAGES } from './schema.js';

export const DEAL_STAGES = Object.freeze([
  'DISCOVERY',
  'PROPOSAL_DRAFT',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
  'PAUSED',
]);

function money(value, currency = 'USD') {
  if (!Number.isFinite(value)) return 'Custom';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function clean(value, fallback = 'Not yet provided') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

export function getSponsorshipPackage(packageId) {
  return STARTER_SPONSORSHIP_PACKAGES.find((item) => item.id === packageId) || STARTER_SPONSORSHIP_PACKAGES[0];
}

export function createSponsorshipDeal(input = {}) {
  const now = input.createdAt || new Date().toISOString();

  return {
    id: input.id || `deal-${input.prospectId || 'prospect'}-${now}`,
    prospectId: input.prospectId || '',
    packageId: input.packageId || 'community-supporter',
    customValue: Number.isFinite(input.customValue) ? input.customValue : null,
    stage: DEAL_STAGES.includes(input.stage) ? input.stage : 'DISCOVERY',
    probability: Number.isFinite(input.probability) ? Math.max(0, Math.min(100, input.probability)) : 10,
    proposedAt: input.proposedAt || '',
    expectedCloseAt: input.expectedCloseAt || '',
    closedAt: input.closedAt || '',
    startDate: input.startDate || '',
    endDate: input.endDate || '',
    deliverables: Array.isArray(input.deliverables) ? input.deliverables : [],
    notes: input.notes || '',
    agreementUrl: input.agreementUrl || '',
    invoiceStatus: input.invoiceStatus || 'NOT_STARTED',
    paymentStatus: input.paymentStatus || 'NOT_STARTED',
    createdAt: now,
    updatedAt: input.updatedAt || now,
  };
}

export function createSponsorProposal({
  prospect = {},
  packageId = 'community-supporter',
  customPrice = null,
  campaignDates = 'Not yet provided',
  deliverables = [],
  paymentTerms = 'Payment terms to be confirmed after sponsor review.',
  optionalExclusivity = 'No exclusivity proposed.',
  reportingPlan = 'Performance recap will use verified website, tournament, and content metrics only.',
  notes = '',
  createdAt = new Date().toISOString(),
} = {}) {
  const sponsorshipPackage = getSponsorshipPackage(packageId);
  const investment = Number.isFinite(customPrice) ? customPrice : sponsorshipPackage.price;
  const finalDeliverables = deliverables.length ? deliverables : sponsorshipPackage.benefits;
  const sections = [
    {
      title: 'Campaign objective',
      body: `Introduce ${clean(prospect.companyName, 'the sponsor')} to the 1v1 Competitive Spades community through a focused, brand-safe tournament partnership.`,
    },
    {
      title: 'Why this fits',
      body: clean(prospect.fitExplanation, 'Fit explanation is not yet provided.'),
    },
    {
      title: 'Deliverables',
      body: finalDeliverables.map((item) => `- ${item}`).join('\n'),
    },
    {
      title: 'Timeline',
      body: clean(campaignDates),
    },
    {
      title: 'Investment',
      body: investment ? money(investment, sponsorshipPackage.currency) : clean(sponsorshipPackage.billingType, 'Custom or in-kind'),
    },
    {
      title: 'Measurement and reporting',
      body: reportingPlan,
    },
    {
      title: 'Terms summary',
      body: `${paymentTerms} ${optionalExclusivity}`,
    },
    {
      title: 'Acceptance next step',
      body: 'Review the proposal, request edits, and confirm whether a final agreement should be prepared.',
    },
  ];

  return {
    id: `proposal-${prospect.id || prospect.companyName || 'prospect'}-${createdAt}`,
    prospectId: prospect.id || '',
    packageId: sponsorshipPackage.id,
    packageName: sponsorshipPackage.name,
    prospectName: clean(prospect.companyName, 'Sponsor prospect'),
    investment: investment || null,
    campaignDates,
    deliverables: finalDeliverables,
    paymentTerms,
    optionalExclusivity,
    reportingPlan,
    notes,
    sections,
    status: 'DRAFT',
    reviewNotice: 'Draft proposal only. Final agreements may require legal review.',
    createdAt,
    updatedAt: createdAt,
  };
}

export function proposalToPlainText(proposal = {}) {
  const lines = [
    `${proposal.prospectName} x 1v1 Competitive Spades`,
    `Package: ${proposal.packageName}`,
    `Status: ${proposal.status}`,
    proposal.reviewNotice,
    '',
    ...(proposal.notes ? [
      'Notes',
      proposal.notes,
      '',
    ] : []),
    ...(proposal.sections || []).flatMap((section) => [
      section.title,
      section.body,
      '',
    ]),
  ];

  return `${lines.join('\n')}\n`;
}

export function proposalToPrintHtml(proposal = {}) {
  const escape = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return [
    '<article class="sponsor-proposal">',
    `<h1>${escape(proposal.prospectName)} x 1v1 Competitive Spades</h1>`,
    `<p><strong>Package:</strong> ${escape(proposal.packageName)}</p>`,
    `<p><strong>Status:</strong> ${escape(proposal.status)}</p>`,
    `<p>${escape(proposal.reviewNotice)}</p>`,
    ...(proposal.sections || []).map((section) => (
      `<section><h2>${escape(section.title)}</h2><p>${escape(section.body).replace(/\n/g, '<br />')}</p></section>`
    )),
    '</article>',
  ].join('');
}

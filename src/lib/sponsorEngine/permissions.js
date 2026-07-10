export const SPONSOR_ROLES = Object.freeze({
  viewer: 'sponsor.viewer',
  researcher: 'sponsor.researcher',
  manager: 'sponsor.manager',
  approver: 'sponsor.approver',
  sender: 'sponsor.sender',
  admin: 'sponsor.admin',
});

export const SPONSOR_ACTIONS = Object.freeze({
  readProspects: 'sponsor.prospects.read',
  createProspect: 'sponsor.prospects.create',
  updateProspect: 'sponsor.prospects.update',
  scoreProspect: 'sponsor.prospects.score',
  createDraft: 'sponsor.outreach.createDraft',
  approveDraft: 'sponsor.outreach.approveDraft',
  sendApprovedDraft: 'sponsor.outreach.sendApprovedDraft',
  managePackages: 'sponsor.packages.manage',
  exportData: 'sponsor.data.export',
  manageSettings: 'sponsor.settings.manage',
});

const ROLE_PERMISSIONS = Object.freeze({
  [SPONSOR_ROLES.viewer]: [
    SPONSOR_ACTIONS.readProspects,
  ],
  [SPONSOR_ROLES.researcher]: [
    SPONSOR_ACTIONS.readProspects,
    SPONSOR_ACTIONS.createProspect,
    SPONSOR_ACTIONS.updateProspect,
    SPONSOR_ACTIONS.scoreProspect,
    SPONSOR_ACTIONS.createDraft,
  ],
  [SPONSOR_ROLES.manager]: [
    SPONSOR_ACTIONS.readProspects,
    SPONSOR_ACTIONS.createProspect,
    SPONSOR_ACTIONS.updateProspect,
    SPONSOR_ACTIONS.scoreProspect,
    SPONSOR_ACTIONS.createDraft,
    SPONSOR_ACTIONS.managePackages,
    SPONSOR_ACTIONS.exportData,
  ],
  [SPONSOR_ROLES.approver]: [
    SPONSOR_ACTIONS.readProspects,
    SPONSOR_ACTIONS.updateProspect,
    SPONSOR_ACTIONS.approveDraft,
  ],
  [SPONSOR_ROLES.sender]: [
    SPONSOR_ACTIONS.readProspects,
    SPONSOR_ACTIONS.sendApprovedDraft,
  ],
  [SPONSOR_ROLES.admin]: Object.values(SPONSOR_ACTIONS),
});

export function sponsorPermissionsForRoles(roles = []) {
  return new Set(
    roles.flatMap((role) => ROLE_PERMISSIONS[role] || []),
  );
}

export function canPerformSponsorAction(roles, action) {
  return sponsorPermissionsForRoles(roles).has(action);
}

export function isSponsorSendingAllowed({ roles = [], settings = {}, draft = {}, prospect = {} } = {}) {
  const blockers = [];

  if (!canPerformSponsorAction(roles, SPONSOR_ACTIONS.sendApprovedDraft)) {
    blockers.push('User lacks sponsor send permission.');
  }

  if (!settings.sendingEnabled) {
    blockers.push('Sponsor sending is disabled in settings.');
  }

  if (!settings.providerConfigured) {
    blockers.push('No production email provider is configured.');
  }

  if (draft.status !== 'APPROVED') {
    blockers.push('Draft is not approved.');
  }

  if (!draft.approvedAt || !draft.approvedBy) {
    blockers.push('Draft approval metadata is incomplete.');
  }

  if (!draft.explicitSendRequested) {
    blockers.push('A separate explicit send action is required.');
  }

  if (prospect.status === 'DO_NOT_CONTACT') {
    blockers.push('Prospect is marked DO_NOT_CONTACT.');
  }

  if (prospect.optedOut) {
    blockers.push('Prospect has opted out.');
  }

  if (prospect.legalRiskStatus === 'RESTRICTED' || prospect.brandSafetyStatus === 'RESTRICTED') {
    blockers.push('Prospect has restricted risk status.');
  }

  return {
    allowed: blockers.length === 0,
    blockers,
  };
}

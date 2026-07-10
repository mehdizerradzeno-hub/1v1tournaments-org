export const SPONSOR_AUDIT_ACTIONS = Object.freeze({
  prospectCreated: 'sponsor.prospect.created',
  prospectUpdated: 'sponsor.prospect.updated',
  prospectScored: 'sponsor.prospect.scored',
  draftGenerated: 'sponsor.outreachDraft.generated',
  draftApproved: 'sponsor.outreachDraft.approved',
  draftRejected: 'sponsor.outreachDraft.rejected',
  sendBlocked: 'sponsor.outreachSend.blocked',
  sendRequested: 'sponsor.outreachSend.requested',
  packageUpdated: 'sponsor.package.updated',
  inquiryReceived: 'sponsor.inquiry.received',
});

function safeClone(value) {
  if (value == null) return null;
  return JSON.parse(JSON.stringify(value));
}

export function createAuditEvent({
  actorId = 'system',
  action,
  entityType,
  entityId,
  beforeData = null,
  afterData = null,
  metadata = {},
  createdAt = new Date().toISOString(),
}) {
  if (!action) {
    throw new Error('Audit action is required.');
  }

  if (!entityType) {
    throw new Error('Audit entityType is required.');
  }

  return {
    id: `${createdAt}-${action}-${entityId || 'none'}`,
    actorId,
    action,
    entityType,
    entityId: entityId || '',
    beforeData: safeClone(beforeData),
    afterData: safeClone(afterData),
    metadata: safeClone(metadata) || {},
    createdAt,
  };
}

export function redactSponsorAuditPayload(payload = {}) {
  const redacted = safeClone(payload) || {};
  const sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'cookie', 'apiKey', 'webhook'];

  function visit(value) {
    if (!value || typeof value !== 'object') {
      return;
    }

    Object.keys(value).forEach((key) => {
      if (sensitiveKeys.some((item) => key.toLowerCase().includes(item.toLowerCase()))) {
        value[key] = '[REDACTED]';
        return;
      }

      visit(value[key]);
    });
  }

  visit(redacted);
  return redacted;
}

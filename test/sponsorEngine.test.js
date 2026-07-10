import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAuditEvent,
  createEmptySponsorProspect,
  getSponsorAdminRoutesForPhase,
  isSponsorSendingAllowed,
  isTierCCategory,
  normalizeCompanyName,
  normalizeDomain,
  prospectDeduplicationKey,
  redactSponsorAuditPayload,
  SPONSOR_ROLES,
} from '../src/lib/sponsorEngine/index.js';

test('sponsor company and domain normalization supports deduplication', () => {
  assert.equal(normalizeCompanyName('Acme Cards, LLC'), 'acme cards');
  assert.equal(normalizeCompanyName('ACME & Company Inc.'), 'acme and');
  assert.equal(normalizeDomain('https://www.example.com/partners?x=1'), 'example.com');
  assert.equal(normalizeDomain('WWW.Example.com/contact'), 'example.com');
  assert.equal(
    prospectDeduplicationKey({ companyName: 'Example LLC', website: 'https://www.example.com' }),
    'domain:example.com',
  );
});

test('new sponsor prospects default to review-safe states', () => {
  const prospect = createEmptySponsorProspect({
    companyName: 'Card Table Co.',
    website: 'https://www.cardtable.example/sponsor',
  });

  assert.equal(prospect.normalizedCompanyName, 'card table');
  assert.equal(prospect.domain, 'cardtable.example');
  assert.equal(prospect.status, 'NEW');
  assert.equal(prospect.dataQualityStatus, 'NEEDS_REVIEW');
  assert.equal(prospect.brandSafetyStatus, 'NEEDS_REVIEW');
  assert.deepEqual(prospect.sourceUrls, []);
  assert.equal(prospect.audienceSummary, 'Not yet provided');
});

test('tier C sponsor categories require extra review', () => {
  assert.equal(isTierCCategory('casinosBetting'), true);
  assert.equal(isTierCCategory('crypto'), true);
  assert.equal(isTierCCategory('playingCards'), false);
});

test('sponsor send gate blocks every unsafe default path', () => {
  const blocked = isSponsorSendingAllowed({
    roles: [SPONSOR_ROLES.admin],
    settings: { sendingEnabled: false, providerConfigured: false },
    draft: { status: 'NEEDS_REVIEW' },
    prospect: { status: 'NEW' },
  });

  assert.equal(blocked.allowed, false);
  assert.match(blocked.blockers.join(' '), /disabled/);
  assert.match(blocked.blockers.join(' '), /not approved/);
  assert.match(blocked.blockers.join(' '), /separate explicit send action/);
});

test('sponsor send gate requires approval metadata and explicit send action', () => {
  const allowed = isSponsorSendingAllowed({
    roles: [SPONSOR_ROLES.admin],
    settings: { sendingEnabled: true, providerConfigured: true },
    draft: {
      status: 'APPROVED',
      approvedAt: '2026-07-10T00:00:00.000Z',
      approvedBy: 'host-account',
      explicitSendRequested: true,
    },
    prospect: { status: 'QUALIFIED', legalRiskStatus: 'CLEAR', brandSafetyStatus: 'CLEAR' },
  });

  assert.equal(allowed.allowed, true);
  assert.deepEqual(allowed.blockers, []);
});

test('audit events require core fields and redact secrets recursively', () => {
  const event = createAuditEvent({
    actorId: 'host',
    action: 'sponsor.prospect.created',
    entityType: 'SponsorProspect',
    entityId: 'prospect-1',
    afterData: { companyName: 'Example' },
    metadata: { token: 'secret', nested: { webhookUrl: 'https://discord.example/hook' } },
    createdAt: '2026-07-10T00:00:00.000Z',
  });
  const redacted = redactSponsorAuditPayload(event);

  assert.equal(event.id, '2026-07-10T00:00:00.000Z-sponsor.prospect.created-prospect-1');
  assert.equal(redacted.metadata.token, '[REDACTED]');
  assert.equal(redacted.metadata.nested.webhookUrl, '[REDACTED]');
});

test('sponsor admin navigation exposes only phase-ready routes', () => {
  const phaseOneRoutes = getSponsorAdminRoutesForPhase(1);
  const phaseTwoRoutes = getSponsorAdminRoutesForPhase(2);

  assert.deepEqual(phaseOneRoutes, []);
  assert.deepEqual(phaseTwoRoutes.map((route) => route.id), ['overview', 'prospects']);
});

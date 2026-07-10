export const SPONSOR_ADMIN_ROUTES = Object.freeze([
  {
    id: 'overview',
    label: 'Overview',
    path: '/admin/sponsors',
    phase: 2,
    description: 'Pipeline totals, follow-ups due, data-quality alerts, and honest empty states.',
  },
  {
    id: 'prospects',
    label: 'Prospects',
    path: '/admin/sponsors/prospects',
    phase: 2,
    description: 'Prospect list, filters, imports, exports, and duplicate review.',
  },
  {
    id: 'research',
    label: 'Research Queue',
    path: '/admin/sponsors/research',
    phase: 3,
    description: 'Source-backed candidate review, scoring, and compliance flags.',
  },
  {
    id: 'approvals',
    label: 'Approval Queue',
    path: '/admin/sponsors/approvals',
    phase: 4,
    description: 'Draft review, factual-claim evidence, approval, rejection, and archive actions.',
  },
  {
    id: 'packages',
    label: 'Packages',
    path: '/admin/sponsors/packages',
    phase: 5,
    description: 'Editable sponsorship package pricing, benefits, visibility, and inventory.',
  },
  {
    id: 'proposals',
    label: 'Proposals',
    path: '/admin/sponsors/proposals',
    phase: 6,
    description: 'Editable proposal previews, deliverables, terms summary, and print export.',
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/admin/sponsors/settings',
    phase: 7,
    description: 'Provider adapters, limits, quiet hours, and draft-only safety controls.',
  },
]);

export function getSponsorAdminRoutesForPhase(phase) {
  return SPONSOR_ADMIN_ROUTES.filter((route) => route.phase <= phase);
}

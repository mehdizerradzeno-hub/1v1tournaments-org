import {
  createEmptySponsorProspect,
  isTierCCategory,
  normalizeCompanyName,
  normalizeDomain,
  prospectDeduplicationKey,
  PROSPECT_STATUSES,
  SPONSOR_CATEGORIES,
} from './schema.js';

export const SPONSOR_PIPELINE_COLUMNS = Object.freeze([
  { id: 'NEW', label: 'New' },
  { id: 'RESEARCHED', label: 'Researched' },
  { id: 'QUALIFIED', label: 'Qualified' },
  { id: 'DRAFT_READY', label: 'Draft Ready' },
  { id: 'CONTACTED', label: 'Contacted' },
  { id: 'REPLIED', label: 'Replied' },
  { id: 'MEETING', label: 'Meeting' },
  { id: 'PROPOSAL', label: 'Proposal' },
  { id: 'NEGOTIATION', label: 'Negotiation' },
  { id: 'WON', label: 'Won' },
  { id: 'LOST', label: 'Lost' },
  { id: 'PAUSED', label: 'Paused' },
  { id: 'DO_NOT_CONTACT', label: 'Do Not Contact' },
]);

const CSV_COLUMNS = [
  'companyName',
  'website',
  'industry',
  'headquarters',
  'sourceType',
  'sourceUrl',
  'publicContactName',
  'publicContactRole',
  'publicContactEmail',
  'publicContactFormUrl',
  'notes',
];

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function csvEscape(value) {
  const text = String(value ?? '');

  if (!/[",\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function rowToProspect(row, index) {
  const sourceUrls = row.sourceUrl ? [{ url: row.sourceUrl, sourceType: row.sourceType || 'manual' }] : [];
  const categoryKey = inferSponsorCategory(row);
  const tierC = isTierCCategory(categoryKey);

  return createEmptySponsorProspect({
    id: `preview-${index + 1}`,
    companyName: row.companyName,
    website: row.website,
    industry: row.industry,
    headquarters: row.headquarters,
    publicContactName: row.publicContactName,
    publicContactRole: row.publicContactRole,
    publicContactEmail: row.publicContactEmail,
    publicContactFormUrl: row.publicContactFormUrl,
    publicContactSourceUrl: row.sourceUrl,
    sourceType: row.sourceType || 'manual',
    sourceUrls,
    dataQualityStatus: sourceUrls.length ? 'NEEDS_REVIEW' : 'MISSING_SOURCES',
    brandSafetyStatus: tierC ? 'NEEDS_REVIEW' : 'CLEAR',
    legalRiskStatus: tierC ? 'NEEDS_REVIEW' : 'CLEAR',
    ageRestricted: tierC && /alcohol|tobacco|nicotine|cannabis|hemp/i.test(`${row.industry} ${row.notes}`),
    gamblingRelated: tierC && /casino|betting|gambling|fantasy|sweepstake/i.test(`${row.industry} ${row.notes}`),
    status: tierC ? 'RESEARCHED' : 'NEW',
  });
}

export function inferSponsorCategory(row = {}) {
  const haystack = `${row.companyName || ''} ${row.industry || ''} ${row.notes || ''}`.toLowerCase();

  if (/casino|betting|gambling|sportsbook/.test(haystack)) return 'casinosBetting';
  if (/crypto|blockchain|web3/.test(haystack)) return 'crypto';
  if (/alcohol|beer|wine|liquor/.test(haystack)) return 'alcohol';
  if (/tobacco|nicotine|hemp|cannabis/.test(haystack)) return 'tobaccoNicotineCannabis';
  if (/card|playing card/.test(haystack)) return 'playingCards';
  if (/stream|camera|microphone|capture/.test(haystack)) return 'streamingHardware';
  if (/audio|headset|speaker/.test(haystack)) return 'gamingAudio';
  if (/raleigh|cary|durham|north carolina|\bnc\b/.test(haystack)) return 'localNc';
  if (/restaurant|food/.test(haystack)) return 'restaurants';
  if (/apparel|shirt|clothing/.test(haystack)) return 'apparel';
  return 'smallBusinessServices';
}

export function parseSponsorCsv(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return { prospects: [], errors: ['CSV is empty.'] };
  }

  const header = splitCsvLine(lines[0]);
  const missingColumns = ['companyName', 'website'].filter((column) => !header.includes(column));
  const errors = missingColumns.map((column) => `Missing required column: ${column}`);

  if (missingColumns.length) {
    return { prospects: [], errors };
  }

  const prospects = lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    const row = Object.fromEntries(header.map((column, columnIndex) => [column, cells[columnIndex] || '']));

    return rowToProspect(row, index);
  }).filter((prospect) => prospect.companyName || prospect.website);

  return {
    prospects: markDuplicateProspects(prospects),
    errors,
  };
}

export function exportSponsorProspectsCsv(prospects) {
  const rows = [CSV_COLUMNS.join(',')];

  prospects.forEach((prospect) => {
    rows.push(CSV_COLUMNS.map((column) => {
      if (column === 'sourceUrl') return csvEscape(prospect.sourceUrls?.[0]?.url || prospect.publicContactSourceUrl || '');
      if (column === 'notes') return csvEscape(prospect.fitExplanation || '');
      return csvEscape(prospect[column] || '');
    }).join(','));
  });

  return `${rows.join('\n')}\n`;
}

export function markDuplicateProspects(prospects, existingProspects = []) {
  const seen = new Map();

  existingProspects.forEach((prospect) => {
    seen.set(prospectDeduplicationKey(prospect), prospect.id || prospect.companyName);
  });

  return prospects.map((prospect) => {
    const key = prospectDeduplicationKey(prospect);
    const duplicateOfId = seen.get(key) || '';
    const next = duplicateOfId
      ? { ...prospect, duplicateOfId, dataQualityStatus: 'DUPLICATE_REVIEW', status: 'PAUSED' }
      : prospect;

    seen.set(key, next.id || next.companyName);
    return next;
  });
}

export function filterSponsorProspects(prospects, filters = {}) {
  const query = String(filters.query || '').trim().toLowerCase();
  const status = String(filters.status || '').trim();
  const risk = String(filters.risk || '').trim();

  return prospects.filter((prospect) => {
    if (status && prospect.status !== status) return false;
    if (risk === 'tier-c' && !prospect.legalRiskStatus?.includes('REVIEW')) return false;

    if (!query) return true;

    return [
      prospect.companyName,
      prospect.website,
      prospect.industry,
      prospect.headquarters,
      prospect.publicContactEmail,
    ].some((value) => String(value || '').toLowerCase().includes(query));
  });
}

export function groupProspectsByStage(prospects) {
  const groups = Object.fromEntries(PROSPECT_STATUSES.map((status) => [status, []]));

  prospects.forEach((prospect) => {
    const status = PROSPECT_STATUSES.includes(prospect.status) ? prospect.status : 'NEW';
    groups[status].push(prospect);
  });

  return groups;
}

export function summarizeSponsorPipeline(prospects) {
  const qualifiedStatuses = new Set(['QUALIFIED', 'DRAFT_READY', 'CONTACTED', 'REPLIED', 'MEETING', 'PROPOSAL', 'NEGOTIATION', 'WON']);
  const draftStatuses = new Set(['DRAFT_READY']);

  return {
    totalProspects: prospects.length,
    qualifiedProspects: prospects.filter((prospect) => qualifiedStatuses.has(prospect.status)).length,
    draftsAwaitingReview: prospects.filter((prospect) => draftStatuses.has(prospect.status)).length,
    dataQualityAlerts: prospects.filter((prospect) => (
      prospect.dataQualityStatus !== 'VERIFIED'
      || prospect.duplicateOfId
      || prospect.legalRiskStatus === 'NEEDS_REVIEW'
      || prospect.brandSafetyStatus === 'NEEDS_REVIEW'
    )).length,
    doNotContact: prospects.filter((prospect) => prospect.status === 'DO_NOT_CONTACT').length,
  };
}

export function createManualSponsorProspect(input = {}, existingProspects = []) {
  const prospect = createEmptySponsorProspect({
    ...input,
    normalizedCompanyName: normalizeCompanyName(input.companyName),
    domain: normalizeDomain(input.website),
    sourceUrls: input.sourceUrl ? [{ url: input.sourceUrl, sourceType: 'manual' }] : [],
  });

  return markDuplicateProspects([prospect], existingProspects)[0];
}

export function sponsorCategoryLabel(categoryKey) {
  return SPONSOR_CATEGORIES[categoryKey]?.label || 'Uncategorized';
}

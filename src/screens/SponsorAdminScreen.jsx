import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  ActionButton,
  Badge,
  EmptyState,
  HubScreen,
  Section,
  Surface,
} from '../components/hub-ui.jsx';
import {
  fetchSponsorCollateral,
  fetchPlayerAccount,
  fetchSponsorInquiries,
  fetchSponsorProspects,
  saveSponsorCollateral,
  saveSponsorProspect,
  saveSponsorProspects,
  updateSponsorProspectStatus,
  updateSponsorInquiryStatus,
} from '../lib/tournamentHostingClient.js';
import {
  exportSponsorProspectsCsv,
  filterSponsorProspects,
  groupProspectsByStage,
  approveOutreachDraft,
  createOutreachDraft,
  createSponsorProposal,
  parseSponsorCsv,
  prepareFollowUpDraft,
  proposalToPlainText,
  PROSPECT_STATUSES,
  runResearchPreparation,
  SPONSOR_PIPELINE_COLUMNS,
  summarizeSponsorPipeline,
} from '../lib/sponsorEngine/index.js';
import { theme } from '../lib/theme.js';

const CODE_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'Menlo' });

const EMPTY_IMPORT = `companyName,website,industry,headquarters,sourceType,sourceUrl,publicContactName,publicContactRole,publicContactEmail,publicContactFormUrl,notes
Example Playing Cards,https://example.com,Playing cards,"Raleigh, NC",manual,https://example.com/contact,,,,https://example.com/contact,"Sample only. Replace with public or authorized information."`;

function useHostAccount() {
  const [state, setState] = useState({ loading: true, account: null, error: '' });

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const result = await fetchPlayerAccount();

        if (active) {
          setState({ loading: false, account: result.account || null, error: '' });
        }
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            account: null,
            error: error instanceof Error ? error.message : 'Account lookup failed.',
          });
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  return state;
}

function StatTile({ label, value }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function ProspectRow({ prospect, selected, onSelect }) {
  return (
    <ActionButton
      onPress={onSelect}
      style={[styles.prospectRow, selected && styles.prospectRowSelected]}
      variant="secondary">
      <View style={styles.prospectRowInner}>
        <View style={styles.prospectRowCopy}>
          <Text numberOfLines={1} style={styles.prospectName}>{prospect.companyName || 'Unnamed company'}</Text>
          <Text numberOfLines={1} style={styles.prospectMeta}>
            {prospect.domain || 'No domain'} | {prospect.industry || 'Industry not yet provided'}
          </Text>
        </View>
        <Badge tone={prospect.duplicateOfId ? 'accent' : prospect.legalRiskStatus === 'NEEDS_REVIEW' ? 'blue' : 'green'}>
          {prospect.duplicateOfId ? 'Duplicate' : prospect.status}
        </Badge>
      </View>
    </ActionButton>
  );
}

const PRIMARY_PROSPECT_STATUSES = [
  'NEW',
  'RESEARCHED',
  'QUALIFIED',
  'DRAFT_READY',
  'PROPOSAL',
  'WON',
  'LOST',
  'PAUSED',
  'DO_NOT_CONTACT',
];

const SPONSOR_WORKSPACE_TABS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'prospects', label: 'Prospects' },
  { id: 'research', label: 'Research' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'export', label: 'Export' },
];

function ProspectDetail({ loading, onUpdateStatus, prospect }) {
  if (!prospect) {
    return (
      <Surface style={styles.detailPanel}>
        <EmptyState
          body="Import or select a prospect to review company profile, sources, risk flags, next action, and contact provenance."
          title="No prospect selected"
        />
      </Surface>
    );
  }

  const sources = prospect.sourceUrls || [];

  return (
    <Surface style={styles.detailPanel}>
      <View style={styles.detailHeader}>
        <View style={styles.detailCopy}>
          <Text style={styles.detailEyebrow}>Prospect detail</Text>
          <Text style={styles.detailTitle}>{prospect.companyName}</Text>
          <Text style={styles.detailBody}>{prospect.companyDescription || 'Company description not yet provided.'}</Text>
        </View>
        <Badge tone={prospect.legalRiskStatus === 'NEEDS_REVIEW' ? 'accent' : 'green'}>
          {prospect.legalRiskStatus}
        </Badge>
      </View>

      <View style={styles.detailGrid}>
        <StatTile label="Fit score" value={prospect.fitScore || 'Not scored'} />
        <StatTile label="Data quality" value={prospect.dataQualityStatus} />
        <StatTile label="Brand safety" value={prospect.brandSafetyStatus} />
        <StatTile label="Next action" value={prospect.nextAction || 'Not yet provided'} />
      </View>

      <View style={styles.sourceBlock}>
        <Text style={styles.sourceTitle}>Public sources</Text>
        {sources.length ? sources.map((source) => (
          <Text key={`${source.url}-${source.sourceType}`} selectable style={styles.sourceText}>
            {source.sourceType || 'source'}: {source.url}
          </Text>
        )) : (
          <Text style={styles.sourceEmpty}>No source URLs yet. This prospect cannot move to outreach review.</Text>
        )}
      </View>

      <View style={styles.sourceBlock}>
        <Text style={styles.sourceTitle}>Pipeline stage</Text>
        <Text style={styles.sourceEmpty}>
          Move saved prospects manually. This never sends outreach or contacts the company.
        </Text>
        <View style={styles.approvalActions}>
          {PRIMARY_PROSPECT_STATUSES.map((status) => (
            <ActionButton
              key={status}
              disabled={loading || prospect.status === status || !PROSPECT_STATUSES.includes(status)}
              onPress={() => onUpdateStatus(prospect.id, status)}
              variant={prospect.status === status ? 'primary' : status === 'DO_NOT_CONTACT' ? 'ghost' : 'secondary'}>
              {status.replace(/_/g, ' ')}
            </ActionButton>
          ))}
        </View>
      </View>
    </Surface>
  );
}

function PipelineBoard({ prospects }) {
  const groups = groupProspectsByStage(prospects);

  return (
    <View style={styles.pipelineBoard}>
      {SPONSOR_PIPELINE_COLUMNS.map((column) => {
        const columnProspects = groups[column.id] || [];

        return (
          <Surface key={column.id} style={styles.pipelineColumn}>
            <View style={styles.pipelineColumnHeader}>
              <Text style={styles.pipelineTitle}>{column.label}</Text>
              <Text style={styles.pipelineCount}>{columnProspects.length}</Text>
            </View>
            {columnProspects.length ? columnProspects.slice(0, 4).map((prospect) => (
              <View key={prospect.id || prospect.companyName} style={styles.pipelineCard}>
                <Text numberOfLines={1} style={styles.pipelineCardTitle}>{prospect.companyName}</Text>
                <Text numberOfLines={1} style={styles.pipelineCardMeta}>{prospect.domain || 'No domain'}</Text>
              </View>
            )) : (
              <Text style={styles.pipelineEmpty}>No records</Text>
            )}
          </Surface>
        );
      })}
    </View>
  );
}

function SponsorInquiryInbox({ error, inquiries, loading, onRefresh, onUpdateStatus }) {
  return (
    <Surface style={styles.inquiryPanel}>
      <View style={styles.researchHeader}>
        <View style={styles.researchCopy}>
          <Text style={styles.researchTitle}>Sponsor inquiry inbox</Text>
          <Text style={styles.researchBody}>
            Public sponsor form submissions land here for manual review. No email is sent automatically.
          </Text>
        </View>
        <ActionButton disabled={loading} onPress={onRefresh} variant="secondary">
          {loading ? 'Refreshing...' : 'Refresh'}
        </ActionButton>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {inquiries.length ? (
        <View style={styles.inquiryList}>
          {inquiries.map((inquiry) => (
            <View key={inquiry.id} style={styles.inquiryCard}>
              <View style={styles.researchCardHeader}>
                <View style={styles.researchCardCopy}>
                  <Text style={styles.researchCompany}>{inquiry.company}</Text>
                  <Text style={styles.researchMeta}>
                    {inquiry.name} | {inquiry.workEmail} | {inquiry.estimatedBudgetRange}
                  </Text>
                </View>
                <Badge tone={inquiry.status === 'NEW' ? 'accent' : inquiry.status === 'REVIEWED' ? 'green' : 'neutral'}>
                  {inquiry.status}
                </Badge>
              </View>
              <Text style={styles.inquiryMessage}>{inquiry.message}</Text>
              <Text selectable style={styles.sourceText}>
                {inquiry.sponsorshipInterest} | {inquiry.website || 'No website'} | {inquiry.receivedAt}
              </Text>
              <View style={styles.approvalActions}>
                <ActionButton
                  disabled={loading || inquiry.status === 'REVIEWED'}
                  onPress={() => onUpdateStatus(inquiry.id, 'REVIEWED')}
                  variant="secondary">
                  Mark reviewed
                </ActionButton>
                <ActionButton
                  disabled={loading || inquiry.status === 'ARCHIVED'}
                  onPress={() => onUpdateStatus(inquiry.id, 'ARCHIVED')}
                  variant="ghost">
                  Archive
                </ActionButton>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          body="When a company submits the public sponsor form, it will appear here after server-side validation."
          title="No sponsor inquiries yet"
        />
      )}
    </Surface>
  );
}

function ResearchQueue({ candidates, loading, onPrepare, onAccept }) {
  return (
    <Surface style={styles.researchPanel}>
      <View style={styles.researchHeader}>
        <View style={styles.researchCopy}>
          <Text style={styles.researchTitle}>Mock-safe research preparation</Text>
          <Text style={styles.researchBody}>
            Bounded provider run. No live crawling, no contact attempts, and every material fact keeps a source.
          </Text>
        </View>
        <ActionButton disabled={loading} onPress={onPrepare}>
          {loading ? 'Preparing...' : 'Prepare queue'}
        </ActionButton>
      </View>

      {candidates.length ? (
        <View style={styles.researchList}>
          {candidates.map((candidate) => (
            <View key={candidate.id} style={styles.researchCard}>
              <View style={styles.researchCardHeader}>
                <View style={styles.researchCardCopy}>
                  <Text style={styles.researchCompany}>{candidate.prospect.companyName}</Text>
                  <Text style={styles.researchMeta}>
                    {candidate.prospect.domain || 'No domain'} | Fit {candidate.prospect.fitScore}/100
                  </Text>
                </View>
                <Badge tone={candidate.prospect.legalRiskStatus === 'NEEDS_REVIEW' ? 'accent' : 'green'}>
                  {candidate.status}
                </Badge>
              </View>
              <Text style={styles.researchExplanation}>{candidate.prospect.fitExplanation}</Text>
              {candidate.scoreBreakdown.risk.flags.length ? (
                <View style={styles.riskList}>
                  {candidate.scoreBreakdown.risk.flags.map((flag) => (
                    <Text key={flag} style={styles.riskText}>{flag}</Text>
                  ))}
                </View>
              ) : null}
              <View style={styles.factList}>
                {candidate.facts.map((fact) => (
                  <Text key={`${candidate.id}-${fact.label}`} selectable style={styles.factText}>
                    {fact.label}: {fact.value} Source: {fact.source.url || 'Not yet provided'}
                  </Text>
                ))}
              </View>
              <ActionButton
                disabled={Boolean(candidate.prospect.duplicateOfId) || candidate.prospect.legalRiskStatus === 'NEEDS_REVIEW'}
                onPress={() => onAccept(candidate)}
                variant="secondary">
                Accept into CRM preview
              </ActionButton>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          body="Run the mock-safe preparation step to review example sponsor candidates with provenance and score breakdowns."
          title="No research candidates prepared"
        />
      )}
    </Surface>
  );
}

function ApprovalQueue({ drafts, selectedProspect, onGenerate, onApprove, onPrepareFollowUp }) {
  return (
    <Surface style={styles.approvalPanel}>
      <View style={styles.researchHeader}>
        <View style={styles.researchCopy}>
          <Text style={styles.researchTitle}>Draft approval queue</Text>
          <Text style={styles.researchBody}>
            Generates review-only outreach drafts. Approval does not send messages.
          </Text>
        </View>
        <ActionButton disabled={!selectedProspect} onPress={onGenerate}>
          Generate draft
        </ActionButton>
      </View>

      {drafts.length ? (
        <View style={styles.researchList}>
          {drafts.map((draft) => (
            <View key={draft.id} style={styles.approvalCard}>
              <View style={styles.researchCardHeader}>
                <View style={styles.researchCardCopy}>
                  <Text style={styles.researchCompany}>{draft.subject}</Text>
                  <Text style={styles.researchMeta}>
                    {draft.recipient || 'No recipient route'} | Quality {draft.qualityScore}/100
                  </Text>
                </View>
                <Badge tone={draft.status === 'APPROVED' ? 'green' : draft.status === 'NEEDS_REVIEW' ? 'blue' : 'accent'}>
                  {draft.status}
                </Badge>
              </View>
              <Text selectable style={styles.draftBody}>{draft.body}</Text>
              <View style={styles.factList}>
                {draft.personalizationFacts.map((fact) => (
                  <Text key={`${draft.id}-${fact.label}`} selectable style={styles.factText}>
                    {fact.label}: {fact.value} Source: {fact.sourceUrl || 'Not yet provided'}
                  </Text>
                ))}
              </View>
              {draft.validation?.warnings?.length ? (
                <View style={styles.riskList}>
                  {draft.validation.warnings.map((warning) => (
                    <Text key={warning} style={styles.riskText}>{warning}</Text>
                  ))}
                </View>
              ) : null}
              <View style={styles.approvalActions}>
                <ActionButton
                  disabled={draft.status !== 'NEEDS_REVIEW'}
                  onPress={() => onApprove(draft)}
                  variant="secondary">
                  Approve draft
                </ActionButton>
                <ActionButton
                  disabled={draft.status !== 'APPROVED'}
                  onPress={() => onPrepareFollowUp(draft)}
                  variant="secondary">
                  Prepare follow-up
                </ActionButton>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          body="Select a prospect and generate an initial review draft. The draft must pass validation before approval."
          title="No drafts prepared"
        />
      )}
    </Surface>
  );
}

function ProposalPreview({ proposals, selectedProspect, onGenerate }) {
  return (
    <Surface style={styles.proposalPanel}>
      <View style={styles.researchHeader}>
        <View style={styles.researchCopy}>
          <Text style={styles.researchTitle}>Proposal generator</Text>
          <Text style={styles.researchBody}>
            Creates editable proposal previews with legal-review notice and verified-only reporting language.
          </Text>
        </View>
        <ActionButton disabled={!selectedProspect} onPress={onGenerate}>
          Generate proposal
        </ActionButton>
      </View>

      {proposals.length ? (
        <View style={styles.researchList}>
          {proposals.map((proposal) => (
            <View key={proposal.id} style={styles.approvalCard}>
              <View style={styles.researchCardHeader}>
                <View style={styles.researchCardCopy}>
                  <Text style={styles.researchCompany}>{proposal.prospectName}</Text>
                  <Text style={styles.researchMeta}>{proposal.packageName} | {proposal.status}</Text>
                </View>
                <Badge tone="blue">Review</Badge>
              </View>
              <Text style={styles.proposalNotice}>{proposal.reviewNotice}</Text>
              <Text selectable style={styles.draftBody}>{proposalToPlainText(proposal)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          body="Select a prospect and generate a proposal preview. Export/delivery comes after review."
          title="No proposals prepared"
        />
      )}
    </Surface>
  );
}

export default function SponsorAdminScreen() {
  const hostState = useHostAccount();
  const [prospects, setProspects] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [csvText, setCsvText] = useState(EMPTY_IMPORT);
  const [researchRun, setResearchRun] = useState(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [outreachDrafts, setOutreachDrafts] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [inquiryState, setInquiryState] = useState({ loading: false, error: '', inquiries: [] });
  const [prospectState, setProspectState] = useState({ loading: false, error: '', message: '' });
  const [collateralState, setCollateralState] = useState({ loading: false, error: '', message: '' });
  const [activeTab, setActiveTab] = useState('inbox');
  const importPreview = useMemo(() => parseSponsorCsv(csvText), [csvText]);
  const filteredProspects = filterSponsorProspects(prospects, { query, status: statusFilter });
  const selectedProspect = prospects.find((prospect) => prospect.id === selectedId) || filteredProspects[0] || null;
  const summary = summarizeSponsorPipeline(prospects);
  const canUseAdmin = Boolean(hostState.account?.hostApproved);

  async function loadSponsorInquiries() {
    setInquiryState((currentState) => ({ ...currentState, loading: true, error: '' }));

    try {
      const result = await fetchSponsorInquiries();

      setInquiryState({
        loading: false,
        error: '',
        inquiries: result.inquiries || [],
      });
    } catch (error) {
      setInquiryState({
        loading: false,
        error: error instanceof Error ? error.message : 'Sponsor inquiries could not be loaded.',
        inquiries: [],
      });
    }
  }

  async function updateInquiryStatus(inquiryId, status) {
    setInquiryState((currentState) => ({ ...currentState, loading: true, error: '' }));

    try {
      const result = await updateSponsorInquiryStatus({ inquiryId, status });

      setInquiryState({
        loading: false,
        error: '',
        inquiries: result.inquiries || [],
      });
    } catch (error) {
      setInquiryState((currentState) => ({
        ...currentState,
        loading: false,
        error: error instanceof Error ? error.message : 'Sponsor inquiry could not be updated.',
      }));
    }
  }

  async function loadSponsorProspects() {
    setProspectState({ loading: true, error: '', message: 'Loading saved sponsor prospects...' });

    try {
      const result = await fetchSponsorProspects();
      const nextProspects = result.prospects || [];

      setProspects(nextProspects);
      setSelectedId(nextProspects[0]?.id || '');
      setProspectState({
        loading: false,
        error: '',
        message: nextProspects.length
          ? `Loaded ${nextProspects.length} saved sponsor prospect${nextProspects.length === 1 ? '' : 's'}.`
          : 'No saved sponsor prospects yet.',
      });
    } catch (error) {
      setProspectState({
        loading: false,
        error: error instanceof Error ? error.message : 'Sponsor prospects could not be loaded.',
        message: '',
      });
    }
  }

  async function loadSponsorCollateral() {
    setCollateralState({ loading: true, error: '', message: 'Loading saved drafts and proposals...' });

    try {
      const result = await fetchSponsorCollateral();
      const nextDrafts = result.drafts || [];
      const nextProposals = result.proposals || [];

      setOutreachDrafts(nextDrafts);
      setProposals(nextProposals);
      setCollateralState({
        loading: false,
        error: '',
        message: `Loaded ${nextDrafts.length} draft${nextDrafts.length === 1 ? '' : 's'} and ${nextProposals.length} proposal${nextProposals.length === 1 ? '' : 's'}.`,
      });
    } catch (error) {
      setCollateralState({
        loading: false,
        error: error instanceof Error ? error.message : 'Sponsor drafts and proposals could not be loaded.',
        message: '',
      });
    }
  }

  useEffect(() => {
    if (canUseAdmin) {
      loadSponsorInquiries();
      loadSponsorProspects();
      loadSponsorCollateral();
    }
  }, [canUseAdmin]);

  async function acceptPreview() {
    setProspectState({ loading: true, error: '', message: '' });

    try {
      const result = await saveSponsorProspects({ prospects: importPreview.prospects });
      const nextProspects = result.prospects || [];

      setProspects(nextProspects);
      setSelectedId(nextProspects[0]?.id || '');
      setProspectState({
        loading: false,
        error: '',
        message: `Saved ${result.savedCount || importPreview.prospects.length} sponsor prospect${(result.savedCount || importPreview.prospects.length) === 1 ? '' : 's'} to the host CRM.`,
      });
    } catch (error) {
      setProspectState({
        loading: false,
        error: error instanceof Error ? error.message : 'Sponsor prospects could not be saved.',
        message: '',
      });
    }
  }

  async function prepareResearchQueue() {
    setResearchLoading(true);

    try {
      const nextRun = await runResearchPreparation({
        query: 'cards streaming raleigh',
        existingProspects: prospects,
        limit: 5,
      });

      setResearchRun(nextRun);
    } finally {
      setResearchLoading(false);
    }
  }

  async function acceptResearchCandidate(candidate) {
    const accepted = {
      ...candidate.prospect,
      id: '',
    };

    setProspectState({ loading: true, error: '', message: '' });

    try {
      const result = await saveSponsorProspect({ prospect: accepted });
      const saved = result.prospect;

      setProspects(result.prospects || [saved, ...prospects]);
      setSelectedId(saved?.id || '');
      setResearchRun((currentRun) => currentRun
        ? {
          ...currentRun,
          candidatesAccepted: currentRun.candidatesAccepted + 1,
          candidates: currentRun.candidates.filter((item) => item.id !== candidate.id),
        }
        : currentRun);
      setProspectState({
        loading: false,
        error: '',
        message: `${saved?.companyName || 'Sponsor prospect'} saved to the host CRM.`,
      });
    } catch (error) {
      setProspectState({
        loading: false,
        error: error instanceof Error ? error.message : 'Research candidate could not be saved.',
        message: '',
      });
    }
  }

  async function changeProspectStatus(prospectId, status) {
    setProspectState({ loading: true, error: '', message: '' });

    try {
      const result = await updateSponsorProspectStatus({ prospectId, status });
      const nextProspects = result.prospects || [];

      setProspects(nextProspects);
      setSelectedId(result.prospect?.id || prospectId);
      setProspectState({
        loading: false,
        error: '',
        message: `${result.prospect?.companyName || 'Sponsor prospect'} moved to ${status.replace(/_/g, ' ')}.`,
      });
    } catch (error) {
      setProspectState({
        loading: false,
        error: error instanceof Error ? error.message : 'Sponsor prospect status could not be updated.',
        message: '',
      });
    }
  }

  async function generateOutreachDraft() {
    if (!selectedProspect) return;

    const draft = createOutreachDraft({
      prospect: selectedProspect,
      templateType: selectedProspect.headquarters?.toLowerCase().includes('nc')
        ? 'local-business-sponsorship'
        : 'initial-introduction',
    });

    setCollateralState({ loading: true, error: '', message: '' });

    try {
      const result = await saveSponsorCollateral({ type: 'draft', record: draft });

      setOutreachDrafts(result.drafts || [draft, ...outreachDrafts]);
      setProposals(result.proposals || proposals);
      setCollateralState({
        loading: false,
        error: '',
        message: 'Draft saved for review. No message was sent.',
      });
    } catch (error) {
      setCollateralState({
        loading: false,
        error: error instanceof Error ? error.message : 'Draft could not be saved.',
        message: '',
      });
    }
  }

  async function approveDraft(draft) {
    const result = approveOutreachDraft(draft, { approvedBy: hostState.account?.id || 'local-host' });

    if (result.errors.length) return;

    setCollateralState({ loading: true, error: '', message: '' });

    try {
      const saveResult = await saveSponsorCollateral({ type: 'draft', record: result.draft });

      setOutreachDrafts(saveResult.drafts || outreachDrafts.map((item) => (
        item.id === draft.id ? result.draft : item
      )));
      setProposals(saveResult.proposals || proposals);
      setCollateralState({
        loading: false,
        error: '',
        message: 'Draft approval saved. No message was sent.',
      });
    } catch (error) {
      setCollateralState({
        loading: false,
        error: error instanceof Error ? error.message : 'Draft approval could not be saved.',
        message: '',
      });
    }
  }

  async function prepareFollowUp(draft) {
    const prospect = prospects.find((item) => item.id === draft.prospectId) || selectedProspect || {};
    const result = prepareFollowUpDraft({ prospect, parentDraft: draft });

    if (!result.draft) return;

    setCollateralState({ loading: true, error: '', message: '' });

    try {
      const saveResult = await saveSponsorCollateral({ type: 'draft', record: result.draft });

      setOutreachDrafts(saveResult.drafts || [result.draft, ...outreachDrafts]);
      setProposals(saveResult.proposals || proposals);
      setCollateralState({
        loading: false,
        error: '',
        message: 'Follow-up draft saved for review. No message was sent.',
      });
    } catch (error) {
      setCollateralState({
        loading: false,
        error: error instanceof Error ? error.message : 'Follow-up draft could not be saved.',
        message: '',
      });
    }
  }

  async function generateProposal() {
    if (!selectedProspect) return;

    const proposal = createSponsorProposal({
      prospect: selectedProspect,
      packageId: selectedProspect.fitScore >= 75 ? 'tournament-sponsor' : 'community-supporter',
      campaignDates: 'Next available public tournament window',
    });

    setCollateralState({ loading: true, error: '', message: '' });

    try {
      const result = await saveSponsorCollateral({ type: 'proposal', record: proposal });

      setOutreachDrafts(result.drafts || outreachDrafts);
      setProposals(result.proposals || [proposal, ...proposals]);
      setCollateralState({
        loading: false,
        error: '',
        message: 'Proposal preview saved. No sponsor was contacted.',
      });
    } catch (error) {
      setCollateralState({
        loading: false,
        error: error instanceof Error ? error.message : 'Proposal preview could not be saved.',
        message: '',
      });
    }
  }

  return (
    <HubScreen
      actions={[
        { label: 'Tournament admin', href: '/admin', variant: 'secondary' },
        { label: 'Public site', href: '/', variant: 'ghost' },
      ]}
      eyebrow="Sponsor Engine"
      footerNote="Sponsor prospects and inquiries persist for host review. No external messages are sent."
      lead="Sponsor CRM workspace for saved prospects, inquiry review, pipeline preview, CSV import, and data-quality checks."
      stickyActions={false}
      title="Sponsor CRM">
      {!canUseAdmin ? (
        <EmptyState
          action={<ActionButton href="/check-in/spades-summer-series?mode=signin">Sign in</ActionButton>}
          body={hostState.loading
            ? 'Checking whether your account has sponsor admin access.'
            : hostState.error || 'Sign in with a host-approved account before managing sponsor prospects.'}
          title="Host access required"
        />
      ) : (
        <>
          <Section
            description="Honest totals only. Empty values mean the CRM has not collected that data yet."
            title="Overview">
            <View style={styles.statGrid}>
              <StatTile label="Total prospects" value={summary.totalProspects} />
              <StatTile label="Qualified" value={summary.qualifiedProspects} />
              <StatTile label="Drafts awaiting review" value={summary.draftsAwaitingReview} />
              <StatTile label="Data-quality alerts" value={summary.dataQualityAlerts} />
              <StatTile label="Do not contact" value={summary.doNotContact} />
            </View>
            <View style={styles.buttonRow}>
              <ActionButton disabled={prospectState.loading} onPress={loadSponsorProspects} variant="secondary">
                {prospectState.loading ? 'Loading...' : 'Refresh prospects'}
              </ActionButton>
              <ActionButton disabled={collateralState.loading} onPress={loadSponsorCollateral} variant="secondary">
                {collateralState.loading ? 'Loading...' : 'Refresh drafts'}
              </ActionButton>
            </View>
            {prospectState.error ? <Text style={styles.errorText}>{prospectState.error}</Text> : null}
            {prospectState.message ? <Text style={styles.successText}>{prospectState.message}</Text> : null}
            {collateralState.error ? <Text style={styles.errorText}>{collateralState.error}</Text> : null}
            {collateralState.message ? <Text style={styles.successText}>{collateralState.message}</Text> : null}
          </Section>

          <Section
            description="Move through one focused sponsor task at a time."
            title="Workspace">
            <Surface style={styles.tabPanel}>
              <View style={styles.tabRow}>
                {SPONSOR_WORKSPACE_TABS.map((tab) => (
                  <ActionButton
                    key={tab.id}
                    onPress={() => setActiveTab(tab.id)}
                    variant={activeTab === tab.id ? 'primary' : 'secondary'}>
                    {tab.label}
                  </ActionButton>
                ))}
              </View>
            </Surface>
          </Section>

          {activeTab === 'inbox' ? (
            <Section
              description="Public sponsor inquiries are stored server-side and reviewed manually."
              title="Inquiry inbox">
              <SponsorInquiryInbox
                error={inquiryState.error}
                inquiries={inquiryState.inquiries}
                loading={inquiryState.loading}
                onRefresh={loadSponsorInquiries}
                onUpdateStatus={updateInquiryStatus}
              />
            </Section>
          ) : null}

          {activeTab === 'prospects' ? (
            <>
              <Section
                description="Paste CSV data to preview normalized prospects. Saving preview stores host-reviewed records in the sponsor CRM."
                title="CSV import preview">
                <Surface style={styles.importPanel}>
                  <TextInput
                    multiline
                    onChangeText={setCsvText}
                    spellCheck={false}
                    style={styles.csvInput}
                    value={csvText}
                  />
                  <View style={styles.importFooter}>
                    <View style={styles.importCopy}>
                      <Text style={styles.importTitle}>{importPreview.prospects.length} preview records</Text>
                      <Text style={styles.importMeta}>
                        {importPreview.errors.length ? importPreview.errors.join(' ') : 'No structural CSV errors found.'}
                      </Text>
                    </View>
                    <ActionButton disabled={Boolean(importPreview.errors.length) || prospectState.loading} onPress={acceptPreview}>
                      {prospectState.loading ? 'Saving...' : 'Save preview'}
                    </ActionButton>
                  </View>
                </Surface>
              </Section>

              <Section
                description="Search, select, and manually move saved sponsor prospects through the pipeline."
                title="Prospects">
                <View style={styles.crmGrid}>
                  <Surface style={styles.listPanel}>
                    <View style={styles.filterRow}>
                      <TextInput
                        onChangeText={setQuery}
                        placeholder="Search company, domain, contact"
                        placeholderTextColor="#7C8782"
                        style={styles.filterInput}
                        value={query}
                      />
                      <TextInput
                        autoCapitalize="characters"
                        onChangeText={setStatusFilter}
                        placeholder="Status"
                        placeholderTextColor="#7C8782"
                        style={styles.filterInputSmall}
                        value={statusFilter}
                      />
                    </View>
                    {filteredProspects.length ? filteredProspects.map((prospect) => (
                      <ProspectRow
                        key={prospect.id || prospect.companyName}
                        onSelect={() => setSelectedId(prospect.id)}
                        prospect={prospect}
                        selected={selectedProspect?.id === prospect.id}
                      />
                    )) : (
                      <EmptyState
                        body="No prospects are loaded yet. Use the CSV preview above to inspect import data."
                        title="No prospects"
                      />
                    )}
                  </Surface>
                  <ProspectDetail
                    loading={prospectState.loading}
                    onUpdateStatus={changeProspectStatus}
                    prospect={selectedProspect}
                  />
                </View>
              </Section>
            </>
          ) : null}

          {activeTab === 'research' ? (
            <Section
              description="Prepare sponsor candidates from approved mock providers. Live search providers can be added later behind the same interface."
              title="Research queue">
              <ResearchQueue
                candidates={researchRun?.candidates || []}
                loading={researchLoading}
                onAccept={acceptResearchCandidate}
                onPrepare={prepareResearchQueue}
              />
            </Section>
          ) : null}

          {activeTab === 'drafts' ? (
            <>
              <Section
                description="Drafts require validation and approval. Sending is deliberately not available from this phase."
                title="Approval queue">
                <ApprovalQueue
                  drafts={outreachDrafts}
                  onApprove={approveDraft}
                  onGenerate={generateOutreachDraft}
                  onPrepareFollowUp={prepareFollowUp}
                  selectedProspect={selectedProspect}
                />
              </Section>

              <Section
                description="Generate proposal previews from selected prospects and starter package definitions."
                title="Proposals">
                <ProposalPreview
                  onGenerate={generateProposal}
                  proposals={proposals}
                  selectedProspect={selectedProspect}
                />
              </Section>
            </>
          ) : null}

          {activeTab === 'pipeline' ? (
            <Section
              description="Pipeline columns are populated by saved sponsor prospect records. Drag-and-drop comes after status updates mature."
              title="Pipeline board">
              <PipelineBoard prospects={prospects} />
            </Section>
          ) : null}

          {activeTab === 'export' ? (
            <Section
              description="Exports the currently loaded sponsor prospect records."
              title="CSV export">
              <Surface style={styles.exportPanel}>
                <Text selectable style={styles.exportText}>{exportSponsorProspectsCsv(prospects)}</Text>
              </Surface>
            </Section>
          ) : null}
        </>
      )}
    </HubScreen>
  );
}

const styles = StyleSheet.create({
  crmGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  csvInput: {
    backgroundColor: 'rgba(5, 11, 10, 0.62)',
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.colors.text,
    fontFamily: CODE_FONT,
    fontSize: 12,
    lineHeight: 18,
    minHeight: 180,
    padding: 14,
  },
  detailBody: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 8,
  },
  detailCopy: {
    flex: 1,
    minWidth: 220,
  },
  detailEyebrow: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  detailHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  detailPanel: {
    flex: 1.1,
    minWidth: 300,
  },
  detailTitle: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 32,
    marginTop: 4,
  },
  exportPanel: {
    backgroundColor: 'rgba(5, 11, 10, 0.62)',
  },
  exportText: {
    color: theme.colors.text,
    fontFamily: CODE_FONT,
    fontSize: 12,
    lineHeight: 18,
  },
  filterInput: {
    backgroundColor: 'rgba(5, 11, 10, 0.62)',
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.colors.text,
    flex: 1,
    fontSize: 14,
    minWidth: 180,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterInputSmall: {
    backgroundColor: 'rgba(5, 11, 10, 0.62)',
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 14,
    minWidth: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  errorText: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  importCopy: {
    flex: 1,
    minWidth: 210,
  },
  importFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 12,
  },
  importMeta: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 2,
  },
  importPanel: {
    borderColor: theme.colors.line,
  },
  importTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
  },
  inquiryCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  inquiryList: {
    gap: 12,
  },
  inquiryMessage: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
  inquiryPanel: {
    borderColor: theme.colors.line,
    gap: 14,
  },
  listPanel: {
    flex: 0.9,
    minWidth: 300,
  },
  approvalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  approvalCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  approvalPanel: {
    borderColor: theme.colors.line,
  },
  draftBody: {
    backgroundColor: 'rgba(5, 11, 10, 0.62)',
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    padding: 12,
  },
  pipelineBoard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  pipelineCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    padding: 10,
  },
  pipelineCardMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 2,
  },
  pipelineCardTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  pipelineColumn: {
    flexBasis: 220,
    flexGrow: 1,
    minHeight: 138,
  },
  pipelineColumnHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pipelineCount: {
    color: theme.colors.accent,
    fontSize: 15,
    fontWeight: '900',
  },
  pipelineEmpty: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 12,
  },
  pipelineTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  prospectMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 2,
  },
  prospectName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  prospectRow: {
    marginBottom: 8,
  },
  prospectRowCopy: {
    flex: 1,
    minWidth: 0,
  },
  prospectRowInner: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  prospectRowSelected: {
    borderColor: theme.colors.accent,
  },
  proposalNotice: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
  },
  proposalPanel: {
    borderColor: 'rgba(108, 199, 255, 0.24)',
  },
  factList: {
    gap: 6,
    marginTop: 10,
  },
  factText: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  researchBody: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 4,
  },
  researchCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  researchCardCopy: {
    flex: 1,
    minWidth: 220,
  },
  researchCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  researchCompany: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
  },
  researchCopy: {
    flex: 1,
    minWidth: 220,
  },
  researchExplanation: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  researchHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  researchList: {
    gap: 12,
    marginTop: 14,
  },
  researchMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 3,
  },
  researchPanel: {
    borderColor: theme.colors.line,
  },
  researchTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
  },
  riskList: {
    backgroundColor: 'rgba(255, 199, 77, 0.08)',
    borderColor: 'rgba(255, 199, 77, 0.24)',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 10,
  },
  riskText: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
  },
  sourceBlock: {
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 16,
    padding: 12,
  },
  sourceEmpty: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  sourceText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 6,
  },
  sourceTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
    marginBottom: 4,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  statTile: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 160,
    flexGrow: 1,
    minHeight: 82,
    padding: 14,
  },
  statValue: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: 7,
  },
  tabPanel: {
    borderColor: theme.colors.line,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});

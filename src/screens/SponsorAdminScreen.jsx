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
import { fetchPlayerAccount } from '../lib/tournamentHostingClient.js';
import {
  exportSponsorProspectsCsv,
  filterSponsorProspects,
  groupProspectsByStage,
  parseSponsorCsv,
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

function ProspectDetail({ prospect }) {
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

export default function SponsorAdminScreen() {
  const hostState = useHostAccount();
  const [prospects, setProspects] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [csvText, setCsvText] = useState(EMPTY_IMPORT);
  const importPreview = useMemo(() => parseSponsorCsv(csvText), [csvText]);
  const filteredProspects = filterSponsorProspects(prospects, { query, status: statusFilter });
  const selectedProspect = prospects.find((prospect) => prospect.id === selectedId) || filteredProspects[0] || null;
  const summary = summarizeSponsorPipeline(prospects);
  const canUseAdmin = Boolean(hostState.account?.hostApproved);

  function acceptPreview() {
    const nextProspects = importPreview.prospects.map((prospect, index) => ({
      ...prospect,
      id: `local-${Date.now()}-${index}`,
    }));

    setProspects(nextProspects);
    setSelectedId(nextProspects[0]?.id || '');
  }

  return (
    <HubScreen
      actions={[
        { label: 'Tournament admin', href: '/admin', variant: 'secondary' },
        { label: 'Public site', href: '/', variant: 'ghost' },
      ]}
      eyebrow="Sponsor Engine"
      footerNote="Sponsor CRM changes in this phase are local preview only. No external messages are sent."
      lead="Phase 2 sponsor CRM workspace for prospects, pipeline review, CSV preview, and data-quality checks."
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
          </Section>

          <Section
            description="Paste CSV data to preview normalized prospects. Accepting preview only updates this local admin session in Phase 2."
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
                <ActionButton disabled={Boolean(importPreview.errors.length)} onPress={acceptPreview}>
                  Load preview
                </ActionButton>
              </View>
            </Surface>
          </Section>

          <Section
            description="Search and filter the current local preview records."
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
              <ProspectDetail prospect={selectedProspect} />
            </View>
          </Section>

          <Section
            description="Pipeline columns are populated by the local preview records. Drag-and-drop comes after persistence is wired."
            title="Pipeline board">
            <PipelineBoard prospects={prospects} />
          </Section>

          <Section
            description="Exports only the local preview data in this phase."
            title="CSV export">
            <Surface style={styles.exportPanel}>
              <Text selectable style={styles.exportText}>{exportSponsorProspectsCsv(prospects)}</Text>
            </Surface>
          </Section>
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
  listPanel: {
    flex: 0.9,
    minWidth: 300,
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
});

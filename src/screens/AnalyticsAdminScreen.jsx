import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  Badge,
  EmptyState,
  HubScreen,
  Section,
  StatPill,
  Surface,
} from '../components/hub-ui.jsx';
import { fetchPlayerAccount, fetchSiteAnalytics } from '../lib/tournamentHostingClient.js';
import { theme } from '../lib/theme.js';

const REPORT_DAYS = 30;

function formatVitalValue(metric, value) {
  if (!Number.isFinite(Number(value))) return 'Not yet provided';
  if (metric === 'CLS') return Number(value).toFixed(3);
  return `${Math.round(Number(value))} ms`;
}

function formatDate(value) {
  if (!value) return 'No data yet';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

function goodRate(vital) {
  return vital?.samples
    ? Math.round(((vital.ratings?.good || 0) / vital.samples) * 100)
    : 0;
}

function MetricCard({ vital }) {
  return (
    <Surface style={styles.metricCard}>
      <View style={styles.rowBetween}>
        <Badge tone={goodRate(vital) >= 75 ? 'green' : goodRate(vital) >= 50 ? 'blue' : 'accent'}>
          {vital.metric}
        </Badge>
        <Text style={styles.metricSamples}>{vital.samples} sample{vital.samples === 1 ? '' : 's'}</Text>
      </View>
      <Text style={styles.metricValue}>{formatVitalValue(vital.metric, vital.average)}</Text>
      <Text style={styles.metricLabel}>Average</Text>
      <View style={styles.metricFooter}>
        <Text style={styles.goodText}>{goodRate(vital)}% good</Text>
        <Text style={styles.mutedText}>
          {vital.ratings?.['needs-improvement'] || 0} improve • {vital.ratings?.poor || 0} poor
        </Text>
      </View>
    </Surface>
  );
}

function DataRow({ label, value, meta }) {
  return (
    <View style={styles.dataRow}>
      <View style={styles.dataCopy}>
        <Text numberOfLines={2} style={styles.dataLabel}>{label}</Text>
        {meta ? <Text numberOfLines={2} style={styles.dataMeta}>{meta}</Text> : null}
      </View>
      <Text style={styles.dataValue}>{value}</Text>
    </View>
  );
}

export default function AnalyticsAdminScreen() {
  const [accountState, setAccountState] = useState({ loading: true, account: null, error: '' });
  const [reportState, setReportState] = useState({ loading: false, report: null, error: '' });
  const account = accountState.account;
  const canReview = Boolean(account?.hostApproved);
  const summary = reportState.report?.summary || null;

  async function loadReport() {
    setReportState((current) => ({ ...current, loading: true, error: '' }));

    try {
      const report = await fetchSiteAnalytics({ days: REPORT_DAYS });
      setReportState({ loading: false, report, error: '' });
    } catch (error) {
      setReportState({
        loading: false,
        report: null,
        error: error instanceof Error ? error.message : 'Site analytics could not be loaded.',
      });
    }
  }

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const result = await fetchPlayerAccount();
        const nextAccount = result.account || null;

        if (!active) return;
        setAccountState({ loading: false, account: nextAccount, error: '' });

        if (nextAccount?.hostApproved) {
          setReportState((current) => ({ ...current, loading: true, error: '' }));

          try {
            const report = await fetchSiteAnalytics({ days: REPORT_DAYS });
            if (active) setReportState({ loading: false, report, error: '' });
          } catch (error) {
            if (active) {
              setReportState({
                loading: false,
                report: null,
                error: error instanceof Error ? error.message : 'Site analytics could not be loaded.',
              });
            }
          }
        }
      } catch (error) {
        if (active) {
          setAccountState({
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

  const totalActivity = (summary?.totals?.pageViews || 0) + (summary?.totals?.linkClicks || 0);
  const hasData = totalActivity > 0 || (summary?.totals?.vitalSamples || 0) > 0;

  return (
    <HubScreen
      actions={[
        { label: 'Tournament admin', href: '/admin', variant: 'secondary' },
        ...(canReview ? [{ label: reportState.loading ? 'Refreshing...' : 'Refresh report', onPress: loadReport }] : []),
      ]}
      eyebrow="Host analytics"
      footerNote="Analytics are anonymous daily aggregates. The site does not store raw events or unique visitor identifiers."
      heroVariant="compact"
      lead="Review route demand, navigation clicks, and field Core Web Vitals without collecting personal data."
      stickyActions={false}
      subtitle={`Rolling ${REPORT_DAYS}-day operational view`}
      title="Site performance analytics">
      {accountState.loading ? (
        <EmptyState body="Checking your host-approved account." title="Loading analytics access" />
      ) : !canReview ? (
        <EmptyState
          action={<ActionButton href="/account">Sign in</ActionButton>}
          body={accountState.error || 'Sign in with a host-approved account before reviewing private site aggregates.'}
          title="Host access required"
        />
      ) : reportState.error ? (
        <EmptyState
          action={<ActionButton onPress={loadReport}>Try again</ActionButton>}
          body={reportState.error}
          title="Analytics are unavailable"
        />
      ) : reportState.loading && !summary ? (
        <EmptyState body="Loading the latest anonymous daily aggregates." title="Building the report" />
      ) : !hasData ? (
        <EmptyState
          action={<ActionButton onPress={loadReport}>Refresh report</ActionButton>}
          body="Collection starts after this release reaches production. No historical activity has been invented or backfilled."
          title="No aggregate data yet"
        />
      ) : (
        <>
          <Section
            description={`${formatDate(summary.period.startDate)} through ${formatDate(summary.period.endDate)}. Counts are activity, not unique people.`}
            title="Overview">
            <Surface style={styles.overviewCard}>
              <View style={styles.statGrid}>
                <StatPill label="Page views" value={String(summary.totals.pageViews)} tone="accent" />
                <StatPill label="Tracked clicks" value={String(summary.totals.linkClicks)} tone="blue" />
                <StatPill label="Vital samples" value={String(summary.totals.vitalSamples)} tone="green" />
                <StatPill label="Days with data" value={String(summary.period.daysWithData)} tone="neutral" />
              </View>
            </Surface>
          </Section>

          <Section
            description="Real browser measurements collected when a page session ends or moves to the background."
            title="Core Web Vitals">
            {summary.vitalMetrics.length ? (
              <View style={styles.metricGrid}>
                {summary.vitalMetrics.map((vital) => <MetricCard key={vital.metric} vital={vital} />)}
              </View>
            ) : (
              <EmptyState body="Field vital samples will appear after production page sessions complete." title="No vital samples yet" />
            )}
          </Section>

          <Section
            description="Use this to prioritize the pages receiving the most real activity."
            title="Top routes">
            <Surface style={styles.listCard}>
              {summary.pages.slice(0, 12).map((page) => (
                <DataRow key={page.path} label={page.path} value={String(page.views)} meta="views" />
              ))}
            </Surface>
          </Section>

          <Section
            description="Destinations are reduced to internal paths or external origins before storage."
            title="Navigation clicks">
            {summary.links.length ? (
              <Surface style={styles.listCard}>
                {summary.links.slice(0, 12).map((link) => (
                  <DataRow
                    key={`${link.from}-${link.to}-${link.external}`}
                    label={link.to}
                    meta={`from ${link.from}${link.external ? ' • external' : ''}`}
                    value={String(link.count)}
                  />
                ))}
              </Surface>
            ) : (
              <EmptyState body="Navigation activity will appear after tracked links are used." title="No clicks yet" />
            )}
          </Section>

          <Section
            description="The latest fourteen aggregate days, newest first."
            title="Daily activity">
            <Surface style={styles.listCard}>
              {summary.daily.slice(-14).reverse().map((day) => (
                <DataRow
                  key={day.date}
                  label={formatDate(day.date)}
                  meta={`${day.linkClicks} clicks • ${day.vitalSamples} vital samples`}
                  value={`${day.pageViews} views`}
                />
              ))}
            </Surface>
          </Section>
        </>
      )}

      <Section
        description="These limits are part of the storage contract, not just dashboard copy."
        title="Privacy guardrails">
        <View style={styles.privacyGrid}>
          <Surface style={styles.privacyCard}>
            <Badge tone="green">Stored</Badge>
            <Text style={styles.privacyTitle}>Daily totals</Text>
            <Text style={styles.privacyBody}>Sanitized paths, destination origins, click counts, and vital summaries.</Text>
          </Surface>
          <Surface style={styles.privacyCard}>
            <Badge tone="accent">Not stored</Badge>
            <Text style={styles.privacyTitle}>Personal or raw data</Text>
            <Text style={styles.privacyBody}>No names, emails, account IDs, cookies, IPs, user agents, query strings, or raw event logs.</Text>
          </Surface>
          <Surface style={styles.privacyCard}>
            <Badge tone="blue">Respected</Badge>
            <Text style={styles.privacyTitle}>Browser privacy signals</Text>
            <Text style={styles.privacyBody}>Global Privacy Control and Do Not Track disable network collection.</Text>
          </Surface>
        </View>
      </Section>
    </HubScreen>
  );
}

const styles = StyleSheet.create({
  dataCopy: {
    flex: 1,
    minWidth: 180,
  },
  dataLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  dataMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  dataRow: {
    alignItems: 'center',
    borderBottomColor: theme.colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  dataValue: {
    color: theme.colors.accent,
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '900',
  },
  goodText: {
    color: theme.colors.success,
    fontSize: 12,
    fontWeight: '900',
  },
  listCard: {
    borderColor: theme.colors.lineStrong,
    paddingVertical: 4,
  },
  metricCard: {
    borderColor: theme.colors.lineStrong,
    flexBasis: 220,
    flexGrow: 1,
    minWidth: 210,
  },
  metricFooter: {
    borderTopColor: theme.colors.line,
    borderTopWidth: 1,
    gap: 4,
    marginTop: 14,
    paddingTop: 12,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  metricSamples: {
    color: theme.colors.muted,
    fontFamily: 'monospace',
    fontSize: 11,
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
    marginTop: 14,
  },
  mutedText: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  overviewCard: {
    borderColor: theme.colors.accentSoft,
  },
  privacyBody: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  privacyCard: {
    borderColor: theme.colors.lineStrong,
    flexBasis: 240,
    flexGrow: 1,
    minWidth: 220,
  },
  privacyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  privacyTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
    marginTop: 12,
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});

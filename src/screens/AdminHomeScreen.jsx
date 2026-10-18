import { Platform, StyleSheet, Text, View } from 'react-native';
import { ActionButton, HubScreen, Section, Surface } from '../components/hub-ui.jsx';
import { ADMIN_COMPETITION_WORKSPACES } from '../lib/adminNavigation.js';
import { theme } from '../lib/theme.js';

export default function AdminHomeScreen() {
  return <HubScreen title="Admin dashboard" eyebrow="Host workspace"
    subtitle="Tournaments and leagues. Separate tools, one account."
    lead="Choose the competition you want to manage. Tournament events and league seasons have their own workspaces."
    actions={[{ label: 'Account', href: '/account', variant: 'secondary' }, { label: 'Public site', href: '/', variant: 'ghost' }]}
    heroVariant="compact" stickyActions={false}
    footerNote="Each workspace keeps its existing host-access checks. Opening a workspace does not publish an event or start a season.">
    <View style={styles.workspaceGrid}>
      {ADMIN_COMPETITION_WORKSPACES.map(workspace => <Section key={workspace.id}
        nativeID={`admin-${workspace.id}`} eyebrow={workspace.eyebrow} title={workspace.title}
        description={workspace.description} style={styles.workspace}>
        <Surface style={styles.panel}>
          {workspace.href ? <>
            <Text style={styles.detail}>{workspace.detail}</Text>
            <Text style={styles.copy}>Use this for individual events and recurring tournament series—not league seasons.</Text>
            <ActionButton href={workspace.href} style={styles.action}>{workspace.action}</ActionButton>
          </> : workspace.links.map((link, index) => <View key={link.href} style={[styles.league, index > 0 && styles.divider]}>
            <Text accessibilityRole="header" aria-level={3} style={styles.cardTitle}>{link.title}</Text>
            <Text style={styles.copy}>{link.description}</Text>
            <ActionButton href={link.href} variant={index === 0 ? 'primary' : 'secondary'} style={styles.action}>{link.action}</ActionButton>
          </View>)}
        </Surface>
      </Section>)}
    </View>
    <Section title="Site tools" description="Shared administration, separate from competition management.">
      <View style={styles.tools}>
        <ActionButton href="/admin/analytics" variant="secondary" style={styles.action}>Site analytics</ActionButton>
        <ActionButton href="/admin/sponsors" variant="secondary" style={styles.action}>Sponsors</ActionButton>
      </View>
      <Text style={styles.note}>Sign in with your approved host account inside the workspace you need. No new account is required.</Text>
    </Section>
  </HubScreen>;
}

const styles = StyleSheet.create({
  workspaceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' },
  workspace: { flexGrow: 1, flexShrink: 1, flexBasis: 420, minWidth: 0 },
  panel: { gap: 18 },
  league: { gap: 12 },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.lineStrong, paddingTop: 20 },
  cardTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '700' },
  detail: { color: theme.colors.accent, fontSize: 14, fontWeight: '700' },
  copy: { color: theme.colors.muted, fontSize: 14, lineHeight: 22 },
  action: { flexShrink: 1, minWidth: 0, maxWidth: '100%', marginRight: 0 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  note: { color: theme.colors.muted, fontSize: 12, lineHeight: 19, marginTop: 14,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'DM Mono, monospace' }) },
});

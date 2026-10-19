import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, HubScreen, Section, Surface } from '../components/hub-ui.jsx';
import { ADMIN_COMPETITION_WORKSPACES } from '../lib/adminNavigation.js';
import { theme } from '../lib/theme.js';

export default function AdminHomeScreen() {
  return <HubScreen title="Admin dashboard" eyebrow="Host workspace"
    lead="Choose a tournament or league to manage."
    actions={[{ label: 'Account', href: '/account', variant: 'secondary' }, { label: 'Public site', href: '/', variant: 'ghost' }]}
    heroVariant="compact" stickyActions={false}
    footerNote="1V1 Tournaments · Host workspace">
    <View style={styles.workspaceGrid}>
      {ADMIN_COMPETITION_WORKSPACES.map(workspace => <Section key={workspace.id}
        nativeID={`admin-${workspace.id}`} eyebrow={workspace.eyebrow} title={workspace.title}
        description={workspace.description} style={styles.workspace}>
        <Surface style={styles.panel}>
          {workspace.href ? <>
            <Text style={styles.detail}>{workspace.detail}</Text>
            <Text style={styles.copy}>Run a single event or a recurring tournament series.</Text>
            <ActionButton href={workspace.href} style={styles.action}>{workspace.action}</ActionButton>
          </> : workspace.links.map((link, index) => <View key={link.href} style={[styles.league, index > 0 && styles.divider]}>
            <Text accessibilityRole="header" aria-level={3} style={styles.cardTitle}>{link.title}</Text>
            <Text style={styles.copy}>{link.description}</Text>
            <ActionButton href={link.href} variant="secondary" style={styles.action}>{link.action}</ActionButton>
          </View>)}
        </Surface>
      </Section>)}
    </View>
    <Section title="Site tools" description="Audience insights and sponsor management.">
      <Surface style={styles.toolsPanel}>
        <View style={styles.tools}>
          <ActionButton href="/admin/analytics" variant="secondary" style={styles.action}>Site analytics</ActionButton>
          <ActionButton href="/admin/sponsors" variant="secondary" style={styles.action}>Sponsors</ActionButton>
        </View>
        <Text style={styles.note}>Use your approved host account to access these tools.</Text>
      </Surface>
    </Section>
  </HubScreen>;
}

const styles = StyleSheet.create({
  workspaceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' },
  workspace: { flexGrow: 1, flexShrink: 1, flexBasis: 420, minWidth: 0 },
  panel: { gap: 18, backgroundColor: theme.colors.surface, borderColor: theme.colors.lineStrong, borderRadius: theme.radius.md, padding: 24 },
  league: { gap: 10 },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.line, paddingTop: 24, marginTop: 6 },
  cardTitle: { color: theme.colors.text, fontSize: 20, lineHeight: 27, fontWeight: '700', letterSpacing: -0.3 },
  detail: { color: theme.colors.text, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  copy: { color: theme.colors.muted, fontSize: 14, lineHeight: 23 },
  action: { flexShrink: 1, minWidth: 0, maxWidth: '100%', alignSelf: 'flex-start', marginRight: 0, marginBottom: 0 },
  toolsPanel: { gap: 16, backgroundColor: theme.colors.surface, borderColor: theme.colors.line, borderRadius: theme.radius.md, padding: 24 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  note: { color: theme.colors.muted, fontSize: 13, lineHeight: 20 },
});

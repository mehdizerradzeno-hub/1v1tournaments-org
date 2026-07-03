import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, Badge, BulletList, EmptyState, HubScreen, Section, StatPill, Surface } from '../components/hub-ui.jsx';
import { siteData } from '../lib/siteData.js';

export default function ContactScreen() {
  const contactHref = `mailto:${siteData.site.contactEmail}`;

  return (
    <HubScreen
      actions={[
        { label: 'Email', href: contactHref, external: true },
        { label: 'About', href: '/about', variant: 'secondary' },
        { label: 'Spades', href: '/spades', variant: 'ghost' },
      ]}
      eyebrow="Contact"
      footerNote={siteData.site.adminNote}
      lead="Use this page for organization questions, tournament questions, and public site feedback."
      stats={[
        { label: 'Email', value: 'Open', tone: 'blue' },
        { label: 'YouTube', value: 'Live', tone: 'green' },
        { label: 'Response', value: 'Manual', tone: 'accent' },
      ]}
      subtitle="Reach the organization directly"
      title="Contact 1v1 Tournaments">
      <Section description="This page gives visitors a clear way to reach the organization." title="Primary contact">
        <Surface style={styles.contactCard}>
          <View style={styles.contactTopRow}>
            <Badge tone="blue">Email</Badge>
            <Text style={styles.contactDomain}>{siteData.site.domain}</Text>
          </View>
          <Text style={styles.contactEmail}>{siteData.site.contactEmail}</Text>
          <Text style={styles.contactCopy}>{siteData.organization.responseNote}</Text>
          <View style={styles.contactActions}>
            <ActionButton href={contactHref} external>
              Open email
            </ActionButton>
            <ActionButton href="/about" variant="secondary">
              Learn about the organization
            </ActionButton>
          </View>
        </Surface>
      </Section>

      <Section description="Public links stay in one place so the website stays easy to verify." title="Public channels">
        <View style={styles.channelRow}>
          <View style={styles.channelStat}>
            <StatPill label="Website" value={siteData.site.domain} tone="accent" />
          </View>
          <View style={styles.channelStat}>
            <StatPill label="Spades" value="Live" tone="green" />
          </View>
          <View style={styles.channelStat}>
            <StatPill label="Euchre" value="Coming soon" tone="blue" />
          </View>
        </View>
        <BulletList
          items={[
            'Live and replay links are published on the site.',
            'Rules and results are posted on the public pages.',
            'No buy-in or wagering language is used on the public site.',
          ]}
          tone="blue"
        />
      </Section>

      <Section description="Keep messages short so they are easy to route by hand for now." title="What to include in your message">
        <EmptyState
          body="Send the tournament name, the game, and the date if you need help with a public event page."
          title="Tournament questions"
        />
      </Section>
    </HubScreen>
  );
}

const styles = StyleSheet.create({
  channelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  channelStat: {
    marginRight: 10,
    marginBottom: 10,
  },
  contactActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  contactCard: {
    borderColor: 'rgba(214, 162, 78, 0.24)',
  },
  contactCopy: {
    color: '#AAB4AE',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  contactDomain: {
    color: '#D6A24E',
    fontSize: 12,
    letterSpacing: 0.8,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  contactEmail: {
    color: '#F4EFE6',
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '800',
  },
  contactTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
});

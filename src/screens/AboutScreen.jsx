import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, Badge, BulletList, HubScreen, Section, StatPill, Surface } from '../components/hub-ui.jsx';
import { getGamePath, siteData } from '../lib/siteData.js';

export default function AboutScreen() {
  const contactHref = `mailto:${siteData.site.contactEmail}`;

  return (
    <HubScreen
      actions={[
        { label: 'Spades', href: getGamePath(siteData.site.primaryGameSlug) },
        { label: 'Contact', href: '/contact', variant: 'secondary' },
        { label: 'Live', href: '/live', variant: 'ghost' },
      ]}
      eyebrow="About"
      footerNote={siteData.site.adminNote}
      lead={siteData.organization.summary}
      stats={[
        { label: 'Spades', value: 'Live', tone: 'green' },
        { label: 'Euchre', value: 'Coming soon', tone: 'blue' },
        { label: 'Entry', value: 'Free', tone: 'accent' },
      ]}
      subtitle="The public organization site for free-entry card-game events"
      title="About 1v1 Tournaments">
      <Section description="A simple public presence is enough while the tournament hub stays easy to maintain." title="What we do">
        <Surface style={styles.aboutCard}>
          <View style={styles.aboutTopRow}>
            <Badge tone="blue">Public website</Badge>
            <Text style={styles.aboutDomain}>{siteData.site.domain}</Text>
          </View>
          <Text style={styles.aboutMission}>{siteData.organization.mission}</Text>
          <BulletList items={siteData.organization.focus} tone="blue" />
          <View style={styles.aboutActions}>
            <ActionButton href={getGamePath(siteData.site.primaryGameSlug)}>Open Spades</ActionButton>
            <ActionButton href={contactHref} external variant="secondary">
              Email the organization
            </ActionButton>
          </View>
        </Surface>
      </Section>

      <Section description="The public site stays intentionally small so updates can be made quickly from one config file." title="How the site works">
        <Surface style={styles.noteCard}>
          <Text style={styles.noteCopy}>
            Public schedules, stream links, rules, and results are published on the website without connecting to production game databases yet.
          </Text>
          <BulletList
            items={[
              'Spades tournaments are the public launch lane.',
              'Euchre is reserved and marked as coming soon.',
              'The same layout can support future card games later.',
            ]}
            tone="accent"
          />
        </Surface>
      </Section>

      <Section description="Use these links if you need to reach the organization directly." title="Contact points">
        <View style={styles.contactRow}>
          <View style={styles.contactStat}>
            <StatPill label="Email" value={siteData.site.contactEmail} tone="blue" />
          </View>
          <View style={styles.contactStat}>
            <StatPill label="YouTube" value="Channel" tone="green" />
          </View>
          <View style={styles.contactStat}>
            <StatPill label="Site" value={siteData.site.domain} tone="accent" />
          </View>
        </View>
        <View style={styles.contactActions}>
          <ActionButton href={contactHref} external>
            Open email
          </ActionButton>
          <ActionButton href="/contact" variant="secondary">
            Contact page
          </ActionButton>
        </View>
      </Section>
    </HubScreen>
  );
}

const styles = StyleSheet.create({
  aboutActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  aboutCard: {
    borderColor: 'rgba(108, 199, 255, 0.24)',
  },
  aboutDomain: {
    color: '#D6A24E',
    fontSize: 12,
    letterSpacing: 0.8,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  aboutMission: {
    color: '#F4EFE6',
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
    marginBottom: 12,
  },
  aboutTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  contactActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  contactStat: {
    marginRight: 10,
    marginBottom: 10,
  },
  noteCard: {
    borderColor: 'rgba(214, 162, 78, 0.24)',
  },
  noteCopy: {
    color: '#AAB4AE',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
});

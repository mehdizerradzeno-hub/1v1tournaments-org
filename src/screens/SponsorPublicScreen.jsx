import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, Badge, BulletList, HubScreen, Section, Surface } from '../components/hub-ui.jsx';
import {
  createSponsorInquiryRecord,
  SPONSOR_BUDGET_RANGES,
  SPONSOR_INTEREST_OPTIONS,
  STARTER_SPONSORSHIP_PACKAGES,
  validateSponsorInquiry,
} from '../lib/sponsorEngine/index.js';
import { getGamePath, siteData } from '../lib/siteData.js';
import { theme } from '../lib/theme.js';

const EMPTY_INQUIRY = {
  name: '',
  company: '',
  workEmail: '',
  website: '',
  sponsorshipInterest: 'Tournament sponsorship',
  estimatedBudgetRange: 'Not sure yet',
  desiredTiming: '',
  message: '',
  consent: false,
};

function PackageCard({ item }) {
  const price = item.price ? `$${item.price.toLocaleString()}` : item.billingType === 'in-kind' ? 'In-kind' : 'Custom';

  return (
    <Surface style={styles.packageCard}>
      <View style={styles.packageTop}>
        <View style={styles.packageCopy}>
          <Text style={styles.packageName}>{item.name}</Text>
          <Text style={styles.packagePrice}>{price}</Text>
        </View>
        <Badge tone={item.public ? 'green' : 'neutral'}>{item.public ? 'Public' : 'Private'}</Badge>
      </View>
      <BulletList items={item.benefits.slice(0, 5)} tone="accent" />
      <Text style={styles.packageNote}>Configurable after sponsor review. No guaranteed impressions or business outcomes.</Text>
    </Surface>
  );
}

function SponsorInquiryForm() {
  const [form, setForm] = useState(EMPTY_INQUIRY);
  const [submitted, setSubmitted] = useState(false);
  const validation = useMemo(() => validateSponsorInquiry(form), [form]);

  function updateField(field, value) {
    setSubmitted(false);
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  }

  function submit() {
    const result = createSponsorInquiryRecord(form);

    if (!result.errors.length) {
      setSubmitted(true);
    }
  }

  return (
    <Surface style={styles.formCard}>
      <View style={styles.formGrid}>
        <TextInput
          onChangeText={(value) => updateField('name', value)}
          placeholder="Name"
          placeholderTextColor="#7C8782"
          style={styles.input}
          value={form.name}
        />
        <TextInput
          onChangeText={(value) => updateField('company', value)}
          placeholder="Company"
          placeholderTextColor="#7C8782"
          style={styles.input}
          value={form.company}
        />
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={(value) => updateField('workEmail', value)}
          placeholder="Work email"
          placeholderTextColor="#7C8782"
          style={styles.input}
          value={form.workEmail}
        />
        <TextInput
          autoCapitalize="none"
          onChangeText={(value) => updateField('website', value)}
          placeholder="Website"
          placeholderTextColor="#7C8782"
          style={styles.input}
          value={form.website}
        />
      </View>

      <View style={styles.optionBlock}>
        <Text style={styles.optionLabel}>Sponsorship interest</Text>
        <View style={styles.optionRow}>
          {SPONSOR_INTEREST_OPTIONS.slice(0, 5).map((option) => (
            <ActionButton
              key={option}
              onPress={() => updateField('sponsorshipInterest', option)}
              variant={form.sponsorshipInterest === option ? 'primary' : 'secondary'}>
              {option}
            </ActionButton>
          ))}
        </View>
      </View>

      <View style={styles.optionBlock}>
        <Text style={styles.optionLabel}>Budget range</Text>
        <View style={styles.optionRow}>
          {SPONSOR_BUDGET_RANGES.slice(0, 6).map((option) => (
            <ActionButton
              key={option}
              onPress={() => updateField('estimatedBudgetRange', option)}
              variant={form.estimatedBudgetRange === option ? 'primary' : 'secondary'}>
              {option}
            </ActionButton>
          ))}
        </View>
      </View>

      <TextInput
        onChangeText={(value) => updateField('desiredTiming', value)}
        placeholder="Desired timing"
        placeholderTextColor="#7C8782"
        style={styles.input}
        value={form.desiredTiming}
      />
      <TextInput
        multiline
        onChangeText={(value) => updateField('message', value)}
        placeholder="Message"
        placeholderTextColor="#7C8782"
        style={[styles.input, styles.messageInput]}
        value={form.message}
      />

      <ActionButton
        onPress={() => updateField('consent', !form.consent)}
        variant={form.consent ? 'primary' : 'secondary'}>
        {form.consent ? 'Consent confirmed' : 'Confirm consent'}
      </ActionButton>

      {validation.errors.length ? (
        <View style={styles.errorBox}>
          {validation.errors.map((error) => (
            <Text key={error} style={styles.errorText}>{error}</Text>
          ))}
        </View>
      ) : null}

      <View style={styles.formFooter}>
        <ActionButton disabled={!validation.accepted} onPress={submit}>
          Submit inquiry
        </ActionButton>
        <Text style={styles.privacyText}>
          Inquiry review is manual. Private CRM details are never shown publicly.
        </Text>
      </View>
      {submitted ? <Text style={styles.successText}>Inquiry validated locally and ready for safe CRM intake.</Text> : null}
    </Surface>
  );
}

function MediaKitSection() {
  return (
    <Surface style={styles.mediaCard}>
      <View style={styles.mediaGrid}>
        <View style={styles.mediaCopy}>
          <Badge tone="blue">Media kit</Badge>
          <Text style={styles.mediaTitle}>1v1 Competitive Spades</Text>
          <Text style={styles.mediaBody}>
            A competitive head-to-head version of spades built around focused matches, tournaments, content, and community events.
          </Text>
        </View>
        <View style={styles.mediaFacts}>
          <Text style={styles.factLabel}>Company</Text>
          <Text style={styles.factValue}>1V1 SPADES LLC</Text>
          <Text style={styles.factLabel}>Product</Text>
          <Text style={styles.factValue}>Live on the Apple App Store</Text>
          <Text style={styles.factLabel}>Positioning</Text>
          <Text style={styles.factValue}>No partner. No excuses.</Text>
        </View>
      </View>
      <Text style={styles.metricNote}>
        Audience metrics are omitted publicly until verified. Admin can add verified SponsorMetric records later.
      </Text>
    </Surface>
  );
}

export default function SponsorPublicScreen({ mediaKitOnly = false }) {
  return (
    <HubScreen
      actions={[
        { label: 'Spades', href: getGamePath(siteData.site.primaryGameSlug) },
        { label: mediaKitOnly ? 'Sponsor Us' : 'Media Kit', href: mediaKitOnly ? '/sponsors' : '/media-kit', variant: 'secondary' },
        { label: 'Contact', href: '/contact', variant: 'ghost' },
      ]}
      eyebrow={mediaKitOnly ? 'Media Kit' : 'Sponsor Us'}
      footerNote="Sponsorship details are reviewed manually. No sponsor claim is public until approved."
      lead={mediaKitOnly
        ? 'Brand overview, partnership categories, verified product facts, and sponsor package starting points.'
        : '1v1 Competitive Spades turns the classic game into a focused head-to-head competition. Partner with us through tournaments, content, community events, and custom campaigns.'}
      stats={[
        { label: 'Product', value: 'App Store', tone: 'green' },
        { label: 'Format', value: '1v1', tone: 'blue' },
        { label: 'Metrics', value: 'Verified only', tone: 'accent' },
      ]}
      subtitle="Reach a competitive card-game community"
      title={mediaKitOnly ? 'Media Kit' : 'Reach a Competitive Card-Game Community'}>
      <Section description="Clear product facts only. No inflated audience claims." title="Brand overview">
        <MediaKitSection />
      </Section>

      <Section description="Starter packages are configurable and require sponsor review before any agreement." title="Sponsorship opportunities">
        <View style={styles.packageGrid}>
          {STARTER_SPONSORSHIP_PACKAGES.filter((item) => item.public).map((item) => (
            <PackageCard key={item.id} item={item} />
          ))}
        </View>
      </Section>

      {!mediaKitOnly ? (
        <Section description="Submit a partnership inquiry for manual review." title="Sponsor inquiry">
          <SponsorInquiryForm />
        </Section>
      ) : null}
    </HubScreen>
  );
}

const styles = StyleSheet.create({
  errorBox: {
    backgroundColor: 'rgba(255, 199, 77, 0.08)',
    borderColor: 'rgba(255, 199, 77, 0.24)',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    marginTop: 12,
    padding: 10,
  },
  errorText: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
  },
  factLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    marginTop: 10,
    textTransform: 'uppercase',
  },
  factValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
    marginTop: 2,
  },
  formCard: {
    borderColor: 'rgba(214, 162, 78, 0.24)',
  },
  formFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 12,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  input: {
    backgroundColor: 'rgba(5, 11, 10, 0.62)',
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.colors.text,
    flex: 1,
    fontSize: 14,
    minWidth: 220,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  mediaBody: {
    color: theme.colors.muted,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 10,
  },
  mediaCard: {
    borderColor: 'rgba(108, 199, 255, 0.24)',
  },
  mediaCopy: {
    flex: 1,
    minWidth: 260,
  },
  mediaFacts: {
    flexBasis: 260,
    flexGrow: 1,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  mediaTitle: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
    marginTop: 10,
  },
  messageInput: {
    marginTop: 10,
    minHeight: 120,
  },
  metricNote: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 16,
  },
  optionBlock: {
    marginTop: 14,
  },
  optionLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  packageCard: {
    flexBasis: 260,
    flexGrow: 1,
  },
  packageCopy: {
    flex: 1,
    minWidth: 180,
  },
  packageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  packageName: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 25,
  },
  packageNote: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 12,
  },
  packagePrice: {
    color: theme.colors.accent,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
    marginTop: 4,
  },
  packageTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  privacyText: {
    color: theme.colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    minWidth: 220,
  },
  successText: {
    color: theme.colors.green,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
    marginTop: 12,
  },
});

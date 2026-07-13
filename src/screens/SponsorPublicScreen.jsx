import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, Badge, BulletList, HubScreen, Section, Surface } from '../components/hub-ui.jsx';
import {
  SPONSOR_BUDGET_RANGES,
  SPONSOR_INTEREST_OPTIONS,
  STARTER_SPONSORSHIP_PACKAGES,
  validateSponsorInquiry,
} from '../lib/sponsorEngine/index.js';
import { submitSponsorInquiry } from '../lib/tournamentHostingClient.js';
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

const SPONSOR_VALUE_CARDS = [
  {
    label: 'Visibility',
    title: 'Show up around tournament nights',
    body: 'Approved sponsor placements can appear on sponsor pages, event pages, stream mentions, Discord posts, and results recaps.',
  },
  {
    label: 'Community',
    title: 'Reach players without gambling language',
    body: 'The platform is free-entry and skill-based, so partnership copy can stay clean, sponsor-safe, and easy to explain.',
  },
  {
    label: 'Content',
    title: 'Attach your brand to recurring moments',
    body: 'Tournament pages, match links, live coverage, and winner posts create repeatable surfaces for future campaigns.',
  },
];

const SPONSOR_FLOW_STEPS = [
  {
    title: 'Review packages',
    body: 'Pick a starting point or ask for a custom fit.',
  },
  {
    title: 'Send inquiry',
    body: 'Share company, timing, interest, and contact details.',
  },
  {
    title: 'Host review',
    body: 'We confirm fit, safety, placement, and campaign scope.',
  },
  {
    title: 'Approve placement',
    body: 'Nothing goes public until both sides approve the details.',
  },
];

const PACKAGE_FIT_COPY = {
  'community-supporter': 'Best for local support and first-time community tests.',
  'tournament-sponsor': 'Best for one named tournament or a focused launch night.',
  'featured-partner': 'Best for several appearances across content and results.',
  'presenting-sponsor': 'Best for a larger custom campaign or season-style presence.',
  'in-kind-sponsor': 'Best for non-cash support such as equipment, food, or creator tools.',
};

function trimValue(value) {
  return String(value || '').trim();
}

function hasValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimValue(value));
}

function hasValidWebsite(value) {
  const raw = trimValue(value);

  if (!raw) return true;

  try {
    const url = raw.startsWith('http://') || raw.startsWith('https://') ? new URL(raw) : new URL(`https://${raw}`);
    return Boolean(url.hostname.includes('.'));
  } catch {
    return false;
  }
}

function getInquiryRequirements(form) {
  return [
    { label: 'Your name', complete: Boolean(trimValue(form.name)) },
    { label: 'Company name', complete: Boolean(trimValue(form.company)) },
    { label: 'Valid work email', complete: hasValidEmail(form.workEmail) },
    { label: 'Website is valid or blank', complete: hasValidWebsite(form.website) },
    { label: 'Message is at least 10 characters', complete: trimValue(form.message).length >= 10 },
    { label: 'Consent confirmed', complete: Boolean(form.consent) },
  ];
}

function ValueCard({ item }) {
  return (
    <Surface style={styles.valueCard}>
      <Badge tone="blue">{item.label}</Badge>
      <Text style={styles.valueTitle}>{item.title}</Text>
      <Text style={styles.valueBody}>{item.body}</Text>
    </Surface>
  );
}

function FlowStep({ index, item }) {
  return (
    <View style={styles.flowStep}>
      <View style={styles.flowNumber}>
        <Text style={styles.flowNumberText}>{index + 1}</Text>
      </View>
      <Text style={styles.flowTitle}>{item.title}</Text>
      <Text style={styles.flowBody}>{item.body}</Text>
    </View>
  );
}

function LabeledInput({ fieldStyle, helper, inputStyle, label, ...props }) {
  return (
    <View style={[styles.field, fieldStyle]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor="#7C8782"
        style={[styles.input, inputStyle]}
        {...props}
      />
      {helper ? <Text style={styles.fieldHelper}>{helper}</Text> : null}
    </View>
  );
}

function RequirementRow({ item }) {
  return (
    <View style={styles.requirementRow}>
      <View style={[styles.requirementMark, item.complete && styles.requirementMarkComplete]}>
        <Text style={[styles.requirementMarkText, item.complete && styles.requirementMarkTextComplete]}>
          {item.complete ? 'OK' : '-'}
        </Text>
      </View>
      <Text style={[styles.requirementText, item.complete && styles.requirementTextComplete]}>
        {item.label}
      </Text>
    </View>
  );
}

function PackageCard({ item }) {
  const price = item.price ? `$${item.price.toLocaleString()}` : item.billingType === 'in-kind' ? 'In-kind' : 'Custom';
  const fitCopy = PACKAGE_FIT_COPY[item.id] || 'Configurable after sponsor review.';

  return (
    <Surface style={styles.packageCard}>
      <View style={styles.packageTop}>
        <View style={styles.packageCopy}>
          <Text style={styles.packageName}>{item.name}</Text>
          <Text style={styles.packagePrice}>{price}</Text>
        </View>
        <Badge tone={item.public ? 'green' : 'neutral'}>{item.public ? 'Public' : 'Private'}</Badge>
      </View>
      <Text style={styles.packageFit}>{fitCopy}</Text>
      <Text style={styles.packageSubhead}>Includes</Text>
      <BulletList items={item.benefits.slice(0, 5)} tone="accent" />
      <Text style={styles.packageNote}>Configurable after sponsor review. No guaranteed impressions or business outcomes.</Text>
    </Surface>
  );
}

function SponsorInquiryForm() {
  const [form, setForm] = useState(EMPTY_INQUIRY);
  const [submitState, setSubmitState] = useState({ submitting: false, submitted: false, error: '', confirmation: '' });
  const validation = useMemo(() => validateSponsorInquiry(form), [form]);
  const requirements = useMemo(() => getInquiryRequirements(form), [form]);
  const completeCount = requirements.filter((item) => item.complete).length;
  const remainingCount = requirements.length - completeCount;
  const hasStartedInquiry = Boolean(
    trimValue(form.name)
      || trimValue(form.company)
      || trimValue(form.workEmail)
      || trimValue(form.website)
      || trimValue(form.desiredTiming)
      || trimValue(form.message)
      || form.consent
  );

  function updateField(field, value) {
    setSubmitState({ submitting: false, submitted: false, error: '', confirmation: '' });
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  }

  async function submit() {
    if (!validation.accepted || submitState.submitting) {
      return;
    }

    setSubmitState({ submitting: true, submitted: false, error: '', confirmation: '' });

    try {
      const result = await submitSponsorInquiry({
        ...form,
        sourcePage: '/sponsors',
      });

      setSubmitState({
        submitting: false,
        submitted: true,
        error: '',
        confirmation: result.inquiry?.id || 'received',
      });
      setForm(EMPTY_INQUIRY);
    } catch (error) {
      setSubmitState({
        submitting: false,
        submitted: false,
        error: error instanceof Error ? error.message : 'Sponsor inquiry could not be submitted.',
        confirmation: '',
      });
    }
  }

  return (
    <Surface style={styles.formCard}>
      <View style={styles.formIntro}>
        <View style={styles.formIntroCopy}>
          <Badge tone={remainingCount ? 'accent' : 'green'}>
            {remainingCount ? `${remainingCount} item${remainingCount === 1 ? '' : 's'} left` : 'Ready'}
          </Badge>
          <Text style={styles.formTitle}>Start a sponsor conversation</Text>
          <Text style={styles.formBody}>
            A short inquiry is enough. We will review fit, confirm details, and keep sponsor claims private until approved.
          </Text>
        </View>
        <View style={styles.requirementPanel}>
          {requirements.map((item) => (
            <RequirementRow key={item.label} item={item} />
          ))}
        </View>
      </View>

      <View style={styles.formStep}>
        <Text style={styles.formStepLabel}>1. Contact</Text>
        <View style={styles.formGrid}>
          <LabeledInput
            label="Your name"
            onChangeText={(value) => updateField('name', value)}
            placeholder="Name"
            value={form.name}
          />
          <LabeledInput
            label="Company"
            onChangeText={(value) => updateField('company', value)}
            placeholder="Company or brand"
            value={form.company}
          />
          <LabeledInput
            autoCapitalize="none"
            keyboardType="email-address"
            label="Work email"
            onChangeText={(value) => updateField('workEmail', value)}
            placeholder="name@company.com"
            value={form.workEmail}
          />
          <LabeledInput
            autoCapitalize="none"
            helper="Optional, but helpful for review."
            label="Website"
            onChangeText={(value) => updateField('website', value)}
            placeholder="company.com"
            value={form.website}
          />
        </View>
      </View>

      <View style={styles.formStep}>
        <Text style={styles.formStepLabel}>2. Partnership fit</Text>
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

        <View style={styles.optionBlockSpaced}>
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

        <LabeledInput
          fieldStyle={styles.fullField}
          helper="Example: next tournament, this month, or Q3."
          label="Desired timing"
          onChangeText={(value) => updateField('desiredTiming', value)}
          placeholder="When would you like to be involved?"
          value={form.desiredTiming}
        />
      </View>

      <View style={styles.formStep}>
        <Text style={styles.formStepLabel}>3. Message</Text>
        <LabeledInput
          fieldStyle={styles.fullField}
          helper="Tell us what you want to support and what outcome you care about."
          inputStyle={styles.messageInput}
          label="Message"
          multiline
          onChangeText={(value) => updateField('message', value)}
          placeholder="A few sentences is perfect."
          textAlignVertical="top"
          value={form.message}
        />
      </View>

      <ActionButton
        onPress={() => updateField('consent', !form.consent)}
        variant={form.consent ? 'primary' : 'secondary'}>
        {form.consent ? '[x] Consent confirmed' : '[ ] I agree to be contacted about sponsorship'}
      </ActionButton>

      {validation.errors.length && hasStartedInquiry ? (
        <View style={styles.errorBox}>
          {validation.errors.map((error) => (
            <Text key={error} style={styles.errorText}>{error}</Text>
          ))}
        </View>
      ) : null}

      <View style={styles.formFooter}>
        <ActionButton disabled={!validation.accepted || submitState.submitting} onPress={submit}>
          {submitState.submitting ? 'Submitting...' : validation.accepted ? 'Submit inquiry' : 'Complete form to submit'}
        </ActionButton>
        <Text style={styles.privacyText}>
          Manual review only. No public placement, sponsor claim, or outreach is created from this form.
        </Text>
      </View>
      {submitState.error ? <Text style={styles.errorText}>{submitState.error}</Text> : null}
      {submitState.submitted ? (
        <Text style={styles.successText}>
          Inquiry received for manual review. Reference: {submitState.confirmation}
        </Text>
      ) : null}
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
            A head-to-head card-game platform built around tournaments, streamable match moments, public results, and community events.
          </Text>
        </View>
        <View style={styles.mediaFacts}>
          <Text style={styles.factLabel}>Company</Text>
          <Text style={styles.factValue}>1V1 SPADES LLC</Text>
          <Text style={styles.factLabel}>Product</Text>
          <Text style={styles.factValue}>Live on the Apple App Store</Text>
          <Text style={styles.factLabel}>Event model</Text>
          <Text style={styles.factValue}>Free-entry tournaments with account-based signups</Text>
        </View>
      </View>
      <Text style={styles.metricNote}>
        Audience metrics stay private until verified. Sponsorships are reviewed manually and no outcomes are guaranteed.
      </Text>
    </Surface>
  );
}

function SponsorFlowSection() {
  return (
    <Section
      description="Simple path, clear expectations, no surprise public claims."
      title="How sponsorship works">
      <Surface style={styles.flowPanel}>
        <View style={styles.flowGrid}>
          {SPONSOR_FLOW_STEPS.map((step, index) => (
            <FlowStep key={step.title} index={index} item={step} />
          ))}
        </View>
      </Surface>
    </Section>
  );
}

function SponsorValueSection() {
  return (
    <Section
      description="What a sponsor gets from this platform today, without inflated audience promises."
      title="Why sponsor 1v1 Tournaments">
      <View style={styles.valueGrid}>
        {SPONSOR_VALUE_CARDS.map((item) => (
          <ValueCard key={item.title} item={item} />
        ))}
      </View>
    </Section>
  );
}

export default function SponsorPublicScreen({ mediaKitOnly = false }) {
  return (
    <HubScreen
      actions={[
        { label: 'Sponsor inquiry', href: '/sponsors' },
        { label: 'Media Kit', href: '/media-kit', variant: 'secondary' },
        { label: 'Spades', href: getGamePath(siteData.site.primaryGameSlug), variant: 'ghost' },
      ]}
      eyebrow={mediaKitOnly ? 'Media Kit' : 'Sponsor Us'}
      footerNote="Sponsorship details are reviewed manually. No sponsor claim is public until approved."
      lead={mediaKitOnly
        ? 'A clean sponsor overview with product facts, partnership options, approval rules, and starter package ranges.'
        : 'Sponsor free-entry competitive Spades tournaments, stream moments, and community events with clear approval before anything goes public.'}
      stats={[
        { label: 'Product', value: 'App Store', tone: 'green' },
        { label: 'Format', value: '1v1', tone: 'blue' },
        { label: 'Review', value: 'Manual', tone: 'accent' },
      ]}
      subtitle="Sponsor software"
      title={mediaKitOnly ? 'Media Kit' : 'Sponsor 1v1 Tournaments'}>
      <SponsorFlowSection />

      <Section description="Clear product facts only. No inflated audience claims." title="Brand overview">
        <MediaKitSection />
      </Section>

      <SponsorValueSection />

      <Section description="Starter packages are configurable and require sponsor review before any agreement." title="Sponsorship opportunities">
        <View style={styles.packageGrid}>
          {STARTER_SPONSORSHIP_PACKAGES.filter((item) => item.public).map((item) => (
            <PackageCard key={item.id} item={item} />
          ))}
        </View>
      </Section>

      {!mediaKitOnly ? (
        <Section description="One short form starts the conversation. The host reviews every inquiry manually." title="Sponsor inquiry">
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
  field: {
    flex: 1,
    minWidth: 220,
  },
  fieldHelper: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 6,
  },
  fieldLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
    marginBottom: 7,
    textTransform: 'uppercase',
  },
  flowBody: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 8,
  },
  flowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  flowNumber: {
    alignItems: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.14)',
    borderColor: theme.colors.accent,
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  flowNumberText: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
  },
  flowPanel: {
    borderColor: 'rgba(214, 162, 78, 0.32)',
  },
  flowStep: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 210,
    flexGrow: 1,
    minHeight: 160,
    padding: 14,
  },
  flowTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
    marginTop: 12,
  },
  formBody: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 8,
  },
  formCard: {
    borderColor: 'rgba(214, 162, 78, 0.32)',
    gap: 16,
  },
  formFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  formIntro: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  formIntroCopy: {
    flex: 1.2,
    minWidth: 260,
  },
  formStep: {
    backgroundColor: 'rgba(255, 255, 255, 0.025)',
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  formStepLabel: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  formTitle: {
    color: theme.colors.text,
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 31,
    marginTop: 10,
  },
  fullField: {
    marginTop: 12,
  },
  input: {
    backgroundColor: 'rgba(5, 11, 10, 0.62)',
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 14,
    minHeight: 48,
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
    borderColor: 'rgba(94, 127, 163, 0.24)',
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
    marginTop: 0,
  },
  optionBlockSpaced: {
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
  packageFit: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    marginBottom: 12,
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
  packageSubhead: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    marginBottom: 8,
    textTransform: 'uppercase',
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
  requirementMark: {
    alignItems: 'center',
    borderColor: theme.colors.line,
    borderRadius: 999,
    borderWidth: 1,
    height: 27,
    justifyContent: 'center',
    width: 42,
  },
  requirementMarkComplete: {
    backgroundColor: 'rgba(78, 201, 140, 0.12)',
    borderColor: theme.colors.green,
  },
  requirementMarkText: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 13,
  },
  requirementMarkTextComplete: {
    color: theme.colors.text,
  },
  requirementPanel: {
    backgroundColor: 'rgba(5, 11, 10, 0.62)',
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    minWidth: 240,
    padding: 12,
  },
  requirementRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  requirementText: {
    color: theme.colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  requirementTextComplete: {
    color: theme.colors.text,
  },
  successText: {
    color: theme.colors.green,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
    marginTop: 12,
  },
  valueBody: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 8,
  },
  valueCard: {
    borderColor: theme.colors.line,
    flexBasis: 240,
    flexGrow: 1,
  },
  valueGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  valueTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
    marginTop: 10,
  },
});

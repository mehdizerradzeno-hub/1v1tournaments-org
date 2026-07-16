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

const SPONSOR_PROOF_POINTS = [
  {
    label: 'Product',
    value: '1v1 Spades',
    body: 'Published on the Apple App Store with live head-to-head gameplay.',
  },
  {
    label: 'Platform',
    value: 'Live hub',
    body: 'Account-based signup, brackets, match links, results, and sponsor workflows are running on 1v1tournaments.org.',
  },
  {
    label: 'Event proof',
    value: '16-player event',
    body: 'The format has already been tested through a completed 16-player tournament.',
  },
  {
    label: 'Direction',
    value: 'Raleigh league',
    body: 'Built toward a Raleigh 1v1 Spades League with local sponsor opportunities.',
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

const PACKAGE_SCOPE_COPY = {
  'community-supporter': 'Community',
  'tournament-sponsor': 'Event',
  'featured-partner': 'League',
  'presenting-sponsor': 'Championship',
  'in-kind-sponsor': 'Support',
};

const RECOMMENDED_PACKAGE_ID = 'featured-partner';

const SPONSOR_READINESS_ITEMS = [
  {
    label: 'Audience context',
    value: 'Player-first',
    body: 'Sponsors sit near tournament signup, match, bracket, stream, and result moments instead of generic ad space.',
  },
  {
    label: 'Inventory',
    value: 'Reviewable',
    body: 'Every placement can be reviewed before it goes live, so partner copy stays accurate and sponsor-safe.',
  },
  {
    label: 'Operations',
    value: 'Host controlled',
    body: 'The sponsor CRM keeps inquiries, prospects, proposals, and approvals separate from public tournament pages.',
  },
];

const SPONSOR_PLACEMENTS = [
  {
    label: 'Event page',
    title: 'Presented-by tournament placement',
    body: 'Sponsor mention near the event summary, signup path, bracket context, and player-facing tournament details.',
  },
  {
    label: 'Stream night',
    title: 'Live table and recap moments',
    body: 'Optional sponsor copy around live coverage, Discord reminders, and post-match recap language after approval.',
  },
  {
    label: 'Results archive',
    title: 'Winner and result visibility',
    body: 'Approved sponsor line can carry into result pages, winner posts, and replay/archive surfaces.',
  },
  {
    label: 'Community',
    title: 'Discord and email-ready copy',
    body: 'Short sponsor-safe blurbs can support reminders and announcements without gambling or payout language.',
  },
];

const SPONSOR_SAFETY_ITEMS = [
  'Free-entry tournaments only; no wagering, deposits, or prize-value claims.',
  'No sponsor logo, message, or claim appears publicly until the host approves it.',
  'Audience and performance numbers stay private until they are verified.',
  'High-risk categories are paused for extra review before outreach or placement.',
];

const SPONSOR_AFTER_SUBMIT_STEPS = [
  {
    title: 'Fit review',
    body: 'The host reviews brand fit, category safety, timing, and the sponsorship goal.',
  },
  {
    title: 'Placement plan',
    body: 'You get a simple proposed package, surfaces, copy, and next tournament opportunity.',
  },
  {
    title: 'Approval',
    body: 'Nothing is published until both sides approve the placement details.',
  },
];

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

function SponsorHero() {
  return (
    <Surface style={styles.sponsorHero}>
      <View style={styles.sponsorHeroCopy}>
        <Badge tone="accent">Founding sponsor path</Badge>
        <Text style={styles.sponsorHeroTitle}>
          Put your brand beside the tournament moments players already care about.
        </Text>
        <Text style={styles.sponsorHeroBody}>
          1v1 Tournaments connects local sponsors to skill-based card-game events, stream nights, bracket pages, and results recaps with manual approval before anything goes public.
        </Text>
        <View style={styles.sponsorHeroActions}>
          <ActionButton href="/sponsors#sponsor-inquiry">
            Request sponsor review
          </ActionButton>
          <ActionButton href="/media-kit" variant="secondary">Open media kit</ActionButton>
        </View>
      </View>
      <View style={styles.sponsorHeroPanel}>
        <Text style={styles.sponsorHeroPanelLabel}>Raleigh league direction</Text>
        <Text style={styles.sponsorHeroPanelTitle}>Local sponsors around real tournament moments.</Text>
        <View style={styles.sponsorHeroSignalGrid}>
          <View style={styles.sponsorHeroSignal}>
            <Text style={styles.sponsorHeroSignalValue}>Free</Text>
            <Text style={styles.sponsorHeroSignalLabel}>Entry</Text>
          </View>
          <View style={styles.sponsorHeroSignal}>
            <Text style={styles.sponsorHeroSignalValue}>No</Text>
            <Text style={styles.sponsorHeroSignalLabel}>Buy-ins</Text>
          </View>
          <View style={styles.sponsorHeroSignal}>
            <Text style={styles.sponsorHeroSignalValue}>Manual</Text>
            <Text style={styles.sponsorHeroSignalLabel}>Approval</Text>
          </View>
        </View>
      </View>
    </Surface>
  );
}

function ProofPointCard({ item }) {
  return (
    <Surface style={styles.proofCard}>
      <Text style={styles.proofLabel}>{item.label}</Text>
      <Text style={styles.proofValue}>{item.value}</Text>
      <Text style={styles.proofBody}>{item.body}</Text>
    </Surface>
  );
}

function SponsorProofSection() {
  return (
    <Section
      description="Real product and event milestones, stated plainly without inflated audience claims."
      title="What is already real">
      <View style={styles.proofGrid}>
        {SPONSOR_PROOF_POINTS.map((item) => (
          <ProofPointCard key={item.label} item={item} />
        ))}
      </View>
    </Section>
  );
}

function DecisionCard({ item }) {
  return (
    <Surface style={styles.decisionCard}>
      <Text style={styles.decisionLabel}>{item.label}</Text>
      <Text style={styles.decisionValue}>{item.value}</Text>
      <Text style={styles.decisionBody}>{item.body}</Text>
    </Surface>
  );
}

function PlacementCard({ item }) {
  return (
    <Surface style={styles.placementCard}>
      <Badge tone="accent">{item.label}</Badge>
      <Text style={styles.placementTitle}>{item.title}</Text>
      <Text style={styles.placementBody}>{item.body}</Text>
    </Surface>
  );
}

function AfterSubmitStep({ index, item }) {
  return (
    <View style={styles.afterStep}>
      <View style={styles.afterStepNumber}>
        <Text style={styles.afterStepNumberText}>{index + 1}</Text>
      </View>
      <View style={styles.afterStepCopy}>
        <Text style={styles.afterStepTitle}>{item.title}</Text>
        <Text style={styles.afterStepBody}>{item.body}</Text>
      </View>
    </View>
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
  const isRecommended = item.id === RECOMMENDED_PACKAGE_ID;
  const scope = PACKAGE_SCOPE_COPY[item.id] || 'Custom';

  return (
    <Surface style={[styles.packageCard, isRecommended && styles.packageCardRecommended]}>
      <View style={styles.packageTop}>
        <View style={styles.packageCopy}>
          <Text style={styles.packageScope}>{scope}</Text>
          <Text style={styles.packageName}>{item.name}</Text>
          <Text style={styles.packagePrice}>{price}</Text>
        </View>
        <Badge tone={isRecommended ? 'accent' : item.public ? 'green' : 'neutral'}>
          {isRecommended ? 'Best league fit' : item.public ? 'Public' : 'Private'}
        </Badge>
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
  const progressPercent = `${Math.round((completeCount / requirements.length) * 100)}%`;
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
          <Text style={styles.formTitle}>Request a sponsor review</Text>
          <Text style={styles.formBody}>
            Send the basics. The host reviews fit, timing, category safety, and placement before any sponsor claim goes public.
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: progressPercent }]} />
          </View>
          <Text style={styles.progressText}>
            {completeCount} of {requirements.length} sponsor details ready.
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
        {form.consent ? '[x] Consent confirmed' : '[ ] Contact me about sponsorship'}
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
          {submitState.submitting ? 'Submitting...' : validation.accepted ? 'Send sponsor inquiry' : 'Complete details to send'}
        </ActionButton>
        <Text style={styles.privacyText}>
          Manual review only. No public placement, sponsor claim, invoice, payment request, or outreach is created from this form.
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
      <View style={styles.mediaDeliverables}>
        <View style={styles.mediaDeliverable}>
          <Text style={styles.mediaDeliverableLabel}>Sponsor page</Text>
          <Text style={styles.mediaDeliverableBody}>Public inquiry and packages.</Text>
        </View>
        <View style={styles.mediaDeliverable}>
          <Text style={styles.mediaDeliverableLabel}>Event surfaces</Text>
          <Text style={styles.mediaDeliverableBody}>Tournament, stream, and result placements.</Text>
        </View>
        <View style={styles.mediaDeliverable}>
          <Text style={styles.mediaDeliverableLabel}>Host review</Text>
          <Text style={styles.mediaDeliverableBody}>Manual approval before anything public.</Text>
        </View>
      </View>
    </Surface>
  );
}

function SponsorReadinessSection() {
  return (
    <Section
      description="The sponsor offer is intentionally simple: visible tournament moments, clean category rules, and host approval before anything goes public."
      title="Sponsor readiness">
      <View style={styles.decisionGrid}>
        {SPONSOR_READINESS_ITEMS.map((item) => (
          <DecisionCard key={item.label} item={item} />
        ))}
      </View>
    </Section>
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

function SponsorPlacementSection() {
  return (
    <Section
      description="Sponsors can start with one tournament surface and expand after the first event proves the fit."
      title="Placement map">
      <View style={styles.placementGrid}>
        {SPONSOR_PLACEMENTS.map((item) => (
          <PlacementCard key={item.label} item={item} />
        ))}
      </View>
      <Surface style={styles.placementPreview}>
        <View style={styles.placementPreviewCopy}>
          <Badge tone="accent">Example placement</Badge>
          <Text style={styles.placementPreviewTitle}>Raleigh 1v1 Spades League presented by your brand</Text>
          <Text style={styles.placementPreviewBody}>
            Sponsor recognition can sit beside the next event, bracket, stream, and results recap without interrupting player actions.
          </Text>
        </View>
        <View style={styles.placementPreviewStack}>
          <View style={styles.previewPill}><Text style={styles.previewPillText}>Event page</Text></View>
          <View style={styles.previewPill}><Text style={styles.previewPillText}>Stream night</Text></View>
          <View style={styles.previewPill}><Text style={styles.previewPillText}>Results recap</Text></View>
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

function SponsorSafetySection() {
  return (
    <Section
      description="Production sponsor pages need trust. These rules keep the offer clean for players, partners, and app-store review."
      title="Brand safety standard">
      <Surface style={styles.safetyPanel}>
        <View style={styles.safetyCopy}>
          <Badge tone="green">Manual approval</Badge>
          <Text style={styles.safetyTitle}>No public sponsor claim without review.</Text>
          <Text style={styles.safetyBody}>
            This page is built for legitimate sponsorship conversations. It avoids inflated metrics, gambling language, and automatic sponsor publication.
          </Text>
        </View>
        <View style={styles.safetyList}>
          <BulletList items={SPONSOR_SAFETY_ITEMS} tone="green" />
        </View>
      </Surface>
    </Section>
  );
}

function SponsorAfterSubmitSection() {
  return (
    <Section
      description="Sponsors should know what happens after they send the form."
      title="After you send an inquiry">
      <Surface style={styles.afterPanel}>
        {SPONSOR_AFTER_SUBMIT_STEPS.map((item, index) => (
          <AfterSubmitStep key={item.title} index={index} item={item} />
        ))}
      </Surface>
    </Section>
  );
}

function SponsorFinalCta({ mediaKitOnly }) {
  return (
    <Surface style={styles.finalCta}>
      <View style={styles.finalCtaCopy}>
        <Badge tone="accent">{mediaKitOnly ? 'Next step' : 'Ready when you are'}</Badge>
        <Text style={styles.finalCtaTitle}>{mediaKitOnly ? 'Turn the media kit into a sponsor inquiry.' : 'Start with one clean sponsorship conversation.'}</Text>
        <Text style={styles.finalCtaBody}>
          Keep the first partnership small, reviewable, and tied to a real tournament night. Scale only after the placement works.
        </Text>
      </View>
      <View style={styles.finalCtaActions}>
        <ActionButton href="/sponsors#sponsor-inquiry">Sponsor inquiry</ActionButton>
        <ActionButton href="/media-kit" variant="secondary">Media kit</ActionButton>
      </View>
    </Surface>
  );
}

export default function SponsorPublicScreen({ mediaKitOnly = false }) {
  return (
    <HubScreen
      actions={[
        { label: 'Sponsor inquiry', href: '/sponsors#sponsor-inquiry' },
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
        { label: 'Milestone', value: '16-player event', tone: 'blue' },
        { label: 'Review', value: 'Manual', tone: 'accent' },
      ]}
      subtitle="Sponsor software"
      title={mediaKitOnly ? 'Media Kit' : 'Sponsor 1v1 Tournaments'}>
      <SponsorHero />

      <SponsorProofSection />

      <SponsorReadinessSection />

      <SponsorFlowSection />

      <Section description="Clear product facts only. No inflated audience claims." title="Brand overview">
        <MediaKitSection />
      </Section>

      <SponsorPlacementSection />

      <SponsorValueSection />

      <SponsorSafetySection />

      <Section
        description="Compare starter packages by scope. Final deliverables are confirmed manually before anything is published."
        title="Sponsorship packages">
        <View style={styles.packageGrid}>
          {STARTER_SPONSORSHIP_PACKAGES.filter((item) => item.public).map((item) => (
            <PackageCard key={item.id} item={item} />
          ))}
        </View>
      </Section>

      {!mediaKitOnly ? (
        <Section
          description="One short form starts the conversation. The host reviews every inquiry manually."
          nativeID="sponsor-inquiry"
          title="Sponsor inquiry">
          <SponsorInquiryForm />
        </Section>
      ) : null}

      <SponsorAfterSubmitSection />

      <SponsorFinalCta mediaKitOnly={mediaKitOnly} />
    </HubScreen>
  );
}

const styles = StyleSheet.create({
  afterPanel: {
    borderColor: 'rgba(214, 162, 78, 0.26)',
    gap: 12,
  },
  afterStep: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  afterStepBody: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 4,
  },
  afterStepCopy: {
    flex: 1,
    minWidth: 0,
  },
  afterStepNumber: {
    alignItems: 'center',
    backgroundColor: 'rgba(214, 162, 78, 0.14)',
    borderColor: theme.colors.accent,
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  afterStepNumberText: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
  },
  afterStepTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
  },
  decisionBody: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 8,
  },
  decisionCard: {
    borderColor: 'rgba(94, 127, 163, 0.26)',
    flexBasis: 250,
    flexGrow: 1,
  },
  decisionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  decisionLabel: {
    color: theme.colors.blue,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  decisionValue: {
    color: theme.colors.text,
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 31,
    marginTop: 8,
  },
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
  finalCta: {
    alignItems: 'center',
    borderColor: 'rgba(214, 162, 78, 0.34)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    justifyContent: 'space-between',
  },
  finalCtaActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  finalCtaBody: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 8,
  },
  finalCtaCopy: {
    flex: 1,
    minWidth: 260,
  },
  finalCtaTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
    marginTop: 10,
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
  mediaDeliverable: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: theme.colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 190,
    flexGrow: 1,
    padding: 12,
  },
  mediaDeliverableBody: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 4,
  },
  mediaDeliverableLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  mediaDeliverables: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
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
  packageCardRecommended: {
    backgroundColor: 'rgba(214, 162, 78, 0.09)',
    borderColor: 'rgba(214, 162, 78, 0.52)',
    ...theme.shadow.premium,
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
  packageScope: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 15,
    marginBottom: 5,
    textTransform: 'uppercase',
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
  placementBody: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 8,
  },
  placementCard: {
    flexBasis: 240,
    flexGrow: 1,
  },
  placementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  placementPreview: {
    alignItems: 'center',
    backgroundColor: 'rgba(5, 11, 10, 0.78)',
    borderColor: 'rgba(214, 162, 78, 0.34)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    justifyContent: 'space-between',
    marginTop: 14,
  },
  placementPreviewBody: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 8,
  },
  placementPreviewCopy: {
    flex: 1.3,
    minWidth: 260,
  },
  placementPreviewStack: {
    flex: 1,
    gap: 10,
    minWidth: 220,
  },
  placementPreviewTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
    marginTop: 10,
  },
  placementTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
    marginTop: 10,
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
  progressFill: {
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    height: '100%',
  },
  progressText: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 7,
  },
  progressTrack: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(214, 162, 78, 0.24)',
    borderRadius: 999,
    borderWidth: 1,
    height: 10,
    marginTop: 14,
    overflow: 'hidden',
  },
  previewPill: {
    backgroundColor: 'rgba(214, 162, 78, 0.10)',
    borderColor: 'rgba(214, 162, 78, 0.28)',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  previewPillText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  proofBody: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 8,
  },
  proofCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.025)',
    borderColor: 'rgba(244, 239, 230, 0.12)',
    flexBasis: 220,
    flexGrow: 1,
  },
  proofGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  proofLabel: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  proofValue: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: 8,
  },
  safetyBody: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 8,
  },
  safetyCopy: {
    flex: 1,
    minWidth: 260,
  },
  safetyList: {
    flex: 1,
    minWidth: 260,
  },
  safetyPanel: {
    alignItems: 'flex-start',
    borderColor: 'rgba(78, 201, 140, 0.3)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  safetyTitle: {
    color: theme.colors.text,
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 31,
    marginTop: 10,
  },
  successText: {
    color: theme.colors.green,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
    marginTop: 12,
  },
  sponsorHero: {
    alignItems: 'stretch',
    backgroundColor: 'rgba(5, 11, 10, 0.82)',
    borderColor: 'rgba(214, 162, 78, 0.38)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    marginBottom: 22,
    overflow: 'hidden',
    ...theme.shadow.premium,
  },
  sponsorHeroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 18,
  },
  sponsorHeroBody: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 26,
    marginTop: 12,
    maxWidth: 720,
  },
  sponsorHeroCopy: {
    flex: 1.45,
    minWidth: 280,
  },
  sponsorHeroPanel: {
    backgroundColor: 'rgba(214, 162, 78, 0.08)',
    borderColor: 'rgba(214, 162, 78, 0.24)',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'space-between',
    minWidth: 260,
    padding: 18,
  },
  sponsorHeroPanelLabel: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.9,
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  sponsorHeroPanelTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: 10,
  },
  sponsorHeroSignal: {
    backgroundColor: 'rgba(5, 11, 10, 0.55)',
    borderColor: 'rgba(244, 239, 230, 0.12)',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 92,
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sponsorHeroSignalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 22,
  },
  sponsorHeroSignalLabel: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 13,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  sponsorHeroSignalValue: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
  },
  sponsorHeroTitle: {
    color: theme.colors.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 40,
    marginTop: 12,
    maxWidth: 760,
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

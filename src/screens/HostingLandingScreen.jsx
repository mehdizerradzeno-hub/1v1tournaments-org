import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, HubScreen, Section } from '../components/hub-ui.jsx';
import {
  HOSTING_BENEFITS,
  HOSTING_DASHBOARD_PATH,
  HOSTING_FAQS,
  HOSTING_PASS,
  HOSTING_REQUEST_HREF,
  HOSTING_STEPS,
  HOSTING_SUPPORT_EMAIL,
} from '../lib/hostingLandingContent.js';
import { theme } from '../lib/theme.js';
import '../styles/hostingLanding.css';

const bracketRounds = [
  { label: 'ROUND 01', matches: ['Match 01', 'Match 02', 'Match 03', 'Match 04'] },
  { label: 'SEMIFINAL', matches: ['Match 05', 'Match 06'] },
  { label: 'FINAL', matches: ['Match 07'] },
];

function RequestAccessButton({ variant = 'primary' }) {
  return <ActionButton external href={HOSTING_REQUEST_HREF} variant={variant}>Request Hosting Access</ActionButton>;
}

function DashboardButton({ variant = 'secondary' }) {
  return <ActionButton href={HOSTING_DASHBOARD_PATH} variant={variant}>Open Hosting Dashboard</ActionButton>;
}

function BracketPreview() {
  return (
    <View dataSet={{ hostingPreview: 'true' }} style={styles.preview}>
      <View style={styles.previewTop}>
        <View>
          <Text style={styles.eyebrow}>FORMAT PREVIEW</Text>
          <Text style={styles.previewTitle}>An eight-player field, one clear path.</Text>
        </View>
        <Text style={styles.previewBadge}>ILLUSTRATIVE</Text>
      </View>
      <View accessibilityLabel="Illustrative eight-player single-elimination bracket layout" dataSet={{ hostingBracket: 'true' }}>
        {bracketRounds.map((round) => (
          <View dataSet={{ hostingBracketRound: 'true' }} key={round.label}>
            <Text style={styles.roundLabel}>{round.label}</Text>
            <View dataSet={{ hostingMatchList: 'true' }}>
              {round.matches.map((match) => (
                <View dataSet={{ hostingMatch: 'true' }} key={match} style={styles.match}>
                  <Text style={styles.matchLabel}>{match}</Text>
                  <View style={styles.matchSlot}><View style={styles.slotLine} /><Text style={styles.slotText}>Player slot</Text></View>
                  <View style={styles.matchSlot}><View style={styles.slotLine} /><Text style={styles.slotText}>Player slot</Text></View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
      <Text style={styles.previewCaption}>
        Illustrative bracket structure, not a tournament result or product screenshot. A verified product capture is required before publication.
      </Text>
    </View>
  );
}

function FaqItem({ item, open, onToggle }) {
  const panelId = `hosting-faq-${item.id}`;
  return (
    <View dataSet={{ hostingFaqItem: 'true' }} style={styles.faqItem}>
      <Pressable
        accessibilityLabel={item.question}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-controls={panelId}
        aria-expanded={open}
        dataSet={{ hostingFaqButton: 'true' }}
        onPress={onToggle}
        style={styles.faqButton}>
        <Text style={styles.faqQuestion}>{item.question}</Text>
        <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.faqIcon}>{open ? '−' : '+'}</Text>
      </Pressable>
      <View aria-hidden={!open} nativeID={panelId} style={[styles.faqAnswerWrap, !open && styles.faqAnswerHidden]}>
        <Text style={styles.faqAnswer}>{item.answer}</Text>
      </View>
    </View>
  );
}

export default function HostingLandingScreen() {
  const [openFaqId, setOpenFaqId] = useState(null);

  return (
    <HubScreen
      accountHref="/account"
      footerNote="Organizer software is separate from free player entry."
      lead="Tournament-hosting software for competitive card-game organizers, venues, and communities."
      publicShell
      showHero={false}
      stickyActions={false}
      title="Host a Spades tournament">
      <View dataSet={{ hostingLanding: 'true' }} style={styles.page}>
        <View dataSet={{ hostingHero: 'true' }} style={styles.hero}>
          <View dataSet={{ hostingHeroCopy: 'true' }} style={styles.heroCopy}>
            <Text style={styles.eyebrow}>1V1 HOSTING / SPADES PILOT</Text>
            <Text accessibilityRole="header" aria-level={1} dataSet={{ hostingHeroTitle: 'true' }} style={styles.heroTitle}>
              HOST THE COMPETITION.{'\n'}OWN THE EXPERIENCE.
            </Text>
            <Text style={styles.heroBody}>
              Tournament-hosting software for competitive card-game organizers, venues, and esports communities. Our first pilot helps you run one head-to-head Spades event with up to eight players.
            </Text>
            <View dataSet={{ hostingActions: 'true' }} style={styles.actions}>
              <RequestAccessButton />
              <DashboardButton />
            </View>
            <Text style={styles.heroNote}>Access requests are reviewed manually. No checkout is live for this pilot.</Text>
          </View>
          <View dataSet={{ hostingHeroAside: 'true' }} style={styles.heroAside}>
            <Text style={styles.asideLabel}>THE PILOT FIELD</Text>
            <Text style={styles.asideNumber}>08</Text>
            <Text style={styles.asideTitle}>Players. One event.</Text>
            <View style={styles.asideRule} />
            <Text style={styles.asideBody}>Build the lobby first. Start when your field is ready. The event allowance is used only after a successful start and first-round assignments.</Text>
            <Text style={styles.asideFoot}>SINGLE-EVENT HOSTING PASS / $15 USD</Text>
          </View>
        </View>

        <View dataSet={{ hostingFactGrid: 'true' }} style={styles.factGrid}>
          <View style={styles.fact}><Text style={styles.factValue}>01</Text><Text style={styles.factLabel}>Tournament included</Text></View>
          <View style={styles.fact}><Text style={styles.factValue}>08</Text><Text style={styles.factLabel}>Player capacity</Text></View>
          <View style={styles.fact}><Text style={styles.factValue}>30</Text><Text style={styles.factLabel}>Calendar days from purchase to start</Text></View>
        </View>

        <Section eyebrow="FOR ORGANIZERS" title="A clear path from setup to start" description="The pilot focuses on the steps an organizer needs to prepare an eight-player Spades event.">
          <View dataSet={{ hostingBenefitGrid: 'true' }} style={styles.cardGrid}>
            {HOSTING_BENEFITS.map((benefit) => (
              <View key={benefit.number} style={styles.benefitCard}>
                <Text style={styles.cardIndex}>{benefit.number} / HOSTING</Text>
                <Text style={styles.cardTitle}>{benefit.title}</Text>
                <Text style={styles.cardBody}>{benefit.body}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section eyebrow="THE BRACKET" title="See the shape of the competition" description="An honest format preview while a privacy-reviewed capture of the real product is prepared.">
          <BracketPreview />
        </Section>

        <Section eyebrow="THE PROCESS" title="How hosting works" description="Access and key delivery are handled personally during the pilot.">
          <View dataSet={{ hostingStepGrid: 'true' }} style={styles.cardGrid}>
            {HOSTING_STEPS.map((step) => (
              <View key={step.number} style={styles.stepCard}>
                <Text style={styles.stepNumber}>{step.number}</Text>
                <Text style={styles.cardTitle}>{step.title}</Text>
                <Text style={styles.cardBody}>{step.body}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section eyebrow="PILOT OFFER" title="One event. Straightforward terms." description="The organizer fee covers software access; player entry remains free under the Hub rules.">
          <View dataSet={{ hostingPricing: 'true' }} style={styles.pricing}>
            <View style={styles.pricingMain}>
              <Text style={styles.eyebrow}>SINGLE-EVENT HOSTING PASS</Text>
              <Text style={styles.price}>${HOSTING_PASS.priceUsd}<Text style={styles.priceUnit}> USD / one-time</Text></Text>
              <Text style={styles.pricingLead}>One Spades tournament with up to eight players. No automatic renewal.</Text>
              <View style={styles.pricingAction}><RequestAccessButton /></View>
              <Text style={styles.smallCopy}>Payment instructions and access are confirmed directly. No online checkout is available yet.</Text>
            </View>
            <View style={styles.pricingDetails}>
              <Text style={styles.detailTitle}>WHAT IS INCLUDED</Text>
              <Text style={styles.detailItem}>One tournament allowance</Text>
              <Text style={styles.detailItem}>Up to eight players</Text>
              <Text style={styles.detailItem}>Original pass valid 30 calendar days from purchase to start</Text>
              <Text style={styles.detailItem}>Key redemption and lobby creation use no event allowance</Text>
              <Text style={styles.detailItem}>Allowance used after successful start and first-round assignments</Text>
            </View>
          </View>
        </Section>

        <View dataSet={{ hostingRoadmap: 'true' }} style={styles.roadmap}>
          <View><Text style={styles.eyebrow}>CAPACITY ROADMAP</Text><Text style={styles.roadmapTitle}>Planning a larger field?</Text></View>
          <Text style={styles.roadmapBody}>Larger-capacity hosting is being evaluated. It is not currently available for purchase through this pilot.</Text>
        </View>

        <Section eyebrow="GOOD TO KNOW" title="Organizer FAQ" description="The pilot terms, timing, and account path in one place.">
          <View dataSet={{ hostingFaq: 'true' }}>
            {HOSTING_FAQS.map((item) => (
              <FaqItem
                item={item}
                key={item.id}
                onToggle={() => setOpenFaqId(openFaqId === item.id ? null : item.id)}
                open={openFaqId === item.id}
              />
            ))}
          </View>
        </Section>

        <Section eyebrow="SUPPORT & POLICY" title="Help is close to the event" description="Use the owning Hub account when requesting access or support.">
          <View dataSet={{ hostingSupportGrid: 'true' }} style={styles.cardGrid}>
            <View style={styles.supportCard}>
              <Text style={styles.cardIndex}>PRIVATE DELIVERY</Text>
              <Text style={styles.cardTitle}>Issued by Mehdi</Text>
              <Text style={styles.cardBody}>Keys are issued and delivered privately after payment and account details are confirmed. Delivery is usually the same day; allow 1–3 business days after both are confirmed.</Text>
            </View>
            <View style={styles.supportCard}>
              <Text style={styles.cardIndex}>24/7 SUPPORT</Text>
              <Text style={styles.cardTitle}>Reach us by email</Text>
              <Text style={styles.cardBody}>For missing access, a wrong-account sign-in, rejected keys, expiry, rescheduling, or an interrupted event, email {HOSTING_SUPPORT_EMAIL}. Do not include passwords.</Text>
              <ActionButton external href={`mailto:${HOSTING_SUPPORT_EMAIL}`} variant="secondary">Email hosting support</ActionButton>
            </View>
            <View style={styles.supportCard}>
              <Text style={styles.cardIndex}>PLAYER ENTRY</Text>
              <Text style={styles.cardTitle}>Free to enter</Text>
              <Text style={styles.cardBody}>The $15 fee is for organizer software. Player entry remains free under the existing Hub rules: no buy-in and no wagering.</Text>
              <ActionButton href="/rules" variant="secondary">Read Hub rules</ActionButton>
            </View>
          </View>
        </Section>

        <View dataSet={{ hostingClosing: 'true' }} style={styles.closing}>
          <Text style={styles.eyebrow}>READY TO ORGANIZE?</Text>
          <Text accessibilityRole="header" aria-level={2} style={styles.closingTitle}>Make the next bracket yours.</Text>
          <Text style={styles.closingBody}>Request pilot access, or return to the hosting dashboard with your existing 1V1 Account Hub account.</Text>
          <View dataSet={{ hostingActions: 'true' }} style={styles.actions}>
            <RequestAccessButton />
            <DashboardButton />
          </View>
        </View>
      </View>
    </HubScreen>
  );
}

const styles = StyleSheet.create({
  page: { gap: 8, paddingBottom: 36 },
  eyebrow: { color: theme.colors.accent, fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  hero: { backgroundColor: '#080D14', borderColor: 'rgba(214,162,78,0.28)', borderRadius: 24, borderTopWidth: 2, borderWidth: 1, marginBottom: 20, overflow: 'hidden' },
  heroCopy: { justifyContent: 'center', padding: 40 },
  heroTitle: { color: theme.colors.text, fontFamily: 'DM Sans, Arial, sans-serif', fontSize: 62, fontWeight: '900', letterSpacing: -2.5, lineHeight: 66, marginTop: 18 },
  heroBody: { color: theme.colors.text, fontSize: 17, lineHeight: 28, marginTop: 22, maxWidth: 640 },
  heroNote: { color: theme.colors.muted, fontSize: 12, lineHeight: 20, marginTop: 4 },
  actions: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', marginTop: 24 },
  heroAside: { backgroundColor: '#111923', justifyContent: 'space-between', padding: 34 },
  asideLabel: { color: theme.colors.accent, fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  asideNumber: { color: theme.colors.text, fontFamily: 'DM Sans, Arial, sans-serif', fontSize: 112, fontWeight: '900', letterSpacing: -7, lineHeight: 120 },
  asideTitle: { color: theme.colors.text, fontSize: 23, fontWeight: '800', letterSpacing: -0.4 },
  asideRule: { backgroundColor: theme.colors.accent, height: 2, marginVertical: 26, width: 44 },
  asideBody: { color: theme.colors.muted, fontSize: 14, lineHeight: 23 },
  asideFoot: { color: theme.colors.accent, fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 28 },
  factGrid: { marginBottom: 30 },
  fact: { backgroundColor: '#0C131D', borderColor: theme.colors.lineStrong, borderRadius: 14, borderWidth: 1, padding: 20 },
  factValue: { color: theme.colors.accent, fontFamily: 'DM Mono, monospace', fontSize: 25, fontWeight: '700' },
  factLabel: { color: theme.colors.text, fontSize: 13, fontWeight: '600', lineHeight: 19, marginTop: 7 },
  cardGrid: { marginTop: 4 },
  benefitCard: { backgroundColor: '#111923', borderColor: theme.colors.lineStrong, borderRadius: 18, borderWidth: 1, minWidth: 0, padding: 26 },
  stepCard: { backgroundColor: '#0C131D', borderColor: theme.colors.lineStrong, borderRadius: 18, borderWidth: 1, minWidth: 0, padding: 25 },
  supportCard: { backgroundColor: '#111923', borderColor: theme.colors.lineStrong, borderRadius: 18, borderWidth: 1, minWidth: 0, padding: 25 },
  cardIndex: { color: theme.colors.accent, fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  cardTitle: { color: theme.colors.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.35, lineHeight: 27, marginTop: 22 },
  cardBody: { color: theme.colors.muted, fontSize: 15, lineHeight: 24, marginTop: 12 },
  preview: { backgroundColor: '#0C131D', borderColor: theme.colors.lineStrong, borderRadius: 20, borderWidth: 1, overflow: 'hidden', padding: 26 },
  previewTop: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 18, justifyContent: 'space-between', marginBottom: 28 },
  previewTitle: { color: theme.colors.text, fontSize: 23, fontWeight: '800', letterSpacing: -0.4, marginTop: 9 },
  previewBadge: { borderColor: theme.colors.accent, borderRadius: 999, borderWidth: 1, color: theme.colors.accent, fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: '700', letterSpacing: 1, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 8 },
  roundLabel: { color: theme.colors.accent, fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 12 },
  match: { backgroundColor: '#111923', borderColor: theme.colors.lineStrong, borderRadius: 12, borderWidth: 1, minWidth: 0, padding: 13 },
  matchLabel: { color: theme.colors.muted, fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: '600', marginBottom: 9 },
  matchSlot: { alignItems: 'center', borderTopColor: theme.colors.line, borderTopWidth: 1, flexDirection: 'row', gap: 9, minHeight: 28 },
  slotLine: { backgroundColor: theme.colors.accent, height: 4, width: 4, borderRadius: 2 },
  slotText: { color: theme.colors.muted, fontSize: 12 },
  previewCaption: { color: theme.colors.muted, fontSize: 12, lineHeight: 19, marginTop: 24 },
  stepNumber: { color: theme.colors.accent, fontFamily: 'DM Mono, monospace', fontSize: 26, fontWeight: '600' },
  pricing: { backgroundColor: '#111923', borderColor: 'rgba(214,162,78,0.34)', borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  pricingMain: { minWidth: 0, padding: 34 },
  price: { color: theme.colors.text, fontSize: 65, fontWeight: '900', letterSpacing: -3, lineHeight: 76, marginTop: 14 },
  priceUnit: { color: theme.colors.muted, fontSize: 16, fontWeight: '500', letterSpacing: 0 },
  pricingLead: { color: theme.colors.text, fontSize: 18, lineHeight: 28, marginTop: 14 },
  pricingAction: { alignItems: 'flex-start', marginTop: 22 },
  smallCopy: { color: theme.colors.muted, fontSize: 12, lineHeight: 19, marginTop: 4 },
  pricingDetails: { backgroundColor: '#0C131D', gap: 0, padding: 34 },
  detailTitle: { color: theme.colors.accent, fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: '700', letterSpacing: 1.1, marginBottom: 13 },
  detailItem: { borderTopColor: theme.colors.lineStrong, borderTopWidth: 1, color: theme.colors.text, fontSize: 14, lineHeight: 22, paddingVertical: 11 },
  roadmap: { alignItems: 'center', backgroundColor: '#0C131D', borderColor: theme.colors.lineStrong, borderRadius: 18, borderWidth: 1, gap: 20, justifyContent: 'space-between', marginVertical: 28, padding: 26 },
  roadmapTitle: { color: theme.colors.text, fontSize: 23, fontWeight: '800', marginTop: 8 },
  roadmapBody: { color: theme.colors.muted, fontSize: 14, lineHeight: 23, maxWidth: 520 },
  faqItem: { backgroundColor: '#111923', borderColor: theme.colors.lineStrong, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  faqButton: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 20, paddingVertical: 14 },
  faqQuestion: { color: theme.colors.text, flex: 1, fontSize: 15, fontWeight: '700', lineHeight: 23, paddingRight: 20 },
  faqIcon: { color: theme.colors.accent, fontSize: 24, lineHeight: 26 },
  faqAnswerWrap: { borderTopColor: theme.colors.lineStrong, borderTopWidth: 1, paddingBottom: 20, paddingHorizontal: 20, paddingTop: 15 },
  faqAnswerHidden: { display: 'none' },
  faqAnswer: { color: theme.colors.muted, fontSize: 14, lineHeight: 23 },
  closing: { alignItems: 'flex-start', backgroundColor: '#080D14', borderColor: 'rgba(214,162,78,0.34)', borderRadius: 20, borderWidth: 1, marginTop: 26, padding: 38 },
  closingTitle: { color: theme.colors.text, fontSize: 35, fontWeight: '900', letterSpacing: -1, lineHeight: 42, marginTop: 13 },
  closingBody: { color: theme.colors.muted, fontSize: 16, lineHeight: 25, marginTop: 12, maxWidth: 650 },
});

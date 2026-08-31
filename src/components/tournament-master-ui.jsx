import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Badge, Surface } from './hub-ui.jsx';
import { TOURNAMENT_MASTER_JOURNEY } from '../lib/tournamentJourneyPresentation.js';
import '../styles/tournamentResponsive.css';

export const TOURNAMENT_JOURNEY_STEPS = TOURNAMENT_MASTER_JOURNEY;

export function TournamentJourney({ compact = false }) {
  const { height, width } = useWindowDimensions();
  const phone = width > 0 && width <= 520;
  const shortLandscape = width > height && height > 0 && height <= 360;
  const condensed = compact || shortLandscape;

  return (
    <Surface
      dataSet={{ tournamentJourney: 'true' }}
      style={[styles.shell, condensed && styles.shellCondensed]}
    >
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Badge tone="accent">1V1 TOURNAMENTS</Badge>
          <Text accessibilityRole="header" style={[styles.title, condensed && styles.titleCondensed]}>
            Sign up. Check in. Play.
          </Text>
          <Text style={styles.subtitle}>
            One account for Spades, Euchre, and the next generation of 1V1 competition.
          </Text>
        </View>
        <View style={styles.seasonPill}>
          <Text style={styles.seasonLabel}>SEASON 1</Text>
          <Text style={styles.seasonValue}>STARTS 8/31</Text>
        </View>
      </View>

      <View
        dataSet={{ tournamentJourneySteps: 'true' }}
        style={[styles.steps, phone && styles.stepsPhone]}
      >
        {TOURNAMENT_JOURNEY_STEPS.map((step) => (
          <View
            dataSet={{ tournamentJourneyStep: 'true' }}
            key={step.number}
            style={[styles.step, phone && styles.stepPhone]}
          >
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{step.number}</Text>
            </View>
            <View style={styles.stepCopy}>
              <Text style={styles.stepTitle}>{step.label}</Text>
              <Text style={styles.stepBody}>{step.description}</Text>
            </View>
          </View>
        ))}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  headingCopy: {
    flex: 1,
    gap: 8,
    minWidth: 220,
  },
  headingRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
  },
  seasonLabel: {
    color: '#D6A24E',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  seasonPill: {
    backgroundColor: 'rgba(214, 162, 78, 0.09)',
    borderColor: 'rgba(214, 162, 78, 0.30)',
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  seasonValue: {
    color: '#F4EFE6',
    fontSize: 15,
    fontWeight: '900',
  },
  shell: {
    backgroundColor: 'rgba(11, 14, 13, 0.94)',
    borderColor: 'rgba(214, 162, 78, 0.28)',
    gap: 22,
    marginBottom: 20,
    overflow: 'hidden',
  },
  shellCondensed: {
    gap: 14,
    paddingBottom: 14,
    paddingTop: 14,
  },
  step: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(244, 239, 230, 0.10)',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 112,
    minWidth: 190,
    padding: 14,
  },
  stepBody: {
    color: '#A7A29A',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  stepCopy: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  stepNumber: {
    alignItems: 'center',
    backgroundColor: '#D6A24E',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  stepNumberText: {
    color: '#0B0D0C',
    fontSize: 16,
    fontWeight: '900',
  },
  stepPhone: {
    flexBasis: '100%',
    minHeight: 86,
  },
  steps: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  stepsPhone: {
    flexDirection: 'column',
  },
  stepTitle: {
    color: '#F4EFE6',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#B7B0A7',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    maxWidth: 720,
  },
  title: {
    color: '#F4EFE6',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 43,
  },
  titleCondensed: {
    fontSize: 29,
    lineHeight: 34,
  },
});

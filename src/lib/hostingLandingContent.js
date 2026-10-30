import {
  buildTournamentAccountPath,
  SPADES_HOSTING_DESTINATION,
} from './accountConnect.js';

export const HOSTING_SUPPORT_EMAIL = 'mehdi.zerrad@1v1spades.com';
export const HOSTING_REQUEST_HREF = `mailto:${HOSTING_SUPPORT_EMAIL}?subject=${encodeURIComponent('Hosting access request')}`;
export const HOSTING_DASHBOARD_PATH = buildTournamentAccountPath(
  SPADES_HOSTING_DESTINATION,
  'signin',
);

export const HOSTING_PASS = Object.freeze({
  name: 'Single-Event Hosting Pass',
  priceUsd: 15,
  includedEvents: 1,
  playerCapacity: 8,
  originalValidityDays: 30,
  automaticRenewal: false,
});

export const HOSTING_BENEFITS = Object.freeze([
  {
    number: '01',
    title: 'One account for your event',
    body: 'Use your 1V1 Account Hub sign-in to reach the Spades hosting dashboard and manage the pass attached to that account.',
  },
  {
    number: '02',
    title: 'Prepare the lobby first',
    body: 'Redeem the hosting key and create your tournament lobby without consuming the event allowance.',
  },
  {
    number: '03',
    title: 'Start with clear assignments',
    body: 'The single event allowance is consumed only when the tournament successfully starts and first-round assignments are created.',
  },
]);

export const HOSTING_STEPS = Object.freeze([
  {
    number: '01',
    title: 'Use your 1V1 account',
    body: 'Create or sign in to the Account Hub account that will own the hosting pass.',
  },
  {
    number: '02',
    title: 'Request hosting access',
    body: 'Tell us your event date and owning account email. We will confirm availability and payment instructions directly.',
  },
  {
    number: '03',
    title: 'Receive your key privately',
    body: 'After payment and account details are confirmed, Mehdi manually issues and privately delivers the key.',
  },
  {
    number: '04',
    title: 'Build, then start',
    body: 'Redeem the key, create the lobby, and start the tournament when your field is ready.',
  },
]);

export const HOSTING_FAQS = Object.freeze([
  {
    id: 'included',
    question: 'What does the Single-Event Hosting Pass include?',
    answer: 'A $15 USD one-time organizer software license for one Spades tournament with up to eight players. It does not renew automatically. Player entry remains free under the Hub rules.',
  },
  {
    id: 'validity',
    question: 'When does the 30-day period begin?',
    answer: 'The original pass is valid for 30 calendar days from the license start time explicitly agreed with the owner and activated on the license. Payment or key redemption does not start the term automatically. Your exact start and expiry timestamps are confirmed before delivery. Start your tournament within that term.',
  },
  {
    id: 'consumption',
    question: 'When is my one tournament used?',
    answer: 'Redeeming the key and creating a lobby do not consume the allowance. It is consumed only when the tournament successfully starts and first-round assignments are created.',
  },
  {
    id: 'delivery',
    question: 'How and when will I receive access?',
    answer: 'Mehdi manually issues and privately delivers the hosting key after payment and your owning Account Hub account are confirmed. Delivery is usually the same day; allow 1–3 business days after both are confirmed.',
  },
  {
    id: 'expired',
    question: 'What if my original pass expires unused?',
    answer: 'Contact support. An expired, unused pass can be reissued after review. The original key or license is revoked or superseded, so the replacement preserves one tournament allowance. Support will confirm replacement details.',
  },
  {
    id: 'capacity',
    question: 'Can I host more than eight players?',
    answer: 'Larger-capacity hosting is on the roadmap and is not available for purchase through this pilot.',
  },
  {
    id: 'support',
    question: 'Where do I get help?',
    answer: `Email ${HOSTING_SUPPORT_EMAIL} at any time. Support is available 24/7. Include the email on your owning Hub account and your event date; never send a password.`,
  },
]);

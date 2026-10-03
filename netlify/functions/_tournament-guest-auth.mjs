import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Buffer } from 'node:buffer';

import { getStoreWithFallback, parseCookies, withCookie } from './_account-utils.mjs';
import { requireTournamentAdmin } from './_host-auth.mjs';
import { isPublicTournamentVisible } from '../../src/lib/tournamentCatalog.js';

export const TOURNAMENT_GUEST_COOKIE = 'one_v_one_tournament_guest';
export const TOURNAMENT_GUEST_STORE = 'tournament-guest-access';
export const GUEST_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

function guestSecret() {
  const secret = String(process.env.TOURNAMENT_SESSION_SECRET || '').trim();
  return secret.length >= 32 ? secret : '';
}

function digest(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function sign(encodedPayload) {
  return createHmac('sha256', guestSecret()).update(encodedPayload).digest('base64url');
}

function guestKeyName(slug) {
  return `${String(slug || '').trim()}.json`;
}

export function guestKeyDigest(value) {
  return digest(value);
}

export function getGuestStore() {
  return getStoreWithFallback(TOURNAMENT_GUEST_STORE);
}

export function createGuestKey() {
  return `guest-${randomBytes(24).toString('base64url')}`;
}

export function createGuestCookie(slug, expiresAt) {
  if (!guestSecret()) return '';

  const payload = {
    slug: String(slug || '').trim(),
    expiresAt,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `v1.${encoded}.${sign(encoded)}`;
}

export function parseGuestCookie(token) {
  if (!guestSecret()) return null;

  const [prefix, encoded, provided, ...extra] = String(token || '').split('.');
  if (prefix !== 'v1' || !encoded || !provided || extra.length) return null;

  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const expiresAt = new Date(payload.expiresAt).getTime();
    if (!payload.slug || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    return { slug: String(payload.slug), expiresAt: new Date(expiresAt).toISOString() };
  } catch {
    return null;
  }
}

export function guestCookie(slug, expiresAt) {
  const maxAge = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return [
    `${TOURNAMENT_GUEST_COOKIE}=${encodeURIComponent(createGuestCookie(slug, expiresAt))}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${Math.min(maxAge, GUEST_SESSION_MAX_AGE_SECONDS)}`,
  ].join('; ');
}

export function clearGuestCookie() {
  return `${TOURNAMENT_GUEST_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function guestAccessRequired() {
  return {
    statusCode: 401,
    message: 'Enter the event guest key to view this tournament.',
    code: 'guest_access_required',
  };
}

export async function loadGuestRecord(slug, store = getGuestStore()) {
  return store.get(guestKeyName(slug), { type: 'json' });
}

export async function hasValidGuestAccess(event, slug, store = getGuestStore()) {
  const cookies = parseCookies(event.headers?.cookie || event.headers?.Cookie || '');
  const session = parseGuestCookie(cookies[TOURNAMENT_GUEST_COOKIE]);
  if (!session || session.slug !== slug) return false;

  const record = await loadGuestRecord(slug, store);
  return Boolean(
    record
      && !record.revokedAt
      && new Date(record.expiresAt).getTime() > Date.now()
      && new Date(session.expiresAt).getTime() > Date.now(),
  );
}

export async function requireTournamentEventAccess(event, tournament, store = getGuestStore()) {
  if (isPublicTournamentVisible(tournament)) return { ok: true, method: 'public' };

  if (await hasValidGuestAccess(event, tournament.slug, store)) {
    return { ok: true, method: 'guest' };
  }

  const adminCheck = await requireTournamentAdmin(event);
  if (adminCheck.ok) return { ok: true, method: adminCheck.method, admin: adminCheck };
  return { error: guestAccessRequired() };
}

export function withGuestCookie(response, slug, expiresAt) {
  return withCookie(response, guestCookie(slug, expiresAt));
}

export function guestKeyMatches(rawKey, record) {
  const expected = Buffer.from(String(record?.keyHash || ''), 'hex');
  const actual = Buffer.from(guestKeyDigest(rawKey), 'hex');
  return expected.length === actual.length && expected.length > 0 && timingSafeEqual(expected, actual);
}

export { guestKeyName };

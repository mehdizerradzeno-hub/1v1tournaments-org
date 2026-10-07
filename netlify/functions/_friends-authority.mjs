import { createHash, timingSafeEqual } from 'node:crypto';

export const FRIENDS_CONTRACT_VERSION = '2026-10-07';
export const FRIENDS_ALLOWED_AUDIENCES = new Set(['spades', 'euchre']);
export const FRIENDS_PAGE_DEFAULT = 25;
export const FRIENDS_PAGE_MAX = 50;

export class FriendsAuthorityError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'FriendsAuthorityError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function text(value, maxLength = 128) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function canonicalId(value) {
  const id = text(value);
  if (!id || /\s/.test(id)) {
    throw new FriendsAuthorityError('invalid_principal', 'A canonical account ID is required.', 400);
  }
  return id;
}

function normalizedHandle(value) {
  const handle = text(value, 32).replace(/^@/, '').toLowerCase();
  if (!handle || !/^[a-z0-9._-]+$/.test(handle)) {
    throw new FriendsAuthorityError('invalid_principal', 'The canonical account has no valid public handle.', 409);
  }
  return handle;
}

function publicProfile(account) {
  if (!account || typeof account !== 'object') {
    throw new FriendsAuthorityError('account_not_found', 'That shared account is unavailable.', 404);
  }
  if (account.deletedAt || account.isGuest === true || account.isBot === true || account.kind === 'guest' || account.kind === 'bot') {
    throw new FriendsAuthorityError('guest_or_bot', 'Only active human shared accounts can use Friends.', 403);
  }
  const canonicalAccountId = canonicalId(account.canonicalAccountId || account.id);
  const handle = normalizedHandle(account.playerHandle || account.handle);
  const displayName = text(account.playerName || account.displayName, 128);
  if (!displayName) {
    throw new FriendsAuthorityError('invalid_principal', 'The canonical account has no valid public profile.', 409);
  }
  return { canonicalAccountId, handle, displayName };
}

export function pairKey(left, right) {
  const a = canonicalId(left);
  const b = canonicalId(right);
  if (a === b) throw new FriendsAuthorityError('self_action', 'You cannot create a relationship with yourself.', 400);
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

function parsePair(key) {
  return key.split('\u0000');
}

function pageSize(value) {
  if (value === undefined || value === null || value === '') return FRIENDS_PAGE_DEFAULT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > FRIENDS_PAGE_MAX) {
    throw new FriendsAuthorityError('invalid_page', 'Page size must be between 1 and 50.', 400);
  }
  return parsed;
}

function cursorOffset(value) {
  if (!value) return 0;
  const offset = Number(value);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new FriendsAuthorityError('invalid_cursor', 'The Friends cursor is invalid.', 400);
  }
  return offset;
}

function paginate(values, options = {}) {
  const offset = cursorOffset(options.cursor);
  const limit = pageSize(options.limit);
  const items = values.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    items,
    page: {
      limit,
      nextCursor: nextOffset < values.length ? String(nextOffset) : null,
    },
  };
}

function safeAuditEvent(event, actor, target, pair, at) {
  return Object.freeze({
    event,
    at,
    actorFingerprint: hash(actor).slice(0, 20),
    targetFingerprint: target ? hash(target).slice(0, 20) : null,
    pairFingerprint: pair ? hash(pair).slice(0, 20) : null,
  });
}

/**
 * This is intentionally a test-only atomic implementation. Its lock lets the
 * state machine prove crossed-request semantics without pretending Netlify
 * Blobs provide a distributed transaction or unique unordered-pair constraint.
 */
export class InMemoryFriendsAuthorityStore {
  constructor() {
    this.relationships = new Map();
    this.idempotency = new Map();
    this.audits = [];
    this.version = 0;
    this.tail = Promise.resolve();
  }

  async atomic(work) {
    let release;
    const previous = this.tail;
    this.tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await work(this);
    } finally {
      release();
    }
  }
}

export class FixedWindowFriendsRateLimiter {
  constructor({ limit = 60, windowMs = 60_000, now = Date.now } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.buckets = new Map();
  }

  allow(key) {
    const current = this.now();
    const entries = (this.buckets.get(key) || []).filter((at) => current - at < this.windowMs);
    if (entries.length >= this.limit) return false;
    entries.push(current);
    this.buckets.set(key, entries);
    return true;
  }
}

export class FriendsAuthority {
  constructor({ store, resolveAccount, now = () => new Date().toISOString(), rateLimiter, auditSink } = {}) {
    if (!store || typeof store.atomic !== 'function') {
      throw new Error('FriendsAuthority requires an injected atomic store.');
    }
    if (typeof resolveAccount !== 'function') {
      throw new Error('FriendsAuthority requires a canonical-account resolver.');
    }
    this.store = store;
    this.resolveAccount = resolveAccount;
    this.now = now;
    this.rateLimiter = rateLimiter || new FixedWindowFriendsRateLimiter();
    this.auditSink = auditSink || (() => undefined);
  }

  async resolvePrincipal(value) {
    const id = canonicalId(value);
    const account = await this.resolveAccount(id);
    const profile = publicProfile(account);
    if (profile.canonicalAccountId !== id) {
      throw new FriendsAuthorityError('account_not_found', 'That shared account is unavailable.', 404);
    }
    return profile;
  }

  rateLimit(audience, actor, operation) {
    const key = `${audience}:${hash(actor).slice(0, 20)}:${operation}`;
    if (!this.rateLimiter.allow(key)) {
      throw new FriendsAuthorityError('rate_limited', 'Too many Friends requests. Try again shortly.', 429);
    }
  }

  recordAudit(store, event, actor, target, pair) {
    const audit = safeAuditEvent(event, actor, target, pair, this.now());
    store.audits.push(audit);
    this.auditSink(audit);
  }

  async search({ audience, actorCanonicalAccountId, query, cursor, limit }) {
    const actor = await this.resolvePrincipal(actorCanonicalAccountId);
    this.rateLimit(audience, actor.canonicalAccountId, 'search');
    const normalized = normalizedHandle(query);
    const result = await this.resolveAccount({ searchHandle: normalized });
    const candidates = Array.isArray(result) ? result : result ? [result] : [];
    const profiles = candidates
      .map((candidate) => publicProfile(candidate))
      .filter((candidate) => candidate.canonicalAccountId !== actor.canonicalAccountId && candidate.handle === normalized)
      .sort((a, b) => a.handle.localeCompare(b.handle) || a.canonicalAccountId.localeCompare(b.canonicalAccountId));
    return {
      contractVersion: FRIENDS_CONTRACT_VERSION,
      ...paginate(profiles, { cursor, limit }),
    };
  }

  async snapshot({ audience, actorCanonicalAccountId, cursors = {}, limit }) {
    const actor = await this.resolvePrincipal(actorCanonicalAccountId);
    this.rateLimit(audience, actor.canonicalAccountId, 'snapshot');
    const rows = await this.store.atomic(async (store) => [...store.relationships.values()]);
    const grouped = { friends: [], incoming: [], outgoing: [] };
    for (const relationship of rows) {
      const [accountA, accountB] = parsePair(relationship.pair);
      if (accountA !== actor.canonicalAccountId && accountB !== actor.canonicalAccountId) continue;
      const other = accountA === actor.canonicalAccountId ? accountB : accountA;
      try {
        const profile = await this.resolvePrincipal(other);
        if (relationship.status === 'accepted') grouped.friends.push(profile);
        else if (relationship.requestedByAccountId === actor.canonicalAccountId) grouped.outgoing.push(profile);
        else grouped.incoming.push(profile);
      } catch (error) {
        if (!(error instanceof FriendsAuthorityError) || error.code !== 'account_not_found') throw error;
      }
    }
    for (const values of Object.values(grouped)) {
      values.sort((a, b) => a.handle.localeCompare(b.handle) || a.canonicalAccountId.localeCompare(b.canonicalAccountId));
    }
    const friends = paginate(grouped.friends, { cursor: cursors.friends, limit });
    const incoming = paginate(grouped.incoming, { cursor: cursors.incoming, limit });
    const outgoing = paginate(grouped.outgoing, { cursor: cursors.outgoing, limit });
    return {
      contractVersion: FRIENDS_CONTRACT_VERSION,
      snapshotVersion: String(this.store.version),
      friends: friends.items,
      incoming: incoming.items,
      outgoing: outgoing.items,
      pages: { friends: friends.page, incoming: incoming.page, outgoing: outgoing.page },
    };
  }

  async mutate({ audience, action, actorCanonicalAccountId, targetCanonicalAccountId, idempotencyKey }) {
    const actor = await this.resolvePrincipal(actorCanonicalAccountId);
    const target = await this.resolvePrincipal(targetCanonicalAccountId);
    const pair = pairKey(actor.canonicalAccountId, target.canonicalAccountId);
    const allowed = new Set(['send', 'accept', 'decline', 'cancel', 'remove']);
    if (!allowed.has(action)) throw new FriendsAuthorityError('invalid_action', 'Choose a supported Friends action.', 400);
    this.rateLimit(audience, actor.canonicalAccountId, action);
    const key = text(idempotencyKey, 128);
    if (idempotencyKey !== undefined && (!key || /\s/.test(key))) {
      throw new FriendsAuthorityError('invalid_idempotency_key', 'Idempotency-Key is invalid.', 400);
    }
    return this.store.atomic(async (store) => {
      const idempotencyRecordKey = key ? `${actor.canonicalAccountId}\u0000${action}\u0000${key}` : '';
      if (idempotencyRecordKey && store.idempotency.has(idempotencyRecordKey)) {
        return { ...store.idempotency.get(idempotencyRecordKey), replayed: true };
      }
      const existing = store.relationships.get(pair);
      let result;
      if (action === 'send') {
        if (!existing) {
          store.relationships.set(pair, { pair, requestedByAccountId: actor.canonicalAccountId, status: 'pending', createdAt: this.now(), updatedAt: this.now() });
          store.version += 1;
          this.recordAudit(store, 'friend_request_sent', actor.canonicalAccountId, target.canonicalAccountId, pair);
          result = { relationship: 'outgoing', profile: target, applied: true };
        } else if (existing.status === 'accepted') {
          result = { relationship: 'accepted', profile: target, applied: false, code: 'already_friends' };
        } else if (existing.requestedByAccountId === actor.canonicalAccountId) {
          result = { relationship: 'outgoing', profile: target, applied: false, code: 'request_exists' };
        } else {
          existing.status = 'accepted';
          existing.acceptedAt = this.now();
          existing.updatedAt = this.now();
          store.version += 1;
          this.recordAudit(store, 'crossed_request_accepted', actor.canonicalAccountId, target.canonicalAccountId, pair);
          result = { relationship: 'accepted', profile: target, applied: true, code: 'crossed_request_accepted' };
        }
      } else if (action === 'accept') {
        if (existing?.status === 'accepted') {
          result = { relationship: 'accepted', profile: target, applied: false, code: 'already_applied' };
        } else if (!existing) {
          throw new FriendsAuthorityError('request_not_found', 'No pending friend request was found.', 404);
        } else if (existing.requestedByAccountId === actor.canonicalAccountId) {
          throw new FriendsAuthorityError('not_incoming_request', 'Only the recipient can accept this request.', 409);
        } else {
          existing.status = 'accepted';
          existing.acceptedAt = this.now();
          existing.updatedAt = this.now();
          store.version += 1;
          this.recordAudit(store, 'friend_request_accepted', actor.canonicalAccountId, target.canonicalAccountId, pair);
          result = { relationship: 'accepted', profile: target, applied: true };
        }
      } else if (action === 'decline' || action === 'cancel') {
        if (!existing) {
          result = { action, profile: target, applied: false, code: 'already_applied' };
        } else {
          const isRequester = existing.requestedByAccountId === actor.canonicalAccountId;
          if ((action === 'decline' && isRequester) || (action === 'cancel' && !isRequester)) {
            throw new FriendsAuthorityError(action === 'decline' ? 'not_incoming_request' : 'not_outgoing_request', 'That pending request cannot be changed this way.', 409);
          }
          store.relationships.delete(pair);
          store.version += 1;
          this.recordAudit(store, action === 'decline' ? 'friend_request_declined' : 'friend_request_canceled', actor.canonicalAccountId, target.canonicalAccountId, pair);
          result = { action, profile: target, applied: true };
        }
      } else if (!existing) {
        result = { removed: true, profile: target, applied: false, code: 'already_applied' };
      } else if (existing.status !== 'accepted') {
        throw new FriendsAuthorityError('friendship_not_found', 'No accepted friendship was found.', 404);
      } else {
        store.relationships.delete(pair);
        store.version += 1;
        this.recordAudit(store, 'friend_removed', actor.canonicalAccountId, target.canonicalAccountId, pair);
        result = { removed: true, profile: target, applied: true };
      }
      const response = { contractVersion: FRIENDS_CONTRACT_VERSION, ...result };
      if (idempotencyRecordKey) store.idempotency.set(idempotencyRecordKey, response);
      return response;
    });
  }

  async deleteAccount({ canonicalAccountId }) {
    const account = await this.resolvePrincipal(canonicalAccountId);
    return this.store.atomic(async (store) => {
      let relationshipsRemoved = 0;
      for (const [key, relationship] of store.relationships) {
        if (!key.includes(`${account.canonicalAccountId}\u0000`) && !key.endsWith(`\u0000${account.canonicalAccountId}`)) continue;
        store.relationships.delete(key);
        relationshipsRemoved += 1;
      }
      if (relationshipsRemoved) store.version += 1;
      this.recordAudit(store, 'friend_account_deleted', account.canonicalAccountId, null, null);
      return { contractVersion: FRIENDS_CONTRACT_VERSION, relationshipsRemoved };
    });
  }
}

function friendSecret(audience, env) {
  return text(env[`HUB_FRIENDS_${String(audience || '').toUpperCase()}_SECRET`], 4096);
}

export function validateFriendsServiceCaller(event, audienceValue, { env = process.env } = {}) {
  const audience = text(audienceValue, 32).toLowerCase();
  if (!FRIENDS_ALLOWED_AUDIENCES.has(audience)) {
    throw new FriendsAuthorityError('wrong_audience', 'Friends is only available to approved game services.', 403);
  }
  const expected = friendSecret(audience, env);
  if (expected.length < 32) {
    throw new FriendsAuthorityError('friends_service_unconfigured', 'Friends service authorization is not configured.', 503);
  }
  const authorization = text(event.headers?.authorization || event.headers?.Authorization, 8192);
  const received = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new FriendsAuthorityError('service_not_authorized', 'Friends service authorization was rejected.', 401);
  }
  return audience;
}

export function hubFriendsEnabled(env = process.env) {
  return String(env.HUB_FRIENDS_ENABLED || '').trim().toLowerCase() === 'true';
}

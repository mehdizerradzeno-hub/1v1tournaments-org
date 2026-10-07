const GLOBAL_FRIENDS_LOCK = 1_492_641_603;

function dateText(value) {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value || '') : parsed.toISOString();
}

function responseObject(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function stable(value) {
  return JSON.stringify(value);
}

function cloneMap(map) {
  return new Map([...map.entries()].map(([key, value]) => [key, JSON.parse(JSON.stringify(value))]));
}

function relationshipFromRow(row) {
  const left = String(row.left_account_id || '');
  const right = String(row.right_account_id || '');
  return {
    pair: `${left}\u0000${right}`,
    requestedByAccountId: String(row.requested_by_account_id || ''),
    status: String(row.status || ''),
    createdAt: dateText(row.created_at),
    updatedAt: dateText(row.updated_at),
    ...(row.accepted_at ? { acceptedAt: dateText(row.accepted_at) } : {}),
  };
}

function relationshipEqual(left, right) {
  return stable(left) === stable(right);
}

function changedKeys(before, after, equal = (left, right) => stable(left) === stable(right)) {
  return [...after.keys()].filter((key) => !before.has(key) || !equal(before.get(key), after.get(key)));
}

function deletedKeys(before, after) {
  return [...before.keys()].filter((key) => !after.has(key));
}

function accountPair(pair) {
  const [left, right, extra] = String(pair || '').split('\u0000');
  if (!left || !right || extra !== undefined) throw new Error('Friends relationship key is invalid.');
  return { left, right };
}

function idempotencyParts(key) {
  const [actor, action, idempotencyKey, extra] = String(key || '').split('\u0000');
  if (!actor || !action || !idempotencyKey || extra !== undefined) throw new Error('Friends idempotency key is invalid.');
  return { actor, action, idempotencyKey };
}

/**
 * Adapts the existing pure Friends domain to Netlify Database. The domain
 * receives the same in-memory-shaped state used by tests, but each operation
 * runs in one Postgres transaction behind a short advisory lock. This keeps
 * unordered friend pairs, crossed requests, idempotency, presence, audit
 * writes, and the snapshot version mutually consistent without claiming that
 * Netlify Blobs offer transaction semantics.
 */
export class PostgresFriendsAuthorityStore {
  constructor({ pool } = {}) {
    if (!pool || typeof pool.connect !== 'function') {
      throw new Error('PostgresFriendsAuthorityStore requires a database pool.');
    }
    this.pool = pool;
  }

  async loadState(client) {
    await client.query('SELECT pg_advisory_xact_lock($1)', [GLOBAL_FRIENDS_LOCK]);
    await client.query(
      "INSERT INTO friends_authority_state (state_key, version) VALUES ('global', 0) ON CONFLICT (state_key) DO NOTHING",
    );
    const [relationships, idempotency, presence, metadata] = await Promise.all([
      client.query('SELECT left_account_id, right_account_id, requested_by_account_id, status, created_at, updated_at, accepted_at FROM friends_relationships'),
      client.query('SELECT actor_account_id, action, idempotency_key, response_json FROM friends_idempotency'),
      client.query('SELECT canonical_account_id, game, expires_at FROM friends_presence'),
      client.query("SELECT version FROM friends_authority_state WHERE state_key = 'global' FOR UPDATE"),
    ]);
    return {
      relationships: new Map((relationships.rows || []).map((row) => {
        const relationship = relationshipFromRow(row);
        return [relationship.pair, relationship];
      })),
      idempotency: new Map((idempotency.rows || []).map((row) => [
        `${row.actor_account_id}\u0000${row.action}\u0000${row.idempotency_key}`,
        responseObject(row.response_json),
      ])),
      presence: new Map((presence.rows || []).map((row) => [
        String(row.canonical_account_id),
        { game: String(row.game), expiresAt: new Date(row.expires_at).getTime() },
      ])),
      audits: [],
      version: Number(metadata.rows?.[0]?.version || 0),
    };
  }

  async persistRelationships(client, before, after) {
    const removed = deletedKeys(before, after);
    if (removed.length) {
      await Promise.all(removed.map(async (pair) => {
        const { left, right } = accountPair(pair);
        await client.query('DELETE FROM friends_relationships WHERE left_account_id = $1 AND right_account_id = $2', [left, right]);
      }));
    }
    const changed = changedKeys(before, after, relationshipEqual);
    if (changed.length) {
      await Promise.all(changed.map(async (pair) => {
        const record = after.get(pair);
        const { left, right } = accountPair(pair);
        await client.query(
          `INSERT INTO friends_relationships
            (left_account_id, right_account_id, requested_by_account_id, status, created_at, updated_at, accepted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (left_account_id, right_account_id) DO UPDATE SET
             requested_by_account_id = EXCLUDED.requested_by_account_id,
             status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at,
             accepted_at = EXCLUDED.accepted_at`,
          [left, right, record.requestedByAccountId, record.status, record.createdAt, record.updatedAt, record.acceptedAt || null],
        );
      }));
    }
  }

  async persistIdempotency(client, before, after) {
    const removed = deletedKeys(before, after);
    if (removed.length) {
      await Promise.all(removed.map(async (key) => {
        const { actor, action, idempotencyKey } = idempotencyParts(key);
        await client.query('DELETE FROM friends_idempotency WHERE actor_account_id = $1 AND action = $2 AND idempotency_key = $3', [actor, action, idempotencyKey]);
      }));
    }
    const changed = changedKeys(before, after);
    if (changed.length) {
      await Promise.all(changed.map(async (key) => {
        const { actor, action, idempotencyKey } = idempotencyParts(key);
        await client.query(
          `INSERT INTO friends_idempotency (actor_account_id, action, idempotency_key, response_json)
           VALUES ($1, $2, $3, $4::jsonb)
           ON CONFLICT (actor_account_id, action, idempotency_key) DO UPDATE SET response_json = EXCLUDED.response_json`,
          [actor, action, idempotencyKey, JSON.stringify(after.get(key))],
        );
      }));
    }
  }

  async persistPresence(client, before, after) {
    const removed = deletedKeys(before, after);
    if (removed.length) {
      await client.query('DELETE FROM friends_presence WHERE canonical_account_id = ANY($1::text[])', [removed]);
    }
    const changed = changedKeys(before, after);
    if (changed.length) {
      await Promise.all(changed.map(async (accountId) => {
        const record = after.get(accountId);
        await client.query(
          `INSERT INTO friends_presence (canonical_account_id, game, expires_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (canonical_account_id) DO UPDATE SET game = EXCLUDED.game, expires_at = EXCLUDED.expires_at`,
          [accountId, record.game, new Date(record.expiresAt).toISOString()],
        );
      }));
    }
  }

  async persistAudits(client, audits) {
    await Promise.all(audits.map((audit) => client.query(
      `INSERT INTO friends_audit_events
        (event_type, occurred_at, actor_fingerprint, target_fingerprint, pair_fingerprint)
       VALUES ($1, $2, $3, $4, $5)`,
      [audit.event, audit.at, audit.actorFingerprint, audit.targetFingerprint, audit.pairFingerprint],
    )));
  }

  async atomic(work) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const state = await this.loadState(client);
      const before = {
        relationships: cloneMap(state.relationships),
        idempotency: cloneMap(state.idempotency),
        presence: cloneMap(state.presence),
        version: state.version,
      };
      const result = await work(state);
      await this.persistRelationships(client, before.relationships, state.relationships);
      await this.persistIdempotency(client, before.idempotency, state.idempotency);
      await this.persistPresence(client, before.presence, state.presence);
      await this.persistAudits(client, state.audits);
      if (before.version !== state.version) {
        await client.query(
          "UPDATE friends_authority_state SET version = $1, updated_at = NOW() WHERE state_key = 'global'",
          [state.version],
        );
      }
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

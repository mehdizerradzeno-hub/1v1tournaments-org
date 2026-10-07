-- Shared Friends requires relational constraints and serializable transactions.
-- These tables are additive: they do not migrate, modify, or delete Blob data.

CREATE TABLE IF NOT EXISTS friends_authority_state (
  state_key TEXT PRIMARY KEY CHECK (state_key = 'global'),
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO friends_authority_state (state_key, version)
VALUES ('global', 0)
ON CONFLICT (state_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS friends_relationships (
  left_account_id TEXT NOT NULL,
  right_account_id TEXT NOT NULL,
  requested_by_account_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  PRIMARY KEY (left_account_id, right_account_id),
  CHECK (left_account_id < right_account_id),
  CHECK (requested_by_account_id = left_account_id OR requested_by_account_id = right_account_id),
  CHECK ((status = 'accepted') = (accepted_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS friends_relationships_left_account_idx
  ON friends_relationships (left_account_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS friends_relationships_right_account_idx
  ON friends_relationships (right_account_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS friends_idempotency (
  actor_account_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('send', 'accept', 'decline', 'cancel', 'remove')),
  idempotency_key TEXT NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (actor_account_id, action, idempotency_key)
);

CREATE TABLE IF NOT EXISTS friends_presence (
  canonical_account_id TEXT PRIMARY KEY,
  game TEXT NOT NULL CHECK (game IN ('spades', 'euchre')),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS friends_presence_expires_at_idx
  ON friends_presence (expires_at);

-- This audit log intentionally holds only one-way fingerprints, never IDs,
-- profile data, room details, match information, or presence timestamps.
CREATE TABLE IF NOT EXISTS friends_audit_events (
  audit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_fingerprint TEXT NOT NULL,
  target_fingerprint TEXT,
  pair_fingerprint TEXT
);

CREATE INDEX IF NOT EXISTS friends_audit_events_occurred_at_idx
  ON friends_audit_events (occurred_at DESC);

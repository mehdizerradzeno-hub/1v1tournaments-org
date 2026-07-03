CREATE TABLE IF NOT EXISTS tournament_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_slug TEXT NOT NULL,
  player_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  player_handle TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'registered',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_slug, contact_email)
);

CREATE INDEX IF NOT EXISTS tournament_signups_tournament_slug_created_at_idx
  ON tournament_signups (tournament_slug, created_at);

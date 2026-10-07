-- The Netlify Functions runtime uses a read-only database role by default.
-- Friends is the sole transactional writer and receives the minimum grants
-- required for its normalized relationship and coarse-presence state.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'netlifydb_readonly') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      friends_authority_state,
      friends_relationships,
      friends_idempotency,
      friends_presence,
      friends_audit_events
    TO netlifydb_readonly;

    GRANT USAGE ON SEQUENCE friends_audit_events_audit_id_seq
    TO netlifydb_readonly;
  END IF;
END $$;

BEGIN;
CREATE TABLE IF NOT EXISTS web_field_session_links (
 source_session_id uuid NOT NULL REFERENCES web_field_sessions(id) ON DELETE CASCADE,
 target_session_id uuid PRIMARY KEY REFERENCES web_field_sessions(id) ON DELETE CASCADE,
 actor text NOT NULL REFERENCES web_user_access(email),
 controller text NOT NULL REFERENCES web_user_access(email),
 mode text NOT NULL CHECK(mode IN ('live','copy')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_session_id,actor)
);
ALTER TABLE web_field_session_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_field_session_links FROM PUBLIC,anon,authenticated;
COMMIT;

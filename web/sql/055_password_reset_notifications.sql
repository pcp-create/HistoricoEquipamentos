CREATE TABLE IF NOT EXISTS web_password_reset_notifications (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 email text NOT NULL,
 user_id text NOT NULL,
 phone text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','skipped')),
 attempts integer NOT NULL DEFAULT 0,
 lease_token uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS web_password_reset_notifications_pending ON web_password_reset_notifications(id) WHERE state='pending';
ALTER TABLE web_password_reset_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_password_reset_notifications FROM PUBLIC,anon,authenticated;

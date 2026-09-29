ALTER TABLE web_user_access ADD COLUMN IF NOT EXISTS managers jsonb NOT NULL DEFAULT '[]';
ALTER TABLE web_field_sessions ADD COLUMN IF NOT EXISTS correction jsonb;
ALTER TABLE web_field_sessions ADD COLUMN IF NOT EXISTS legacy_event_id bigint REFERENCES web_service_operation_events(id);
ALTER TABLE web_field_sessions ADD COLUMN IF NOT EXISTS correction_version integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS web_field_time_requests (
 id uuid PRIMARY KEY, request_key uuid NOT NULL UNIQUE,
 operation_id uuid NOT NULL REFERENCES web_service_operations(id),
 session_id uuid REFERENCES web_field_sessions(id),
 legacy_event_id bigint REFERENCES web_service_operation_events(id),
 requester text NOT NULL REFERENCES web_user_access(email),
 actor text NOT NULL REFERENCES web_user_access(email),
 kind text NOT NULL CHECK(kind IN ('work','travel')),
 reason text NOT NULL, proposed jsonb NOT NULL, original jsonb,
 base_version integer NOT NULL DEFAULT 0,
 managers jsonb NOT NULL DEFAULT '[]',
 location jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','superseded')),
 reviewed_by text, reviewed_at timestamptz, review_reason text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS web_field_one_time_request ON web_field_time_requests(session_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS web_field_time_requests_actor ON web_field_time_requests(actor,created_at DESC);
ALTER TABLE web_field_time_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_field_time_requests FROM PUBLIC,anon,authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS web_field_one_legacy_request ON web_field_time_requests(legacy_event_id) WHERE status='pending';

BEGIN;
CREATE TABLE IF NOT EXISTS crm_stage_limit_settings (
 id integer PRIMARY KEY CHECK(id=1), limits jsonb NOT NULL DEFAULT '{}',
 version integer NOT NULL DEFAULT 1, updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO crm_stage_limit_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS crm_stage_delay_notifications (
 id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('proposal','opportunity')),
 record_id uuid NOT NULL, stage text NOT NULL, stage_since timestamptz NOT NULL,
 notice_day date NOT NULL, recipient text NOT NULL,
 lease_token uuid NOT NULL, claimed_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 UNIQUE(kind,record_id,stage,stage_since,notice_day)
);
ALTER TABLE crm_stage_limit_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_stage_delay_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_stage_limit_settings,crm_stage_delay_notifications FROM anon,authenticated;
COMMIT;

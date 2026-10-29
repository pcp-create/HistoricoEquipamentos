BEGIN;
CREATE TABLE IF NOT EXISTS web_warehouse_notification_events(
 addition_id uuid PRIMARY KEY REFERENCES web_warehouse_material_additions(id),
 actor text NOT NULL,document jsonb NOT NULL,expanded boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS web_warehouse_notifications(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 addition_id uuid NOT NULL REFERENCES web_warehouse_notification_events(addition_id),
 recipient text NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sent','skipped')),
 attempts integer NOT NULL DEFAULT 0,lease_token uuid,phone text,
 created_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz,
 UNIQUE(addition_id,recipient)
);
CREATE INDEX IF NOT EXISTS warehouse_notifications_pending ON web_warehouse_notifications(id) WHERE state='pending';
ALTER TABLE web_warehouse_notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_warehouse_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_warehouse_notification_events,web_warehouse_notifications FROM PUBLIC,anon,authenticated;
COMMIT;

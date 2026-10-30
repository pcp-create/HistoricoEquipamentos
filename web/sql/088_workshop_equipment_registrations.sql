BEGIN;
CREATE TABLE IF NOT EXISTS web_workshop_equipment_registrations(
 id uuid PRIMARY KEY,actor text NOT NULL,document jsonb NOT NULL,payload jsonb,
 state text NOT NULL CHECK(state IN('sending','complete','rejected','uncertain')),
 equipment_id bigint,message text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workshop_equipment_registrations_equipment ON web_workshop_equipment_registrations(equipment_id);
ALTER TABLE web_workshop_equipment_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_workshop_equipment_registrations FROM PUBLIC,anon,authenticated;
COMMIT;

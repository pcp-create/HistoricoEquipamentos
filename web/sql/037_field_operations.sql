CREATE TABLE IF NOT EXISTS web_field_material_checks (
 operation_id uuid NOT NULL REFERENCES web_service_operations(id),actor text NOT NULL,
 confirmed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(operation_id,actor)
);
ALTER TABLE web_service_item_usage ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES web_service_operations(id);
CREATE TABLE IF NOT EXISTS web_field_sessions (
 id uuid PRIMARY KEY,operation_id uuid NOT NULL REFERENCES web_service_operations(id),actor text NOT NULL,
 kind text NOT NULL CHECK(kind IN('work','travel')),state text NOT NULL CHECK(state IN('running','paused','finished')),
 started_at timestamptz NOT NULL DEFAULT now(),segment_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 active_seconds numeric NOT NULL DEFAULT 0 CHECK(active_seconds>=0),pause_seconds numeric NOT NULL DEFAULT 0 CHECK(pause_seconds>=0),
 pause_reason jsonb,pause_alert_at timestamptz,vehicle_id text,odometer_start numeric,odometer_end numeric,
 CHECK(odometer_start IS NULL OR odometer_start>=0),CHECK(odometer_end IS NULL OR odometer_end>=odometer_start)
);
CREATE UNIQUE INDEX IF NOT EXISTS web_field_one_active ON web_field_sessions(actor) WHERE state<>'finished';
CREATE INDEX IF NOT EXISTS web_field_sessions_operation ON web_field_sessions(operation_id,started_at);
CREATE TABLE IF NOT EXISTS web_field_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,request_id uuid UNIQUE NOT NULL,
 operation_id uuid NOT NULL REFERENCES web_service_operations(id),actor text NOT NULL,action text NOT NULL,
 latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 accuracy double precision NOT NULL CHECK(accuracy>=0),located_at timestamptz NOT NULL,
 document jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_field_events_operation ON web_field_events(operation_id,created_at);
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['web_field_material_checks','web_field_sessions','web_field_events'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated',t);
END LOOP;END $$;

ALTER TABLE web_user_access ADD COLUMN IF NOT EXISTS hourly_cost numeric(14,2) CHECK(hourly_cost>=0);
CREATE TABLE IF NOT EXISTS web_service_schedule_settings (
 id integer PRIMARY KEY CHECK(id=1),document jsonb NOT NULL,version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),updated_by text
);
INSERT INTO web_service_schedule_settings(id,document) VALUES(1,'{"serviceTypes":["Interno","Externo","Terceirizado"],"checklists":[],"calendars":[{"id":"standard","name":"Padrão","week":[{"day":1,"start":"07:30","end":"12:00"},{"day":1,"start":"13:00","end":"18:00"},{"day":2,"start":"07:30","end":"12:00"},{"day":2,"start":"13:00","end":"18:00"},{"day":3,"start":"07:30","end":"12:00"},{"day":3,"start":"13:00","end":"18:00"},{"day":4,"start":"07:30","end":"12:00"},{"day":4,"start":"13:00","end":"18:00"},{"day":5,"start":"07:30","end":"12:00"}]}]}'::jsonb) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS web_service_schedules (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,company_id integer NOT NULL,order_id bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),created_by text NOT NULL,UNIQUE(company_id,order_id)
);
CREATE TABLE IF NOT EXISTS web_service_operations (
 id uuid PRIMARY KEY,schedule_id bigint NOT NULL REFERENCES web_service_schedules(id),position integer NOT NULL CHECK(position>0),document jsonb NOT NULL DEFAULT '{}',status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','planning','scheduled','awaiting_execution','executing','awaiting_review','reviewed','completed')),sent_at timestamptz,ends_at timestamptz,version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),updated_by text NOT NULL,UNIQUE(schedule_id,position)
);
CREATE TABLE IF NOT EXISTS web_service_operation_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,operation_id uuid NOT NULL REFERENCES web_service_operations(id),action text NOT NULL,hours numeric(12,3),actor text NOT NULL,description text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS web_service_item_usage (
 schedule_id bigint NOT NULL REFERENCES web_service_schedules(id),item_id bigint NOT NULL,withdrawn numeric(16,3) CHECK(withdrawn>=0),used numeric(16,3) CHECK(used>=0),version integer NOT NULL DEFAULT 1,updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(schedule_id,item_id)
);
CREATE TABLE IF NOT EXISTS web_service_item_cost (
 schedule_id bigint NOT NULL REFERENCES web_service_schedules(id),item_id bigint NOT NULL,cost numeric(16,2) CHECK(cost>=0),version integer NOT NULL DEFAULT 1,updated_by text NOT NULL,PRIMARY KEY(schedule_id,item_id)
);
CREATE OR REPLACE FUNCTION web_lock_completed_operation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='completed' THEN RAISE EXCEPTION 'Operação concluída não pode ser alterada.' USING ERRCODE='23514';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS web_lock_completed_operation ON web_service_operations;
CREATE TRIGGER web_lock_completed_operation BEFORE UPDATE OR DELETE ON web_service_operations FOR EACH ROW EXECUTE FUNCTION web_lock_completed_operation();
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['web_service_schedule_settings','web_service_schedules','web_service_operations','web_service_operation_events','web_service_item_usage','web_service_item_cost'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated',t);END LOOP;END $$;

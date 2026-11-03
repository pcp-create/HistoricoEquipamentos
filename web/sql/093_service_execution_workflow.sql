-- Execution keeps one task per operation, handing it between technical and planning teams.
CREATE TABLE IF NOT EXISTS web_service_operation_workflows (
 operation_id uuid PRIMARY KEY REFERENCES web_service_operations(id),
 task_id bigint NOT NULL UNIQUE REFERENCES web_tasks(id),
 planner text NOT NULL,
 phase text NOT NULL CHECK(phase IN('execution','review','reviewed','internal','billing')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE web_service_schedules ADD COLUMN IF NOT EXISTS release_kind text CHECK(release_kind IN('internal','billing'));
ALTER TABLE web_tasks ADD COLUMN IF NOT EXISTS approval_parent_id bigint REFERENCES web_tasks(id);
CREATE UNIQUE INDEX IF NOT EXISTS web_approval_single_correction ON web_tasks(approval_parent_id) WHERE approval_parent_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS web_service_customer_reports (
 id uuid PRIMARY KEY,schedule_id bigint NOT NULL REFERENCES web_service_schedules(id),
 actor text NOT NULL,phone text NOT NULL,token_hash text NOT NULL UNIQUE,filename text NOT NULL,
 content bytea NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS web_service_notifications (
 id uuid PRIMARY KEY,source_key text NOT NULL UNIQUE,recipient text,phone text,text text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sent','skipped')),
 attempts int NOT NULL DEFAULT 0,lease_token uuid,sent_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['web_service_operation_workflows','web_service_customer_reports','web_service_notifications'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated',t);
END LOOP;END $$;

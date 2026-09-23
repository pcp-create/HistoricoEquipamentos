CREATE TABLE IF NOT EXISTS web_tasks (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source_key text NOT NULL, cycle text NOT NULL, equipment_id bigint NOT NULL,
 plan_id text, origin text NOT NULL, title text NOT NULL, equipment_name text NOT NULL,
 customer text NOT NULL DEFAULT '', source_status text NOT NULL,
 status text NOT NULL DEFAULT 'not_started' CHECK(status IN('not_started','in_progress','completed')),
 priority text NOT NULL CHECK(priority IN('normal','high','urgent')), priority_manual boolean NOT NULL DEFAULT false,
 assigned_to text REFERENCES web_user_access(email), due_date date,
 created_at timestamptz NOT NULL DEFAULT now(), first_assigned_at timestamptz, completed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by text NOT NULL DEFAULT 'Sistema', version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS web_tasks_open_source ON web_tasks(source_key) WHERE status <> 'completed';
CREATE INDEX IF NOT EXISTS web_tasks_assigned ON web_tasks(assigned_to,created_at DESC);
CREATE TABLE IF NOT EXISTS web_task_notes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, task_id bigint NOT NULL REFERENCES web_tasks(id),
 title text NOT NULL, description text NOT NULL, automatic boolean NOT NULL DEFAULT false,
 created_by text NOT NULL, created_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS web_task_attachments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, task_id bigint NOT NULL REFERENCES web_tasks(id),
 filename text NOT NULL, content_type text NOT NULL, content bytea NOT NULL,
 created_by text NOT NULL, created_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(octet_length(content) <= 3000000)
);
CREATE TABLE IF NOT EXISTS web_task_notifications (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, task_id bigint NOT NULL REFERENCES web_tasks(id),
 task_version integer NOT NULL, recipient text NOT NULL REFERENCES web_user_access(email),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sent','skipped')),
 lease_token uuid, leased_until timestamptz, attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 UNIQUE(task_id,task_version,recipient)
);
CREATE TABLE IF NOT EXISTS web_task_sync (id integer PRIMARY KEY CHECK(id=1), synced_at timestamptz NOT NULL);
ALTER TABLE web_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_task_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_task_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_task_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_tasks,web_task_notes,web_task_attachments,web_task_notifications,web_task_sync FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS web_task_notes_history ON web_task_notes(task_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS web_task_attachments_history ON web_task_attachments(task_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS web_task_notifications_pending ON web_task_notifications(id) WHERE state='pending';

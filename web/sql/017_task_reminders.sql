CREATE TABLE IF NOT EXISTS web_task_reminders (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 task_id bigint NOT NULL REFERENCES web_tasks(id),
 scheduled_at timestamptz NOT NULL,
 recipient text NOT NULL REFERENCES web_user_access(email),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sent','cancelled','skipped')),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid, leased_until timestamptz, attempts integer NOT NULL DEFAULT 0,
 sent_at timestamptz,
 UNIQUE(task_id,scheduled_at,recipient)
);
CREATE INDEX IF NOT EXISTS web_task_reminders_due ON web_task_reminders(scheduled_at) WHERE state='pending';
ALTER TABLE web_task_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_task_reminders FROM PUBLIC,anon,authenticated;

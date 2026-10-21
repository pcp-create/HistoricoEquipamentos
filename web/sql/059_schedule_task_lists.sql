BEGIN;
CREATE TABLE IF NOT EXISTS web_service_task_lists (
 id uuid PRIMARY KEY,name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 document jsonb NOT NULL,version integer NOT NULL DEFAULT 1,active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),created_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),updated_by text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS web_service_task_lists_name ON web_service_task_lists(lower(trim(name))) WHERE active;
ALTER TABLE web_service_task_lists ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_service_task_lists FROM PUBLIC,anon,authenticated;
COMMIT;

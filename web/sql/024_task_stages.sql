CREATE TABLE IF NOT EXISTS web_task_stages (
 id uuid PRIMARY KEY,
 job_title text NOT NULL CHECK(length(btrim(job_title)) BETWEEN 1 AND 120),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
 sort_order integer NOT NULL CHECK(sort_order BETWEEN 1 AND 9999),
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS web_task_stages_name ON web_task_stages(lower(btrim(job_title)),lower(btrim(name)));
ALTER TABLE web_task_stages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_task_stages FROM PUBLIC,anon,authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS web_task_stages_order ON web_task_stages(lower(btrim(job_title)),sort_order);

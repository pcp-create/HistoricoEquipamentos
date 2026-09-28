ALTER TABLE web_tasks ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES web_task_stages(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS web_tasks_stage ON web_tasks(stage_id) WHERE stage_id IS NOT NULL;

ALTER TABLE web_task_stages ADD COLUMN IF NOT EXISTS job_title_key text GENERATED ALWAYS AS (lower(btrim(job_title))) STORED;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='web_task_stages_order' AND conrelid='web_task_stages'::regclass) THEN
  DROP INDEX IF EXISTS web_task_stages_order;
  ALTER TABLE web_task_stages ADD CONSTRAINT web_task_stages_order UNIQUE(job_title_key,sort_order) DEFERRABLE INITIALLY IMMEDIATE;
 END IF;
END $$;

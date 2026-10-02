ALTER TABLE web_tasks ADD COLUMN IF NOT EXISTS restricted boolean NOT NULL DEFAULT false;

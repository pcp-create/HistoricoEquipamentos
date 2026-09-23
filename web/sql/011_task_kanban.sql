ALTER TABLE web_tasks ADD COLUMN IF NOT EXISTS kanban_column text CHECK(kanban_column IN ('pending','in_progress','overdue'));
ALTER TABLE web_tasks ADD COLUMN IF NOT EXISTS source_resolved boolean NOT NULL DEFAULT true;
ALTER TABLE web_tasks ALTER COLUMN source_resolved SET DEFAULT false;

ALTER TABLE web_tasks ALTER COLUMN equipment_id DROP NOT NULL;
ALTER TABLE web_tasks ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT 'Sistema';

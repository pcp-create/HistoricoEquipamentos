ALTER TABLE web_user_access ADD COLUMN IF NOT EXISTS task_color text CHECK(task_color IS NULL OR task_color ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE web_task_territories
 ADD COLUMN IF NOT EXISTS mesoregion text,
 ADD COLUMN IF NOT EXISTS microregion text,
 ADD COLUMN IF NOT EXISTS seller text;

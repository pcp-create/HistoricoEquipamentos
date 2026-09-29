ALTER TABLE web_service_schedules ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

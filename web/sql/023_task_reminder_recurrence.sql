CREATE TABLE IF NOT EXISTS web_task_reminder_series (
 id uuid PRIMARY KEY,
 task_id bigint NOT NULL REFERENCES web_tasks(id),
 anchor_local text NOT NULL,
 rule jsonb NOT NULL,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE web_task_reminder_series ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_task_reminder_series FROM PUBLIC,anon,authenticated;
ALTER TABLE web_task_reminders ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES web_task_reminder_series(id);
ALTER TABLE web_task_reminders ADD COLUMN IF NOT EXISTS occurrence_index integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS web_task_reminders_series_occurrence ON web_task_reminders(series_id,occurrence_index) WHERE series_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS web_task_reminder_series_task ON web_task_reminder_series(task_id);
CREATE OR REPLACE FUNCTION web_stop_completed_task_reminders() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
  UPDATE web_task_reminder_series SET active=false WHERE task_id=NEW.id AND active;
  UPDATE web_task_reminders SET state='cancelled' WHERE task_id=NEW.id AND state='pending' AND series_id IS NOT NULL AND (leased_until IS NULL OR leased_until<now());
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS web_stop_completed_task_reminders ON web_tasks;
CREATE TRIGGER web_stop_completed_task_reminders AFTER UPDATE OF status ON web_tasks FOR EACH ROW EXECUTE FUNCTION web_stop_completed_task_reminders();

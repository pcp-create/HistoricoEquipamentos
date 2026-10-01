ALTER TABLE web_task_notifications ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'assignment' CHECK (kind IN ('assignment','completed'));
ALTER TABLE web_task_notifications DROP CONSTRAINT IF EXISTS web_task_notifications_task_id_task_version_recipient_key;
CREATE UNIQUE INDEX IF NOT EXISTS web_task_notifications_event_unique ON web_task_notifications(task_id,task_version,recipient,kind);
CREATE OR REPLACE FUNCTION web_queue_task_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO web_task_notifications(task_id,task_version,recipient,kind)
    VALUES(NEW.id,GREATEST(NEW.version,OLD.version+1),NEW.assigned_to,'completed') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS web_task_completion_notification ON web_tasks;
CREATE TRIGGER web_task_completion_notification AFTER UPDATE OF status ON web_tasks
FOR EACH ROW EXECUTE FUNCTION web_queue_task_completion();

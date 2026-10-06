ALTER TABLE web_tasks ADD COLUMN IF NOT EXISTS followers text[] NOT NULL DEFAULT '{}';
ALTER TABLE web_task_notifications DROP CONSTRAINT IF EXISTS web_task_notifications_kind_check;
ALTER TABLE web_task_notifications ADD CONSTRAINT web_task_notifications_kind_check CHECK(kind IN ('assignment','completed','reminder'));
ALTER TABLE web_task_notifications ADD COLUMN IF NOT EXISTS reminder_id bigint REFERENCES web_task_reminders(id);
DROP INDEX IF EXISTS web_task_notifications_event_unique;
CREATE UNIQUE INDEX web_task_notifications_event_unique ON web_task_notifications(task_id,task_version,recipient,kind) WHERE kind <> 'reminder';
CREATE UNIQUE INDEX web_task_notifications_reminder_unique ON web_task_notifications(reminder_id,recipient) WHERE kind='reminder';
CREATE OR REPLACE FUNCTION web_queue_task_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
  INSERT INTO web_task_notifications(task_id,task_version,recipient,kind)
  SELECT NEW.id,GREATEST(NEW.version,OLD.version+1),u.email,'completed'
  FROM web_user_access u WHERE u.email=ANY(array_append(NEW.followers,NEW.assigned_to))
  ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION web_queue_task_followers() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='assignment' AND NEW.recipient=(SELECT assigned_to FROM web_tasks WHERE id=NEW.task_id) THEN
  INSERT INTO web_task_notifications(task_id,task_version,recipient,kind,assignment_reason)
  SELECT NEW.task_id,NEW.task_version,u.email,'assignment',NEW.assignment_reason
  FROM web_tasks t JOIN web_user_access u ON u.email=ANY(t.followers)
  WHERE t.id=NEW.task_id AND u.email<>NEW.recipient ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER web_task_follower_notifications AFTER INSERT ON web_task_notifications FOR EACH ROW EXECUTE FUNCTION web_queue_task_followers();

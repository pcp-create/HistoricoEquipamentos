-- Idempotent photo retries after an interrupted connection.
ALTER TABLE web_service_checklist_photos ADD COLUMN IF NOT EXISTS client_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS web_checklist_photo_request_unique
  ON web_service_checklist_photos(client_request_id) WHERE client_request_id IS NOT NULL;

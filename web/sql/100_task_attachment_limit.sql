-- Match application validation for task uploads and generated technical reports.
ALTER TABLE web_task_attachments
  DROP CONSTRAINT IF EXISTS web_task_attachments_content_check;
ALTER TABLE web_task_attachments
  ADD CONSTRAINT web_task_attachments_content_check CHECK (octet_length(content) <= 5000000);

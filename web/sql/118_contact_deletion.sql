BEGIN;
ALTER TABLE web_customer_contacts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE web_customer_contacts ADD COLUMN IF NOT EXISTS deleted_by text;
COMMIT;

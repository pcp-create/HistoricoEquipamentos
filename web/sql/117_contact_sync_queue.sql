BEGIN;
ALTER TABLE web_customer_contacts ADD COLUMN IF NOT EXISTS sync_error text NOT NULL DEFAULT '';
ALTER TABLE web_customer_contacts ADD COLUMN IF NOT EXISTS sync_attempted_at timestamptz;
ALTER TABLE web_customer_contacts ADD COLUMN IF NOT EXISTS sync_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE web_customer_contacts ADD COLUMN IF NOT EXISTS sync_requested boolean NOT NULL DEFAULT false;
UPDATE web_customer_contacts SET sync_requested=true WHERE customer_key LIKE 'm8:%' AND (m8_id IS NULL OR integration_state IN ('failed','uncertain','sending') OR field_overrides <> '{}'::jsonb OR job_type_override_id IS NOT NULL);
ALTER TABLE web_customer_contacts ADD COLUMN IF NOT EXISTS sync_claim uuid;
ALTER TABLE web_customer_contacts ADD COLUMN IF NOT EXISTS sync_claimed_at timestamptz;
COMMIT;

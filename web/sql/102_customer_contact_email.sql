ALTER TABLE web_customer_contacts ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
ALTER TABLE web_customer_contacts ADD COLUMN IF NOT EXISTS job_title text NOT NULL DEFAULT '';

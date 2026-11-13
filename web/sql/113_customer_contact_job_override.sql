BEGIN;
ALTER TABLE public.web_customer_contacts ADD COLUMN IF NOT EXISTS job_type_override_id bigint REFERENCES public.web_contact_job_types(id);
ALTER TABLE public.web_customer_contacts ADD COLUMN IF NOT EXISTS job_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.web_customer_contacts ADD COLUMN IF NOT EXISTS job_updated_by text;
ALTER TABLE public.web_customer_contacts ADD COLUMN IF NOT EXISTS job_updated_at timestamptz;
COMMIT;

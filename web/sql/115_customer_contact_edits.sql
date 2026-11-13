BEGIN;
ALTER TABLE public.web_customer_contacts ADD COLUMN IF NOT EXISTS field_overrides jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(field_overrides)='object');
COMMIT;

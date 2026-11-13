BEGIN;
ALTER TABLE public.web_customer_contacts ADD COLUMN IF NOT EXISTS m8_id bigint;
ALTER TABLE public.web_customer_contacts ADD COLUMN IF NOT EXISTS company_id integer;
ALTER TABLE public.web_customer_contacts ADD COLUMN IF NOT EXISTS contact_type text NOT NULL DEFAULT 'Geral';
ALTER TABLE public.web_customer_contacts ADD COLUMN IF NOT EXISTS cargo_id integer;
ALTER TABLE public.web_customer_contacts ADD COLUMN IF NOT EXISTS additional_phone text NOT NULL DEFAULT '';
ALTER TABLE public.web_customer_contacts ADD COLUMN IF NOT EXISTS document text NOT NULL DEFAULT '';
ALTER TABLE public.web_customer_contacts ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE public.web_customer_contacts ADD COLUMN IF NOT EXISTS integration_state text NOT NULL DEFAULT 'local' CHECK(integration_state IN ('local','sending','uncertain','synced','failed'));
CREATE UNIQUE INDEX IF NOT EXISTS web_customer_contacts_m8_unique ON public.web_customer_contacts(customer_key,company_id,m8_id) WHERE m8_id IS NOT NULL;
-- ERP contacts may legitimately share the same name and phone; identity is the M8 ID.
ALTER TABLE public.web_customer_contacts DROP CONSTRAINT IF EXISTS web_customer_contacts_customer_key_name_phone_key;
CREATE UNIQUE INDEX IF NOT EXISTS web_customer_contacts_local_unique ON public.web_customer_contacts(customer_key,name,phone) WHERE m8_id IS NULL;
COMMIT;

BEGIN;
ALTER TABLE public.web_user_access ADD COLUMN IF NOT EXISTS m8_employee_id integer CHECK(m8_employee_id > 0);
ALTER TABLE public.m8_order_type_catalog ADD COLUMN IF NOT EXISTS customer_equipment_only boolean;
CREATE TABLE IF NOT EXISTS public.service_order_registries (
 kind text NOT NULL CHECK(kind IN ('payment-terms','order-statuses','freight','service-types','service-origins')),
 id integer NOT NULL CHECK(id>=0 AND (id>0 OR kind='freight')), name text NOT NULL CHECK(length(trim(name))>0),active boolean NOT NULL DEFAULT true,
 warranty_id integer CHECK(warranty_id>0), warranty_description text,
 payload jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now(),updated_by text NOT NULL,
 PRIMARY KEY(kind,id)
);
ALTER TABLE public.service_order_registries DROP CONSTRAINT IF EXISTS service_order_registries_id_check;
ALTER TABLE public.service_order_registries ADD CONSTRAINT service_order_registries_id_check CHECK(id>=0 AND (id>0 OR kind='freight'));
ALTER TABLE public.registry_manual_updates DROP CONSTRAINT IF EXISTS registry_manual_updates_registry_key_check;
ALTER TABLE public.registry_manual_updates ADD CONSTRAINT registry_manual_updates_registry_key_check CHECK(registry_key IN ('order-types','quote-types','payment-terms','order-statuses','freight','service-types','service-origins'));
CREATE TABLE IF NOT EXISTS public.service_order_submissions (
 id uuid PRIMARY KEY, created_by text NOT NULL,company_id integer NOT NULL CHECK(company_id IN(1,2,27404)),
 request jsonb NOT NULL, header jsonb NOT NULL, items jsonb NOT NULL,
 m8_id integer, state text NOT NULL DEFAULT 'ready' CHECK(state IN ('ready','sending','partial','uncertain','complete','rejected')),
 next_item integer NOT NULL DEFAULT 0, message text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_order_submissions_user ON public.service_order_submissions(created_by,created_at DESC);
ALTER TABLE public.service_order_registries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_order_registries,public.service_order_submissions FROM PUBLIC,anon,authenticated;
COMMIT;

BEGIN;
ALTER TABLE public.crm_opportunities ADD COLUMN IF NOT EXISTS commercial jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(commercial)='object');
COMMIT;

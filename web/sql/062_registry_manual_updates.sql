BEGIN;
CREATE TABLE IF NOT EXISTS public.registry_manual_updates (
 registry_key text PRIMARY KEY CHECK (registry_key IN ('order-types','quote-types')),
 updated_at timestamptz NOT NULL,
 updated_by text NOT NULL
);
ALTER TABLE public.registry_manual_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registry_manual_updates FROM PUBLIC,anon,authenticated;
COMMIT;

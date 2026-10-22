BEGIN;
CREATE TABLE IF NOT EXISTS public.m8_quote_type_catalog (
 id bigint PRIMARY KEY, name text NOT NULL, active boolean NOT NULL,
 collected_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.m8_quote_type_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.m8_quote_type_catalog FROM PUBLIC, anon, authenticated;
COMMIT;

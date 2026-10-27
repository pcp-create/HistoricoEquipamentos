CREATE TABLE public.integracao_m8_headers_sync (
 company_id integer PRIMARY KEY,
 collected_at timestamptz NOT NULL,
 received integer NOT NULL,
 changed integer NOT NULL,
 duration_ms bigint NOT NULL
);
ALTER TABLE public.integracao_m8_headers_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracao_m8_headers_sync FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public.integracao_m8_headers_sync FROM anon,authenticated;
 END IF;
END $$;

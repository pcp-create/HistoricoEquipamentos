CREATE TABLE IF NOT EXISTS public.m8_locality_geocoding_attempts (
 person_id bigint NOT NULL, address_id bigint NOT NULL, address_hash text NOT NULL,
 attempted_at timestamptz NOT NULL DEFAULT now(), next_at timestamptz NOT NULL,
 PRIMARY KEY(person_id,address_id)
);
ALTER TABLE public.m8_locality_geocoding_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.m8_locality_geocoding_attempts FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
 REVOKE ALL ON public.m8_locality_geocoding_attempts FROM anon,authenticated;
 END IF;
END $$;

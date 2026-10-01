CREATE TABLE IF NOT EXISTS public.web_customer_map_points (
 person_id bigint NOT NULL,address_id bigint NOT NULL,address_hash text NOT NULL,
 latitude double precision NOT NULL CHECK(latitude BETWEEN -85 AND 85),
 longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 precision text NOT NULL,provider text NOT NULL,updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(person_id,address_id)
);
CREATE TABLE IF NOT EXISTS public.web_schedule_map_choices (
 schedule_id bigint PRIMARY KEY REFERENCES web_service_schedules(id) ON DELETE CASCADE,
 person_id bigint NOT NULL,address_id bigint NOT NULL,updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['web_customer_map_points','web_schedule_map_choices'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t); END IF;
 END LOOP;
END $$;

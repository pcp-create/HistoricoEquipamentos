CREATE TABLE public.m8_customer_localities (
 company_id integer NOT NULL, person_id bigint NOT NULL CHECK(person_id>0),
 address_id bigint NOT NULL CHECK(address_id>0), address_type text,
 postal_code text, street text, number text, complement text, letter text,
 district_id bigint, district text, city_id bigint, city text, state text, country text,
 payload jsonb NOT NULL, present boolean NOT NULL DEFAULT true,
 collected_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,person_id,address_id)
);
CREATE TABLE public.m8_customer_locality_queue (
 company_id integer NOT NULL, person_id bigint NOT NULL CHECK(person_id>0),
 attempted_at timestamptz, checked_at timestamptz,
 next_at timestamptz NOT NULL DEFAULT now(), error text,
 PRIMARY KEY(company_id,person_id)
);
CREATE INDEX m8_customer_locality_due ON public.m8_customer_locality_queue(company_id,next_at,person_id);
COMMENT ON TABLE public.m8_customer_localities IS 'Localidades do cliente coletadas do ERP M8; preserva todos os tipos de endereço e o payload original.';
CREATE FUNCTION public.m8_customer_locality_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' OR OLD.payload IS DISTINCT FROM NEW.payload THEN
  INSERT INTO public.m8_customer_locality_queue(company_id,person_id)
   VALUES(NEW.company_id,NEW.person_id)
   ON CONFLICT(company_id,person_id) DO UPDATE SET next_at=LEAST(m8_customer_locality_queue.next_at,now());
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER m8_customer_locality_changed AFTER INSERT OR UPDATE ON public.m8_customer_directory
 FOR EACH ROW WHEN(NEW.person_id>0) EXECUTE FUNCTION public.m8_customer_locality_changed();
INSERT INTO public.m8_customer_locality_queue(company_id,person_id)
 SELECT company_id,person_id FROM public.m8_customer_directory WHERE person_id>0;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['m8_customer_localities','m8_customer_locality_queue'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t); END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.m8_customer_locality_changed() FROM PUBLIC;

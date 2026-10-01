-- Shared ERP directory: company 1 is the sole source of customer localities.
SELECT pg_advisory_xact_lock(81017,1);
SELECT pg_advisory_xact_lock(81017,2);
SELECT pg_advisory_xact_lock(81017,27404);
DELETE FROM public.m8_customer_locality_queue WHERE company_id<>1;
DELETE FROM public.m8_customer_localities WHERE company_id<>1;
ALTER TABLE public.m8_customer_locality_queue ADD CONSTRAINT m8_locality_queue_shared CHECK(company_id=1);
ALTER TABLE public.m8_customer_localities ADD CONSTRAINT m8_localities_shared CHECK(company_id=1);
CREATE OR REPLACE FUNCTION public.m8_customer_locality_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.company_id=1 AND (TG_OP='INSERT' OR OLD.payload IS DISTINCT FROM NEW.payload) THEN
  INSERT INTO public.m8_customer_locality_queue(company_id,person_id)
   VALUES(1,NEW.person_id)
   ON CONFLICT(company_id,person_id) DO UPDATE SET next_at=LEAST(m8_customer_locality_queue.next_at,now());
 END IF;
 RETURN NULL;
END $$;
COMMENT ON TABLE public.m8_customer_localities IS 'Localidades compartilhadas dos clientes do ERP M8. Fonte canônica: empresa 1. Associar por person_id independentemente da empresa da OS.';

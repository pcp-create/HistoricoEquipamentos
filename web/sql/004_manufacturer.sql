CREATE TABLE public.manufacturer_revisions (
 id text PRIMARY KEY, filename text NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(),
 active boolean NOT NULL DEFAULT false, report jsonb NOT NULL
);
CREATE UNIQUE INDEX manufacturer_one_active ON public.manufacturer_revisions(active) WHERE active;
CREATE TABLE public.manufacturer_variants (
 id text PRIMARY KEY, revision_id text NOT NULL REFERENCES public.manufacturer_revisions(id),
 name text NOT NULL, header jsonb NOT NULL, models jsonb NOT NULL, rules jsonb NOT NULL, issues jsonb NOT NULL
);
CREATE INDEX manufacturer_variant_revision ON public.manufacturer_variants(revision_id);
CREATE TABLE public.manufacturer_entries (
 id text PRIMARY KEY, variant_id text NOT NULL REFERENCES public.manufacturer_variants(id),
 sheet text NOT NULL, row_number integer NOT NULL, section text NOT NULL, description text NOT NULL,
 code_original text NOT NULL, code text, observation text NOT NULL,
 interval_original text NOT NULL, interval_hours numeric, issues jsonb NOT NULL,
 UNIQUE(variant_id,row_number)
);
CREATE INDEX manufacturer_entry_variant ON public.manufacturer_entries(variant_id);
CREATE INDEX manufacturer_entry_code ON public.manufacturer_entries(code);
CREATE TABLE public.manufacturer_product_codes (
 company_id bigint NOT NULL, product_id bigint NOT NULL, field text NOT NULL, code text NOT NULL,
 PRIMARY KEY(company_id,product_id,field,code),
 FOREIGN KEY(company_id,product_id) REFERENCES public.m8_product_catalog(company_id,product_id) ON DELETE CASCADE
);
CREATE INDEX manufacturer_product_code_lookup ON public.manufacturer_product_codes(code,company_id);
CREATE FUNCTION public.manufacturer_code_tokens(value text) RETURNS SETOF text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 WITH pieces AS (
 SELECT regexp_replace(upper(trim(part)),'[ .\t\r\n-]','','g') AS code
 FROM regexp_split_to_table(COALESCE(value,''),'[;,/|\r\n]+') part
 UNION
 SELECT regexp_replace(m[2],'[ .-]','','g') FROM regexp_matches(COALESCE(value,''),'(^|[^[:alnum:]])([0-9]{4}[ .-][0-9]{4}[ .-][0-9]{2}|[0-9]{10})(?=$|[^[:alnum:]])','g') m
 ) SELECT DISTINCT code FROM pieces WHERE code ~ '^[A-Z0-9]{6,24}$' AND code ~ '[0-9]'
$$;
CREATE FUNCTION public.manufacturer_index_product() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 DELETE FROM public.manufacturer_product_codes WHERE company_id=NEW.company_id AND product_id=NEW.product_id;
 INSERT INTO public.manufacturer_product_codes
 SELECT NEW.company_id,NEW.product_id,f.field,t.code
 FROM (VALUES ('referenciaFabricante'),('codigoSimilaridade')) f(field)
 CROSS JOIN LATERAL public.manufacturer_code_tokens(NEW.payload->>f.field) t(code);
 RETURN NEW;
END $$;
CREATE TRIGGER manufacturer_product_codes_refresh AFTER INSERT OR UPDATE OF payload ON public.m8_product_catalog
FOR EACH ROW EXECUTE FUNCTION public.manufacturer_index_product();
INSERT INTO public.manufacturer_product_codes
SELECT c.company_id,c.product_id,f.field,t.code FROM public.m8_product_catalog c
CROSS JOIN (VALUES ('referenciaFabricante'),('codigoSimilaridade')) f(field)
CROSS JOIN LATERAL public.manufacturer_code_tokens(c.payload->>f.field) t(code);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['manufacturer_revisions','manufacturer_variants','manufacturer_entries','manufacturer_product_codes'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t); END IF;
 END LOOP;
END $$;

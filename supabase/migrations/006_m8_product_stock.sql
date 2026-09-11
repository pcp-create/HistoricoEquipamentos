CREATE TABLE public.m8_product_catalog (
 company_id bigint NOT NULL, product_id bigint NOT NULL, name text, unit text,
 sale_price numeric, minimum_price numeric, source_updated_at timestamptz,
 collected_at timestamptz NOT NULL, payload jsonb NOT NULL,
 PRIMARY KEY(company_id,product_id)
);
CREATE TABLE public.m8_product_prices (
 company_id bigint NOT NULL, product_id bigint NOT NULL, observed_at timestamptz NOT NULL,
 sale_price numeric, minimum_price numeric, PRIMARY KEY(company_id,product_id,observed_at)
);
CREATE TABLE public.m8_product_stock (
 company_id bigint NOT NULL, product_id bigint NOT NULL, establishment_id bigint NOT NULL,
 establishment_name text, stock numeric, available numeric, average_cost numeric,
 establishment_price numeric, collected_at timestamptz NOT NULL, payload jsonb NOT NULL,
 PRIMARY KEY(company_id,product_id,establishment_id)
);
CREATE TABLE public.m8_product_available (
 company_id bigint NOT NULL, product_id bigint NOT NULL, establishment_id bigint NOT NULL,
 available numeric, collected_at timestamptz NOT NULL,
 PRIMARY KEY(company_id,product_id,establishment_id)
);
CREATE TABLE public.m8_product_sync (
 company_id bigint NOT NULL, mode text NOT NULL, cursor_at timestamptz, full_at timestamptz,
 success_at timestamptz, PRIMARY KEY(company_id,mode)
);
CREATE TABLE public.m8_product_stock_queue (
 company_id bigint NOT NULL, product_id bigint NOT NULL, attempted_at timestamptz,
 success_at timestamptz, PRIMARY KEY(company_id,product_id)
);
CREATE VIEW public.m8_product_current WITH (security_invoker=true) AS
SELECT c.company_id,c.product_id,c.unit,c.sale_price,c.minimum_price,c.collected_at AS price_at,
 s.stock,s.stock_value,s.stock_at,a.available,a.available_at
FROM public.m8_product_catalog c
LEFT JOIN LATERAL (SELECT CASE WHEN count(stock)=count(*) THEN sum(stock) END AS stock,
 CASE WHEN count(stock)=count(*) AND count(average_cost)=count(*) THEN sum(stock*average_cost) END AS stock_value,
 min(collected_at) AS stock_at FROM public.m8_product_stock s WHERE s.company_id=c.company_id AND s.product_id=c.product_id) s ON true
LEFT JOIN LATERAL (SELECT CASE WHEN count(available)=count(*) THEN sum(available) END AS available,
 min(collected_at) AS available_at FROM public.m8_product_available a WHERE a.company_id=c.company_id AND a.product_id=c.product_id) a ON true;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['m8_product_catalog','m8_product_prices','m8_product_stock','m8_product_available','m8_product_sync','m8_product_stock_queue'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
 END LOOP;
END $$;
REVOKE ALL ON public.m8_product_current FROM PUBLIC, anon, authenticated;

-- Reservation links come from the detailed stock snapshot, not historical OS consumption.
CREATE OR REPLACE VIEW public.m8_product_current WITH (security_invoker=true) AS
SELECT c.company_id,c.product_id,c.unit,c.sale_price,c.minimum_price,c.collected_at AS price_at,
 s.stock,s.stock_value,s.stock_at,s.available,s.stock_at AS available_at,
 COALESCE(reservations.orders,'[]'::jsonb) AS reserved_orders
FROM public.m8_product_catalog c
LEFT JOIN LATERAL (
 SELECT CASE WHEN count(stock)=count(*) THEN sum(stock) END AS stock,
 CASE WHEN count(stock)=count(*) AND count(average_cost)=count(*) THEN sum(stock*average_cost) END AS stock_value,
 CASE WHEN count(available)=count(*) THEN sum(available) END AS available,
 min(collected_at) AS stock_at
 FROM public.m8_product_stock s WHERE s.company_id=c.company_id AND s.product_id=c.product_id
) s ON true
LEFT JOIN LATERAL (
 SELECT jsonb_agg(jsonb_build_object(
   'company_id',c.company_id,'order_id',r.order_id::text,
   'order_number',COALESCE(o.numero_sequencia,o.id_m8,r.order_id)::text,
   'imported',o.id_m8 IS NOT NULL
 ) ORDER BY r.order_id DESC) AS orders
 FROM (
   SELECT DISTINCT token::bigint AS order_id
   FROM public.m8_product_stock ps
   CROSS JOIN LATERAL regexp_split_to_table(COALESCE(ps.payload->>'idsOs',''), '[,;[:space:]]+') AS token
   WHERE ps.company_id=c.company_id AND ps.product_id=c.product_id
     AND token ~ '^[1-9][0-9]{0,17}$'
 ) r
 LEFT JOIN public.m8_ordens_servico o ON o.company_id=c.company_id AND o.id_m8=r.order_id
) reservations ON true;

-- The batch availability endpoint returns zero for products whose detailed stock
-- contains a nonzero available balance (confirmed with M8 product 19420).
-- Use only the detailed snapshot and its timestamp; unknown never becomes zero.
CREATE OR REPLACE VIEW public.m8_product_current WITH (security_invoker=true) AS
SELECT c.company_id,c.product_id,c.unit,c.sale_price,c.minimum_price,c.collected_at AS price_at,
 s.stock,s.stock_value,s.stock_at,s.available,s.stock_at AS available_at
FROM public.m8_product_catalog c
LEFT JOIN LATERAL (
 SELECT CASE WHEN count(stock)=count(*) THEN sum(stock) END AS stock,
 CASE WHEN count(stock)=count(*) AND count(average_cost)=count(*) THEN sum(stock*average_cost) END AS stock_value,
 CASE WHEN count(available)=count(*) THEN sum(available) END AS available,
 min(collected_at) AS stock_at
 FROM public.m8_product_stock s WHERE s.company_id=c.company_id AND s.product_id=c.product_id
) s ON true;

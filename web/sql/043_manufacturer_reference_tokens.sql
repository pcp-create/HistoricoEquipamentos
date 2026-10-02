-- Recognize codes preceded by a manufacturer name, preserving legacy tokens.
CREATE OR REPLACE FUNCTION public.manufacturer_code_tokens(value text) RETURNS SETOF text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 WITH pieces AS (
 SELECT regexp_replace(upper(trim(part)),'[ .\t\r\n-]','','g') AS code
 FROM regexp_split_to_table(COALESCE(value,''),'[;,/|\r\n]+') part
 UNION
 SELECT regexp_replace(m[2],'[ .-]','','g') FROM regexp_matches(COALESCE(value,''),'(^|[^[:alnum:]])([0-9]{4}[ .-][0-9]{4}[ .-][0-9]{2}|[0-9]{10})(?=$|[^[:alnum:]])','g') m
 UNION
 SELECT regexp_replace(
   regexp_replace(upper(trim(part)), '^[[:alpha:]][[:alpha:] .&-]*[[:space:]]+', ''),
   '[ .\t\r\n-]', '', 'g')
 FROM regexp_split_to_table(COALESCE(value,''),'[;,/|\r\n]+') part
 WHERE upper(trim(part)) ~ '^[[:alpha:]][[:alpha:] .&-]*[[:space:]]+[A-Z0-9.-]*[0-9]'
 ) SELECT DISTINCT code FROM pieces WHERE code ~ '^[A-Z0-9]{6,24}$' AND code ~ '[0-9]'
$$;

-- Rebuild existing links; the existing product trigger uses the new tokenizer.
DELETE FROM public.manufacturer_product_codes;
INSERT INTO public.manufacturer_product_codes
SELECT c.company_id,c.product_id,f.field,t.code FROM public.m8_product_catalog c
CROSS JOIN (VALUES ('referenciaFabricante'),('codigoSimilaridade')) f(field)
CROSS JOIN LATERAL public.manufacturer_code_tokens(c.payload->>f.field) t(code);

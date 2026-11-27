BEGIN;
CREATE OR REPLACE FUNCTION crm_business_minutes(start_at timestamptz,end_at timestamptz)
RETURNS numeric LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT COALESCE(sum(GREATEST(0,extract(epoch FROM
   LEAST(end_at AT TIME ZONE 'America/Sao_Paulo',d+interval '1 day')
   -GREATEST(start_at AT TIME ZONE 'America/Sao_Paulo',d)
 )))/60,0)
 FROM generate_series(date_trunc('day',start_at AT TIME ZONE 'America/Sao_Paulo'),
                      date_trunc('day',end_at AT TIME ZONE 'America/Sao_Paulo'),interval '1 day') d
 WHERE extract(isodow FROM d)<6
$$;
COMMIT;

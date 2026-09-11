CREATE TABLE public.m8_service_catalog (
  company_id bigint NOT NULL,
  service_id bigint NOT NULL,
  name text NOT NULL,
  unit text,
  internal_code text,
  sale_price numeric,
  minimum_price numeric,
  collected_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY(company_id,service_id)
);
ALTER TABLE public.m8_service_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.m8_service_catalog FROM PUBLIC, anon, authenticated;

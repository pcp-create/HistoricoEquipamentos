CREATE TABLE public.web_order_profit (
  company_id bigint NOT NULL,
  order_id bigint NOT NULL,
  document jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  calculated_by text NOT NULL,
  PRIMARY KEY(company_id,order_id),
  CHECK(company_id IN (1,2,27404))
);
ALTER TABLE public.web_order_profit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_order_profit FROM PUBLIC, anon, authenticated;

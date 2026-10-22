CREATE TABLE public.m8_purchase_orders (
 company_id integer NOT NULL, id bigint NOT NULL, status text NOT NULL,
 eligible boolean NOT NULL, present boolean NOT NULL DEFAULT true,
 supplier text, payload jsonb NOT NULL,
 collected_at timestamptz NOT NULL DEFAULT now(), detail_at timestamptz,
 pending boolean NOT NULL DEFAULT true, retry_after timestamptz, failures integer NOT NULL DEFAULT 0,
 PRIMARY KEY(company_id,id)
);
CREATE TABLE public.m8_purchase_items (
 company_id integer NOT NULL, order_id bigint NOT NULL, id bigint NOT NULL,
 product_id bigint, unit text, quantity numeric NOT NULL, purchased numeric NOT NULL,
 balance numeric NOT NULL, eligible boolean NOT NULL, payload jsonb NOT NULL,
 PRIMARY KEY(company_id,order_id,id),
 FOREIGN KEY(company_id,order_id) REFERENCES public.m8_purchase_orders(company_id,id)
);
CREATE TABLE public.m8_purchase_sync (
 company_id integer PRIMARY KEY, headers_at timestamptz NOT NULL
);
CREATE INDEX m8_purchase_queue ON public.m8_purchase_orders(company_id,detail_at);
CREATE INDEX m8_purchase_product ON public.m8_purchase_items(company_id,product_id);
ALTER TABLE public.m8_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m8_purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m8_purchase_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.m8_purchase_orders,public.m8_purchase_items,public.m8_purchase_sync FROM PUBLIC,anon,authenticated;

-- Preserve existing links; empty legacy rows represented removed links.
DELETE FROM public.web_order_links WHERE linked_company_id IS NULL OR linked_order_id IS NULL;
ALTER TABLE public.web_order_links DROP CONSTRAINT IF EXISTS web_order_links_pkey;
ALTER TABLE public.web_order_links ALTER COLUMN linked_company_id SET NOT NULL;
ALTER TABLE public.web_order_links ALTER COLUMN linked_order_id SET NOT NULL;
ALTER TABLE public.web_order_links ADD PRIMARY KEY(company_id,order_id,linked_company_id,linked_order_id);
CREATE INDEX IF NOT EXISTS web_order_links_target_idx ON public.web_order_links(linked_company_id,linked_order_id);

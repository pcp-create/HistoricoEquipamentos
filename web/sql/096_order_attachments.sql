CREATE TABLE IF NOT EXISTS public.web_order_attachment_uploads (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL CHECK(company_id IN(1,2,27404)),order_id bigint NOT NULL,
 filename text NOT NULL,sha256 text NOT NULL,actor text NOT NULL,
 state text NOT NULL CHECK(state IN('sending','complete','rejected','uncertain')),attachment_id text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,order_id,filename,sha256)
);
ALTER TABLE public.web_order_attachment_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_order_attachment_uploads FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.m8_quotes (
 company_id integer NOT NULL, id bigint NOT NULL, number text NOT NULL, revision integer NOT NULL DEFAULT 0,
 client text, document text, client_id text, city text, state text, description text, type_name text, status text, situation text,
 emission date, validity date, total numeric, payload jsonb NOT NULL,
 collected_at timestamptz NOT NULL DEFAULT now(), detail_at timestamptz, pending boolean NOT NULL DEFAULT true,
 retry_after timestamptz, failures integer NOT NULL DEFAULT 0,
 PRIMARY KEY(company_id,id)
);
CREATE TABLE IF NOT EXISTS public.m8_quote_items (
 company_id integer NOT NULL, quote_id bigint NOT NULL, kind text NOT NULL CHECK(kind IN ('produto','servico','vendedor')),
 id bigint NOT NULL, payload jsonb NOT NULL,
 PRIMARY KEY(company_id,quote_id,kind,id),
 FOREIGN KEY(company_id,quote_id) REFERENCES public.m8_quotes(company_id,id)
);
CREATE INDEX IF NOT EXISTS m8_quotes_emission ON public.m8_quotes(emission DESC,id DESC);
CREATE INDEX IF NOT EXISTS m8_quotes_queue ON public.m8_quotes(company_id,pending,detail_at);
ALTER TABLE public.m8_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m8_quote_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.m8_quotes,public.m8_quote_items FROM PUBLIC,anon,authenticated;

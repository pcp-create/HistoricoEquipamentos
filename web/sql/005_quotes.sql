CREATE TABLE public.web_quotes (
 id uuid PRIMARY KEY,
 number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 version integer NOT NULL DEFAULT 1,
 company_id integer NOT NULL CHECK (company_id IN (1,2,27404)),
 client_name text NOT NULL,
 equipment text NOT NULL,
 service_type text NOT NULL,
 document jsonb NOT NULL,
 total_cents bigint NOT NULL CHECK (total_cents >= 0),
 created_by text NOT NULL,
 updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_quotes_updated ON public.web_quotes(updated_at DESC);
ALTER TABLE public.web_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_quotes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.web_quotes_number_seq FROM PUBLIC, anon, authenticated;

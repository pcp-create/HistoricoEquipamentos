CREATE TABLE public.m8_customer_commercial (
 person_id bigint PRIMARY KEY, detail jsonb NOT NULL, sellers jsonb NOT NULL,
 synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.m8_customer_commercial_queue (
 person_id bigint PRIMARY KEY, next_at timestamptz NOT NULL DEFAULT now(),
 checked_at timestamptz, error text
);
CREATE INDEX m8_customer_commercial_due ON public.m8_customer_commercial_queue(next_at,person_id);
CREATE TABLE public.m8_customer_commercial_sync (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), catalog_at timestamptz NOT NULL
);
ALTER TABLE public.m8_customer_commercial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m8_customer_commercial_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m8_customer_commercial_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.m8_customer_commercial,public.m8_customer_commercial_queue,public.m8_customer_commercial_sync FROM PUBLIC,anon,authenticated;

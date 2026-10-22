BEGIN;
CREATE TABLE IF NOT EXISTS public.service_order_edits (
 id uuid PRIMARY KEY,
 company_id integer NOT NULL CHECK(company_id IN(1,2,27404)),
 m8_id bigint NOT NULL,
 created_by text NOT NULL,
 source_hash text NOT NULL,
 request jsonb NOT NULL,
 steps jsonb NOT NULL,
 state text NOT NULL CHECK(state IN('ready','sending','partial','uncertain','rejected','complete')),
 next_step integer NOT NULL DEFAULT 0,
 message text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS service_order_edits_active_order ON public.service_order_edits(company_id,m8_id)
 WHERE state IN('ready','sending','partial','uncertain');
CREATE INDEX IF NOT EXISTS service_order_edits_completed ON public.service_order_edits(company_id,m8_id,updated_at DESC) WHERE state='complete';
ALTER TABLE public.service_order_edits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_order_edits FROM anon,authenticated;
COMMIT;

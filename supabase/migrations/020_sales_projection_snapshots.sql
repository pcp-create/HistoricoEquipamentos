CREATE TABLE IF NOT EXISTS public.web_sales_projection_snapshots (
 id uuid PRIMARY KEY,
 period text NOT NULL CHECK (period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by text NOT NULL,
 document jsonb NOT NULL,
 schema_version integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS sales_projection_snapshots_period_date
 ON public.web_sales_projection_snapshots(period, created_at DESC);
ALTER TABLE public.web_sales_projection_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_sales_projection_snapshots FROM PUBLIC, anon, authenticated;
-- Snapshots are immutable, including through accidental application updates.
CREATE OR REPLACE FUNCTION public.reject_projection_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Parciais da projeção são imutáveis';
END $$;
DROP TRIGGER IF EXISTS immutable_projection_snapshot ON public.web_sales_projection_snapshots;
CREATE TRIGGER immutable_projection_snapshot BEFORE UPDATE OR DELETE
 ON public.web_sales_projection_snapshots FOR EACH ROW
 EXECUTE FUNCTION public.reject_projection_snapshot_mutation();

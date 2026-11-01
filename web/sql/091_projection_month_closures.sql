-- Preserve the forecast baseline independently of later snapshot deletion or ERP changes.
CREATE TABLE IF NOT EXISTS web_projection_month_closures (
 period text PRIMARY KEY CHECK(period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 snapshot_id uuid NOT NULL,
 label text NOT NULL,
 captured_at timestamptz NOT NULL,
 document jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE web_projection_month_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_projection_month_closures FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION reject_projection_closure_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Fechamentos mensais são imutáveis'; END $$;
CREATE TRIGGER immutable_projection_month_closure BEFORE UPDATE OR DELETE ON web_projection_month_closures
 FOR EACH ROW EXECUTE FUNCTION reject_projection_closure_mutation();

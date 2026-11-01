-- Corrections require an append-only audit matching the complete old and new rows.
CREATE TABLE IF NOT EXISTS web_projection_closure_corrections (
 id uuid PRIMARY KEY,
 period text NOT NULL REFERENCES web_projection_month_closures(period),
 previous_closure jsonb NOT NULL,
 corrected_closure jsonb NOT NULL,
 reason text NOT NULL CHECK(length(reason)>0),
 actor text NOT NULL CHECK(length(actor)>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE web_projection_closure_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_projection_closure_corrections FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION reject_projection_closure_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Auditorias de fechamento são imutáveis'; END $$;
CREATE TRIGGER immutable_projection_closure_audit BEFORE UPDATE OR DELETE ON web_projection_closure_corrections
 FOR EACH ROW EXECUTE FUNCTION reject_projection_closure_audit_mutation();
CREATE OR REPLACE FUNCTION reject_projection_closure_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND EXISTS (
  SELECT 1 FROM web_projection_closure_corrections a
  WHERE a.id=NULLIF(current_setting('app.projection_closure_correction',true),'')::uuid
   AND a.period=OLD.period AND a.previous_closure=to_jsonb(OLD) AND a.corrected_closure=to_jsonb(NEW)
 ) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Fechamentos mensais são imutáveis; correção exige auditoria autorizada';
END $$;

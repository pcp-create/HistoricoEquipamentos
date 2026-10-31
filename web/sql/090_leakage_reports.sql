CREATE TABLE IF NOT EXISTS web_leakage_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),version integer NOT NULL DEFAULT 1,
 title text NOT NULL,client text NOT NULL,service_order text NOT NULL DEFAULT '',
 document jsonb NOT NULL,source_key text UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),created_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),updated_by text NOT NULL
);
CREATE TABLE IF NOT EXISTS web_leakage_report_revisions (
 report_id uuid NOT NULL REFERENCES web_leakage_reports(id),version integer NOT NULL,
 document jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),created_by text NOT NULL,
 PRIMARY KEY(report_id,version)
);
CREATE TABLE IF NOT EXISTS web_leakage_report_images (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digest text UNIQUE NOT NULL,
 content bytea NOT NULL,content_type text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),created_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS leakage_reports_updated ON web_leakage_reports(updated_at DESC,id);
ALTER TABLE web_leakage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_leakage_report_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_leakage_report_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_leakage_reports,web_leakage_report_revisions,web_leakage_report_images FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION reject_leakage_revision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'O histórico do levantamento é imutável'; END $$;
DROP TRIGGER IF EXISTS immutable_leakage_revision ON web_leakage_report_revisions;
CREATE TRIGGER immutable_leakage_revision BEFORE UPDATE OR DELETE ON web_leakage_report_revisions FOR EACH ROW EXECUTE FUNCTION reject_leakage_revision_mutation();

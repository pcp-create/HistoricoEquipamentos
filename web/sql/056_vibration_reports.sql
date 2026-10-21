BEGIN;
CREATE TABLE IF NOT EXISTS web_vibration_report_images (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), digest text NOT NULL UNIQUE,
 content bytea NOT NULL CHECK(octet_length(content)<=3000000),
 content_type text NOT NULL CHECK(content_type IN ('image/png','image/jpeg','image/webp')),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS web_vibration_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version integer NOT NULL DEFAULT 1,
 title text NOT NULL, service_order text NOT NULL DEFAULT '', clients text NOT NULL DEFAULT '',
 document jsonb NOT NULL, created_by text NOT NULL, updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_vibration_reports_updated ON web_vibration_reports(updated_at DESC,id);
CREATE TABLE IF NOT EXISTS web_vibration_report_image_links (
 report_id uuid NOT NULL REFERENCES web_vibration_reports(id) ON DELETE CASCADE,
 image_id uuid NOT NULL REFERENCES web_vibration_report_images(id), PRIMARY KEY(report_id,image_id)
);
ALTER TABLE web_vibration_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_vibration_report_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_vibration_report_image_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_vibration_reports,web_vibration_report_images,web_vibration_report_image_links FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON web_vibration_reports,web_vibration_report_images,web_vibration_report_image_links FROM anon,authenticated; END IF; END $$;
COMMIT;

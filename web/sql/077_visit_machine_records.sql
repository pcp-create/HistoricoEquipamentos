BEGIN;
ALTER TABLE web_sales_visits ADD COLUMN IF NOT EXISTS machine_records jsonb NOT NULL DEFAULT '[]', ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS web_visit_photos(id uuid PRIMARY KEY,visit_id uuid NOT NULL REFERENCES web_sales_visits(id) ON DELETE CASCADE,content bytea NOT NULL);
ALTER TABLE web_visit_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_visit_photos FROM PUBLIC,anon,authenticated;
ALTER TABLE web_equipment_events DROP CONSTRAINT IF EXISTS web_equipment_events_kind_check;
ALTER TABLE web_equipment_events ADD CONSTRAINT web_equipment_events_kind_check CHECK(kind IN('settings','plan','maintenance','archive','visit'));
COMMIT;

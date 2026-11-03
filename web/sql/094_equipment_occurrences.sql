CREATE TABLE IF NOT EXISTS web_equipment_occurrences (
 id uuid PRIMARY KEY,
 equipment_id bigint NOT NULL REFERENCES m8_equipment_catalog(equipment_id),
 occurred_on date NOT NULL,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 12000),
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_equipment_occurrences_history ON web_equipment_occurrences(equipment_id,occurred_on DESC,created_at DESC);
ALTER TABLE web_equipment_occurrences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_equipment_occurrences FROM PUBLIC,anon,authenticated;

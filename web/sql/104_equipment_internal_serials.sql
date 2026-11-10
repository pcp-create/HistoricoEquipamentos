BEGIN;
CREATE TABLE IF NOT EXISTS web_equipment_serial_counter(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),last_number bigint NOT NULL CHECK(last_number>=1)
);
INSERT INTO web_equipment_serial_counter(singleton,last_number) VALUES(true,1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS web_equipment_internal_serials(
 id uuid PRIMARY KEY,actor text NOT NULL,number bigint NOT NULL UNIQUE CHECK(number>=2 AND number<=999999999999),
 registration_id uuid,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE web_equipment_serial_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_equipment_internal_serials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_equipment_serial_counter,web_equipment_internal_serials FROM PUBLIC,anon,authenticated;
COMMIT;

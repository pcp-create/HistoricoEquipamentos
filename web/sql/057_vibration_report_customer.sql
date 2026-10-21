BEGIN;
ALTER TABLE web_vibration_reports ADD COLUMN IF NOT EXISTS customer_company_id integer;
ALTER TABLE web_vibration_reports ADD COLUMN IF NOT EXISTS customer_person_id bigint;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='web_vibration_reports_customer_fk') THEN
  ALTER TABLE web_vibration_reports ADD CONSTRAINT web_vibration_reports_customer_fk
   FOREIGN KEY(customer_company_id,customer_person_id) REFERENCES m8_customer_directory(company_id,person_id);
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS web_vibration_reports_customer ON web_vibration_reports(customer_company_id,customer_person_id);
COMMIT;

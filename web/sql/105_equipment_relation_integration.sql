BEGIN;
ALTER TABLE web_equipment_customer_links ADD COLUMN IF NOT EXISTS integration_state text NOT NULL DEFAULT 'pending';
ALTER TABLE web_equipment_customer_links ADD COLUMN IF NOT EXISTS integration_error text;
ALTER TABLE web_equipment_customer_links ADD COLUMN IF NOT EXISTS integration_lease uuid;
ALTER TABLE web_equipment_customer_links ADD COLUMN IF NOT EXISTS integration_lease_at timestamptz;
UPDATE web_equipment_customer_links SET integration_state='confirmed' WHERE confirmed_at IS NOT NULL;
ALTER TABLE web_visit_equipment_inactivations ADD COLUMN IF NOT EXISTS integration_status text NOT NULL DEFAULT 'pending';
ALTER TABLE web_visit_equipment_inactivations ADD COLUMN IF NOT EXISTS integration_error text;
ALTER TABLE web_visit_equipment_inactivations ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE web_visit_equipment_inactivations ADD COLUMN IF NOT EXISTS reactivated_at timestamptz;
CREATE OR REPLACE FUNCTION web_confirm_equipment_customer_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.present THEN
  WITH confirmed AS (
   UPDATE web_equipment_customer_links SET confirmed_at=now(),integration_state='confirmed',integration_error=NULL
   WHERE equipment_id=NEW.equipment_id AND customer_key='m8:'||NEW.person_id::text AND confirmed_at IS NULL RETURNING task_id
  ) UPDATE web_tasks SET status='completed',source_resolved=true,completed_at=now(),updated_at=now(),updated_by='Sistema · integração de equipamentos',version=version+1
   WHERE id IN(SELECT task_id FROM confirmed WHERE task_id IS NOT NULL) AND status<>'completed';
 END IF;
 RETURN NEW;
END;$$;
COMMIT;

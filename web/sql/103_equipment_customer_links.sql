BEGIN;
CREATE TABLE IF NOT EXISTS web_equipment_customer_links (
 equipment_id bigint NOT NULL,customer_key text NOT NULL CHECK(customer_key ~ '^(m8:[0-9]+|lead:[0-9a-f-]{36})$'),
 customer_name text NOT NULL,actor text NOT NULL,source text NOT NULL,
 registration_id uuid,task_id bigint REFERENCES web_tasks(id),created_at timestamptz NOT NULL DEFAULT now(),confirmed_at timestamptz,
 PRIMARY KEY(equipment_id,customer_key)
);
ALTER TABLE web_equipment_customer_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_equipment_customer_links FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE VIEW web_effective_person_equipment AS
 SELECT DISTINCT p.company_id,'m8:'||p.person_id::text customer_key,p.person_id,p.equipment_id,p.person_name,false AS integration_pending,true AS present
 FROM m8_person_equipment p WHERE p.present
 UNION ALL
 SELECT 1,l.customer_key,CASE WHEN l.customer_key LIKE 'm8:%' THEN substring(l.customer_key FROM 4)::bigint END,l.equipment_id,l.customer_name,true,true
 FROM web_equipment_customer_links l WHERE l.confirmed_at IS NULL AND NOT EXISTS(
 SELECT 1 FROM m8_person_equipment p WHERE p.present AND p.equipment_id=l.equipment_id AND 'm8:'||p.person_id::text=l.customer_key);
REVOKE ALL ON web_effective_person_equipment FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION web_confirm_equipment_customer_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.present THEN
  WITH confirmed AS (
   UPDATE web_equipment_customer_links SET confirmed_at=now()
   WHERE equipment_id=NEW.equipment_id AND customer_key='m8:'||NEW.person_id::text AND confirmed_at IS NULL RETURNING task_id
  ) UPDATE web_tasks SET status='completed',source_resolved=true,completed_at=now(),updated_at=now(),updated_by='Sistema · integração de equipamentos',version=version+1
   WHERE id IN(SELECT task_id FROM confirmed WHERE task_id IS NOT NULL) AND status<>'completed';
 END IF;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS web_equipment_customer_link_confirm ON m8_person_equipment;
CREATE TRIGGER web_equipment_customer_link_confirm AFTER INSERT OR UPDATE ON m8_person_equipment FOR EACH ROW EXECUTE FUNCTION web_confirm_equipment_customer_link();
CREATE OR REPLACE FUNCTION web_equipment_serial_key(value text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT regexp_replace(translate(upper(coalesce(value,'')),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','AAAAAEEEEIIIIOOOOOUUUUC'),'[^A-Z0-9]','','g');
$$;
CREATE INDEX IF NOT EXISTS equipment_catalog_serial_normalized ON m8_equipment_catalog((web_equipment_serial_key(serial))) WHERE present;
ALTER TABLE web_visit_machine_registrations ADD COLUMN IF NOT EXISTS registration_document jsonb;
ALTER TABLE web_visit_machine_registrations ADD COLUMN IF NOT EXISTS equipment_id bigint;
COMMIT;

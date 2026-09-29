CREATE OR REPLACE FUNCTION web_schedule_rule_matches(o jsonb, config jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE r jsonb; c jsonb; matched boolean; condition boolean; first_condition boolean;
BEGIN
 IF config->>'enabled' IS DISTINCT FROM 'true' THEN RETURN false; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(config->'rules','[]'::jsonb)) LOOP
  matched:=false; first_condition:=true;
  FOR c IN SELECT value FROM jsonb_array_elements(coalesce(r->'conditions','[]'::jsonb)) LOOP
   IF c->>'field' NOT IN ('tipo_nome','situacao_nome','tipo_atendimento_nome') OR c->>'operator' NOT IN ('eq','neq') THEN RETURN false; END IF;
   condition:=coalesce(CASE WHEN c->>'operator'='eq' THEN o->>(c->>'field')=c->>'value' ELSE o->>(c->>'field')<>c->>'value' END,false);
   IF first_condition THEN matched:=condition;first_condition:=false;
   ELSIF c->>'connector'='and' THEN matched:=matched AND condition;
   ELSIF c->>'connector'='or' THEN matched:=matched OR condition;
   ELSE RETURN false;END IF;
  END LOOP;
  IF NOT first_condition AND matched THEN RETURN true; END IF;
 END LOOP;
 RETURN false;
END $$;
CREATE OR REPLACE FUNCTION web_auto_schedule_changed_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE config jsonb; schedule bigint;
BEGIN
 IF NEW.company_id NOT IN (1,2,27404) THEN RETURN NEW;END IF;
 SELECT document->'automaticEntry' INTO config FROM web_service_schedule_settings WHERE id=1;
 IF NOT web_schedule_rule_matches(to_jsonb(NEW),config) THEN RETURN NEW;END IF;
 INSERT INTO web_service_schedules(company_id,order_id,created_by) VALUES(NEW.company_id,NEW.id_m8,'Sistema · Entrada automática') ON CONFLICT(company_id,order_id) DO NOTHING RETURNING id INTO schedule;
 IF schedule IS NOT NULL THEN
  INSERT INTO web_service_operations(id,schedule_id,position,document,updated_by) VALUES(gen_random_uuid(),schedule,1,'{"serviceType":"","jobTitle":"","description":"","internalNote":"","vehicleId":"","checklistId":"","responsible":"","support":[],"date":"","time":"","duration":null,"calendarId":"standard","checked":[]}'::jsonb,'Sistema · Entrada automática');
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS web_auto_schedule_changed_order ON m8_ordens_servico;
CREATE TRIGGER web_auto_schedule_changed_order AFTER INSERT OR UPDATE OF tipo_nome,situacao_nome,tipo_atendimento_nome ON m8_ordens_servico FOR EACH ROW EXECUTE FUNCTION web_auto_schedule_changed_order();
CREATE OR REPLACE FUNCTION web_auto_schedule_existing_orders() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.document->'automaticEntry' IS NOT DISTINCT FROM OLD.document->'automaticEntry' THEN RETURN NEW;END IF;
 WITH added AS (
  INSERT INTO web_service_schedules(company_id,order_id,created_by)
  SELECT o.company_id,o.id_m8,'Sistema · Entrada automática' FROM m8_ordens_servico o WHERE o.company_id IN(1,2,27404) AND web_schedule_rule_matches(to_jsonb(o),NEW.document->'automaticEntry')
  ON CONFLICT(company_id,order_id) DO NOTHING RETURNING id
 ) INSERT INTO web_service_operations(id,schedule_id,position,document,updated_by)
 SELECT gen_random_uuid(),id,1,'{"serviceType":"","jobTitle":"","description":"","internalNote":"","vehicleId":"","checklistId":"","responsible":"","support":[],"date":"","time":"","duration":null,"calendarId":"standard","checked":[]}'::jsonb,'Sistema · Entrada automática' FROM added;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS web_auto_schedule_existing_orders ON web_service_schedule_settings;
CREATE TRIGGER web_auto_schedule_existing_orders AFTER UPDATE ON web_service_schedule_settings FOR EACH ROW EXECUTE FUNCTION web_auto_schedule_existing_orders();

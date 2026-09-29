CREATE OR REPLACE FUNCTION web_schedule_rule_matches(o jsonb, config jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE r jsonb; c jsonb; matched boolean; condition boolean; first_condition boolean;
BEGIN
 IF config->>'enabled' IS DISTINCT FROM 'true' THEN RETURN false; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(config->'rules','[]'::jsonb)) LOOP
  matched:=false; first_condition:=true;
  FOR c IN SELECT value FROM jsonb_array_elements(coalesce(r->'conditions','[]'::jsonb)) LOOP
   IF c->>'field' NOT IN ('tipo_nome','situacao_nome','tipo_atendimento_nome','status_lancamento_nome') OR c->>'operator' NOT IN ('eq','neq') THEN RETURN false; END IF;
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
DROP TRIGGER IF EXISTS web_auto_schedule_changed_order ON m8_ordens_servico;
CREATE TRIGGER web_auto_schedule_changed_order AFTER INSERT OR UPDATE OF tipo_nome,situacao_nome,tipo_atendimento_nome,status_lancamento_nome ON m8_ordens_servico FOR EACH ROW EXECUTE FUNCTION web_auto_schedule_changed_order();

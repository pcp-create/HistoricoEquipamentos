-- Process events are recorded in the same transaction as the action that caused them.
ALTER TABLE web_task_notes ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES web_quotes(id);
CREATE TABLE IF NOT EXISTS web_task_quote_links (
 task_id bigint NOT NULL REFERENCES web_tasks(id),
 quote_id uuid NOT NULL REFERENCES web_quotes(id),
 PRIMARY KEY(task_id,quote_id)
);
ALTER TABLE web_task_quote_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_task_quote_links FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION web_task_equipment_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t record; label text; detail text; qid uuid; who text; is_quote boolean;
BEGIN
 is_quote := NEW.document->>'action'='quote';
 IF NEW.kind IN ('settings','plan') AND NOT coalesce(is_quote,false) AND NEW.document->'before' IS NOT DISTINCT FROM NEW.document->'after' THEN RETURN NEW; END IF;
 who:=coalesce(nullif(NEW.display_name,''),'Sistema');
 IF is_quote THEN
  qid:=(NEW.document->>'quoteId')::uuid;
  label:='Orçamento criado';
  detail:='Gerado orçamento nº '||coalesce(NEW.document->>'quoteNumber','')||' para '||coalesce(NEW.document->>'planName','o plano preventivo')||'. Rascunho disponível para edição.';
 ELSE
  label:=CASE NEW.kind WHEN 'maintenance' THEN 'Manutenção registrada' WHEN 'archive' THEN 'Plano arquivado' WHEN 'settings' THEN 'Dados do equipamento atualizados' ELSE 'Plano preventivo atualizado' END;
  detail:=label||'. '||coalesce(NEW.document->'after'->>'name','');
  IF NEW.kind='maintenance' THEN detail:=detail||' Data: '||coalesce(NEW.document->'after'->>'lastDate','não informada')||'. OS: '||coalesce(nullif(NEW.document->'after'->>'lastOrder',''),'não informada')||'.'; END IF;
 END IF;
 FOR t IN SELECT * FROM web_tasks WHERE equipment_id=NEW.equipment_id AND status<>'completed'
   AND (NEW.plan_id IS NULL OR plan_id IS NULL OR plan_id=NEW.plan_id::text OR
     (source_key='preventive-group:'||NEW.equipment_id::text AND EXISTS(SELECT 1 FROM web_equipment_plans p WHERE p.id=NEW.plan_id AND nullif(p.document->>'hours','')::numeric>0)))
   ORDER BY id FOR UPDATE
 LOOP
  IF is_quote THEN INSERT INTO web_task_quote_links(task_id,quote_id) VALUES(t.id,qid) ON CONFLICT DO NOTHING; END IF;
  INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name,quote_id)
    VALUES(t.id,label,detail,true,NEW.created_by,who,qid);
  UPDATE web_tasks SET status=CASE WHEN is_quote AND status='not_started' THEN 'in_progress' ELSE status END,
    kanban_column=CASE WHEN is_quote AND status='not_started' THEN 'in_progress' ELSE kanban_column END,
    updated_at=now(),updated_by=NEW.created_by,version=version+1 WHERE id=t.id;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS web_task_equipment_history ON web_equipment_events;
CREATE TRIGGER web_task_equipment_history AFTER INSERT ON web_equipment_events FOR EACH ROW EXECUTE FUNCTION web_task_equipment_history();

CREATE OR REPLACE FUNCTION web_task_quote_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t record; label text; who text;
BEGIN
 IF NEW.document IS NOT DISTINCT FROM OLD.document AND NEW.total_cents IS NOT DISTINCT FROM OLD.total_cents THEN RETURN NEW; END IF;
 label:=CASE WHEN NEW.document->>'deletedAt' IS NOT NULL AND OLD.document->>'deletedAt' IS NULL THEN 'Orçamento excluído' ELSE 'Orçamento atualizado' END;
 SELECT display_name INTO who FROM web_user_access WHERE email=NEW.updated_by;
 FOR t IN SELECT w.* FROM web_tasks w JOIN web_task_quote_links l ON l.task_id=w.id WHERE l.quote_id=NEW.id ORDER BY w.id FOR UPDATE OF w
 LOOP
  INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name,quote_id)
    VALUES(t.id,label,label||': nº '||NEW.number::text||'. Cliente: '||NEW.client_name||'. Materiais e serviços: '||jsonb_array_length(coalesce(NEW.document->'items','[]'::jsonb))::text||'.',true,NEW.updated_by,coalesce(nullif(who,''),'Usuário não identificado'),NEW.id);
  UPDATE web_tasks SET updated_at=now(),updated_by=NEW.updated_by,version=version+1 WHERE id=t.id;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS web_task_quote_history ON web_quotes;
CREATE TRIGGER web_task_quote_history AFTER UPDATE ON web_quotes FOR EACH ROW EXECUTE FUNCTION web_task_quote_history();

CREATE OR REPLACE FUNCTION web_task_order_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t record;
BEGIN
 IF NEW.observacao IS NOT DISTINCT FROM OLD.observacao AND NEW.cliente_nome IS NOT DISTINCT FROM OLD.cliente_nome AND NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.total_geral IS NOT DISTINCT FROM OLD.total_geral AND NEW.data_entrega_prevista IS NOT DISTINCT FROM OLD.data_entrega_prevista AND NEW.data_entrega IS NOT DISTINCT FROM OLD.data_entrega THEN RETURN NEW; END IF;
 FOR t IN SELECT * FROM web_tasks WHERE ((order_company=NEW.company_id AND order_id=NEW.id_m8) OR (source_key LIKE 'rental:%' AND split_part(source_key,':',3)=NEW.company_id::text AND split_part(source_key,':',4)=NEW.id_m8::text)) AND status<>'completed' ORDER BY id FOR UPDATE
 LOOP
  INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name)
    VALUES(t.id,'OS vinculada atualizada','OS '||coalesce(NEW.numero_sequencia,NEW.id_m8)::text||'. Status: '||coalesce(OLD.status,'não informado')||' → '||coalesce(NEW.status,'não informado')||'. Previsão de entrega: '||coalesce(NEW.data_entrega_prevista::text,'não informada')||'. Atualização recebida do M8.',true,'Sistema','Integração M8');
  UPDATE web_tasks SET updated_at=now(),updated_by='Sistema',version=version+1 WHERE id=t.id;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS web_task_order_history ON m8_ordens_servico;
CREATE TRIGGER web_task_order_history AFTER UPDATE ON m8_ordens_servico FOR EACH ROW EXECUTE FUNCTION web_task_order_history();

CREATE OR REPLACE FUNCTION web_task_order_item_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t record; item jsonb; previous jsonb; label text; changed boolean;
BEGIN
 IF TG_OP='DELETE' THEN item:=to_jsonb(OLD); ELSE item:=to_jsonb(NEW); END IF;
 IF TG_OP='UPDATE' THEN
  previous:=to_jsonb(OLD);
  SELECT EXISTS(SELECT 1 FROM unnest(ARRAY['produto_id','produto_nome','servico_id','servico_nome','quantidade','valor_unitario','valor_total','situacao_item_nome','observacao']) k WHERE item->k IS DISTINCT FROM previous->k) INTO changed;
  IF NOT changed THEN RETURN NEW; END IF;
 END IF;
 label:=CASE WHEN TG_TABLE_NAME='m8_os_produtos' THEN 'Material da OS' ELSE 'Serviço da OS' END||CASE TG_OP WHEN 'INSERT' THEN ' incluído' WHEN 'DELETE' THEN ' removido' ELSE ' atualizado' END;
 FOR t IN SELECT * FROM web_tasks WHERE status<>'completed' AND
   ((order_company=(item->>'company_id')::integer AND order_id=(item->>'ordem_servico_id')::bigint)
    OR (source_key LIKE 'rental:%' AND split_part(source_key,':',3)=item->>'company_id' AND split_part(source_key,':',4)=item->>'ordem_servico_id')) ORDER BY id FOR UPDATE
 LOOP
  INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name)
    VALUES(t.id,label,label||': '||coalesce(item->>'produto_nome',item->>'servico_nome','Item')||'. Quantidade: '||coalesce(item->>'quantidade','não informada')||'. Atualização recebida do M8.',true,'Sistema','Integração M8');
  UPDATE web_tasks SET updated_at=now(),updated_by='Sistema',version=version+1 WHERE id=t.id;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS web_task_order_item_history ON m8_os_produtos;
CREATE TRIGGER web_task_order_item_history AFTER INSERT OR UPDATE OR DELETE ON m8_os_produtos FOR EACH ROW EXECUTE FUNCTION web_task_order_item_history();
DROP TRIGGER IF EXISTS web_task_order_item_history ON m8_os_servicos;
CREATE TRIGGER web_task_order_item_history AFTER INSERT OR UPDATE OR DELETE ON m8_os_servicos FOR EACH ROW EXECUTE FUNCTION web_task_order_item_history();

-- Initial creation/automatic assignment and explicit status resets are not treatment.
CREATE OR REPLACE FUNCTION web_task_note_is_activity(automatic boolean, title text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT (NOT automatic AND title NOT IN ('Tarefa manual criada','Tarefa reaberta','Status de execução alterado'))
 OR title IN ('Orçamento criado','Orçamento atualizado','Orçamento excluído','Manutenção registrada','Plano arquivado','Dados do equipamento atualizados','Plano preventivo atualizado','OS vinculada atualizada','Material da OS incluído','Material da OS removido','Material da OS atualizado','Serviço da OS incluído','Serviço da OS removido','Serviço da OS atualizado');
$$;
CREATE OR REPLACE FUNCTION web_task_activity_progress() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF web_task_note_is_activity(NEW.automatic,NEW.title) THEN
  -- Callers already update version/author in the same transaction.
  UPDATE web_tasks SET status='in_progress',kanban_column='in_progress'
  WHERE id=NEW.task_id AND status='not_started';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS web_task_activity_progress ON web_task_notes;
CREATE TRIGGER web_task_activity_progress AFTER INSERT ON web_task_notes FOR EACH ROW EXECUTE FUNCTION web_task_activity_progress();

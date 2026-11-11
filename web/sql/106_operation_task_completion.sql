BEGIN;
-- Operation tasks end at review. Later order flow changes must not reopen them.
CREATE OR REPLACE FUNCTION complete_reviewed_operation_tasks(actor text DEFAULT 'Sistema',op_id uuid DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item record;n integer:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(728001);
 FOR item IN SELECT DISTINCT t.id,p.id operation_id FROM web_tasks t JOIN web_service_operations p ON
 (t.source_key='manual:schedule-operation:'||p.id::text OR EXISTS(SELECT 1 FROM web_service_operation_workflows w WHERE w.operation_id=p.id AND w.task_id=t.id))
 WHERE p.status IN('reviewed','completed') AND t.status<>'completed' AND (op_id IS NULL OR p.id=op_id) ORDER BY t.id
 LOOP
  UPDATE web_tasks SET status='completed',source_resolved=true,completed_at=COALESCE(completed_at,now()),kanban_column=NULL,updated_at=now(),updated_by=actor,version=version+1 WHERE id=item.id;
  INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES(item.id,'Conclusão automática da operação','Tarefa concluída automaticamente: operação revisada.',true,actor,COALESCE((SELECT display_name FROM web_user_access WHERE email=actor),actor));
  INSERT INTO web_access_events(event,email,actor,details) VALUES('operation_task_auto_completed',actor,actor,jsonb_build_object('taskId',item.id,'operationId',item.operation_id));
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
CREATE OR REPLACE FUNCTION finish_operation_task_after_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM complete_reviewed_operation_tasks(COALESCE(NEW.updated_by,'Sistema'),NEW.id);RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS web_complete_reviewed_operation_task ON web_service_operations;
CREATE TRIGGER web_complete_reviewed_operation_task AFTER UPDATE OF status ON web_service_operations FOR EACH ROW WHEN(NEW.status IN('reviewed','completed') AND OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION finish_operation_task_after_review();
CREATE OR REPLACE FUNCTION protect_operation_task_completion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE op_status text;
BEGIN
 IF NEW.source_key LIKE 'manual:schedule-operation:%' THEN
  SELECT status INTO op_status FROM web_service_operations WHERE 'manual:schedule-operation:'||id::text=NEW.source_key;
  IF op_status IN('reviewed','completed') THEN
   NEW.status:='completed';NEW.source_resolved:=true;NEW.completed_at:=COALESCE(CASE WHEN TG_OP='UPDATE' THEN OLD.completed_at END,NEW.completed_at,now());NEW.kanban_column:=NULL;
  ELSIF op_status IS NOT NULL AND NEW.status='completed' THEN
   RAISE EXCEPTION 'Tarefas de operações são concluídas automaticamente após a revisão da operação.';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS web_protect_operation_task_completion ON web_tasks;
CREATE TRIGGER web_protect_operation_task_completion BEFORE INSERT OR UPDATE ON web_tasks FOR EACH ROW EXECUTE FUNCTION protect_operation_task_completion();
-- Preserve the integration entry point while ending the operation task at Revisado.
CREATE OR REPLACE FUNCTION route_schedule_flow_tasks(company bigint,os bigint,actor text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE op record;n integer:=0;
BEGIN
 FOR op IN SELECT p.id FROM web_service_operations p JOIN web_service_schedules s ON s.id=p.schedule_id WHERE s.company_id=company AND s.order_id=os AND s.active AND p.status IN('reviewed','completed') LOOP
  n:=n+complete_reviewed_operation_tasks(COALESCE(actor,'Sistema'),op.id);
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION complete_reviewed_operation_tasks(text,uuid),finish_operation_task_after_review(),protect_operation_task_completion(),route_schedule_flow_tasks(bigint,bigint,text) FROM PUBLIC,anon,authenticated;
COMMIT;

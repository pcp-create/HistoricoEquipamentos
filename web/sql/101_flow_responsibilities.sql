CREATE TABLE IF NOT EXISTS web_service_flow_owners (
 flow_status_id bigint PRIMARY KEY,area text NOT NULL CHECK(area IN('Comercial','Planejamento','Almoxarifado','Compras','Faturamento','Outro')),
 updated_by text NOT NULL DEFAULT 'Sistema',updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS web_service_flow_recipients (
 area text PRIMARY KEY CHECK(area IN('Comercial','Planejamento','Almoxarifado','Compras','Faturamento','Outro')),
 recipient text REFERENCES web_user_access(email) ON DELETE SET NULL,updated_by text NOT NULL DEFAULT 'Sistema',updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE web_service_flow_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_service_flow_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_service_flow_owners,web_service_flow_recipients FROM PUBLIC,anon,authenticated;
INSERT INTO web_service_flow_owners(flow_status_id,area) VALUES
(19,'Faturamento'),
(18,'Faturamento'),
(27,'Comercial'),
(25,'Planejamento'),
(21,'Planejamento'),
(46,'Comercial'),
(22,'Compras'),
(40,'Compras'),
(41,'Planejamento'),
(5,'Planejamento'),
(7,'Planejamento'),
(8,'Planejamento'),
(36,'Comercial'),
(31,'Planejamento'),
(51,'Almoxarifado'),
(6,'Comercial'),
(26,'Faturamento'),
(24,'Comercial'),
(44,'Comercial'),
(43,'Planejamento'),
(48,'Compras'),
(49,'Almoxarifado'),
(32,'Planejamento'),
(54,'Planejamento'),
(23,'Planejamento'),
(35,'Planejamento'),
(45,'Comercial'),
(28,'Planejamento'),
(14,'Comercial'),
(55,'Planejamento'),
(56,'Comercial')
ON CONFLICT DO NOTHING;
INSERT INTO web_service_flow_owners(flow_status_id,area)
 SELECT id,'Outro' FROM service_order_registries WHERE kind='flow-statuses' ON CONFLICT DO NOTHING;
ALTER TABLE web_service_operation_workflows ADD COLUMN IF NOT EXISTS flow_status_id bigint;
ALTER TABLE web_service_operation_workflows DROP CONSTRAINT IF EXISTS web_service_operation_workflows_phase_check;
ALTER TABLE web_service_operation_workflows ADD CONSTRAINT web_service_operation_workflows_phase_check CHECK(phase IN('execution','review','reviewed','internal','billing','handling'));

-- One existing programming task follows the configured area/user. No task per retry.
CREATE OR REPLACE FUNCTION route_schedule_flow_tasks(company bigint,os bigint,actor text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target text;area_name text;flow_id bigint;flow_name text;op record;wf record;task_key bigint;task_version integer;routed integer:=0;actor_name text;
BEGIN
 PERFORM pg_advisory_xact_lock(728001);
 SELECT o.status_lancamento_id,o.status_lancamento_nome,f.area,r.recipient INTO flow_id,flow_name,area_name,target
 FROM m8_ordens_servico o JOIN web_service_flow_owners f ON f.flow_status_id=o.status_lancamento_id
 JOIN web_service_flow_recipients r ON r.area=f.area JOIN web_user_access u ON u.email=r.recipient AND u.enabled
 WHERE o.company_id=company AND o.id_m8=os AND lower(COALESCE(o.status,'')) NOT IN('processado','cancelado','cancelada','excluida');
 IF target IS NULL THEN RETURN 0; END IF;
 actor:=COALESCE(NULLIF(actor,''),'Sistema');
 SELECT COALESCE(display_name,actor) INTO actor_name FROM web_user_access WHERE email=actor;
 FOR op IN SELECT p.*,s.created_by planner FROM web_service_operations p JOIN web_service_schedules s ON s.id=p.schedule_id
  WHERE s.company_id=company AND s.order_id=os AND s.active AND p.status IN('reviewed','completed') ORDER BY p.id
 LOOP
  SELECT * INTO wf FROM web_service_operation_workflows WHERE operation_id=op.id FOR UPDATE;
  task_key:=wf.task_id;
  IF task_key IS NOT NULL AND wf.flow_status_id=flow_id AND wf.phase='handling'
    AND EXISTS(SELECT 1 FROM web_tasks WHERE id=task_key AND assigned_to=target) THEN CONTINUE; END IF;
  IF task_key IS NULL THEN
   SELECT id INTO task_key FROM web_tasks WHERE source_key='manual:schedule-operation:'||op.id::text ORDER BY id DESC LIMIT 1;
  END IF;
  IF task_key IS NULL THEN
   INSERT INTO web_tasks(source_key,cycle,origin,title,equipment_name,customer,source_status,priority,assigned_to,first_assigned_at,created_by,updated_by,order_company,order_id,order_number,followers,status)
   SELECT 'manual:schedule-operation:'||op.id::text,'execution','Programação de OSs','OS '||COALESCE(o.numero_sequencia,o.id_m8)::text||' · Operação '||op.position::text,
    COALESCE(o.equipamento,''),COALESCE(o.cliente_nome,''),'handling','normal',target,now(),actor,actor,company,os,COALESCE(o.numero_sequencia,o.id_m8)::text,ARRAY[actor],'in_progress'
   FROM m8_ordens_servico o WHERE o.company_id=company AND o.id_m8=os RETURNING id,version INTO task_key,task_version;
  ELSE
   UPDATE web_tasks SET assigned_to=target,source_status='handling',status='in_progress',completed_at=NULL,kanban_column=NULL,stage_id=NULL,
    version=version+1,updated_at=now(),updated_by=actor WHERE id=task_key RETURNING version INTO task_version;
  END IF;
  INSERT INTO web_service_operation_workflows(operation_id,task_id,planner,phase,flow_status_id)
   VALUES(op.id,task_key,COALESCE(op.planner,actor),'handling',flow_id)
   ON CONFLICT(operation_id) DO UPDATE SET phase='handling',flow_status_id=EXCLUDED.flow_status_id,updated_at=now();
  INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name)
   VALUES(task_key,'Tratativa de Status Fluxo',COALESCE(flow_name,flow_id::text)||' · Área: '||area_name||' · Direcionado a: '||target,true,actor,COALESCE(actor_name,actor));
  INSERT INTO web_task_notifications(task_id,task_version,recipient) VALUES(task_key,task_version,target);
  routed:=routed+1;
 END LOOP;
 RETURN routed;
END $$;
CREATE OR REPLACE FUNCTION route_changed_order_flow() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM route_schedule_flow_tasks(NEW.company_id::bigint,NEW.id_m8::bigint,'Sistema');
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS web_route_order_flow ON m8_ordens_servico;
CREATE TRIGGER web_route_order_flow AFTER UPDATE OF status_lancamento_id ON m8_ordens_servico
 FOR EACH ROW WHEN (OLD.status_lancamento_id IS DISTINCT FROM NEW.status_lancamento_id) EXECUTE FUNCTION route_changed_order_flow();

REVOKE ALL ON FUNCTION route_schedule_flow_tasks(bigint,bigint,text),route_changed_order_flow() FROM PUBLIC,anon,authenticated;

import 'server-only';
import type {PoolClient} from 'pg';

// These tasks are user-created; the source key only provides request idempotency.
export async function repairOrderReportTasks(c: Pick<PoolClient,'query'>) {
 const rows=(await c.query(`SELECT t.*, EXISTS(SELECT 1 FROM web_task_notes n WHERE n.task_id=t.id AND n.automatic AND n.title='Tarefa concluída automaticamente' AND n.description='Processo encerrado, substituído ou removido da base ativa.' AND n.created_at=t.completed_at) erroneous_closure FROM web_tasks t WHERE source_key LIKE 'order-report-task:%' FOR UPDATE`)).rows;
 for(const task of rows){
  const autoClosed=task.status==='completed' && task.source_resolved && task.updated_by==='Sistema' && task.erroneous_closure;
  await c.query(`UPDATE web_tasks SET source_key='manual:'||source_key, status=CASE WHEN $2 THEN 'not_started' ELSE status END, source_resolved=CASE WHEN $2 THEN false ELSE source_resolved END, completed_at=CASE WHEN $2 THEN NULL ELSE completed_at END, updated_at=now(),version=version+1 WHERE id=$1`,[task.id,autoClosed]);
  if(autoClosed)await c.query(`INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,'Tarefa reaberta após correção','Encerramento automático indevido corrigido. A tarefa da OS deve ser concluída pelo responsável. O histórico e os anexos foram preservados.',true,'Sistema','Sistema')`,[task.id]);
 }
}

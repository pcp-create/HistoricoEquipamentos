import {validDate} from "../equipment-management/planning";
import { canManageVisits } from "../access-roles";
import "server-only";
import { database } from "../db";
import { Forbidden } from "../auth";
import type { AuthUser } from "../user-display-name";
import { AdminInputError } from "../admin-store";
import {syncVisitTask} from "./automatic-task";
export async function createVisitTask(b: any, user: AuthUser) {
  if (
    !/^[0-9a-f-]{36}$/i.test(b.visitId || "") ||
    !/^[0-9a-f-]{36}$/i.test(b.requestId || "")
  )
    throw new AdminInputError("Visita inválida.");
  if (!b.assignedTo || !b.dueDate)
    throw new AdminInputError("Informe responsável e vencimento.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const v = (
        await c.query("SELECT * FROM web_sales_visits WHERE id=$1 FOR UPDATE", [
          b.visitId,
        ])
      ).rows[0],
      access = (
        await c.query(
          "SELECT enabled,role FROM web_user_access WHERE email=$1",
          [user.email],
        )
      ).rows[0];
    if (
      !access?.enabled ||
      !v ||
      (v.seller !== user.email && !canManageVisits(access.role))
    )
      throw new Forbidden();
    if (v.status === "cancelled")
      throw new AdminInputError(
        "Não é possível direcionar a tarefa de uma visita cancelada.",
      );
    const old = (
      await c.query(
        "SELECT task_id FROM web_sales_visit_tasks WHERE request_id=$1 AND visit_id=$2",
        [b.requestId, b.visitId],
      )
    ).rows[0];
    if (old) {
      await c.query("COMMIT");
      return { taskId: String(old.task_id) };
    }
    const findLinked=async()=> (await c.query("SELECT * FROM web_tasks WHERE source_key=ANY($1::text[]) OR id IN(SELECT task_id FROM web_sales_visit_tasks WHERE visit_id=$2) ORDER BY CASE WHEN source_key=ANY($1::text[]) THEN 0 ELSE 1 END,id LIMIT 1 FOR UPDATE",[[`visit:${v.id}`,`manual:visit:${v.id}`],v.id])).rows[0];
    let linked=await findLinked();
    if(!linked){await syncVisitTask(c,v.id,user.email,true,undefined,false,v.status==='completed');linked=await findLinked();}
    if(linked){
      if(typeof b.title!=='string'||!b.title.trim()||b.title.trim().length>160||typeof b.description!=='string'||!b.description.trim()||b.description.length>12000||!['normal','high','urgent'].includes(b.priority)||!validDate(b.dueDate))throw new AdminInputError('Preencha título, motivo, prioridade e vencimento da pendência.');
      const recipient=typeof b.assignedTo==='string'?b.assignedTo.trim().toLowerCase():'';
      const employee=(await c.query('SELECT enabled,phone FROM web_user_access WHERE email=$1 FOR SHARE',[recipient])).rows[0];
      if(!employee?.enabled||!employee.phone)throw new AdminInputError('Selecione um responsável ativo com WhatsApp cadastrado.');
      const updated=(await c.query("UPDATE web_tasks SET source_key=$2,cycle=CASE WHEN $9 THEN 'manual' ELSE 'visit' END,source_status=CASE WHEN $9 THEN 'manual' ELSE 'scheduled' END,title=$3,assigned_to=$4,due_date=$5,priority=$6,priority_manual=true,status='not_started',source_resolved=false,completed_at=NULL,kanban_column=NULL,stage_id=NULL,followers=ARRAY(SELECT DISTINCT follower FROM unnest(followers||ARRAY[$8::text]||CASE WHEN $10 THEN ARRAY[$7::text] ELSE ARRAY[]::text[] END) AS f(follower) WHERE $10 OR follower<>$7),version=version+1,updated_by=$7,updated_at=now() WHERE id=$1 RETURNING *",[linked.id,v.status==='completed'?`manual:visit:${v.id}`:`visit:${v.id}`,b.title.trim(),recipient,b.dueDate,b.priority,user.email,v.seller,v.status==='completed',b.followTask!==false])).rows[0];
      const context=`Visita: ${new Date(v.completed_at||v.scheduled_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}\nCliente: ${linked.customer||v.customer_key}\nContato: ${v.contact} · ${v.phone}\nRegistro da visita: ${v.outcome}\n${(v.machine_records||[]).map((m:any)=>`${m.name}: ${m.note}${m.meter!=null?' · Horímetro: '+m.meter+' h':''}`).join('\n')}\n${(v.photos||[]).map((id:string)=>`Foto da visita: /api/visits/photos/${id}`).join('\n')}\n\nDemanda / motivo: ${b.description.trim()}`;
      await c.query("INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,'Pendência da visita direcionada',$2,false,$3,COALESCE((SELECT display_name FROM web_user_access WHERE email=$3),$3))",[linked.id,context,user.email]);
      await c.query('INSERT INTO web_sales_visit_tasks(request_id,visit_id,task_id,created_by) VALUES($1,$2,$3,$4)',[b.requestId,v.id,linked.id,user.email]);
      await c.query('UPDATE web_sales_visits SET followers=ARRAY(SELECT DISTINCT follower FROM unnest(followers||CASE WHEN $3 THEN ARRAY[$2::text] ELSE ARRAY[]::text[] END) AS f(follower) WHERE $3 OR follower<>$2) WHERE id=$1',[v.id,user.email,b.followTask!==false]);
      await c.query('INSERT INTO web_task_notifications(task_id,task_version,recipient,assignment_reason) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[linked.id,updated.version,recipient,b.description.trim()]);
      await c.query('COMMIT');return {taskId:String(linked.id)};
    }
    throw new AdminInputError('Não foi possível localizar a tarefa vinculada à visita.');
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

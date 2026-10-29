import 'server-only';
/** One confirmation covers the selected materials of one physical delivery. */
export async function createWithdrawalApproval(c:any,batch:string,company:string,order:string,employee:string,actor:string,detail:any,items:{id:string;quantity:number}[]){
 const scheduled=(await c.query(`SELECT 1 FROM web_service_operations p JOIN web_service_schedules s ON s.id=p.schedule_id
 WHERE s.active AND p.status NOT IN('completed','reviewed') AND (p.document->>'responsible'=$3 OR p.document->'support' ? $3)
 AND ((s.company_id=$1 AND s.order_id=$2) OR EXISTS(SELECT 1 FROM web_order_links l WHERE l.company_id=s.company_id AND l.order_id=s.order_id AND l.linked_company_id=$1 AND l.linked_order_id=$2)) LIMIT 1`,[company,order,employee])).rows.length;
 if(scheduled)return null;
 const metadata=(await c.query(`SELECT equipamento name,NULLIF(to_jsonb(o)->>'produto_equipamento_id','')::bigint equipment_id FROM m8_ordens_servico o WHERE company_id=$1 AND id_m8=$2`,[company,order])).rows[0];
 const creator=(await c.query('SELECT display_name FROM web_user_access WHERE email=$1',[actor])).rows[0];
 const description=`Material retirado no almoxarifado?\n\nConfirme se você recebeu os materiais desta entrega. Caso não tenha retirado, reprove e informe o motivo para tratativa do almoxarifado.\n\nOS: ${detail.order.number}\nCliente: ${detail.order.customer||'Não informado'}\nEquipamento: ${metadata?.name||'Não informado'}\nEntregue por: ${creator?.display_name||actor}\n\nMateriais:\n${items.map(item=>{const row=detail.items.find((r:any)=>r.id_m8===item.id);return `${row.produto_id} · ${row.produto_nome}: ${item.quantity.toLocaleString('pt-BR',{maximumFractionDigits:3})} ${row.unidade_nome}`;}).join('\n')}`;
 const task=(await c.query(`INSERT INTO web_tasks(source_key,cycle,origin,title,equipment_name,equipment_id,customer,source_status,priority,priority_manual,assigned_to,first_assigned_at,created_by,updated_by,order_company,order_id,order_number,followers,task_type,approval_state,approval_description,approval_approver)
 VALUES($1,'warehouse-delivery','Almoxarifado','Material retirado no almoxarifado?',$2,$3,$4,'warehouse-delivery','normal',true,$5,now(),$6,$6,$7,$8,$9,ARRAY[$6]::text[],'approval','pending',$10,$5) RETURNING id::text`,[
 `manual:warehouse:withdrawal:${batch}`,metadata?.name||'',metadata?.equipment_id||null,detail.order.customer||'',employee,actor,company,order,detail.order.number,description])).rows[0];
 await c.query('INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,$2,$3,true,$4,$5)',[task.id,'Confirmação de retirada solicitada pelo almoxarifado',description,actor,creator?.display_name||actor]);
 await c.query('INSERT INTO web_task_notifications(task_id,task_version,recipient) VALUES($1,1,$2)',[task.id,employee]);
 await c.query('INSERT INTO web_warehouse_withdrawal_confirmations(batch_id,task_id,employee) VALUES($1,$2,$3)',[batch,task.id,employee]);
 return task.id;
}

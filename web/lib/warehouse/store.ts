import "server-only";
import {database} from "../db";
import {createWithdrawalApproval} from "./withdrawal-approval";
import {withWarehouseSupply} from "./supply";
import {approvedMaterialSql} from "../material-approval";
export class WarehouseError extends Error {}
const eligible = "(o.status_lancamento_nome ILIKE '%AGUARDANDO SEPARA%' OR o.status_lancamento_nome ILIKE '%MATERIAL SEPARAD%' OR o.status_lancamento_nome ILIKE '%MATERIAIS SEPARAD%')";
function target(company:unknown,id:unknown) {
 if(!["1","2","27404"].includes(String(company)) || !/^[1-9]\d{0,17}$/.test(String(id))) throw new WarehouseError("OS inválida.");
}
export async function warehouseDeliveryTotals(c:any,items:any[],kind="delivery"):Promise<Map<string,any>> {
 const result = new Map<string,any>();
 if(!items.length || !(await c.query("SELECT to_regclass('public.web_warehouse_delivery_items') IS NOT NULL available")).rows[0]?.available) return result;
 const rows=(await c.query(`SELECT i.company_id::text,i.order_id::text,i.item_id::text,b.technician,
  COALESCE(u.display_name,b.technician) technician_name,sum(i.quantity)::float8 quantity
  FROM web_warehouse_delivery_items i JOIN web_warehouse_batches b ON b.id=i.batch_id
  LEFT JOIN web_user_access u ON u.email=b.technician
  JOIN jsonb_to_recordset($1::jsonb) k(company_id int,order_id bigint,item_id bigint)
   ON k.company_id=i.company_id AND k.order_id=i.order_id AND k.item_id=i.item_id
  WHERE COALESCE(to_jsonb(b)->>'kind','delivery')=$2
  GROUP BY i.company_id,i.order_id,i.item_id,b.technician,u.display_name`,
 [JSON.stringify(items.map(i=>({company_id:i.item_company,order_id:i.item_order,item_id:i.id_m8}))),kind])).rows;
 for(const row of rows){const key=`${row.company_id}:${row.order_id}:${row.item_id}`;const value=result.get(key)||{quantity:0,technicians:[]};value.quantity+=Number(row.quantity);value.technicians.push({email:row.technician,name:row.technician_name,quantity:Number(row.quantity)});result.set(key,value);}
 return result;
}
export async function warehouseOrders(query:string,page=1,kanban=false,returns=false,delivered=false) {
 if(query.length>120 || !Number.isInteger(page)||page<1) throw new WarehouseError("Filtro inválido.");
 const filter=returns ? `EXISTS(SELECT 1 FROM web_service_item_usage u WHERE u.item_company=o.company_id AND u.item_order=o.id_m8 GROUP BY u.item_id HAVING SUM(COALESCE((SELECT sum(COALESCE((a->>'returned')::numeric,0)) FROM jsonb_array_elements(COALESCE(u.allocations,'[]')) a),0)) > COALESCE((SELECT sum(i.quantity) FROM web_warehouse_delivery_items i JOIN web_warehouse_batches b ON b.id=i.batch_id WHERE b.kind='receipt' AND i.company_id=o.company_id AND i.order_id=o.id_m8 AND i.item_id=u.item_id),0))` : delivered ? `COALESCE(progress.delivered,false) AND sync.last_detail_at IS NOT NULL` : `o.status IN('Pendente','Aprovado') AND ${eligible} AND NOT (COALESCE(progress.delivered,false) AND sync.last_detail_at IS NOT NULL)`;
 const rows=(await database().query(`WITH delivery AS MATERIALIZED (
 SELECT i.company_id,i.order_id,i.item_id,SUM(CASE WHEN b.kind='delivery' THEN i.quantity ELSE -i.quantity END) quantity
 FROM web_warehouse_delivery_items i JOIN web_warehouse_batches b ON b.id=i.batch_id GROUP BY i.company_id,i.order_id,i.item_id
 ), progress AS (
 SELECT p.company_id,p.ordem_servico_id,BOOL_AND(p.quantidade>0 AND COALESCE(d.quantity,0)>=p.quantidade AND p.quantidade IS NOT NULL) delivered
 FROM m8_os_produtos p JOIN (SELECT DISTINCT company_id,order_id FROM delivery) orders ON orders.company_id=p.company_id AND orders.order_id=p.ordem_servico_id
 LEFT JOIN delivery d ON d.company_id=p.company_id AND d.order_id=p.ordem_servico_id AND d.item_id=p.id_m8
 WHERE p.esta_excluido IS NOT TRUE AND ${approvedMaterialSql("p")} AND p.quantidade IS DISTINCT FROM 0 GROUP BY p.company_id,p.ordem_servico_id
 ) SELECT o.company_id,o.id_m8::text id,COALESCE(o.numero_sequencia,o.id_m8)::text number,
 o.cliente_nome customer,o.equipamento equipment,o.status_lancamento_nome flow,count(*) OVER()::int total
 FROM m8_ordens_servico o LEFT JOIN progress ON progress.company_id=o.company_id AND progress.ordem_servico_id=o.id_m8 LEFT JOIN integracao_m8_os_sync sync ON sync.company_id=o.company_id AND sync.ordem_servico_id=o.id_m8 WHERE o.company_id IN(1,2,27404) AND ${filter}
 AND concat_ws(' ',o.id_m8,o.numero_sequencia,o.cliente_nome,o.equipamento) ILIKE $1
 ORDER BY o.id_m8 DESC,o.company_id LIMIT $3 OFFSET $2`,["%"+query+"%",kanban?0:(page-1)*50,kanban?10000:50])).rows;
 const users=(await database().query("SELECT email,COALESCE(NULLIF(display_name,''),email) name,job_title FROM web_user_access WHERE enabled ORDER BY display_name,email")).rows;
 return {rows,total:rows[0]?.total||0,page,users};
}
export async function warehouseOrder(company:string,id:string,c:any=database()) {
 target(company,id);
 const order=(await c.query("SELECT company_id,id_m8::text id,COALESCE(numero_sequencia,id_m8)::text number,cliente_nome customer,status,status_lancamento_id::text flow_id,status_lancamento_nome flow FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2",[company,id])).rows[0];
 if(!order)throw new WarehouseError("OS não encontrada.");
 const items=(await c.query(`SELECT p.id_m8::text,p.produto_id::text,p.produto_nome,p.quantidade::float8,p.unidade_nome,
 p.company_id item_company,p.ordem_servico_id::text item_order,(p.esta_excluido IS NOT TRUE AND ${approvedMaterialSql("p")}) deliverable
 FROM m8_os_produtos p WHERE p.company_id=$1 AND p.ordem_servico_id=$2 AND ((p.esta_excluido IS NOT TRUE AND ${approvedMaterialSql("p")}) OR EXISTS(SELECT 1 FROM web_service_item_usage u WHERE u.item_company=p.company_id AND u.item_order=p.ordem_servico_id AND u.item_id=p.id_m8 AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(u.allocations,'[]')) a WHERE COALESCE((a->>'returned')::numeric,0)>0))) ORDER BY p.id_m8`,[company,id])).rows;
 const collected=(await c.query("SELECT last_detail_at IS NOT NULL complete FROM integracao_m8_os_sync WHERE company_id=$1 AND ordem_servico_id=$2",[company,id])).rows[0]?.complete===true;
 const totals=await warehouseDeliveryTotals(c,items);
 const received=await warehouseDeliveryTotals(c,items,"receipt");
 const additions=(await c.query("SELECT a.id,a.state,a.item_id::text,a.document,a.actor,COALESCE(u.display_name,a.actor) actor_name,a.created_at,a.message,(SELECT jsonb_build_object('queued',(SELECT count(*) FROM web_warehouse_notifications n WHERE n.addition_id=e.addition_id),'sent',(SELECT count(*) FROM web_warehouse_notifications n WHERE n.addition_id=e.addition_id AND n.state='sent'),'claimed',(SELECT count(*) FROM web_warehouse_notifications n WHERE n.addition_id=e.addition_id AND n.state='pending' AND n.attempts>0),'awaitingManagers',NOT e.expanded) FROM web_warehouse_notification_events e WHERE e.addition_id=a.id) whatsapp FROM web_warehouse_material_additions a LEFT JOIN web_user_access u ON u.email=a.actor WHERE a.company_id=$1 AND a.order_id=$2 ORDER BY a.created_at DESC",[company,id])).rows;
 const usage=(await c.query(`SELECT item_id::text,
 SUM(withdrawn)::float8 net,
 SUM(COALESCE((SELECT sum(COALESCE((a->>'gross')::numeric,(a->>'quantity')::numeric)) FROM jsonb_array_elements(COALESCE(allocations,'[]')) a),withdrawn,0))::float8 gross,
 SUM(COALESCE((SELECT sum((a->>'returned')::numeric) FROM jsonb_array_elements(COALESCE(allocations,'[]')) a),0))::float8 returned
 FROM web_service_item_usage WHERE item_company=$1 AND item_order=$2 GROUP BY item_id`,[company,id])).rows;
 const history=(await c.query(`SELECT i.item_id::text,i.quantity::float8,b.created_at,b.technician,b.actor,b.kind,
 COALESCE(t.display_name,b.technician) technician_name,COALESCE(a.display_name,b.actor) actor_name,
 CASE WHEN confirmation.task_id IS NOT NULL THEN jsonb_build_object('taskId',confirmation.task_id::text,'state',task.approval_state,'reason',task.approval_reason,'decidedAt',task.approval_decided_at,'decidedBy',COALESCE(decider.display_name,task.approval_decided_by)) END withdrawal_approval
 FROM web_warehouse_delivery_items i JOIN web_warehouse_batches b ON b.id=i.batch_id
 LEFT JOIN web_user_access t ON t.email=b.technician LEFT JOIN web_user_access a ON a.email=b.actor
 LEFT JOIN web_warehouse_withdrawal_confirmations confirmation ON confirmation.batch_id=b.id
 LEFT JOIN web_tasks task ON task.id=confirmation.task_id LEFT JOIN web_user_access decider ON decider.email=task.approval_decided_by
 WHERE i.company_id=$1 AND i.order_id=$2 ORDER BY b.created_at DESC,i.item_id`,[company,id])).rows;
 const flowHistory=(await c.query("SELECT f.*,COALESCE(u.display_name,f.actor) actor_name FROM web_warehouse_flow_changes f LEFT JOIN web_user_access u ON u.email=f.actor WHERE f.company_id=$1 AND f.order_id=$2 ORDER BY f.created_at DESC",[company,id])).rows;
 const supplied=await withWarehouseSupply(items,c);
 return {order,flowHistory,complete:collected,items:supplied.map((i:any)=>({...i,delivery:totals.get(`${company}:${id}:${i.id_m8}`)||{quantity:0,technicians:[]},received:received.get(`${company}:${id}:${i.id_m8}`)||{quantity:0,technicians:[]},addedLater:additions.some((a:any)=>a.state==='complete'&&a.item_id===i.id_m8),usage:usage.find((u:any)=>u.item_id===i.id_m8)||{gross:0,returned:0,net:0}})),history,additions};
}
export async function deliverWarehouse(input:any,actor:string) {
 target(input?.company,input?.order);
 const kind=input.action==="receipt"?"receipt":"delivery";
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId||"") || typeof input.technician!=="string" || !Array.isArray(input.items)||!input.items.length||input.items.length>200||new Set(input.items.map((i:any)=>String(i?.id))).size!==input.items.length)throw new WarehouseError("Confira o funcionário e os materiais selecionados.");
 const items=input.items.map((i:any)=>({id:String(i?.id),quantity:i?.quantity})).sort((a:any,b:any)=>a.id.localeCompare(b.id));
 if(items.some((i:any)=>!/^[1-9]\d{0,17}$/.test(i.id)||typeof i.quantity!=="number"||!Number.isFinite(i.quantity)||i.quantity<=0||i.quantity>1e9||Math.abs(i.quantity-Math.round(i.quantity*1000)/1000)>1e-9))throw new WarehouseError("Informe quantidades positivas com até três casas decimais.");
 const document={...(kind==="receipt"?{kind}:{}),company:String(input.company),order:String(input.order),technician:input.technician,items};
 const c=await database().connect();
 try{
 await c.query("BEGIN READ WRITE");
 await c.query("SELECT pg_advisory_xact_lock(829201,0)");
 if(!(await c.query("SELECT 1 FROM web_user_access WHERE email=$1 AND enabled",[actor])).rows.length)throw new WarehouseError("Usuário sem acesso ativo.");
 const previous=(await c.query("SELECT actor,document FROM web_warehouse_batches WHERE id=$1",[input.requestId])).rows[0];
 if(previous){if(previous.actor!==actor||JSON.stringify(previous.document)!==JSON.stringify(document)){
 // JSONB changes object key order; compare semantically in PostgreSQL.
 const same=(await c.query("SELECT document=$2::jsonb same FROM web_warehouse_batches WHERE id=$1 AND actor=$3",[input.requestId,JSON.stringify(document),actor])).rows[0]?.same;
 if(!same)throw new WarehouseError("Identificador já utilizado para outra entrega.");
 }const confirmation=(await c.query("SELECT task_id::text FROM web_warehouse_withdrawal_confirmations WHERE batch_id=$1",[input.requestId])).rows[0];await c.query("COMMIT");return {saved:true,approvalTaskId:confirmation?.task_id||null};}
 if(!(await c.query("SELECT 1 FROM web_user_access WHERE email=$1 AND enabled",[input.technician])).rows.length)throw new WarehouseError("Selecione um funcionário com acesso ativo.");
 const allowed=(await c.query(`SELECT 1 FROM m8_ordens_servico o WHERE company_id=$1 AND id_m8=$2 AND status IN('Pendente','Aprovado') AND ${eligible} FOR SHARE`,[input.company,input.order])).rows.length;
 if(!allowed && kind==="delivery")throw new WarehouseError("A OS saiu da etapa de separação. Atualize a lista antes de registrar a entrega.");
 // Lock ERP items against concurrent sync and recheck the balance before the bulk insert.
 await c.query("SELECT id_m8 FROM m8_os_produtos WHERE company_id=$1 AND ordem_servico_id=$2 FOR SHARE",[input.company,input.order]);
 const current=await warehouseOrder(String(input.company),String(input.order),c);
 if(!current.complete)throw new WarehouseError("Aguarde a importação completa das peças da OS.");
 for(const item of items){
 const row=current.items.find((i:any)=>i.id_m8===item.id);
 const balance=row ? kind==='delivery'&&row.deliverable===false ? -1 : kind==='receipt' ? Number(row.usage.returned)-Number(row.received.quantity) : Number(row.quantidade)-Number(row.delivery.quantity)+Number(row.received.quantity) : -1;
 if(!row||item.quantity>Math.round(balance*1000)/1000)throw new WarehouseError(kind==='receipt'?"Quantidade acima da devolução informada pelo funcionário e ainda não recebida.":"Quantidade acima do saldo reservado. Atualize as peças antes de entregar.");
 }
 await c.query("INSERT INTO web_warehouse_batches(id,actor,technician,document,kind) VALUES($1,$2,$3,$4,$5)",[input.requestId,actor,input.technician,JSON.stringify(document),kind]);
 for(const item of items)await c.query("INSERT INTO web_warehouse_delivery_items(batch_id,company_id,order_id,item_id,quantity) VALUES($1,$2,$3,$4,$5)",[input.requestId,input.company,input.order,item.id,item.quantity]);
 const approvalTaskId=kind==='delivery'?await createWithdrawalApproval(c,input.requestId,String(input.company),String(input.order),input.technician,actor,current,items):null;
 await c.query("COMMIT");return {saved:true,approvalTaskId};
 }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
}

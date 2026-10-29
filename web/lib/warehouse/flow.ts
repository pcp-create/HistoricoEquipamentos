import 'server-only';
import {database} from '../db';
import {m8Session,M8RequestError} from '../service-orders/m8';
import {refreshProjectionOrder} from '../sales-projection/refresh-order';
import {WarehouseError} from './store';
async function transaction<T>(fn:(c:any)=>Promise<T>){const c=await database().connect();try{await c.query('BEGIN READ WRITE');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function warehouseFlowStatuses(){return {rows:(await database().query("SELECT id::text,name FROM service_order_registries WHERE kind='flow-statuses' AND active ORDER BY id")).rows};}
export async function changeWarehouseFlow(input:any,actor:string,session=m8Session){
 if(!['1','2','27404'].includes(String(input?.company))||!/^\d{1,9}$/.test(String(input.order))||Number(input.order)<1||!/^[1-9]\d{0,8}$/.test(String(input.flowId))||typeof input.expectedFlow!=='string'||!/^\d{0,9}$/.test(input.expectedFlow)||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId||''))throw new WarehouseError('Confira a OS e o status do fluxo.');
 const request={flowId:String(input.flowId),expectedFlow:input.expectedFlow};
 const previous=(await database().query('SELECT *,document @> $2::jsonb same FROM web_warehouse_flow_changes WHERE id=$1',[input.requestId,JSON.stringify(request)])).rows[0];
 const replay=(row:any)=>{if(row.actor!==actor||String(row.company_id)!==String(input.company)||String(row.order_id)!==String(input.order)||!row.same)throw new WarehouseError('Identificador utilizado para outra alteração de fluxo.');return {state:row.state,message:row.message};};
 if(previous)return replay(previous);
 const m8=await session(Number(input.company));
 const reservation=await transaction(async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1,$2)',[Number(input.company),Number(input.order)]);
  const previous=(await c.query('SELECT *,document @> $2::jsonb same FROM web_warehouse_flow_changes WHERE id=$1',[input.requestId,JSON.stringify(request)])).rows[0];
  if(previous)return {previous};
  if(!(await c.query('SELECT 1 FROM web_user_access WHERE email=$1 AND enabled',[actor])).rows.length)throw new WarehouseError('Usuário sem acesso ativo.');
  const status=(await c.query("SELECT name FROM service_order_registries WHERE kind='flow-statuses' AND id=$1 AND active",[input.flowId])).rows[0];
  if(!status)throw new WarehouseError('Selecione um status ativo do cadastro M8.');
  const order=(await c.query("SELECT status_lancamento_id::text flow_id,status_lancamento_nome flow FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2 AND status IN('Pendente','Aprovado')",[input.company,input.order])).rows[0];
  if(!order)throw new WarehouseError('Esta OS não está aberta para alteração do fluxo.');
  if(String(order.flow_id||'')!==input.expectedFlow)throw new WarehouseError('O fluxo da OS mudou. Atualize antes de alterar.');
  if(input.expectedFlow===String(input.flowId))throw new WarehouseError('Selecione um status diferente do atual.');
  if((await c.query("SELECT 1 FROM web_warehouse_flow_changes WHERE company_id=$1 AND order_id=$2 AND state IN('sending','uncertain')",[input.company,input.order])).rows.length)throw new WarehouseError('Há uma alteração de fluxo aguardando confirmação. Confira o M8 antes de reenviar.');
  const document={...request,before:order.flow,after:status.name};
  await c.query("INSERT INTO web_warehouse_flow_changes(id,company_id,order_id,actor,document,state) VALUES($1,$2,$3,$4,$5,'sending')",[input.requestId,input.company,input.order,actor,JSON.stringify(document)]);
  return {document};
 });
 if(reservation.previous)return replay(reservation.previous);
 let state='rejected',message='O M8 não confirmou o fluxo atual. Nenhuma alteração foi enviada.',writeStarted=false;
 try{
  const rows=await m8(`/v1/assistenciatecnica/ordemservico?Id=${input.order}&Page=1&PageSize=1`);
  if(Array.isArray(rows)&&rows.length===1&&String(rows[0].id)===String(input.order)&&['Pendente','Aprovado'].includes(rows[0].status)&&String(rows[0].statusLancamentoId||'')===input.expectedFlow){
   writeStarted=true;await m8(`/v1/assistenciatecnica/ordemservico/${input.order}/statusfluxo`,{statusFluxoId:Number(input.flowId)},'PATCH');
   state='complete';message='Status do fluxo atualizado no M8.';
  }
 }catch(e){state=!writeStarted||(e instanceof M8RequestError&&!e.uncertain)?'rejected':'uncertain';message=e instanceof M8RequestError?e.message:'Não foi possível confirmar a alteração. Confira o M8 antes de reenviar.';}
 await transaction(c=>c.query('UPDATE web_warehouse_flow_changes SET state=$2,message=$3,updated_at=now() WHERE id=$1',[input.requestId,state,message]));
 if(state==='complete')try{await refreshProjectionOrder(Number(input.company),String(input.order),session);}catch{message='Fluxo confirmado no M8. A exibição local aguarda sincronização.';await transaction(c=>c.query('UPDATE web_warehouse_flow_changes SET message=$2 WHERE id=$1',[input.requestId,message]));}
 return {state,message};
}

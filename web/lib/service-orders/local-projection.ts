import 'server-only';
import {database} from '../db';
import {createdDetail} from './created-order-detail';

/** Populate only confirmed local creations. Never replace rows already supplied by the integrator. */
export async function materializeCreatedOrder(c:any,row:any){
 if(row.state!=='complete'||!row.m8_id)return false;
 const draft=row.request,company=Number(row.company_id),orderId=String(row.m8_id);
 const existing=(await c.query("SELECT payload->'_localCreation'->>'submissionId' AS submission_id FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2",[company,orderId])).rows[0];
 if(existing?.submission_id===row.id)return true;
 const customer=(await c.query('SELECT name,document,payload FROM m8_customer_directory WHERE person_id=$1 ORDER BY (company_id=$2) DESC LIMIT 1',[draft.customer,company])).rows[0];
 const equipment=draft.equipment?(await c.query('SELECT * FROM m8_equipment_catalog WHERE equipment_id=$1',[draft.equipment])).rows[0]:null;
 const type=(await c.query('SELECT name FROM m8_order_type_catalog WHERE id=$1',[draft.type])).rows[0];
 const registries=(await c.query('SELECT kind,id,name FROM service_order_registries')).rows;
 const name=(kind:string,id:any)=>registries.find((r:any)=>r.kind===kind&&String(r.id)===String(id))?.name;
 const receipt=draft.creationReceipt||{};
 const source:any={...row.header,id:row.m8_id,clienteNome:customer?.name,clienteRazaoSocial:customer?.name,clienteCpfCnpj:customer?.document,
  dataAbertura:row.header.emissao,tipoNome:type?.name,status:receipt.status||row.header.status||'Pendente',
  produtoEquipamentoId:draft.equipment?Number(draft.equipment):undefined,equipamento:equipment?.name,modeloEquipamento:equipment?.model,numeroSerie:equipment?.serial,
  numeroSequencia:receipt.numeroSequencia,statusLancamentoId:Number(draft.flowStatus),statusLancamentoNome:name('flow-statuses',draft.flowStatus),
  tipoAtendimentoNome:name('service-types',draft.serviceType),situacaoNome:name('order-statuses',draft.situation),condicaoPagamentoNome:name('payment-terms',draft.payment),
  produtos:[],servicos:[]};
 for(const item of row.items){
  if(!['material','service'].includes(item.kind)||!item.confirmedId)continue;
  const code=item.kind==='material'?'produtoId':'servicoId';
  const original=draft.items.find((i:any)=>i.kind===item.kind&&String(i.code)===String(item.payload[code]));
  source[item.kind==='material'?'produtos':'servicos'].push({id:item.confirmedId,...item.payload,[item.kind==='material'?'produtoNome':'servicoNome']:original?.name});
 }
 source.totalGeral=Math.round(row.items.filter((i:any)=>['material','service'].includes(i.kind)).reduce((sum:number,i:any)=>sum+Number(i.payload.valorTotal||0),0)*100)/100;
 const detail=createdDetail(source,company);
 const insert=async(table:string,records:any[],keys:string[])=>{
  if(!records.length)return;
  const columns=[...new Set(records.flatMap(Object.keys))];
  await c.query(`INSERT INTO ${table} (${columns.join(',')}) SELECT ${columns.join(',')} FROM jsonb_populate_recordset(NULL::${table},$1::jsonb) ON CONFLICT(${keys.join(',')}) DO NOTHING`,[JSON.stringify(records)]);
 };
 await insert('m8_ordens_servico',[{...detail.order,payload:{...source,_localCreation:{submissionId:row.id,confirmedAt:new Date(row.updated_at).toISOString()}}}],['company_id','id_m8']);
 // Hold the parent while inserting children, so an integrator detail transaction cannot interleave.
 await c.query('SELECT id_m8 FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2 FOR UPDATE',[company,orderId]);
 const integrated=(await c.query('SELECT last_detail_at,last_attempt_at FROM integracao_m8_os_sync WHERE company_id=$1 AND ordem_servico_id=$2',[company,orderId])).rows[0];
 const snapshotStarted=integrated?.last_attempt_at||integrated?.last_detail_at;
 if(integrated?.last_detail_at&&new Date(snapshotStarted).getTime()>=new Date(row.updated_at).getTime())return true;
 await insert('m8_os_produtos',detail.materials.map((p:any,index:number)=>({...p,ordem_servico_id:orderId,payload:source.produtos[index]})),['company_id','ordem_servico_id','id_m8']);
 await insert('m8_os_servicos',detail.services.map((p:any,index:number)=>({...p,ordem_servico_id:orderId,payload:source.servicos[index]})),['company_id','ordem_servico_id','id_m8']);
 await c.query(`INSERT INTO integracao_m8_os_sync(company_id,ordem_servico_id,summary_status,inventory_seen_at) VALUES($1,$2,$3,now()) ON CONFLICT(company_id,ordem_servico_id) DO UPDATE SET pending=true,finalized=false,next_attempt_at=now(),inventory_seen_at=GREATEST(integracao_m8_os_sync.inventory_seen_at,EXCLUDED.inventory_seen_at) WHERE integracao_m8_os_sync.last_detail_at IS NULL OR COALESCE(integracao_m8_os_sync.last_attempt_at,integracao_m8_os_sync.last_detail_at)<$4::timestamptz`,[company,orderId,source.status,row.updated_at]);
 return true;
}
export async function ensureCreatedOrderProjection(company:string|number,id:string|number,transaction?:any){
 if(![1,2,27404].includes(Number(company))||!/^\d+$/.test(String(id)))return false;
 const c=transaction||await database().connect();
 try{
  if(!transaction)await c.query('BEGIN READ WRITE');
  const row=(await c.query("SELECT * FROM service_order_submissions WHERE company_id=$1 AND m8_id=$2 AND state='complete' ORDER BY created_at LIMIT 1",[company,id])).rows[0];
  const result=row?await materializeCreatedOrder(c,row):false;
  if(!transaction)await c.query('COMMIT');return result;
 }catch(e){if(!transaction)await c.query('ROLLBACK');throw e;}finally{if(!transaction)c.release();}
}

/** A later local edit still uses the existing live ERP detail bridge until the integrator catches up. */
export async function canUseCreatedOrderProjection(company:string,id:string){
 const found=await database().query(`SELECT 1 FROM service_order_submissions s WHERE company_id=$1 AND m8_id=$2 AND state='complete'
 AND NOT EXISTS(SELECT 1 FROM service_order_edits e WHERE e.company_id=s.company_id AND e.m8_id=s.m8_id AND e.state='complete' AND e.updated_at>s.updated_at) LIMIT 1`,[company,id]);
 return found.rows.length>0;
}

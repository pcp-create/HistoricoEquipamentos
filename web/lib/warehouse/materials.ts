import "server-only";
import {database} from "../db";
import {m8Session,M8RequestError} from "../service-orders/m8";
import {itemPayload} from "../service-orders/model";
import {refreshProjectionOrder} from "../sales-projection/refresh-order";
import {withWarehouseSupply} from "./supply";
import {WarehouseError} from "./store";
import {queueWarehouseMaterialNotification} from "./notifications";
import fields from "../service-orders/detail-fields.json";
export async function warehouseProducts(company:string,query:string,page=1){
 if(!['1','2','27404'].includes(company)||query.length>120||!Number.isInteger(page)||page<1)throw new WarehouseError('Filtro de materiais inválido.');
 const rows=(await database().query(`SELECT c.product_id::text id,c.name,c.unit,c.company_id item_company,c.product_id::text produto_id,v.sale_price price,count(*) OVER()::int total
 FROM m8_product_catalog c LEFT JOIN m8_product_current v USING(company_id,product_id)
 WHERE c.company_id=$1 AND concat_ws(' ',c.product_id,c.name,c.payload->>'referenciaFabricante') ILIKE $2
 ORDER BY c.name,c.product_id LIMIT 30 OFFSET $3`,[company,'%'+query+'%',(page-1)*30])).rows;
 return {rows:await withWarehouseSupply(rows),total:rows[0]?.total||0,page};
}
/** One durable reservation per request before the ERP POST; never repeat an uncertain write. */
export async function addWarehouseMaterial(input:any,actor:string,session=m8Session){
 if(!['1','2','27404'].includes(String(input?.company))||!/^\d{1,18}$/.test(String(input.order))||!/^\d{1,18}$/.test(String(input.product))||!Number(input.order)||!Number(input.product)||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId||''))throw new WarehouseError('Material ou OS inválida.');
 if(typeof input.quantity!=='number'||!Number.isFinite(input.quantity)||input.quantity<=0||input.quantity>1e9||Math.abs(input.quantity-Math.round(input.quantity*1000)/1000)>1e-9||typeof input.price!=='number'||!Number.isFinite(input.price)||input.price<0||input.price>1e9||Math.abs(input.price-Math.round(input.price*100)/100)>1e-9)throw new WarehouseError('Informe quantidade positiva (até três decimais) e valor unitário válido (até dois decimais).');
 const justification=typeof input.justification==='string'?input.justification.trim():'';
 if(!justification||justification.length>2000)throw new WarehouseError('Informe a justificativa da inclusão, com até 2.000 caracteres.');
 const document={justification,product:String(input.product),quantity:input.quantity,price:input.price};
 const db=database();
 const previous=(await db.query('SELECT *,document=$2::jsonb same FROM web_warehouse_material_additions WHERE id=$1',[input.requestId,JSON.stringify(document)])).rows[0];
 const replay=(row:any)=>{if(row.actor!==actor||String(row.company_id)!==String(input.company)||String(row.order_id)!==String(input.order)||!row.same)throw new WarehouseError('Identificador utilizado para outra inclusão.');return {state:row.state,message:row.message,itemId:row.item_id};};
 if(previous)return replay(previous);
 const m8=await session(Number(input.company));
 let notification:any=null;
 const c=await db.connect();
 try{
  await c.query('BEGIN READ WRITE');await c.query('SELECT pg_advisory_xact_lock(829202,0)');
  const prior=(await c.query('SELECT *,document=$2::jsonb same FROM web_warehouse_material_additions WHERE id=$1',[input.requestId,JSON.stringify(document)])).rows[0];
  if(prior){await c.query('COMMIT');return replay(prior);}
  if(!(await c.query('SELECT 1 FROM web_user_access WHERE email=$1 AND enabled',[actor])).rows.length)throw new WarehouseError('Usuário sem acesso ativo.');
  const order=(await c.query("SELECT COALESCE(numero_sequencia,id_m8)::text number,cliente_nome customer,equipamento equipment FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2 AND status IN('Pendente','Aprovado') FOR SHARE",[input.company,input.order])).rows[0];
  if(!order)throw new WarehouseError('Esta OS não está aberta para inclusão de materiais.');
  const product=(await c.query('SELECT name,unit FROM m8_product_catalog WHERE company_id=$1 AND product_id=$2',[input.company,input.product])).rows[0];
  if(!product)throw new WarehouseError('Selecione um produto do catálogo da empresa da OS.');
  notification={company:String(input.company),orderNumber:order.number,customer:order.customer,equipment:order.equipment,productCode:String(input.product),productName:product.name,unit:product.unit,quantity:input.quantity,price:input.price,total:itemPayload({kind:'material',code:String(input.product),quantity:String(input.quantity),price:String(input.price),name:''}).valorTotal,justification};
  if((await c.query("SELECT 1 FROM web_warehouse_material_additions WHERE company_id=$1 AND order_id=$2 AND state IN('sending','uncertain')",[input.company,input.order])).rows.length)throw new WarehouseError('Há uma inclusão aguardando confirmação nesta OS. Confira o histórico e o M8 antes de enviar outro material.');
  await c.query("INSERT INTO web_warehouse_material_additions(id,company_id,order_id,actor,document,state) VALUES($1,$2,$3,$4,$5,'sending')",[input.requestId,input.company,input.order,actor,JSON.stringify(document)]);
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 let state='uncertain',message:string|null=null,itemId:string|null=null,writeStarted=false;
 try{
  // Recheck live status immediately before the only write to the ERP.
  const live=await m8(`/v1/assistenciatecnica/ordemservico?Id=${input.order}&Page=1&PageSize=1`);
  if(!Array.isArray(live)||live.length!==1||String(live[0].id)!==String(input.order)||!['Pendente','Aprovado'].includes(live[0].status)){
   state='rejected';message='O M8 não confirmou que a OS está aberta. Nenhum material foi enviado.';
  }else{
   notification={...notification,orderNumber:String(live[0].numeroSequencia||notification.orderNumber),customer:live[0].clienteNome||notification.customer,equipment:live[0].equipamento||notification.equipment};
   writeStarted=true;
   const result=await m8(`/v1/assistenciatecnica/ordemservico/${input.order}/produto`,{...itemPayload({kind:'material',code:String(input.product),quantity:String(input.quantity),price:String(input.price),name:''}),observacaoInterna:'Incluído posteriormente pelo almoxarifado via portal. Justificativa: '+justification});
   if(!Number.isSafeInteger(result?.id)||result.id<=0)throw new M8RequestError('O M8 não confirmou o ID do material. Confira no ERP antes de novo envio.',true);
   itemId=String(result.id);state='complete';message='Material incluído posteriormente pelo almoxarifado.';
  }
 }catch(e){state=!writeStarted||(e instanceof M8RequestError&&!e.uncertain)?'rejected':'uncertain';message=e instanceof M8RequestError?e.message:'Não foi possível confirmar a inclusão. Confira o M8 antes de reenviar.';}
 // Persist confirmation before refresh. A failed refresh must never replay the ERP write.
 const save=await db.connect();
 try{await save.query('BEGIN READ WRITE');await save.query('UPDATE web_warehouse_material_additions SET state=$2,item_id=$3,message=$4,updated_at=now() WHERE id=$1',[input.requestId,state,itemId,message]);if(state==='complete')await queueWarehouseMaterialNotification(save,input.requestId,actor,notification);await save.query('COMMIT');}catch(e){await save.query('ROLLBACK');throw e;}finally{save.release();}
 if(state==='complete'){
  try{
   const full=await m8(`/v1/assistenciatecnica/ordemservicocompleta?Id=${input.order}&Page=1&PageSize=1`);
   const material=Array.isArray(full)&&full.length===1&&String(full[0].id)===String(input.order)?full[0].produtos?.find((p:any)=>String(p.id)===itemId):null;
   if(!material||String(material.produtoId)!==String(input.product))throw new Error('Material ainda não retornou na consulta.');
   const mapped=fields.m8_os_produtos.filter(([,field])=>material[field]!==undefined);
   const columns=['company_id','ordem_servico_id','id_m8','payload',...mapped.map(([column])=>column)];
   const values=[input.company,input.order,itemId,JSON.stringify(material),...mapped.map(([,field])=>material[field])];
   const local=await db.connect();
   try{await local.query('BEGIN READ WRITE');await local.query(`INSERT INTO m8_os_produtos(${columns.join(',')}) VALUES(${values.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT(company_id,ordem_servico_id,id_m8) DO UPDATE SET ${columns.slice(3).map(key=>`${key}=EXCLUDED.${key}`).join(',')},updated_at=now(),sincronizado_em=now()`,values);await local.query('COMMIT');}catch(e){await local.query('ROLLBACK');throw e;}finally{local.release();}
   await refreshProjectionOrder(Number(input.company),String(input.order),session);
  }catch{message='Material confirmado no M8. A exibição local aguarda sincronização.';}
 }
 const final=await db.connect();
 try{await final.query('BEGIN READ WRITE');await final.query('UPDATE web_warehouse_material_additions SET message=$2,updated_at=now() WHERE id=$1',[input.requestId,message]);await final.query('COMMIT');}catch(e){await final.query('ROLLBACK');throw e;}finally{final.release();}
 return {state,message,itemId};
}

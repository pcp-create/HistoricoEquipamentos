import 'server-only';
import {database} from '../db';
import {AdminInputError} from '../admin-store';
import {m8Session} from '../service-orders/m8';
import {cityKey} from '../tasks/territories';
export const editableFields=['razaoSocial','municipioNome','ufSigla','regiaoId','classificacaoId'] as const;
export function customerPatch(changes:Record<string,unknown>){
 const patch:Record<string,unknown>={};
 for(const [key,value] of Object.entries(changes)){
  if(!editableFields.includes(key as any))throw new AdminInputError('Campo M8 não permitido.');
  if(key.endsWith('Id')){if(!Number.isSafeInteger(Number(value))||Number(value)<1)throw new AdminInputError('Selecione um ID válido do M8.');patch[key]=Number(value);}
  else{if(typeof value!=='string'||!value.trim()||value.length>180)throw new AdminInputError('Preencha os campos M8 corretamente.');patch[key]=value.trim();}
 }
 if(patch.ufSigla){patch.ufSigla=String(patch.ufSigla).toUpperCase();if(!'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').includes(String(patch.ufSigla)))throw new AdminInputError('UF inválida.');}
 return patch;
}
async function write(work:(c:any)=>Promise<void>){const c=await database().connect();try{await c.query('BEGIN READ WRITE');await work(c);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
export function companyId(value:unknown){const id=Number(value);if(id!==1)throw new AdminInputError('Empresa inválida.');return id;}
export function personId(value:unknown){if(!/^\d+$/.test(String(value))||Number(value)<1)throw new AdminInputError('Cliente inválido.');return String(value);}
export async function customerRegistry(company:number){
 const db=database();
 const rows=(await db.query(`SELECT d.person_id::text AS id,d.name,d.document,d.payload,r.detail,r.sellers,r.synced_at,r.assignee,r.seller_user,coalesce(r.version,0) AS version FROM (SELECT DISTINCT ON (person_id) * FROM m8_customer_directory WHERE company_id IN (1,2,27404) ORDER BY person_id,(company_id=1) DESC,collected_at DESC) d LEFT JOIN web_customer_registry r ON r.person_id=d.person_id AND r.company_id=$1 ORDER BY d.name,d.person_id`,[company])).rows;
 // Keep deployment compatible with servers that have not installed integrator 018 yet.
 const hasCommercial=(await db.query("SELECT to_regclass('public.m8_customer_commercial') AS relation")).rows[0]?.relation;
 if(hasCommercial){
  const imported=(await db.query('SELECT person_id::text AS id,detail,sellers,synced_at FROM m8_customer_commercial')).rows;
  const byId=new Map(imported.map(row=>[row.id,row]));
  for(const row of rows){const source=byId.get(row.id);if(source&&(!row.synced_at||new Date(source.synced_at)>new Date(row.synced_at))){row.detail=source.detail;row.sellers=source.sellers;row.synced_at=source.synced_at;}}
 }
 const territories=(await db.query('SELECT city_key,uf,mesoregion,microregion FROM web_task_territories')).rows;
 const byCity=new Map(territories.map(t=>[t.city_key+':'+t.uf,t]));
 return {rows:rows.map(row=>{const p={...row.payload,...row.detail};const t=byCity.get(cityKey(p.municipioNome||'')+':'+(p.ufSigla||''));return {id:row.id,name:p.razaoSocial||row.name,document:row.document,municipioNome:p.municipioNome||'',ufSigla:p.ufSigla||'',regiaoId:p.regiaoId||'',regiaoNome:p.regiaoNome||'',classificacaoId:p.classificacaoId||'',classificacaoNome:p.classificacaoNome||'',vendedorId:String(((row.sellers||[]).find((s:any)=>s.padrao)||(row.sellers?.length===1?row.sellers[0]:null))?.vendedorId||''),seller:(row.sellers||[]).map((s:any)=>s.vendedorNome||s.nome||String(s.vendedorId||'')).join(', '),mesoregion:t?.mesoregion||'',microregion:t?.microregion||'',assignee:row.assignee||'',seller_user:row.seller_user||'',version:row.version,synced_at:row.synced_at};}),users:(await db.query("SELECT email,display_name,job_title FROM web_user_access WHERE enabled ORDER BY display_name,email")).rows};
}
export async function syncCustomerPage(company:number,page:number){
 if(!Number.isInteger(page)||page<1)throw new AdminInputError('Página inválida.');
 const session=await m8Session(company),rows=await session(`/v1/configuracoes/cliente?Page=${page}&PageSize=500`);
 if(!Array.isArray(rows))throw Error('Lista M8 inválida.');
 await write(async c=>{for(const row of rows){const id=personId(row.id);await c.query(`INSERT INTO m8_customer_directory(company_id,person_id,name,document,payload,collected_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(company_id,person_id) DO UPDATE SET name=EXCLUDED.name,document=EXCLUDED.document,payload=EXCLUDED.payload,collected_at=now()`,[company,id,row.razaoSocial||'',row.cpfCnpj||'',JSON.stringify(row)]);}});
 return {count:rows.length,done:rows.length<500};
}
export async function syncCustomerDetails(company:number,ids:unknown[],sessionFactory:typeof m8Session=m8Session){
 if(!Array.isArray(ids)||ids.length>20)throw new AdminInputError('Selecione até 20 clientes por consulta.');
 const session=await sessionFactory(company);
 const results=[];
 for(const raw of ids){const id=personId(raw);const detail=await session(`/v1/configuracoes/cliente/${id}`),sellers=await session(`/v1/configuracoes/cliente/${id}/vendedor?Page=1&PageSize=1000`);
  if(!detail||typeof detail!=='object'||Array.isArray(detail)||!Array.isArray(sellers))throw Error('Detalhes M8 inválidos.');
  await write(async c=>{await c.query(`INSERT INTO web_customer_registry(company_id,person_id,detail,sellers,synced_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(company_id,person_id) DO UPDATE SET detail=EXCLUDED.detail,sellers=EXCLUDED.sellers,synced_at=now()`,[company,id,JSON.stringify(detail),JSON.stringify(sellers)]);});results.push(id);
 }
 return {ids:results};
}
async function saveCustomerUnlocked(body:any,actor:string,sessionFactory:typeof m8Session){
 const company=companyId(body.company),id=personId(body.id);
 if(!Number.isInteger(body.version))throw new AdminInputError('Versão inválida.');
 const {vendedorId:requestedSeller,...fields}=body.changes||{};
 const patch=customerPatch(fields);
 const sellerChanged=requestedSeller!==undefined;
 if(sellerChanged&&(!Number.isSafeInteger(Number(requestedSeller))||Number(requestedSeller)<1))throw new AdminInputError('Selecione um vendedor M8 válido.');
 if((Object.keys(patch).length||sellerChanged)&&body.editM8!==true)throw new AdminInputError('Ative Editar campos M8 antes de enviar.');
 const current=(await database().query('SELECT d.person_id,r.version,r.assignee,r.seller_user FROM m8_customer_directory d LEFT JOIN web_customer_registry r ON r.person_id=d.person_id AND r.company_id=$1 WHERE d.company_id IN(1,2,27404) AND d.person_id=$2 LIMIT 1',[company,id])).rows[0];
 if(!current||(current.version||0)!==body.version)throw new AdminInputError('Registro alterado. Atualize antes de salvar.');
 if(body.assignee&&!(await database().query('SELECT 1 FROM web_user_access WHERE email=$1 AND enabled',[body.assignee])).rows.length)throw new AdminInputError('Selecione um orçamentista ativo.');
 const sellerUser=body.seller_user===undefined?current.seller_user||null:body.seller_user||null;
 if(sellerUser!==null&&(typeof sellerUser!=='string'||!(await database().query("SELECT 1 FROM web_user_access WHERE email=$1 AND enabled AND lower(trim(job_title)) IN ('vendedor','vendedora')",[sellerUser])).rows.length))throw new AdminInputError('Selecione um vendedor ativo.');
 if(Object.keys(patch).length||sellerChanged){
  const session=await sessionFactory(company),remote=await session(`/v1/configuracoes/cliente/${id}`);
  if(sellerChanged){
   const links=await session(`/v1/configuracoes/cliente/${id}/vendedor?Page=1&PageSize=1000`);
   if(!Array.isArray(links))throw Error('Vínculos M8 inválidos.');
   const primary=links.find((s:any)=>s.padrao)||(links.length===1?links[0]:null);
   if(String(primary?.vendedorId||'')!==String(body.before?.vendedorId||''))throw new AdminInputError('O vendedor foi alterado no M8. Sincronize antes de enviar.');
   const selected=await session(`/v1/configuracoes/vendedor/${Number(requestedSeller)}`);
   if(Number(selected?.id)!==Number(requestedSeller)||selected.ativo===false)throw new AdminInputError('Selecione um vendedor M8 ativo.');
  }
  for(const key of Object.keys(patch))if(String(remote[key]??'')!==String(body.before?.[key]??''))throw new AdminInputError('O cliente foi alterado no M8. Sincronize antes de enviar.');
  if(Object.keys(patch).length)await session(`/v1/configuracoes/cliente/${id}`,patch,'PATCH');
  if(sellerChanged){
   await session(`/v1/configuracoes/cliente/${id}/vendedor`,{vendedorId:Number(requestedSeller),padrao:true},'POST');
   const updated=await session(`/v1/configuracoes/cliente/${id}/vendedor?Page=1&PageSize=1000`);
   if(!Array.isArray(updated)||updated.filter((s:any)=>s.padrao===true).length!==1||!updated.some((s:any)=>Number(s.vendedorId)===Number(requestedSeller)&&s.padrao===true))throw new AdminInputError('O M8 não confirmou o vendedor padrão. Atualize os detalhes do cliente antes de tentar novamente.');
  }
  await syncCustomerDetails(company,[id],sessionFactory);
 }
 await write(async c=>{
  const result=await c.query(`INSERT INTO web_customer_registry(company_id,person_id,assignee,seller_user) VALUES($1,$2,$3,$5) ON CONFLICT(company_id,person_id) DO UPDATE SET assignee=EXCLUDED.assignee,seller_user=EXCLUDED.seller_user,version=web_customer_registry.version+1 WHERE web_customer_registry.version=$4 RETURNING version`,[company,id,body.assignee||null,body.version||1,sellerUser]);
  if(!result.rows.length)throw new AdminInputError('Registro alterado. Recarregue antes de salvar novamente.');
  await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('customer_registry',$1,$1,$2)",[actor,JSON.stringify({company,id,patch,...(sellerChanged?{vendedorId:Number(requestedSeller),beforeVendedorId:body.before?.vendedorId}:{}),assignee:body.assignee||null,seller_user:sellerUser})]);
 });
 return {saved:true};
}

export async function saveCustomer(body:any,actor:string,sessionFactory:typeof m8Session=m8Session){
 const company=companyId(body.company),id=personId(body.id),lock=await database().connect();
 try{
  await lock.query('BEGIN READ WRITE');
  await lock.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`customer-registry:${company}:${id}`]);
  const result=await saveCustomerUnlocked(body,actor,sessionFactory);
  await lock.query('COMMIT');return result;
 }catch(error){await lock.query('ROLLBACK');throw error;}finally{lock.release();}
}

export async function customerLookups(company:number,sessionFactory:typeof m8Session=m8Session){
 const session=await sessionFactory(company),classifications:any[]=[],sellers:any[]=[];
 for(let page=1;page<=100;page++){
  const rows=await session(`/v1/configuracoes/classificacaopessoa?Page=${page}&PageSize=1000`);
  if(!Array.isArray(rows))throw Error('Classificações M8 inválidas.');
  classifications.push(...rows.map(row=>({id:String(row.id),name:row.nome||String(row.id)})));
  if(rows.length<1000)break;
  if(page===100)throw Error('Limite de classificações atingido.');
 }
 for(let page=1;page<=100;page++){
  const rows=await session(`/v1/configuracoes/vendedor?Page=${page}&PageSize=1000`);
  if(!Array.isArray(rows))throw Error('Vendedores M8 inválidos.');
  sellers.push(...rows.filter(row=>row.ativo!==false).map(row=>({id:String(row.id),name:row.razaoSocial||row.fantasia||String(row.id)})));
  if(rows.length<1000)return {classifications,sellers};
 }
 throw Error('Limite de vendedores atingido.');
}

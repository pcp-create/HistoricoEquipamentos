import 'server-only';
import {database} from '../db';
import {m8Session,M8RequestError} from '../service-orders/m8';
import {equipmentRegistrationInput,equipmentRegistrationName,equipmentRegistrationPayload,EquipmentRegistrationError,type RegistrationInput} from './equipment-registration-model';
export {EquipmentRegistrationError};
const normalized=(value:unknown)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
async function registrationDefaults(api:Awaited<ReturnType<typeof m8Session>>,input:RegistrationInput){
 const own=input.ownership==='own',familyName=own?'EQUIPAMENTO DE LOCAÇÃO':'USO E CONSUMO';
 const list=async(path:string)=>{const rows=await api(path);if(!Array.isArray(rows))throw new EquipmentRegistrationError('O M8 não confirmou os cadastros automáticos. Tente novamente.');return rows;};
 const [families,units,groups,categories]=await Promise.all([
  list('/v1/estoque/familia?'+new URLSearchParams({Nome:familyName,Page:'1',PageSize:'1000'})),
  list('/v1/estoque/unidade?Nome=UNIDADE&Page=1&PageSize=1000'),
  list(`/v1/estoque/grupo?Id=${own?96:97}&Page=1&PageSize=1`),
  own?list('/v1/estoque/categoria?Nome=DIVERSOS&Page=1&PageSize=1000'):Promise.resolve([]),
 ]);
 const choose=(rows:any[],predicate:(v:any)=>boolean,label:string)=>{const found=rows.filter(predicate);if(found.length!==1||!Number.isSafeInteger(found[0].id)||found[0].id<=0)throw new EquipmentRegistrationError(`Confira o cadastro automático de ${label} no M8.`);return found[0].id;};
 const family=choose(families,r=>normalized(r.nome)===normalized(familyName),'família');
 const unit=choose(units,r=>normalized(r.nome)==='UNIDADE'&&normalized(r.abreviatura)==='UN','unidade');
 choose(groups,r=>r.id===(own?96:97)&&normalized(r.nome)===(own?'EQUIPAMENTOS USADOS (COMPRESSORES, SEPARADORES, SECADORES, MOTORES)':'EQUIPAMENTOS DE CLIENTES'),'grupo de estoque');
 return {family,unit,...(own?{category:choose(categories,r=>normalized(r.nome)==='DIVERSOS','categoria')}:{})};
}
async function saveLocal(db:any,row:any){
 const input=equipmentRegistrationInput(row.document,{requireInternalDetails:false}),payload=row.payload;
 const c=await db.connect();
 try{await c.query('BEGIN READ WRITE');
  await c.query(`INSERT INTO m8_equipment_catalog(company_id,equipment_id,name,alias,model,models,serial,serial_source,issues,payload,present,collected_at)
   VALUES(1,$1,$2,$2,$3,$4,$5,'portal','[]',$6,true,now())
   ON CONFLICT(equipment_id) DO NOTHING`,
   [row.equipment_id,payload.nome,input.model||null,input.model?[input.model]:[],input.serial,JSON.stringify({...payload,id:Number(row.equipment_id),numeroSerie:input.serial,modeloResumido:input.model})]);
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 return {id:String(row.equipment_id),name:payload.nome,model:input.model,serial:input.serial,client:''};
}
/** Persist the request before the single ERP write. Never replay an uncertain POST. */
export async function registerWorkshopEquipment(raw:any,actor:string,session=m8Session){
 let input=equipmentRegistrationInput(raw,{requireInternalDetails:false});const document=JSON.stringify(input);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.requestId||''))throw new EquipmentRegistrationError('Atualize o cadastro antes de salvar.');
 const db=database();
 const replay=async(row:any)=>{
  if(row.actor!==actor||JSON.stringify(equipmentRegistrationInput(row.document,{requireInternalDetails:false}))!==document)throw new EquipmentRegistrationError('Identificador utilizado para outro cadastro.');
  return {state:row.state,message:row.message,equipment:row.state==='complete'?await saveLocal(db,row):null};
 };
 if(!(await db.query('SELECT 1 FROM web_user_access WHERE email=$1 AND enabled',[actor])).rows.length)throw new EquipmentRegistrationError('Usuário sem acesso ativo.');
 const prior=(await db.query('SELECT *,document=$2::jsonb same FROM web_workshop_equipment_registrations WHERE id=$1',[raw.requestId,document])).rows[0];
 if(prior)return replay(prior);

 input=equipmentRegistrationInput(raw);
 const api=await session(1),defaults=await registrationDefaults(api,input),payload=equipmentRegistrationPayload(input,defaults);
 const c=await db.connect();
 try{await c.query('BEGIN READ WRITE');await c.query('SELECT pg_advisory_xact_lock(829203,0)');
  const existing=(await c.query('SELECT *,document=$2::jsonb same FROM web_workshop_equipment_registrations WHERE id=$1',[raw.requestId,document])).rows[0];
  if(existing){await c.query('COMMIT');return replay(existing);}
  const matches=(await c.query(`SELECT equipment_id::text id,name,model,serial FROM m8_equipment_catalog WHERE present AND (($3::boolean=false AND lower(name)=lower($1)) OR (length($2)>=3 AND upper($2) NOT IN('NC','N/C','SEM SERIE') AND lower(serial)=lower($2))) LIMIT 1`,[equipmentRegistrationName(input),input.serial,input.noSerial])).rows;
  if(matches.length)throw new EquipmentRegistrationError(`Este equipamento já está cadastrado (${matches[0].id}). Pesquise pela série ou pelo código antes de adicionar.`);
  const pending=(await c.query("SELECT 1 FROM web_workshop_equipment_registrations WHERE state IN('sending','uncertain') AND ((length($1)>=3 AND upper($1) NOT IN('NC','N/C','SEM SERIE') AND lower(document->>'serial')=lower($1)) OR lower(payload->>'nome')=lower($2))",[input.serial,payload.nome])).rows.length;
  if(pending)throw new EquipmentRegistrationError('Já existe um cadastro desta máquina aguardando confirmação. Confira o M8 antes de um novo envio.');
  await c.query("INSERT INTO web_workshop_equipment_registrations(id,actor,document,payload,state) VALUES($1,$2,$3,$4,'sending')",[raw.requestId,actor,document,JSON.stringify(payload)]);
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 let state='uncertain',message='O M8 não confirmou o cadastro. Confira o ERP antes de reenviar.',equipmentId:string|null=null;
 try{
  const response=await api(input.ownership==='own'?'/v1/estoque/produto':'/v1/estoque/equipamento',payload);
  if(!Number.isSafeInteger(response?.id)||response.id<=0)throw new M8RequestError('O M8 não confirmou o código do equipamento. Confira o ERP antes de reenviar.',true);
  equipmentId=String(response.id);state='complete';message='Equipamento cadastrado no M8. Confirme a entrada para incluí-lo na oficina.';
 }catch(e){state=e instanceof M8RequestError&&!e.uncertain?'rejected':'uncertain';message=e instanceof M8RequestError?e.message:'Não foi possível confirmar o cadastro no M8. Confira o ERP antes de reenviar.';}
 const save=await db.connect();
 try{await save.query('BEGIN READ WRITE');await save.query('UPDATE web_workshop_equipment_registrations SET state=$2,equipment_id=$3,message=$4,updated_at=now() WHERE id=$1',[raw.requestId,state,equipmentId,message]);await save.query('COMMIT');}catch(e){await save.query('ROLLBACK');throw e;}finally{save.release();}
 return {state,message,equipment:state==='complete'?await saveLocal(db,{equipment_id:equipmentId,payload,document:input}):null};
}

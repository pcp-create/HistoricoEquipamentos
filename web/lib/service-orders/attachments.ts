import 'server-only';
import {createHash} from 'node:crypto';
import {database} from '../db';
import {m8Session,M8RequestError} from './m8';
import {OrderInputError,positiveId} from './model';
export const attachmentMaxBytes=3*1024*1024;
export function attachmentTarget(company:string,order:string){
 if(!['1','2','27404'].includes(company))throw new OrderInputError('Empresa inválida.');
 positiveId(order,'a OS');return `/v1/assistenciatecnica/ordemservico/${order}/anexo`;
}
export function attachmentName(value:string){
 const name=value.trim();
 if(!name||name.length>180||/[\\/\x00-\x1f\x7f]/.test(name)||name==='.'||name==='..')throw new OrderInputError('Nome do anexo inválido (máximo de 180 caracteres).');
 return name;
}
// M8 stores the filename in the attachment description. Keep room for the extension.
export function attachmentErpName(value:string){
 const name=attachmentName(value);
 if(name.length<=100)return name;
 const extension=name.match(/\.[a-zA-Z0-9]{1,12}$/)?.[0]||'';
 const suffix='-'+createHash('sha256').update(name).digest('hex').slice(0,8);
 return name.slice(0,100-extension.length-suffix.length).trimEnd()+suffix+extension;
}
export function attachmentPayload(name:string,bytes:Buffer){
 if(!bytes.length||bytes.length>attachmentMaxBytes)throw new OrderInputError('Cada anexo deve ter entre 1 byte e 3 MB.');
 return {nome:attachmentErpName(name),arquivo:bytes.toString('base64')};
}
export function decodeAttachment(result:any){
 const encoded=result?.arquivo;
 if(typeof encoded!=='string'||!encoded.length||encoded.length>Math.ceil(attachmentMaxBytes/3)*4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw new OrderInputError('O anexo retornado pelo ERP é inválido ou excede 3 MB.');
 return Buffer.from(encoded,'base64');
}
export async function listOrderAttachments(company:string,order:string){
 const path=attachmentTarget(company,order),m8=await m8Session(Number(company));
 const rows:any[]=[];
 for(let page=1;page<=100;page++){
  const result=await m8(`${path}?Page=${page}&PageSize=100`);
  if(!Array.isArray(result))throw new OrderInputError('Lista de anexos inválida no M8.');
  rows.push(...result.map((r:any)=>({id:String(r.id),name:String(r.descricao||`Anexo ${r.id}`)})));
  if(result.length<100)return rows;
 }
 throw new OrderInputError('A lista de anexos excedeu o limite de consulta.');
}
export async function downloadOrderAttachment(company:string,order:string,id:string){
 const path=attachmentTarget(company,order);positiveId(id,'o anexo');
 const m8=await m8Session(Number(company)),data=await m8(`${path}/${id}`);
 const bytes=decodeAttachment(data),extension=String(data.tipo||'bin').replace(/[^a-zA-Z0-9]/g,'').slice(0,12)||'bin';
 return {bytes,name:`OS-${order}-anexo-${id}.${extension}`};
}
async function matchingBytes(received:Buffer,expected:Buffer,generated:boolean){
 if(received.equals(expected))return true;
 if(!generated)return false;
 // Regenerating an unchanged report changes PDF timestamps, but must not change its content.
 const {PDFDocument}=await import('pdf-lib');
 const normalize=async(bytes:Buffer)=>{
  const pdf=await PDFDocument.load(bytes,{updateMetadata:false});
  pdf.setCreationDate(new Date(0));pdf.setModificationDate(new Date(0));
  return Buffer.from(await pdf.save({useObjectStreams:false}));
 };
 return (await normalize(received)).equals(await normalize(expected));
}
// A missing POST ID is not proof of failure. Verify the received bytes before acknowledging.
async function confirmedAttachment(m8:Awaited<ReturnType<typeof m8Session>>,path:string,names:string[],bytes:Buffer,generated:boolean){
 const possibleNames=new Set(names.flatMap(name=>[name,name.replace(/\.[a-zA-Z0-9]{1,12}$/,'')]));
 for(let page=1;page<=100;page++){
  const rows=await m8(`${path}?Page=${page}&PageSize=100`);
  if(!Array.isArray(rows))return null;
  for(const row of rows){
   if(!validAttachmentId(row?.id)||!possibleNames.has(String(row.descricao)))continue;
   try{if(await matchingBytes(decodeAttachment(await m8(`${path}/${row.id}`)),bytes,generated))return String(row.id);}catch{}
  }
  if(rows.length<100)return null;
 }
 return null;
}
function validAttachmentId(id:unknown){return /^[1-9]\d*$/.test(String(id))&&Number(id)<=2147483647;}
export async function uploadOrderAttachment(company:string,order:string,name:string,bytes:Buffer,actor:string,identity?:string):Promise<{id:string;alreadySent?:boolean}>{
 const filename=attachmentName(name),path=attachmentTarget(company,order),payload=attachmentPayload(filename,bytes);
 const m8=await m8Session(Number(company));
 const digest=createHash('sha256').update(identity?'generated-report:'+identity:bytes).digest('hex');
 const db=database(),c=await db.connect();
 let reserved=false;
 const confirm=async(id:string)=>{
  await c.query('BEGIN READ WRITE');
  await c.query("UPDATE web_order_attachment_uploads SET state='complete',attachment_id=$5,updated_at=now() WHERE company_id=$1 AND order_id=$2 AND filename=$3 AND sha256=$4",[company,order,filename,digest,id]);
  await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('service_order_attachment_added',$1,$1,$2)",[actor,JSON.stringify({company,order,name:payload.nome,attachmentId:id,bytes:bytes.length})]);
  await c.query('COMMIT');return {id};
 };
 const reconcile=async()=>{
  try{return await confirmedAttachment(m8,path,[filename,payload.nome],bytes,!!identity);}catch{return null;}
 };
 try{
  await c.query('BEGIN READ WRITE');
  const inserted=await c.query("INSERT INTO web_order_attachment_uploads(company_id,order_id,filename,sha256,actor,state) VALUES($1,$2,$3,$4,$5,'sending') ON CONFLICT(company_id,order_id,filename,sha256) DO UPDATE SET state='sending',actor=EXCLUDED.actor,updated_at=now() WHERE web_order_attachment_uploads.state='rejected' RETURNING id",[company,order,filename,digest,actor]);
  if(!inserted.rows.length){
   const old=(await c.query('SELECT state,attachment_id FROM web_order_attachment_uploads WHERE company_id=$1 AND order_id=$2 AND filename=$3 AND sha256=$4',[company,order,filename,digest])).rows[0];
   await c.query('ROLLBACK');
   if(old?.state==='complete')return {id:old.attachment_id,alreadySent:true};
   const recovered=await reconcile();
   if(recovered)return {...await confirm(recovered),alreadySent:true};
   throw new OrderInputError('Este arquivo já teve envio iniciado. Confira os anexos no ERP antes de tentar novamente; o sistema não repete um envio sem confirmação.');
  }
  await c.query('COMMIT');reserved=true;
  let result;
  try{result=await m8(path,payload);}
  catch(e){
   const uncertain=!(e instanceof M8RequestError)||e.uncertain;
   await c.query('BEGIN READ WRITE');
   await c.query("UPDATE web_order_attachment_uploads SET state=$5,updated_at=now() WHERE company_id=$1 AND order_id=$2 AND filename=$3 AND sha256=$4",[company,order,filename,digest,uncertain?'uncertain':'rejected']);
   await c.query('COMMIT');
   if(uncertain){const recovered=await reconcile();if(recovered)return await confirm(recovered);}
   const message=e instanceof Error?e.message:'O ERP não confirmou o anexo. Confira os anexos antes de repetir.';
   throw new OrderInputError(/Descricao.*(?:maximum|maxim|string or array)/is.test(message)?'O ERP recusou o nome do anexo por exceder o limite da descrição.':message);
  }
  let id=validAttachmentId(result?.id)?String(result.id):null;
  if(!id)id=await reconcile();
  if(!id){
   await c.query('BEGIN READ WRITE');
   await c.query("UPDATE web_order_attachment_uploads SET state='uncertain',updated_at=now() WHERE company_id=$1 AND order_id=$2 AND filename=$3 AND sha256=$4",[company,order,filename,digest]);
   await c.query('COMMIT');
   throw new OrderInputError('O ERP não confirmou o identificador do anexo e o arquivo ainda não pôde ser conferido. Atualize os anexos e tente novamente; o sistema verificará o recebimento sem duplicar o envio.');
  }
  return await confirm(id);
 }catch(e){await c.query('ROLLBACK');if(reserved&&!(e instanceof OrderInputError))throw new OrderInputError('O envio do anexo não foi confirmado. Confira no ERP antes de repetir.');throw e;}finally{c.release();}
}

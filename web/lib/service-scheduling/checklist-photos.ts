import 'server-only';
import {database} from '../db';
import {Forbidden} from '../auth';
import {stagesOf,photoLimit} from './checklists';
import sharp from 'sharp';
export class ChecklistPhotoError extends Error {}
async function permitted(c:any,operationId:string,email:string){
 const row=(await c.query(`SELECT o.*,u.role,u.enabled FROM web_service_operations o JOIN web_user_access u ON u.email=$2 WHERE o.id=$1`,[operationId,email])).rows[0];
 if(!row?.enabled||(row.role!=='admin'&&row.document.responsible!==email&&!row.document.support?.includes(email)))throw new Forbidden();
 return row;
}
export async function saveChecklistPhoto(operationId:string,stageId:string,fieldId:string,file:File,email:string){
 if(!/^[0-9a-f-]{36}$/i.test(operationId)||!file||file.size>3*1024*1024||!file.size)throw new ChecklistPhotoError('Envie uma foto de até 3 MB.');
 const bytes=Buffer.from(await file.arrayBuffer());
 const raster=bytes.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])) || bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || (bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP');
 if(!raster)throw new ChecklistPhotoError('Use uma foto JPEG, PNG ou WebP.');
 let image:Buffer;
 try{image=await sharp(bytes,{limitInputPixels:40000000}).rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:85}).toBuffer();}catch{throw new ChecklistPhotoError('Imagem inválida. Use JPEG, PNG ou WebP.');}
 const c=await database().connect();
 try{
  await c.query('BEGIN READ WRITE');await c.query('SELECT pg_advisory_xact_lock(728001)');
  const o=await permitted(c,operationId,email);
  const run=o.document.checklistRun;
  const reviewing=o.role==='admin'&&o.status==='awaiting_review'&&run?.stages[stageId]?.status==='submitted';
  if(!reviewing&&(['completed','reviewed','awaiting_review'].includes(o.status)||!run||run.stages[stageId]?.status!=='released'))throw new ChecklistPhotoError('A etapa não está aberta para preenchimento.');
  if(!stagesOf(run.template).find(s=>s.id===stageId)?.fields.some(f=>f.id===fieldId&&(f.type==='photo'||f.type==='signature'||photoLimit(f)>0)))throw new ChecklistPhotoError('Campo de fotos inválido.');
  const count=(await c.query('SELECT count(*)::int n FROM web_service_checklist_photos WHERE operation_id=$1 AND stage_id=$2 AND field_id=$3',[operationId,stageId,fieldId])).rows[0].n;
  if(count>=50)throw new ChecklistPhotoError('Limite de anexos deste campo atingido.');
  const result=(await c.query('INSERT INTO web_service_checklist_photos(operation_id,stage_id,field_id,filename,mime,content,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id::text',[operationId,stageId,fieldId,(file.name.replace(/\.[^.]+$/,'').slice(0,160)||'foto')+'.jpg','image/jpeg',image,email])).rows[0];
  await c.query('COMMIT');return result;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function getChecklistPhoto(id:string,email:string){
 if(!/^\d{1,18}$/.test(id))return null;
 const db=database();const p=(await db.query('SELECT * FROM web_service_checklist_photos WHERE id=$1',[id])).rows[0];
 if(!p)return null;await permitted(db,p.operation_id,email);return p;
}

import 'server-only';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {database} from '../db';
import {LeakageConflict,LeakageInputError,leakageId,validateLeakage} from './model';
export async function saveLeakage(body:any,email:string,sourceKey?:string){
 const document=validateLeakage(body?.document),id=body.id?leakageId(body.id):null;
 if(id&&(!Number.isSafeInteger(body.version)||body.version<1))throw new LeakageInputError('Versão inválida. Reabra o levantamento.');
 const c=await database().connect();
 try{
  await c.query('BEGIN READ WRITE');
  if(sourceKey){const existing=(await c.query('SELECT id FROM web_leakage_reports WHERE source_key=$1',[sourceKey])).rows[0];if(existing){await c.query('COMMIT');return {...existing,skipped:true};}}
  const assets=[...new Set([...document.images.map((i:any)=>i.assetId),document.clientLogo].filter(Boolean))];
  if(assets.length&&(await c.query('SELECT id FROM web_leakage_report_images WHERE id=ANY($1::uuid[])',[assets])).rows.length!==assets.length)throw new LeakageInputError('Uma imagem não foi salva. Anexe-a novamente.');
  const values=[document.title,document.client,document.serviceOrder,JSON.stringify(document),email];
  const row=id?(await c.query('UPDATE web_leakage_reports SET title=$1,client=$2,service_order=$3,document=$4,updated_by=$5,updated_at=now(),version=version+1 WHERE id=$6 AND version=$7 RETURNING id,version,updated_at',[...values,id,body.version])).rows[0]
   :(await c.query('INSERT INTO web_leakage_reports(title,client,service_order,document,created_by,updated_by,source_key) VALUES($1,$2,$3,$4,$5,$5,$6) RETURNING id,version,updated_at',[...values,sourceKey||null])).rows[0];
  if(!row)throw new LeakageConflict('Este levantamento foi alterado por outra pessoa. Reabra a versão atual ou salve como novo.');
  await c.query('INSERT INTO web_leakage_report_revisions(report_id,version,document,created_by) VALUES($1,$2,$3,$4)',[row.id,row.version,JSON.stringify(document),email]);
  await c.query('COMMIT');return {...row,document};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function leakageList(q:string,offset=0){
 const term=q.trim().slice(0,120).replace(/[\\%_]/g,'\\$&');
 return {rows:(await database().query("SELECT id,version,title,client,service_order,updated_at,updated_by,document->>'date' AS date,jsonb_array_length(document->'machines') AS machine_count FROM web_leakage_reports WHERE concat_ws(' ',client,title,service_order) ILIKE $1 ORDER BY updated_at DESC,id LIMIT 25 OFFSET $2",['%'+term+'%',offset])).rows};
}
export async function leakageDetail(id:string,version?:number){
 const row=(await database().query('SELECT id,version,document FROM web_leakage_reports WHERE id=$1',[leakageId(id)])).rows[0];
 if(!row)throw new LeakageInputError('Levantamento não encontrado.');
 const revisions=(await database().query('SELECT version,created_at,created_by FROM web_leakage_report_revisions WHERE report_id=$1 ORDER BY version DESC',[id])).rows;
 if(version){const old=(await database().query('SELECT document FROM web_leakage_report_revisions WHERE report_id=$1 AND version=$2',[id,version])).rows[0];if(!old)throw new LeakageInputError('Revisão não encontrada.');return {...row,document:old.document,revisions,historicalVersion:version};}
 return {...row,revisions};
}
export async function saveLeakageImage(file:File,email:string){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>3000000)throw new LeakageInputError('Use JPG, PNG ou WebP de até 3 MB.');
 let content:Buffer;try{content=await sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:40000000}).rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();}catch{throw new LeakageInputError('Imagem inválida.');}
 const c=await database().connect();try{await c.query('BEGIN READ WRITE');const row=(await c.query("INSERT INTO web_leakage_report_images(digest,content,content_type,created_by) VALUES($1,$2,'image/webp',$3) ON CONFLICT(digest) DO UPDATE SET digest=EXCLUDED.digest RETURNING id",[createHash('sha256').update(content).digest('hex'),content,email])).rows[0];await c.query('COMMIT');return row;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

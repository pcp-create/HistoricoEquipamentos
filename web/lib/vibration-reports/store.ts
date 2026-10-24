import {searchPatterns} from "@/lib/filters";
import 'server-only';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {database} from '../db';
export class ReportInputError extends Error {}
export class ReportConflict extends Error {}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function reportId(value:unknown):string{if(typeof value!=='string'||!uuid.test(value))throw new ReportInputError('Identificador inválido.');return value;}
function text(value:unknown,max:number){if(typeof value!=='string'||value.length>max)throw new ReportInputError('Texto inválido ou muito longo.');return value;}
export function validateProject(raw:any){
 if(!raw||!Array.isArray(raw.equipments)||!raw.equipments.length||raw.equipments.length>100)throw new ReportInputError('Inclua de 1 a 100 equipamentos.');
 const images=new Set<string>();let points=0;
 const customer=raw.customer;
 if(!customer||!Number.isSafeInteger(customer.companyId)||customer.companyId<1||typeof customer.personId!=='string'||!/^\d{1,18}$/.test(customer.personId))throw new ReportInputError('Selecione um cliente cadastrado para vincular o relatório.');
 const document:any={version:3,customer:{companyId:customer.companyId,personId:customer.personId}};
 for(const key of ['title','serviceOrder','technician','collector','issued','general'])document[key]=text(raw[key]??'',key==='general'?30000:500);
 document.title=document.title.trim()||'Relatório Técnico de Análise de Vibrações';
 document.equipments=raw.equipments.map((e:any)=>{
  if(!e||!Array.isArray(e.components)||e.components.length>100)throw new ReportInputError('Componentes inválidos.');
  const result:any={id:typeof e.id==='string'?text(e.id,100):crypto.randomUUID(),selected:e.selected!==false};
  for(const key of ['client','machine','date','status','diagnosis','recommendation'])result[key]=text(e[key]??'',key==='diagnosis'||key==='recommendation'?30000:500);
  result.components=e.components.map((c:any)=>{
   if(!c||!Array.isArray(c.points)||c.points.length>1000)throw new ReportInputError('Pontos inválidos.');
   return {name:text(c.name,500),date:text(c.date??'',100),points:c.points.map((p:any)=>{
    if(++points>2000)throw new ReportInputError('Limite de 2.000 pontos por relatório.');
    const point:any={name:text(p.name,500),spectra:{}};
    for(const key of ['velocity','acceleration','peak']){const v=p[key];if(v!==''&&(typeof v!=='number'||!Number.isFinite(v)))throw new ReportInputError('Medição inválida.');point[key]=v;}
    for(const type of ['velocity','envelope','acceleration'])if(p.spectra?.[type]){
     const image=p.spectra[type],assetId=reportId(image.assetId);images.add(assetId);
     point.spectra[type]={assetId,name:text(image.name??'Espectro',500)};
    }
    return point;
   })};
  });return result;
 });
 return {document,images:[...images],clients:[...new Set(document.equipments.map((e:any)=>e.client))].join(' · ')};
}
async function write<T>(fn:(c:any)=>Promise<T>):Promise<T>{const c=await database().connect();try{await c.query('BEGIN READ WRITE');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function saveReport(body:any,email:string){
 const {document,images}=validateProject(body?.document);
 const id=body.id?reportId(body.id):null;
 if(id&&(!Number.isSafeInteger(body.version)||body.version<1))throw new ReportInputError('Versão inválida.');
 return write(async c=>{
  const customer=(await c.query("SELECT company_id,person_id::text,name,document,payload->>'municipioNome' city,payload->>'ufSigla' uf FROM m8_customer_directory WHERE company_id=$1 AND person_id=$2",[document.customer.companyId,document.customer.personId])).rows[0];
  if(!customer)throw new ReportInputError('Cliente não encontrado na base. Selecione outro cliente.');
  document.customer={companyId:customer.company_id,personId:customer.person_id,name:customer.name||'Cliente sem nome',document:customer.document||'',city:customer.city||'',uf:customer.uf||''};
  for(const equipment of document.equipments)equipment.client=document.customer.name;
  const clients=document.customer.name;
  if(images.length){const found=await c.query('SELECT id FROM web_vibration_report_images WHERE id=ANY($1::uuid[])',[images]);if(found.rows.length!==images.length)throw new ReportInputError('Um espectro não foi salvo. Anexe novamente.');}
  const values=[document.title,document.serviceOrder,clients,JSON.stringify(document),email,document.customer.companyId,document.customer.personId];
  const row=id?(await c.query('UPDATE web_vibration_reports SET title=$1,service_order=$2,clients=$3,document=$4,updated_by=$5,updated_at=now(),customer_company_id=$6,customer_person_id=$7,version=version+1 WHERE id=$8 AND version=$9 RETURNING id,version,updated_at,document->\'customer\' AS customer',[...values,id,body.version])).rows[0]
   :(await c.query('INSERT INTO web_vibration_reports(title,service_order,clients,document,created_by,updated_by,customer_company_id,customer_person_id) VALUES($1,$2,$3,$4,$5,$5,$6,$7) RETURNING id,version,updated_at,document->\'customer\' AS customer',values)).rows[0];
  if(!row)throw new ReportConflict('Este relatório foi alterado por outro usuário. Reabra a versão salva ou salve como novo.');
  await c.query('DELETE FROM web_vibration_report_image_links WHERE report_id=$1',[row.id]);
  for(const image of images)await c.query('INSERT INTO web_vibration_report_image_links(report_id,image_id) VALUES($1,$2)',[row.id,image]);
  return row;
 });
}
export async function saveImage(file:File,email:string){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3000000||file.size===0)throw new ReportInputError('Use PNG, JPEG ou WebP de até 3 MB.');
 const content=Buffer.from(await file.arrayBuffer());let metadata;
 try{metadata=await sharp(content,{limitInputPixels:40000000}).metadata();}catch{throw new ReportInputError('Imagem inválida.');}
 const contentType=({png:'image/png',jpeg:'image/jpeg',webp:'image/webp'} as Record<string,string>)[metadata.format||''];
 if(!contentType||!metadata.width||!metadata.height)throw new ReportInputError('Imagem inválida.');
 const digest=createHash('sha256').update(content).digest('hex');
 return write(async c=>(await c.query('INSERT INTO web_vibration_report_images(digest,content,content_type,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(digest) DO UPDATE SET digest=EXCLUDED.digest RETURNING id',[digest,content,contentType,email])).rows[0]);
}
export async function reportsList(search:string,offset:number){
 const rows=(await database().query(`SELECT id,title,service_order,clients,version,created_by,updated_by,updated_at FROM web_vibration_reports WHERE concat_ws(' ',title,clients,service_order) ILIKE ALL($1::text[]) ORDER BY updated_at DESC,id LIMIT 51 OFFSET $2`,[searchPatterns(search.slice(0,200)),offset])).rows;
 return {reports:rows.slice(0,50),hasMore:rows.length>50};
}
export async function reportDetail(id:string){return (await database().query('SELECT id,version,document,updated_at FROM web_vibration_reports WHERE id=$1',[reportId(id)])).rows[0];}
export async function reportImage(id:string){return (await database().query('SELECT content,content_type FROM web_vibration_report_images WHERE id=$1',[reportId(id)])).rows[0];}

export async function reportCustomers(search:string){
 const rows=(await database().query(`SELECT company_id,person_id::text,name,document,payload->>'municipioNome' city,payload->>'ufSigla' uf
 FROM m8_customer_directory WHERE company_id=1 AND concat_ws(' ',name,document,person_id::text,payload->>'municipioNome') ILIKE ALL($1::text[])
 ORDER BY name NULLS LAST,company_id,person_id LIMIT 51`,[searchPatterns(search.slice(0,200))])).rows;
 return {customers:rows.slice(0,50).map(r=>({companyId:r.company_id,personId:r.person_id,name:r.name||'Cliente sem nome',document:r.document||'',city:r.city||'',uf:r.uf||''})),hasMore:rows.length>50};
}

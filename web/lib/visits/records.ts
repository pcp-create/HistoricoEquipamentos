import {validDate,brazilToday} from "../equipment-management/planning";
import {customerEquipment} from "./customer-equipment";
import 'server-only';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {AdminInputError} from '../admin-store';
export async function saveVisitRecords(c:any,b:any,email:string,customers:any[]){
 const visit=(await c.query('SELECT * FROM web_sales_visits WHERE id=$1',[b.id])).rows[0];
 if(visit.status!=='completed')return;
 // A repeated historical submission must not duplicate photos or machine events.
 if((visit.machine_records?.length||visit.photos?.length))return;
 const records=b.machineRecords??[],photos=b.photos??[];
 if(!Array.isArray(records)||records.length>50||!Array.isArray(photos)||photos.length>6)throw new AdminInputError('Selecione até 50 máquinas e 6 fotos.');
 if(photos.reduce((sum:number,p:any)=>sum+(typeof p==='string'?p.length:0),0)>3500000)throw new AdminInputError('O conjunto de fotos excede o limite.');
 const equipment=await customerEquipment(c,visit.customer_key);
 const pending=records.some((r:any)=>typeof r?.equipment==='string'&&r.equipment.startsWith('pending:'))
  ? (await c.query('SELECT id::text,equipment_type,model FROM web_visit_machine_registrations WHERE customer_key=$1',[visit.customer_key])).rows : [];
 const seen=new Set();
 const normalized=records.map((r:any)=>{
  const registered=pending.find((m:any)=>`pending:${m.id}`===r?.equipment);
  const machine=registered?{name:`${registered.equipment_type} - ${registered.model}`} : equipment.find((e:any)=>e.id===r?.equipment);
  if(!machine||seen.has(r.equipment)||typeof r.note!=='string'||!r.note.trim()||r.note.length>5000)throw new AdminInputError('Confira as máquinas e preencha o registro de cada uma.');
  const hasMeter=r.meter!=null&&r.meter!=='';
  if(hasMeter && (typeof r.meter!=='string'||!/^\d+(?:[.,]\d{1,2})?$/.test(r.meter)||Number(r.meter.replace(',','.'))>1e9))throw new AdminInputError('Informe um horímetro válido.');
  if((hasMeter||r.meterDate)&&(!hasMeter||typeof r.meterDate!=='string'||!validDate(r.meterDate)||r.meterDate>brazilToday()))throw new AdminInputError('Informe o horímetro e uma data de coleta válida, até hoje.');
  seen.add(r.equipment);return {equipment:r.equipment,name:machine.name,note:r.note.trim(),...(hasMeter?{meter:Number(r.meter.replace(',','.')),meterDate:r.meterDate}:{})};
 });
 const ids:string[]=[];
 for(const photo of photos){
  if(typeof photo!=='string'||photo.length>1000000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo))throw new AdminInputError('Foto inválida ou muito grande.');
  let content:Buffer;
  try{content=await sharp(Buffer.from(photo.split(',')[1],'base64'),{limitInputPixels:25000000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toBuffer();}catch{throw new AdminInputError('Não foi possível ler uma das fotos.');}
  const id=randomUUID();await c.query('INSERT INTO web_visit_photos(id,visit_id,content) VALUES($1,$2,$3)',[id,b.id,content]);ids.push(id);
 }
 await c.query('UPDATE web_sales_visits SET machine_records=$2,photos=$3 WHERE id=$1',[b.id,JSON.stringify(normalized),JSON.stringify(ids)]);
 for(const r of normalized.filter(r=>!r.equipment.startsWith('pending:')))await c.query("INSERT INTO web_equipment_events(equipment_id,kind,document,created_by,display_name) VALUES($1,'visit',$2,$3,coalesce((SELECT display_name FROM web_user_access WHERE email=$3),$3))",[r.equipment,JSON.stringify({visitId:b.id,note:r.note,meter:r.meter,meterDate:r.meterDate,visitDate:visit.completed_at,photos:ids}),email]);
}

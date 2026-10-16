import {requireUser,Unauthorized} from '@/lib/auth';
import {database} from '@/lib/db';
export const runtime='nodejs';
export async function GET(req:Request){
 try{
  await requireUser();
  const params=new URL(req.url).searchParams;
  if(params.has('reading')){
    const id=params.get('reading')||'';
    if(!/^\d{1,18}$/.test(id))return Response.json({error:'Equipamento inválido.'},{status:400});
    const row=(await database().query('SELECT document FROM web_equipment_settings WHERE equipment_id=$1',[id])).rows[0];
    return Response.json({meter:row?.document?.meter??null,meterDate:row?.document?.meterDate||null},{headers:{'Cache-Control':'private, no-store'}});
  }
  const schedule=params.get('schedule')||'';
  if(!/^\d{1,18}$/.test(schedule))return Response.json({error:'Programação inválida.'},{status:400});
  const q=(params.get('q')||'').trim().slice(0,100);
  const all=params.get('scope')==='all';
  const offset=Math.max(0,Math.min(100000,Number(params.get('offset'))||0));
  const rows=(await database().query(`SELECT e.equipment_id::text,e.name,e.serial FROM m8_equipment_catalog e
    WHERE e.present AND ($2='' OR e.equipment_id::text ILIKE $3 OR e.name ILIKE $3 OR e.serial ILIKE $3)
    AND ($4::boolean OR EXISTS(SELECT 1 FROM m8_person_equipment l
      JOIN web_service_schedules s ON s.id=$1
      JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id
      WHERE l.equipment_id=e.equipment_id AND l.person_id=o.cliente_id AND l.present))
    ORDER BY e.name,e.equipment_id LIMIT 51 OFFSET $5`,[schedule,q,'%'+q+'%',all,Math.floor(offset)])).rows;
  return Response.json({rows:rows.slice(0,50),hasMore:rows.length>50},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return Response.json({error:'Não foi possível buscar equipamentos.'},{status:e instanceof Unauthorized?401:503});}
}

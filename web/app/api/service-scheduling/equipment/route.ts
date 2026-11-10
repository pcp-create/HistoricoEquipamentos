import {approvedMaterialSql} from "@/lib/material-approval";
import {searchPatterns} from "@/lib/filters";
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
  const rows=(await database().query(`WITH customer AS (
      SELECT o.cliente_id FROM web_service_schedules s
      JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id WHERE s.id=$1
    ), choices AS (
      SELECT e.equipment_id::text,e.name,e.serial,
        CASE WHEN EXISTS(SELECT 1 FROM m8_person_equipment l,customer c
          WHERE l.equipment_id=e.equipment_id AND l.person_id=c.cliente_id AND l.present) THEN 'client'
        WHEN EXISTS(SELECT 1 FROM m8_os_produtos p
          JOIN m8_ordens_servico rental ON rental.company_id=p.company_id AND rental.id_m8=p.ordem_servico_id
          JOIN customer c ON c.cliente_id=rental.cliente_id
          WHERE p.produto_id=e.equipment_id AND rental.company_id IN(1,2,27404)
          AND rental.status='Pendente' AND rental.tipo_id=8
          AND p.esta_excluido IS NOT TRUE AND ${approvedMaterialSql("p")}) THEN 'rental'
        ELSE 'other' END AS origin
      FROM m8_equipment_catalog e
      WHERE e.present AND ($2='' OR concat_ws(' ',e.equipment_id,e.name,e.serial) ILIKE ALL($3::text[]))
    ) SELECT * FROM choices WHERE $4::boolean OR origin<>'other'
    ORDER BY CASE origin WHEN 'client' THEN 0 WHEN 'rental' THEN 1 ELSE 2 END,name,equipment_id
    LIMIT 51 OFFSET $5`,[schedule,q,searchPatterns(q),all,Math.floor(offset)])).rows;
  return Response.json({rows:rows.slice(0,50),hasMore:rows.length>50},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return Response.json({error:'Não foi possível buscar equipamentos.'},{status:e instanceof Unauthorized?401:503});}
}

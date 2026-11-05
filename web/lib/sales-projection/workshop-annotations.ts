import 'server-only';
import {database} from '../db';
import {hasPartsShortage,effectiveStage,stages} from '../workshop/model';
import type {Detail} from './model';
export async function attachWorkshopAnnotations(sales:Detail[]){
 if(!sales.length)return;const db=database();
  const workshopOrders = await db.query<{
    company: string; id: string; visit: string; workshop: string; stage: string;
    source: {sheet?: string;entryKind?:string;componentName?:string}; flows: {status_lancamento_nome: string}[];
  }>(`
    SELECT k.company_id::text company,k.order_id::text id,
      v.id::text visit,w.name workshop,v.stage,v.source,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('status_lancamento_nome',related.status_lancamento_nome))
        FROM m8_ordens_servico related
        WHERE related.status IN('Pendente','Aprovado') AND (
          related.produto_equipamento_id=v.equipment_id OR EXISTS (
            SELECT 1 FROM m8_order_equipment_links el WHERE el.company_id=related.company_id
              AND el.order_id=related.id_m8 AND el.equipment_id=v.equipment_id AND NOT el.stale
          )
        )), '[]'::jsonb) flows
    FROM jsonb_to_recordset($1::jsonb) k(company_id bigint,order_id bigint)
    JOIN m8_ordens_servico o ON o.company_id=k.company_id AND o.id_m8=k.order_id
    JOIN web_workshop_visits v ON v.exited_at IS NULL AND v.reconciled_out_at IS NULL AND (
      v.equipment_id=o.produto_equipamento_id OR EXISTS (
        SELECT 1 FROM m8_order_equipment_links l WHERE l.company_id=o.company_id
          AND l.order_id=o.id_m8 AND l.equipment_id=v.equipment_id AND NOT l.stale
      )
    )
    LEFT JOIN web_workshops w ON w.id=v.workshop_id
    ORDER BY k.company_id,k.order_id,v.entered_at DESC,v.id
  `, [JSON.stringify(sales.map(detail => ({
    company_id: Number(detail.fields?.sourceCompany || detail.company), order_id: detail.id,
  })))]);

 const grouped=new Map<string,typeof workshopOrders.rows>();
 for(const row of workshopOrders.rows){const key=`${row.company}:${row.id}`;const group=grouped.get(key)||[];group.push(row);grouped.set(key,group);}
 for(const detail of sales){
  delete detail.workshop;
  const visits=grouped.get(`${detail.fields?.sourceCompany||detail.company}:${detail.id}`)||[];
  const machine=visits.find(v=>v.source?.entryKind!=='component');
  detail.workshopComponents=visits.filter(v=>v.source?.entryKind==='component').map(v=>({visit:v.visit,name:v.source.componentName||'Componente',workshop:v.workshop||'Oficina não informada'}));
  if(detail.fields)detail.fields.inWorkshop=machine?'Sim':detail.workshopComponents.length?'Somente componente':'Não';
  if(machine){const stage=effectiveStage(machine.stage,machine.flows,machine.source),option=stages.find(s=>s.id===stage);detail.workshop={visit:machine.visit,name:machine.workshop,stage,label:option?.label||stage,color:option?.color||'#547c99',partsPending:hasPartsShortage(machine.flows)};}
 }
}

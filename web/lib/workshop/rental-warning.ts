import 'server-only';
import {database} from '../db';
import {approvedMaterialSql} from '../material-approval';
export async function workshopRentalWarning(visitId:string) {
 if(!/^[0-9a-f-]{36}$/i.test(visitId))return {orders:[]};
 const orders=(await database().query(`SELECT DISTINCT o.id_m8::text id,o.company_id company,
 COALESCE(o.numero_sequencia,o.id_m8)::text number,o.cliente_nome customer
 FROM web_workshop_visits v
 JOIN m8_os_produtos p ON p.produto_id=v.equipment_id
 JOIN m8_ordens_servico o ON o.company_id=p.company_id AND o.id_m8=p.ordem_servico_id
 WHERE v.id=$1 AND COALESCE(v.source->>'entryKind','equipment')='equipment'
 AND v.exited_at IS NULL AND v.reconciled_out_at IS NULL
 AND p.esta_excluido IS NOT TRUE AND ${approvedMaterialSql('p')}
 AND o.company_id IN(1,2,27404) AND o.tipo_id::text='8' AND o.status='Pendente'
 ORDER BY company,id`,[visitId])).rows;
 return {orders};
}

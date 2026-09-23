import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { database } from '../lib/db';
const dir = resolve(process.env.PREVENTIVE_RESEARCH_DIR || '../.m8/preventive-research');
await mkdir(dir, { recursive: true, mode: 0o700 });
try {
  const equipment = (await database().query(`SELECT equipment_id::text AS id,name,serial,model FROM m8_equipment_catalog WHERE present ORDER BY equipment_id`)).rows;
  const orders = (await database().query(`SELECT o.id_m8::text AS id,o.company_id,o.numero_sequencia::text AS number,
    o.produto_equipamento_id::text AS equipment_id,o.status,o.tipo_atendimento_nome,o.observacao,
    o.emissao,o.data_abertura,o.data_entrega,s.finalized,s.pending,
    COALESCE((SELECT jsonb_agg(l.equipment_id::text) FROM m8_equipment_linked l WHERE l.company_id=o.company_id AND l.order_id=o.id_m8),'[]') AS linked
    FROM m8_ordens_servico o LEFT JOIN integracao_m8_os_sync s ON s.company_id=o.company_id AND s.ordem_servico_id=o.id_m8
    WHERE o.company_id IN (1,2,27404)`)).rows;
  for (const [name, data] of [['m8-equipment', equipment], ['m8-orders', orders]] as const)
    await writeFile(resolve(dir, name + '.json'), JSON.stringify(data), { mode: 0o600 });
  console.log(JSON.stringify({ equipment: equipment.length, orders: orders.length, directory: dir }));
} finally { await database().end(); }

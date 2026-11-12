import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {quoteHistory} from '../lib/quotes/suggestions';
test('CRM quotation history scopes client/equipment, supports client-only fallback and omits rejected or incomplete materials',async()=>{
 const db=new PGlite();
 try {
 await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
 for(const file of readdirSync(new URL('../../supabase/migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())await db.exec(readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.exec(`INSERT INTO m8_ordens_servico(company_id,id_m8,cliente_id,produto_equipamento_id,status,emissao,payload) VALUES
 (1,1,10,100,'Processado','2026-01-01','{}'),(2,2,10,200,'Processado','2026-02-01','{}'),(1,3,11,100,'Processado','2026-03-01','{}'),(1,4,10,100,'Pendente','2026-04-01','{}');
 INSERT INTO integracao_m8_os_sync(company_id,ordem_servico_id,inventory_seen_at,finalized,pending,last_detail_at) SELECT company_id,id_m8,now(),true,false,now() FROM m8_ordens_servico;
 INSERT INTO m8_os_produtos(company_id,id_m8,ordem_servico_id,produto_id,produto_nome,unidade_nome,quantidade,valor_total,esta_excluido,aprovado,payload) VALUES
 (1,1,1,50,'Filtro máquina 100','UN',2,40,false,'Sim','{}'),(2,2,2,60,'Peça máquina 200','UN',1,30,false,'Sim','{}'),(1,3,3,70,'Outro cliente','UN',1,50,false,'Sim','{}'),(1,4,4,80,'Não processado','UN',1,50,false,'Sim','{}'),(1,5,1,90,'Reprovado','UN',1,10,false,'Nao','{}'),(1,6,1,91,'Excluído','UN',1,10,true,'Sim','{}');
 INSERT INTO m8_os_servicos(company_id,id_m8,ordem_servico_id,servico_id,servico_nome,quantidade,valor_total,payload) VALUES(1,1,1,10,'Revisão',2,100,'{}');`);
 const exact=await quoteHistory(new URLSearchParams('clientId=10&equipmentId=100&historyScope=customer'),db as any);
 assert.deepEqual([...exact.items.values()].map(i=>i.code).sort(),['10','50']);
 assert.equal(exact.histories['p:1:50:UN'].rows[0].order,'1');
 const client=await quoteHistory(new URLSearchParams('clientId=10&historyScope=customer'),db as any);
 assert.deepEqual([...client.items.values()].map(i=>i.code).sort(),['10','50','60']);
 assert.equal((await quoteHistory(new URLSearchParams('clientId=10'),db as any)).items.size,0);
 }finally{await db.close();}
});

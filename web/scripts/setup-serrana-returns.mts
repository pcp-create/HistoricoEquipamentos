import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {database} from '../lib/db';
const name='025_serrana_sales_returns.sql';
const sql=await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
const checksum=createHash('sha256').update(sql).digest('hex');
const db=database(),client=await db.connect();
try {
 await client.query('BEGIN READ WRITE');
 await client.query('SET LOCAL lock_timeout=\'10s\'');
 await client.query('SELECT pg_advisory_xact_lock(81008,0)');
 const applied=(await client.query('SELECT checksum FROM integracao_m8_migrations WHERE name=$1',[name])).rows[0];
 if(applied&&applied.checksum!==checksum)throw new Error('Migration aplicada possui checksum diferente.');
 if(!applied){
  await client.query(sql);
  await client.query('INSERT INTO integracao_m8_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);
 }
 await client.query('COMMIT');
 console.log(applied?'Migration já aplicada.':'Migration aplicada: '+name);
 console.log('Devoluções de outubro / empresa 2:',(await client.query(`SELECT count(*) quantidade,sum("totalGeral") total FROM public."fDevolucoesOutros" WHERE company_id=2 AND emissao>='2026-10-01' AND emissao<'2026-11-01'`)).rows[0]);
} catch(error){await client.query('ROLLBACK');throw error;} finally {client.release();await db.end();}

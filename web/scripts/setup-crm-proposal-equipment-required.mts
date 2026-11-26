import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {database} from '../lib/db';

const db=database(),client=await db.connect();
try{
 await client.query('BEGIN READ WRITE');
 await client.query('SELECT pg_advisory_xact_lock(81018,128)');
 const name='128_crm_proposal_equipment_required.sql',sql=readFileSync(new URL('../sql/'+name,import.meta.url),'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
 const previous=(await client.query('SELECT checksum FROM web_history_migrations WHERE name=$1',[name])).rows[0];
 if(previous&&previous.checksum!==checksum)throw Error('Migration existente diverge.');
 if(!previous){await client.query(sql.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));await client.query('INSERT INTO web_history_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);}
 await client.query('COMMIT');console.log('Obrigatoriedade de equipamento em propostas preparada.');
}catch(error){await client.query('ROLLBACK');console.error('Não foi possível preparar a obrigatoriedade de equipamento em propostas.',error instanceof Error?error.message:'');process.exitCode=1;}
finally{client.release();await db.end();}

import {readFileSync} from 'node:fs';
import {database} from '../lib/db';
const db=database(),c=await db.connect();
try{
 await c.query('BEGIN READ WRITE');
 await c.query(readFileSync(new URL('../sql/100_task_attachment_limit.sql',import.meta.url),'utf8'));
 await c.query('COMMIT');
 console.log('Limite de anexos de tarefas atualizado para 5 MB.');
}catch(error){await c.query('ROLLBACK');throw error;}
finally{c.release();await db.end();}

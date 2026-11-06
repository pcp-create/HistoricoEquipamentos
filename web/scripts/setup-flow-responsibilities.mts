import {readFileSync} from 'node:fs';
import {database} from '../lib/db';
const db=database(),c=await db.connect();
try{
 await c.query('BEGIN READ WRITE');
 await c.query(readFileSync(new URL('../sql/101_flow_responsibilities.sql',import.meta.url),'utf8'));
 await c.query('COMMIT');
 console.log('Responsáveis por Status Fluxo e tratativas configurados.');
}catch(error){await c.query('ROLLBACK');throw error;}
finally{c.release();await db.end();}

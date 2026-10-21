import {readFileSync} from 'node:fs';
import {database} from '../lib/db';
const db=database(),c=await db.connect();
try{
 for(const name of ['056_vibration_reports','057_vibration_report_customer']){
 const sql=readFileSync(new URL('../sql/'+name+'.sql',import.meta.url),'utf8').replace(/^BEGIN;/,'BEGIN READ WRITE;');
 await c.query(sql);
 }
 console.log('Estrutura de relatórios de vibração criada/verificada.');
}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();await db.end();}

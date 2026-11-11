import {readFileSync} from 'node:fs';
import {database} from '../lib/db';
const db=database(),c=await db.connect();
try{await c.query(readFileSync(new URL('../sql/107_order_type_equipment_requirement.sql',import.meta.url),'utf8').replace('BEGIN;','BEGIN READ WRITE;'));console.log('Configuração de equipamento obrigatório criada/verificada.');}
catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await db.end();}

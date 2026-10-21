import {readFileSync} from 'node:fs';
import {database} from '../lib/db';
const db=database(),c=await db.connect();
try {
 await c.query(readFileSync(new URL('../sql/058_field_session_teams.sql',import.meta.url),'utf8').replace('BEGIN;','BEGIN READ WRITE;'));
 console.log('Estrutura de apontamentos em equipe criada/verificada.');
} catch(error){await c.query('ROLLBACK');throw error;} finally {c.release();await db.end();}

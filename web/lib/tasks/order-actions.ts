import 'server-only';
import {database} from '../db';
import {Forbidden} from '../auth';
import {TaskInputError} from './store';
export function orderActionName(value:unknown){
 if(typeof value!=='string'||!value.trim()||value.trim().length>80)throw new TaskInputError('Informe a ação da tarefa (até 80 caracteres).');
 return value.trim().replace(/\s+/g,' ');
}
export async function orderTaskActions(){return (await database().query('SELECT id::text,name FROM web_order_task_actions WHERE active ORDER BY name,id')).rows;}
export async function addOrderTaskAction(value:unknown,email:string){
 const name=orderActionName(value),c=await database().connect();
 try{
 await c.query('BEGIN READ WRITE');
 if(!(await c.query('SELECT enabled FROM web_user_access WHERE email=$1',[email])).rows[0]?.enabled)throw new Forbidden();
 await c.query('SELECT pg_advisory_xact_lock(728002)');
 let row=(await c.query('SELECT id::text,name,active FROM web_order_task_actions WHERE lower(trim(name))=lower($1)',[name])).rows[0];
 if(row&&!row.active)throw new TaskInputError('Esta ação está inativa. Selecione outra ação.');
 if(!row)row=(await c.query('INSERT INTO web_order_task_actions(name,created_by) VALUES($1,$2) RETURNING id::text,name',[name,email])).rows[0];
 await c.query('COMMIT');return {action:{id:row.id,name:row.name}};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function selectedOrderTaskAction(c:any,id:unknown){
 if(id===undefined||id===null||id==='')return null; // Existing clients/tasks without an action remain compatible.
 if(!/^[1-9]\d{0,17}$/.test(String(id)))throw new TaskInputError('Selecione uma ação da tarefa válida.');
 const row=(await c.query('SELECT id::text,name FROM web_order_task_actions WHERE id=$1 AND active FOR SHARE',[id])).rows[0];
 if(!row)throw new TaskInputError('A ação da tarefa não está disponível. Atualize a lista.');return row;
}

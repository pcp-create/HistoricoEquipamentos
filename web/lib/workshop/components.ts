import 'server-only';
import {Forbidden} from '../auth';
export class WorkshopComponentError extends Error{}
export async function componentTypes(db:any){
 if(!(await db.query("SELECT to_regclass('public.web_workshop_component_types') IS NOT NULL available")).rows[0]?.available)return [];
 return (await db.query('SELECT id::text,name,active,version FROM web_workshop_component_types WHERE active ORDER BY name,id')).rows;
}
export async function mutateComponentType(c:any,b:any,email:string){
 const access=(await c.query('SELECT enabled,role FROM web_user_access WHERE email=$1 FOR SHARE',[email])).rows[0];
 if(!access?.enabled)throw new Forbidden();
 const action=b.action;
 if(action!=='component_add'&&access.role!=='admin')throw new Forbidden();
 const name=typeof b.name==='string'?b.name.trim().replace(/\s+/g,' '):'';
 if(action!=='component_delete'&&(!name||name.length>160))throw new WorkshopComponentError('Informe o nome do componente (até 160 caracteres).');
 let row;
 if(action==='component_add')row=(await c.query(`INSERT INTO web_workshop_component_types(name,created_by,updated_by) VALUES($1,$2,$2) ON CONFLICT(lower(trim(name))) WHERE active DO NOTHING RETURNING *`,[name,email])).rows[0]||(await c.query('SELECT * FROM web_workshop_component_types WHERE active AND lower(trim(name))=lower($1)',[name])).rows[0];
 else{
  if(!/^[1-9]\d*$/.test(String(b.componentId))||!Number.isSafeInteger(b.version))throw new WorkshopComponentError('Componente inválido.');
  row=(await c.query('SELECT * FROM web_workshop_component_types WHERE id=$1 AND active FOR UPDATE',[b.componentId])).rows[0];
  if(!row||row.version!==b.version)throw new WorkshopComponentError('Este componente mudou. Atualize a lista.');
  if(action==='component_delete')await c.query('UPDATE web_workshop_component_types SET active=false,version=version+1,updated_by=$2,updated_at=now() WHERE id=$1',[row.id,email]);
  else if(action==='component_update')await c.query('UPDATE web_workshop_component_types SET name=$2,version=version+1,updated_by=$3,updated_at=now() WHERE id=$1',[row.id,name,email]);
  else throw new WorkshopComponentError('Ação inválida.');
 }
 // Historical entry names remain immutable, even after catalogue edits/removal.
 await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('workshop_component_catalog',$1,$1,$2)",[email,JSON.stringify({action,id:row.id,name,previous:row})]);
 return {saved:true as const,component:{id:String(row.id),name:action==='component_add'?row.name:name}};
}

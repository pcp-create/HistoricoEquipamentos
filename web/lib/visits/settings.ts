import "server-only";
import { database } from "../db";
import { visitIdentity } from "./store";
import { AdminInputError } from "../admin-store";
export async function visitSettings(email:string) {
  const db=database(); await visitIdentity(db,email);
  return (await db.query("SELECT id::text,name,description,active,version FROM web_sales_visit_purposes ORDER BY id")).rows;
}
export async function saveVisitPurpose(body:any,email:string) {
  const items=Array.isArray(body?.purposes)?body.purposes:[body];
  if(!items.length || items.length>200) throw new AdminInputError('Informe até 200 finalidades por vez.');
  for(const body of items){
  const name=typeof body?.name==='string'?body.name.trim():'';
  if(!name || name.length>120 || typeof body.description!=='string' || body.description.length>2000 || typeof body.active!=='boolean' || (body.id && (!/^\d+$/.test(body.id) || !Number.isInteger(body.version)))) throw new AdminInputError('Preencha nome e descrição válidos.');
  }
  const c=await database().connect();
  try {
    await c.query('BEGIN READ WRITE'); await visitIdentity(c,email);
    for(const body of items){
    const name=body.name.trim();
    const before=body.id?(await c.query('SELECT * FROM web_sales_visit_purposes WHERE id=$1 FOR UPDATE',[body.id])).rows[0]:null;
    if(body.id && (!before || before.version!==body.version)) throw new AdminInputError('Registro alterado. Atualize a página antes de salvar.');
    const result=body.id?await c.query('UPDATE web_sales_visit_purposes SET name=$2,description=$3,active=$4,version=version+1 WHERE id=$1 RETURNING id',[body.id,name,body.description.trim(),body.active]):await c.query('INSERT INTO web_sales_visit_purposes(name,description,active) VALUES($1,$2,$3) RETURNING id',[name,body.description.trim(),body.active]);
    await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('sales_visit_purpose',$1,$1,$2)",[email,JSON.stringify({before,after:{...body,name,id:result.rows[0].id}})]);
    }
    await c.query('COMMIT');
  } catch(e:any){await c.query('ROLLBACK');if(e.code==='23505')throw new AdminInputError('Já existe uma finalidade com esse nome.');throw e;} finally{c.release();}
}

import 'server-only';
import {database} from '../db';
import {Forbidden} from '../auth';
import {OrderInputError} from './model';
function target(company:unknown,order:unknown){
 if(!['1','2','27404'].includes(String(company))||!/^[1-9]\d{0,17}$/.test(String(order)))throw new OrderInputError('OS inválida.');
}
const event='service_order_comment_added';
export async function orderComments(company:string,order:string,before?:string|null){
 target(company,order);if(before&&!/^[1-9]\d{0,18}$/.test(before))throw new OrderInputError('Página inválida.');
 const result=await database().query(`SELECT a.id::text,a.created_at AS at,a.actor,a.details->>'comment' AS comment,COALESCE(NULLIF(a.details->>'authorName',''),NULLIF(u.display_name,''),a.actor) author FROM web_access_events a LEFT JOIN web_user_access u ON u.email=a.actor WHERE a.event=$1 AND a.details->>'company'=$2 AND a.details->>'order'=$3 AND ($4::bigint IS NULL OR a.id<$4::bigint) ORDER BY a.id DESC LIMIT 51`,[event,company,order,before||null]);
 const total=await commentTotal(database(),company,order);
 return {rows:result.rows.slice(0,50),hasMore:result.rows.length>50,total};
}
/** The comment is itself an immutable OS audit event, committed only once per request. */
export async function addOrderComment(input:any,email:string){
 target(input?.company,input?.order);
 if(typeof input.comment!=='string'||!input.comment.trim()||input.comment.length>8000)throw new OrderInputError('Escreva um comentário de até 8.000 caracteres.');
 if(typeof input.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId))throw new OrderInputError('Identificador inválido.');
 const company=String(input.company),order=String(input.order),comment=input.comment.trim(),c=await database().connect();
 try{
  await c.query('BEGIN READ WRITE');
  const user=(await c.query('SELECT display_name FROM web_user_access WHERE email=$1 AND enabled',[email])).rows[0];if(!user)throw new Forbidden();
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[event+':'+email+':'+input.requestId]);
  const existing=(await c.query('SELECT id::text,details FROM web_access_events WHERE event=$1 AND actor=$2 AND details->>\'requestId\'=$3',[event,email,input.requestId])).rows[0];
  if(existing){
   if(existing.details.company!==company||existing.details.order!==order||existing.details.comment!==comment)throw new OrderInputError('Este envio já foi usado para outro comentário. Atualize os comentários antes de tentar novamente.');
   const total=await commentTotal(c,company,order);await c.query('COMMIT');return {id:existing.id,total};
  }
  if(!(await c.query('SELECT 1 FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2',[company,order])).rows.length)throw new OrderInputError('OS não encontrada.');
  const result=await c.query('INSERT INTO web_access_events(event,email,actor,details) VALUES($1,$2,$2,$3) RETURNING id::text',[event,email,JSON.stringify({company,order,comment,authorName:user.display_name||email,requestId:input.requestId})]);
  const total=await commentTotal(c,company,order);await c.query('COMMIT');return {id:result.rows[0].id,total};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

async function commentTotal(db:{query:Function},company:string,order:string){return Number((await db.query(`SELECT count(*) AS total FROM web_access_events WHERE event=$1 AND details->>'company'=$2 AND details->>'order'=$3`,[event,company,order])).rows[0].total);}
export async function attachOrderCommentCounts(rows:import('../sales-projection/model').Detail[]){
 if(!rows.length)return;
 const keys=rows.map(row=>({company:String(row.fields?.sourceCompany||row.company),order:String(row.id)}));
 const result=await database().query(`SELECT a.details->>'company' company,a.details->>'order' AS "order",count(*) total FROM web_access_events a JOIN (SELECT DISTINCT company,"order" FROM jsonb_to_recordset($2::jsonb) AS x(company text,"order" text)) k ON a.details->>'company'=k.company AND a.details->>'order'=k."order" WHERE a.event=$1 GROUP BY 1,2`,[event,JSON.stringify(keys)]);
 const counts=new Map(result.rows.map(row=>[`${row.company}:${row.order}`,Number(row.total)]));
 for(const row of rows)row.commentCount=counts.get(`${row.fields?.sourceCompany||row.company}:${row.id}`)||0;
}

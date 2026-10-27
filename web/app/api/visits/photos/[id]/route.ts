import {requireUser} from '@/lib/auth';
import {database} from '@/lib/db';
import {contactAccess} from '@/lib/visits/contacts';
export async function GET(_r:Request,{params}:{params:Promise<{id:string}>}){
 try{
 const user=await requireUser(),{id}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(id))return new Response(null,{status:404});
 const row=(await database().query('SELECT p.content,v.customer_key FROM web_visit_photos p JOIN web_sales_visits v ON v.id=p.visit_id WHERE p.id=$1',[id])).rows[0];
 if(!row)return new Response(null,{status:404});
 await contactAccess(database(),row.customer_key,user.email);
 return new Response(new Uint8Array(row.content),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response(null,{status:403});}
}

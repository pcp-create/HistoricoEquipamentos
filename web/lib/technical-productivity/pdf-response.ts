import 'server-only';
import {Forbidden} from '../auth';
import {validMonth} from './model';
import {technicalProductivity} from './store';
import {productivityPdf} from './pdf';
export async function productivityPdfResponse(request:Request,personalEmail?:string){
 const params=new URL(request.url).searchParams,month=params.get('month')||'';
 if(!validMonth(month))return Response.json({error:'Mês inválido.'},{status:400});
 const selected=params.get('technician')||'';
 if(personalEmail&&selected&&selected!==personalEmail)throw new Forbidden();
 const data=await technicalProductivity(month,personalEmail);
 if(!personalEmail&&selected){data.users=data.users.filter(user=>user.email===selected);if(!data.users.length)return Response.json({error:'Técnico não encontrado.'},{status:404});}
 const bytes=await productivityPdf(data);
 return new Response(Buffer.from(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="apontamentos-${month}.pdf"`,'Cache-Control':'private, no-store'}});
}

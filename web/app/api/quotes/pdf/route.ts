import {requireUser,Unauthorized} from '@/lib/auth';
import {quoteProducts} from '@/lib/quotes/products';
import {getQuote} from '@/lib/quotes/store';
import {quotePdf} from '@/lib/quotes/pdf';
import {QuoteValidation} from '@/lib/quotes/types';
import {database} from '@/lib/db';
import {logDataError} from '@/lib/data-error';
export const runtime='nodejs';
export async function GET(request:Request){
 try{await requireUser();const q=await getQuote(new URL(request.url).searchParams.get('id')||'');if(!q)return Response.json({error:'Orçamento não encontrado.'},{status:404});
 const customer=q.clientId?(await database().query("SELECT document,payload->>'municipioNome' city,payload->>'ufSigla' state FROM m8_customer_directory WHERE company_id=$1 AND person_id=$2",[q.company,q.clientId])).rows[0]:{};
 const bytes=await quotePdf({...q,items:await quoteProducts(q.items)},customer||{});return new Response(Buffer.from(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="orcamento-${q.number}.pdf"`,'Cache-Control':'private, no-store'}});
 }catch(e){if(e instanceof Unauthorized)return Response.json({error:'Sessão expirada.'},{status:401});if(e instanceof QuoteValidation)return Response.json({error:e.message},{status:400});logDataError('quote-pdf',e);return Response.json({error:'Não foi possível gerar o PDF.'},{status:503});}
}

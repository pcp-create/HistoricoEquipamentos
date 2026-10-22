import {requireUser,sameOrigin,Unauthorized} from "@/lib/auth";
import {listQuoteTypes,refreshQuoteTypes} from "@/lib/quote-type-catalog";
export const runtime="nodejs";
export const maxDuration=60;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
function failure(e:unknown){return json({error:e instanceof Unauthorized?"Sessão expirada.":"Não foi possível consultar ou atualizar o cadastro. Tente novamente."},e instanceof Unauthorized?401:503);}
export async function GET(){try{await requireUser();return json(await listQuoteTypes());}catch(e){return failure(e);}}
export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:"Origem inválida."},403);
 try{const user=await requireUser();const count=await refreshQuoteTypes(user.email);return json({...await listQuoteTypes(),count});}catch(e){return failure(e);}
}

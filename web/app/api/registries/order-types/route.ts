import {OrderInputError} from "@/lib/service-orders/model";
import {requireUser,sameOrigin,Unauthorized,Forbidden} from "@/lib/auth";
import {listOrderTypes,refreshOrderTypes,updateEquipmentRequirement} from "@/lib/order-type-catalog";
export const runtime="nodejs";
export const maxDuration=60;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
function failure(e:unknown){return json({error:e instanceof OrderInputError?e.message:e instanceof Forbidden?"Acesso não permitido.":e instanceof Unauthorized?"Sessão expirada.":"Não foi possível consultar ou atualizar o cadastro. Tente novamente."},e instanceof OrderInputError?400:e instanceof Forbidden?403:e instanceof Unauthorized?401:503);}
export async function GET(){try{await requireUser();return json(await listOrderTypes());}catch(e){return failure(e);}}
export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:"Origem inválida."},403);
 try{const user=await requireUser();const count=await refreshOrderTypes(user.email);return json({...await listOrderTypes(),count});}catch(e){return failure(e);}
}

export async function PATCH(req:Request){
 if(!sameOrigin(req))return json({error:'Origem inválida.'},403);
 try{const user=await requireUser();const body=await req.json();return json(await updateEquipmentRequirement(body.id,body.equipment_required,user.email));}catch(e){return failure(e);}
}

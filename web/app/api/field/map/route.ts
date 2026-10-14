import { requireModule, sameOrigin, Forbidden, Unauthorized } from '@/lib/auth';
import { fieldMapData, saveFieldLocation } from '@/lib/service-scheduling/field-map';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
function fail(e:unknown) { return json({error:e instanceof Forbidden?'Acesso ao mapa não permitido.':e instanceof Unauthorized?'Entre novamente para continuar.':'Não foi possível acessar o mapa.'},e instanceof Forbidden?403:e instanceof Unauthorized?401:503); }
export async function GET(){try {const u=await requireModule("tecnico");return json(await fieldMapData(u.email));}catch(e){return fail(e)}}
export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Origem inválida.'},403);
 try {const u=await requireModule("tecnico");const raw=await req.text();if(raw.length>2000)return json({error:'Dados excedem o limite.'},413);
 let body;try{body=JSON.parse(raw)}catch{return json({error:'Dados inválidos.'},400)}
 await saveFieldLocation(u.email,body);return json({saved:true});}catch(e){return fail(e)}
}

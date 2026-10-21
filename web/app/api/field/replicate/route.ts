import {requireUser,sameOrigin,Forbidden,Unauthorized} from "@/lib/auth";
import {replicateTimeLog,TeamSessionError} from "@/lib/service-scheduling/team-sessions";
export const runtime="nodejs";
export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:"Origem inválida."},{status:403});
 try{
  const user=await requireUser();
  const raw=await req.text();
  if(raw.length>10000)return Response.json({error:"Dados excedem o limite."},{status:413});
  let body;try{body=JSON.parse(raw);}catch{return Response.json({error:"Dados inválidos."},{status:400});}
  return Response.json(await replicateTimeLog(body,user.email),{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return Response.json({error:error instanceof TeamSessionError?error.message:error instanceof Forbidden?"Sem permissão para replicar este apontamento.":error instanceof Unauthorized?"Sessão expirada.":"Não foi possível replicar o apontamento."},{status:error instanceof Unauthorized?401:error instanceof Forbidden?403:error instanceof TeamSessionError?400:503});}
}

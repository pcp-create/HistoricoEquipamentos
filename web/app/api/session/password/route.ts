import { requireUser, clearSession, sameOrigin, Unauthorized, Forbidden } from "@/lib/auth";
import { changeOwnPassword, PasswordInputError } from "@/lib/password-change";
export const runtime="nodejs";
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req:Request) {
  if(!sameOrigin(req))return json({error:"Origem inválida."},403);
  try {
    const user=await requireUser({allowPasswordChange:true});
    const raw=await req.text();
    if(raw.length>2000)return json({error:"Dados excedem o limite."},413);
    let body;try{body=JSON.parse(raw);}catch{return json({error:"Dados inválidos."},400);}
    await changeOwnPassword(body,user);
    await clearSession();
    return json({saved:true});
  } catch(e) {
    return json({error:e instanceof PasswordInputError?e.message:e instanceof Unauthorized?"Entre novamente para alterar a senha.":e instanceof Forbidden?"Acesso não permitido.":"Não foi possível alterar a senha. Tente novamente."},e instanceof Unauthorized?401:e instanceof Forbidden?403:e instanceof PasswordInputError?400:503);
  }
}

import {reviewWritingPrompt} from '@/lib/service-scheduling/review-writing-prompt';
import {requireUser,sameOrigin,Unauthorized,Forbidden} from '@/lib/auth';
import {database} from '@/lib/db';
import {writingFields,validateWritingSuggestions} from '@/lib/service-scheduling/review-writing';
export const runtime='nodejs';
export const maxDuration=60;
const json=(value:any,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const running=new Set<string>();
export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Origem inválida.'},403);
 let owner:string|undefined;
 try{
  const user=await requireUser();
  const raw=await req.text();
  if(raw.length>80000)return json({error:'Relatório muito extenso para revisão de texto.'},413);
  let body:any;try{body=JSON.parse(raw);}catch{return json({error:'Solicitação inválida.'},400);}
  if(!/^[\da-f-]{36}$/i.test(body.operationId||'')||!Array.isArray(body.fields)||body.fields.length>150)return json({error:'Solicitação inválida.'},400);
  const operation=(await database().query('SELECT version,status,document FROM web_service_operations WHERE id=$1',[body.operationId])).rows[0];
  if(!operation)return json({error:'Operação não encontrada.'},404);
  if(operation.version!==body.version||operation.status!=='awaiting_review')return json({error:'A operação foi alterada ou não está aguardando revisão. Atualize a tela.'},409);
  // The persisted template determines which paths the client may submit; no numeric/status fields.
  const run=structuredClone(operation.document.checklistRun);
  if(!run)return json({error:'Relatório não disponível.'},400);
  const allowed=writingFields(run,true);
  const fields=body.fields.map((f:any)=>{
   const target=allowed.find(a=>a.id===f.id);
   if(!target||typeof f.text!=='string'||!f.text.trim()||f.text.length>10000)throw new Error('INVALID_FIELDS');
   return {...target,text:f.text};
  });
  if(new Set(fields.map((f:any)=>f.id)).size!==fields.length)throw new Error('INVALID_FIELDS');
  if(!fields.length)return json({suggestions:[]});
  if(!process.env.OPENAI_API_KEY)return json({error:'A revisão com IA ainda não foi configurada no servidor.'},503);
  if(running.has(user.email))return json({error:'Aguarde a revisão de texto em andamento.'},429);
  owner=user.email;running.add(owner);
  const response=await fetch('https://api.openai.com/v1/responses',{
   method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(45000),
   body:JSON.stringify({model:process.env.OPENAI_REVIEW_MODEL||'gpt-4o-mini',store:false,max_output_tokens:10000,
    instructions:reviewWritingPrompt,
    input:JSON.stringify(fields.map(({id,stageId,fieldId,key,label,text}:any)=>({id,stageId,fieldId,key,label,text}))),
    text:{format:{type:'json_schema',name:'writing_review',strict:true,schema:{type:'object',additionalProperties:false,required:['suggestions'],properties:{suggestions:{type:'array',items:{type:'object',additionalProperties:false,required:['id','suggested'],properties:{id:{type:'string'},suggested:{type:'string'}}}}}}}}
   })});
  if(!response.ok){
   const failure=await response.json().catch(()=>null);
   const code=failure?.error?.code,type=failure?.error?.type;
   if(code==='credit_balance_exhausted'||code==='insufficient_quota'||type==='insufficient_quota')return json({error:'A conta da OpenAI está sem créditos disponíveis ou atingiu a cota da API. Verifique o saldo e o faturamento da API para continuar.'},503);
   if(response.status===401)return json({error:'A chave da OpenAI não foi aceita. Verifique a configuração da integração no servidor.'},503);
   if(response.status===403||code==='model_not_found')return json({error:'A conta da OpenAI não tem acesso ao modelo configurado. Verifique as permissões da integração.'},503);
   if(response.status===429)return json({error:'O limite de consultas à IA foi atingido. Aguarde um momento e tente novamente.'},429);
   return json({error:'Não foi possível consultar a IA. Tente novamente mais tarde.'},503);
  }
  const result=await response.json();
  if(result.status!=='completed')return json({error:'A IA não concluiu a revisão. Nenhum texto foi alterado.'},503);
  const output=(result.output||[]).flatMap((v:any)=>v.content||[]).filter((v:any)=>v.type==='output_text').map((v:any)=>v.text).join('');
  try{return json({suggestions:validateWritingSuggestions(fields,JSON.parse(output))});}
  catch{return json({error:'A resposta da IA não passou pela validação. Nenhum texto foi alterado; tente novamente.'},502);}
 }catch(e){
  if(e instanceof Unauthorized)return json({error:'Sessão expirada.'},401);
  if(e instanceof Forbidden)return json({error:'Acesso não permitido.'},403);
  if(e instanceof Error&&e.message==='INVALID_FIELDS')return json({error:'Campos de texto inválidos. Salve os ajustes e tente novamente.'},400);
  return json({error:'Não foi possível revisar o texto agora. Nenhum campo foi alterado.'},503);
 }finally{if(owner)running.delete(owner);}
}

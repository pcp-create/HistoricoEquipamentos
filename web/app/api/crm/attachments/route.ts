import {requireUser,sameOrigin,Unauthorized,Forbidden} from '@/lib/auth';
import {CrmError} from '@/lib/crm/model';
import {proposalAttachments,proposalAttachment,addProposalAttachment,removeProposalAttachment,proposalAttachmentMaxBytes} from '@/lib/crm/proposal-attachments';
import {taskAttachmentMime} from '@/lib/tasks/attachment-types';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function failure(error:unknown){return Response.json({error:error instanceof Unauthorized?'Sessão expirada.':error instanceof Forbidden?'Acesso não permitido.':error instanceof CrmError?error.message:'Não foi possível acessar os anexos.'},{status:error instanceof Unauthorized?401:error instanceof Forbidden?403:error instanceof CrmError?400:503,headers});}
export async function GET(request:Request){
 try{await requireUser();const params=new URL(request.url).searchParams,proposal=params.get('proposal')||'',id=params.get('id');
  if(!id)return Response.json({rows:await proposalAttachments(proposal)},{headers});
  const file=await proposalAttachment(proposal,id),mime=taskAttachmentMime(file.filename),inline=mime.startsWith('image/')||mime==='application/pdf';
  return new Response(new Uint8Array(file.content),{headers:{...headers,'Content-Type':mime,'Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,'Content-Security-Policy':"sandbox; default-src 'none'"}});
 }catch(error){return failure(error);}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Origem inválida.'},{status:403,headers});
 try{const user=await requireUser();if(Number(request.headers.get('content-length')||0)>proposalAttachmentMaxBytes+65536)throw new CrmError('Cada anexo pode ter até 3 MB.');
  const data=await request.formData(),file=data.get('file');if(!(file instanceof File))throw new CrmError('Selecione um arquivo.');
  return Response.json(await addProposalAttachment(String(data.get('proposal')||''),file,user.email),{headers});
 }catch(error){return failure(error);}
}
export async function DELETE(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Origem inválida.'},{status:403,headers});
 try{const user=await requireUser(),params=new URL(request.url).searchParams;return Response.json(await removeProposalAttachment(params.get('proposal')||'',params.get('id')||'',user.email),{headers});}
 catch(error){return failure(error);}
}

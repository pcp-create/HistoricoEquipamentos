/** Interpret API failures without exposing tokens, recipients or message contents. */
export function gmailDraftError(status:number,payload:any){
 const error=payload?.error||{};
 const reasons=[error.status,...(Array.isArray(error.errors)?error.errors.map((v:any)=>v?.reason):[]),...(Array.isArray(error.details)?error.details.map((v:any)=>v?.reason):[])].filter((v:any)=>typeof v==='string');
 const disabled=reasons.some(r=>['SERVICE_DISABLED','accessNotConfigured','serviceDisabled'].includes(r))||/has not been used|it is disabled|access not configured/i.test(String(error.message||''));
 if(disabled)return {enableApi:true,message:'A Gmail API não está ativada no projeto Google Cloud deste Client ID. Ative a Gmail API, aguarde a atualização e tente novamente.'};
 if(status===401)return {enableApi:false,message:'A autorização do Google expirou ou não é válida. Conecte sua conta novamente.'};
 if(reasons.some(r=>['insufficientPermissions','ACCESS_TOKEN_SCOPE_INSUFFICIENT'].includes(r)))return {enableApi:false,message:'O Google não concedeu a permissão para criar rascunhos. Conecte novamente e permita o acesso ao Gmail solicitado pelo portal.'};
 if(reasons.includes('domainPolicy'))return {enableApi:false,message:'A política do Google Workspace bloqueou a criação do rascunho. Peça ao administrador da conta para autorizar esta integração.'};
 if(status===429||reasons.some(r=>['rateLimitExceeded','userRateLimitExceeded','quotaExceeded','dailyLimitExceeded'].includes(r)))return {enableApi:false,message:'O limite de uso da Gmail API foi atingido. Aguarde antes de tentar novamente e confira as cotas do projeto Google.'};
 const code=reasons.find(r=>/^[A-Z_]{3,60}$/.test(r))||reasons.find(r=>/^[a-zA-Z]{3,60}$/.test(r));
 return {enableApi:false,message:`O Google recusou a criação do rascunho (HTTP ${status}${code?' · '+code:''}). Confira as permissões do Gmail e a configuração da API no Google Cloud.`};
}

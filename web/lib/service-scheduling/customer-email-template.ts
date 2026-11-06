export const defaultCustomerEmail={
 subject:'Relatório técnico · OS {os} - {cliente}',
 body:'Olá,\n\nSegue em anexo o relatório técnico resumido da OS {os}, referente ao atendimento de {cliente}.\n\nPermanecemos à disposição.\n\nAtenciosamente,\n{responsavel}\n{empresa}',
 gmailClientId:'',
};
export function validateCustomerEmail(value:any){
 if(value!=null&&(typeof value!=='object'||Array.isArray(value)))throw Error('Configuração de e-mail inválida.');
 const config={...defaultCustomerEmail,...value};
 if(typeof config.subject!=='string'||!config.subject.trim()||config.subject.length>300||/[\r\n]/.test(config.subject))throw Error('Informe um assunto válido para o e-mail (até 300 caracteres).');
 if(typeof config.body!=='string'||!config.body.trim()||config.body.length>10000)throw Error('Informe o texto padrão do e-mail (até 10.000 caracteres).');
 if(typeof config.gmailClientId!=='string'||(config.gmailClientId&&!/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(config.gmailClientId)))throw Error('Informe um Client ID Google válido ou deixe em branco.');
 return {subject:config.subject.trim(),body:config.body.trim(),gmailClientId:config.gmailClientId};
}
export function fillCustomerEmail(template:string,values:Record<string,string>){return template.replace(/\{(os|cliente|equipamento|empresa|responsavel)\}/g,(_,key)=>values[key]||'');}

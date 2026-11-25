export const defaultCustomerEmail={
 subject:'Relatório técnico · OS {os} - {cliente}',
 body:'Olá,\n\nSegue em anexo o relatório técnico resumido da OS {os}, referente ao atendimento de {cliente}.\n\nEquipamentos atendidos:\n{equipamento}\n\nPermanecemos à disposição.\n\nAtenciosamente,\n{responsavel}\n{empresa}',
 bodyHtml:'',
 filenameTemplate:'',
 gmailClientId:'',
};
export function validateCustomerEmail(value:any){
 if(value!=null&&(typeof value!=='object'||Array.isArray(value)))throw Error('Configuração de e-mail inválida.');
 const config={...defaultCustomerEmail,...value};
 if(typeof config.subject!=='string'||!config.subject.trim()||config.subject.length>300||/[\r\n]/.test(config.subject))throw Error('Informe um assunto válido para o e-mail (até 300 caracteres).');
 if(typeof config.filenameTemplate!=='string'||config.filenameTemplate.length>220||/[<>:"/\\|?*\u0000-\u001f\u007f]/.test(config.filenameTemplate))throw Error('Informe um nome padrão de anexo válido (até 220 caracteres).');
 if(typeof config.body!=='string'||!config.body.trim()||config.body.length>10000)throw Error('Informe o texto padrão do e-mail (até 10.000 caracteres).');
 if(typeof config.bodyHtml!=='string'||config.bodyHtml.length>900000)throw Error('O texto padrão formatado excede o limite permitido.');
 if(typeof config.gmailClientId!=='string'||(config.gmailClientId&&!/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(config.gmailClientId)))throw Error('Informe um Client ID Google válido ou deixe em branco.');
 return {subject:config.subject.trim(),filenameTemplate:config.filenameTemplate.trim(),body:config.body.trim(),bodyHtml:config.bodyHtml.trim(),gmailClientId:config.gmailClientId};
}
export function fillCustomerEmail(template:string,values:Record<string,string>){return template.replace(/\{(os|proposta|revisao|cliente|equipamento(?:_\d{2,3})?|empresa|responsavel)\}/g,(_,key)=>values[key]||'');}

/** Template values are text, even when inserted into formatted messages. */
export function fillCustomerEmailHtml(template:string,values:Record<string,string>){
 const escaped=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/\r?\n/g,'<br>')]));
 return fillCustomerEmail(template,escaped);
}

export function emailAttachmentFilename(template:string,values:Record<string,string>,fallback:string){
 const value=fillCustomerEmail(template,values).replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
 const base=value.replace(/\.pdf$/i,'').trim().slice(0,216).trim();
 return base?base+'.pdf':fallback;
}

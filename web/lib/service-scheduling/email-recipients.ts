export function emailRecipients(value:string){
 if(typeof value!=='string'||value.length>6000||/[\r\n]/.test(value))throw Error('Informe os destinatários separados por vírgula ou ponto e vírgula.');
 const emails=[...new Set(value.split(/[;,]/).map(v=>v.trim()).filter(Boolean))];
 if(!emails.length||emails.length>20||emails.some(v=>v.length>254||!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(v)))throw Error('Informe até 20 e-mails válidos, separados por vírgula ou ponto e vírgula.');
 return emails;
}
export function reportAttachmentName(value:string){
 const name=value.trim();
 if(!name||name.length>220||/[<>:"/\\|?*\u0000-\u001f\u007f]/.test(name)||!name.toLowerCase().endsWith('.pdf'))throw Error('Informe um nome de anexo válido com a extensão .pdf (até 220 caracteres).');
 return name;
}

// Only private incoming messages and explicit manual MENU/CANCELAR controls reach DSU.
return $input.all().flatMap((item,i)=>{
 const b=item.json.body, key=b?.data?.key;
 const jid=typeof key?.remoteJid==='string' ? key.remoteJid : '';
 const alt=typeof key?.remoteJidAlt==='string' ? key.remoteJidAlt : '';
 const privateMessage=jid.endsWith('@s.whatsapp.net') || (jid.endsWith('@lid') && alt.endsWith('@s.whatsapp.net'));
 let message=b?.data?.message;
 for(let n=0;n<4&&message;n++){
  const nested=message.ephemeralMessage?.message||message.viewOnceMessage?.message||message.viewOnceMessageV2?.message||message.viewOnceMessageV2Extension?.message||message.documentWithCaptionMessage?.message;
  if(!nested)break;message=nested;
 }
 const manualControl=key?.fromMe===true && /^(menu|cancelar)$/i.test(String(message?.conversation||message?.extendedTextMessage?.text||'').trim());
 if(b?.instance==='BotDemandas' && key?.fromMe===true && (!privateMessage||!manualControl))return [];
 const dsu=b?.instance==='BotDemandas' && ['messages.upsert','MESSAGES_UPSERT'].includes(b?.event) && (key?.fromMe===false||manualControl) && privateMessage;
 return [{json:{...item.json,dsu},pairedItem:{item:i}}];
});

// Private incoming messages, manual controls and outgoing activity reach DSU.
return $input.all().flatMap((item,i)=>{
 const b=item.json.body, key=b?.data?.key;
 const jid=typeof key?.remoteJid==='string' ? key.remoteJid : '';
 const alt=typeof key?.remoteJidAlt==='string' ? key.remoteJidAlt : '';
 const privateMessage=jid.endsWith('@s.whatsapp.net') || (jid.endsWith('@lid') && alt.endsWith('@s.whatsapp.net'));
 // All private outgoing messages reach DSU only to refresh conversation activity.
 if(b?.instance==='BotDemandas' && key?.fromMe===true && !privateMessage)return [];
 const dsu=b?.instance==='BotDemandas' && ['messages.upsert','MESSAGES_UPSERT'].includes(b?.event) && (key?.fromMe===false||key?.fromMe===true) && privateMessage;
 return [{json:{...item.json,dsu},pairedItem:{item:i}}];
});

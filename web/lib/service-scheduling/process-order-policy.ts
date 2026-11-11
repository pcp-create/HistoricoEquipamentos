export function processOrderBlockReason(operations:any[],orderStatus?:string){
 if(['Processado','Processada'].includes(orderStatus||''))return 'Esta OS já está processada.';
 if(['Cancelado','Cancelada'].includes(orderStatus||''))return 'Uma OS cancelada não pode ser processada.';
 if(!operations.length)return 'A OS não possui operações para revisar.';
 const pending=operations.filter(o=>!['reviewed','completed'].includes(o.status));
 return pending.length?`Revise todas as operações antes de processar a OS. ${pending.length} operação(ões) ainda não revisada(s).`:'';
}

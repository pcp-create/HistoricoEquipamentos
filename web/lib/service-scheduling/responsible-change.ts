export const responsibleChangeWarning='Ao remover ou trocar o executante de uma operação já enviada, dados ainda não sincronizados no aparelho do técnico anterior podem ser perdidos parcialmente. Confirma a alteração do responsável?';
export function changesDispatchedResponsible(operation:any,next:any){
 return !!operation.sent_at && next?.responsible!==operation.document.responsible;
}
export function validateResponsibleChange(operation:any,next:any,confirmed:unknown){
 if(!changesDispatchedResponsible(operation,next))return false;
 if(confirmed!==true)throw Error('Confirme a troca do executante: dados não sincronizados podem ser perdidos parcialmente.');
 if(!next?.responsible)throw Error('Selecione um novo executante para a operação enviada.');
 return true;
}

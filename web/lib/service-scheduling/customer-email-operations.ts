export function canEmailOperation(operation:any){
 return ['reviewed','completed'].includes(operation.status)&&!!operation.document?.checklistRun;
}
/** Recheck both ownership and review state against the current database snapshot. */
export function selectEmailOperations(operations:any[],ids:unknown){
 if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))throw Error('Selecione de 1 a 100 operações revisadas para enviar.');
 const normalized=ids.map(id=>id.toLowerCase());
 if(new Set(normalized).size!==normalized.length)throw Error('Há operações repetidas na seleção.');
 const selected=operations.filter(op=>normalized.includes(op.id.toLowerCase()));
 if(selected.length!==normalized.length)throw Error('Selecione somente operações desta OS.');
 if(selected.some(op=>!canEmailOperation(op)))throw Error('Selecione somente operações revisadas ou concluídas com relatório técnico.');
 return selected;
}

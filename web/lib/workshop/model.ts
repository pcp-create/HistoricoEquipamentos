export const stages=[{id:'received',label:'Recebido',color:'#547c99'},{id:'diagnosis',label:'Diagnóstico',color:'#6366c2'},{id:'approval',label:'Aguardando aprovação',color:'#bd8624'},{id:'parts',label:'Aguardando peça',color:'#d3653c'},{id:'repair',label:'Em reparo',color:'#237ca3'},{id:'ready',label:'Pronto para saída',color:'#228566'}];
export function effectiveStage(stage:string,orders:any[]){
 const shortage=orders.some(o=>/faltando pe[cç]as|falta de materia|aguardando pe[cç]a|aguardando materia/i.test(o.status_lancamento_nome||''));
 return shortage?'parts':stage;
}
export function daysInWorkshop(entered:string,exited?:string|null,now=Date.now()){
 return Math.max(0,Math.floor(((exited?Date.parse(exited):now)-Date.parse(entered))/86400000));
}

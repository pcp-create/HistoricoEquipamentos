export const stages=[{id:'received',label:'Recebido',color:'#547c99'},{id:'diagnosis',label:'Diagnóstico',color:'#6366c2'},{id:'approval',label:'Aguardando aprovação do cliente',color:'#bd8624'},{id:'approval_internal',label:'Aguardando aprovação interna',color:'#97702c'},{id:'parts',label:'Aguardando peça',color:'#d3653c'},{id:'repair',label:'Em execução',color:'#237ca3'},{id:'ready',label:'Pronto para saída',color:'#228566'},{id:'quotation',label:'Aguardando orçamento comercial',color:'#97702c'},{id:'factory_warranty',label:'Garantia fábrica',color:'#8c67b5'},{id:'rj_warranty',label:'Garantia RJ',color:'#6676b5'},{id:'return_unrepaired',label:'Devolução sem conserto',color:'#916b68'},{id:'scheduled',label:'Serviço agendado',color:'#487c9c'},{id:'disposal',label:'Aguardando descarte',color:'#7c7580'}];
export function hasPartsShortage(orders: {status_lancamento_nome?: string | null}[] = []) {
 return orders.some(o=>/faltando pe[cç]as|falta de materia|aguardando pe[cç]a|aguardando materia/i.test(o.status_lancamento_nome||''));
}
export function effectiveStage(stage:string,_orders:any[],source?:{sheet?:string}){
 // Material shortages are alerts; the recorded process stage remains movable.
 return stage==='approval'&&isRentalSource(source)?'approval_internal':stage;
}
export function daysInWorkshop(entered:string,exited?:string|null,now=Date.now()){
 return Math.max(0,Math.floor(((exited?Date.parse(exited):now)-Date.parse(entered))/86400000));
}

export function isRentalSource(source?:{sheet?:string}){return source?.sheet==='Equipamentos Locação em revisão';}
/** Stored approval remains stable; origin determines its display and grouping. */
export function stageOptions(source?:{sheet?:string}){return stages.filter(s=>s.id!=='approval_internal').map(s=>s.id==='approval'&&isRentalSource(source)?{...s,label:'Aguardando aprovação interna'}:s);}

export const workshopAgeColors=['#239564','#d9a019','#d94a58','#794bc3'];
export function workshopAgeBand(days:number,external=false){return days<=(external?7:15)?0:days<=(external?15:30)?1:days<=(external?30:50)?2:3;}
export function workshopAgeColor(days:number){return workshopAgeColors[workshopAgeBand(days)];}

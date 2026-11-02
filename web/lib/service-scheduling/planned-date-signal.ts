import type {PlannedDate} from './planned-date';
export function plannedDateSignal(value:PlannedDate|undefined,today:string){
 if(value?.source==='finished')return {state:'finished',label:'Sem programação pendente'};
 if(value?.source==='scheduled')return value.date&&value.date<today
   ? {state:'overdue',label:'Atenção: programação vencida'}
   : {state:'scheduled',label:'Já programado'};
 if(value?.source==='estimated'&&value.requiresAttention===false)return {state:'ready',label:'Disponível para programar'};
 return {state:'attention',label:'Precisa de atenção'};
}

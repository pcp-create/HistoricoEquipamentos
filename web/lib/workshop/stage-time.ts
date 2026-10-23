import {stages,isRentalSource} from './model';
const aliases:Record<string,string>={'Em reparo':'repair','Aguardando aprovação':'approval'};
function eventStage(e:any,source:any):string|null|undefined {
 if(e.action==='Retirado da posição atual pela conferência')return null;
 if(e.document?.nextStage)return e.document.nextStage;
 if(e.action==='Entrada registrada')return 'received';
 if(e.action?.startsWith('Etapa: ')){const label=e.action.slice(7);return aliases[label]||stages.find(s=>s.label===label)?.id;}
 if(['Importado da planilha','Presença confirmada pela planilha filtrada','Presença da frota confirmada pela planilha atual'].includes(e.action)){
  const code=String(e.document?.notes||'').match(/^\s*(\d+)\s*-/)?.[1];
  const map:Record<string,string>=isRentalSource(source)?{'1':'diagnosis','3':'approval','4':'parts','6':'repair','9':'disposal','11':'scheduled'}:{'1':'diagnosis','2':'quotation','3':'approval','4':'parts','6':'repair','8':'ready','9':'return_unrepaired','13':'factory_warranty','14':'rj_warranty'};
  return code?map[code]:undefined;
 }
 return undefined;
}
/** Only observed stage history is attributed; unknown imported periods are never guessed. */
export function workshopStageTime(visit:any,now=Date.now()){
 const entered=Date.parse(visit.entered_at),end=Math.min(now,visit.exited_at?Date.parse(visit.exited_at):Infinity,visit.reconciled_out_at?Date.parse(visit.reconciled_out_at):Infinity);
 const totals:Record<string,number>={};let cursor=entered,stage:string|null=null,currentSince:number|null=null,unknown=0;
 if(!Number.isFinite(entered)||end<entered)return {totals,currentMs:0,currentSince:null,unknownMs:0};
 const events=[...(visit.events||[])].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
 const add=(until:number)=>{const ms=Math.max(0,until-cursor);if(stage)totals[stage]=(totals[stage]||0)+ms;else unknown+=ms;cursor=until;};
 for(const e of events){let next=eventStage(e,visit.source);if(next===undefined)continue;if(next==='approval_internal')next='approval';
  let at=Date.parse(e.created_at);if(e.action==='Entrada registrada')at=entered;
  if(!Number.isFinite(at)||at>end)continue;at=Math.max(entered,at);
  add(Math.max(cursor,at));if(stage!==next){stage=next;currentSince=next?at:null;}
 }
 add(end);
 // Current DB state can differ after old imports; do not attribute an unrecorded stage change.
 const matches=stage===visit.stage;
 return {totals,currentMs:totals[visit.stage]||0,currentSince:matches?currentSince:null,unknownMs:unknown,observedStage:stage};
}
export function stageDuration(ms:number){const minutes=Math.floor(Math.max(0,ms)/60000),days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),mins=minutes%60;return days?`${days}d ${hours}h ${mins}min`:hours?`${hours}h ${mins}min`:minutes?`${minutes}min`:'Menos de 1min';}

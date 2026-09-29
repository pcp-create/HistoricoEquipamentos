export const fieldTypes: Record<string,string> = {flag:'Indicador de Status',text:'Texto curto',textarea:'Texto longo',number:'Número',select:'Lista de opções',date:'Data',time:'Hora',photo:'Fotos / anexos de imagem',meter:'Horímetro do equipamento',signature:'Assinatura'};
export type ChecklistField = {id:string;label:string;type:string;required:boolean;options?:string[];group?:string;maxPhotos?:number;comment?:boolean;report?:boolean;internalNote?:boolean};
export type ChecklistGroup = {id:string;name:string;fields:ChecklistField[];direct?:boolean};
export type ChecklistStage = {id:string;name:string;fields:ChecklistField[];groups?:ChecklistGroup[]};
export function groupsOf(s:ChecklistStage):ChecklistGroup[]{
 if(s.groups)return s.groups;
 const groups:ChecklistGroup[]=[];
 for(const f of s.fields||[]){const name=f.group?.trim()||'';let group=groups.find(g=>g.name===name);if(!group){group={id:s.id+'-group-'+(groups.length+1),name,fields:[],...(name?{}:{direct:true})};groups.push(group);}group.fields.push(f);}
 return groups;
}
export function fieldOptions(f:ChecklistField):string[]{return f.options ?? (f.type==='flag'?['OK','NOK','NA']:[]);}
export function photoLimit(f:ChecklistField){return f.maxPhotos??(f.type==='photo'?12:0);}
export function normalizeStage(s:ChecklistStage):ChecklistStage {const groups=groupsOf(s).filter(g=>!g.direct||g.fields.length>0);return {...s,groups,fields:groups.flatMap(g=>g.fields)};}

export type ChecklistTemplate = {id:string;name:string;prefix?:string;m8Identifier?:string;items:string[];stages?:ChecklistStage[]};
export function stagesOf(c:ChecklistTemplate):ChecklistStage[] {
 return (c.stages || [{id:'legacy',name:'Checklist',fields:c.items.map((label,i)=>({id:'legacy-'+i,label,type:'flag',required:false}))}]).map(normalizeStage);
}
export function validateChecklists(raw:any):ChecklistTemplate[] {
 if(!Array.isArray(raw)||raw.length>100) throw Error('Checklists inválidos.');
 const ids=new Set<string>();
 const text=(v:any,max:number)=>typeof v==='string'&&!!v.trim()&&v.length<=max;
 const id=(v:any)=>text(v,100)&&/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(v)&&!["constructor","prototype"].includes(v);
 for(const c of raw){
  if(!c||!id(c.id)||ids.has(c.id)||!text(c.name,120)||!Array.isArray(c.items)||c.items.length>100||c.items.some((v:any)=>!text(v,200)))throw Error('Informe um nome válido para cada checklist.');
  ids.add(c.id);
  if(c.m8Identifier!==undefined&&(typeof c.m8Identifier!=="string"||c.m8Identifier.length>500))throw Error("Identificador M8 inválido.");
  if(c.prefix!=null && (typeof c.prefix!=='string'||c.prefix.length>20))throw Error('Prefixo limitado a 20 caracteres.');
  if(c.stages!==undefined){
   if(!Array.isArray(c.stages)||!c.stages.length||c.stages.length>30)throw Error('Inclua de 1 a 30 etapas no checklist.');
   const stageIds=new Set(),fieldIds=new Set();
   for(const original of c.stages){
    if(!original || typeof original!=="object")throw Error("Etapa inválida.");
    if(original.groups===undefined && (!Array.isArray(original.fields)||original.fields.some((f:any)=>!f||typeof f!=="object")))throw Error("Campos inválidos.");
    if(original.groups!==undefined && (!Array.isArray(original.groups)||!original.groups.length||original.groups.length>30))throw Error('Inclua de 1 a 30 grupos por etapa.');
    const groupIds=new Set();
    for(const g of original.groups||[]){if(!g||!id(g.id)||groupIds.has(g.id)||(g.direct===true?g.name!=='':!text(g.name,120))||(g.direct!==undefined&&typeof g.direct!=='boolean')||!Array.isArray(g.fields)||!g.fields.length)throw Error('Cada grupo precisa de nome e campos.');groupIds.add(g.id);}
    const s=normalizeStage(original);
    if(!s||!id(s.id)||stageIds.has(s.id)||!text(s.name,120)||!Array.isArray(s.fields)||!s.fields.length||s.fields.length>100)throw Error('Cada etapa precisa de nome e de 1 a 100 campos.');
    stageIds.add(s.id);
    for(const f of s.fields){
     if(!f||!id(f.id)||fieldIds.has(f.id)||!text(f.label,200)||!Object.hasOwn(fieldTypes,f.type)||typeof f.required!=='boolean'||(f.group!=null && (typeof f.group!=='string'||f.group.length>120)))throw Error('Campo de checklist inválido.');
     fieldIds.add(f.id);
     if(f.maxPhotos!==undefined&&(!Number.isInteger(f.maxPhotos)||f.maxPhotos<0||f.maxPhotos>30||(f.type==='photo'&&f.maxPhotos===0)))throw Error('Quantidade máxima de fotos deve ser de 1 a 30 (ou zero para desativar).');
     if((['comment','report','internalNote'] as const).some(k=>f[k]!==undefined&&typeof f[k]!=='boolean'))throw Error('Opções do campo inválidas.');
     if((f.type==='select'||(f.type==='flag'&&f.options!==undefined))&&(!Array.isArray(f.options)||!f.options.length||f.options.length>50||f.options.some((v:any)=>!text(v,120))||new Set(f.options).size!==f.options.length))throw Error('Informe opções distintas para o campo de seleção.');
    }
   }
   if(stagesOf(c).flatMap(s=>s.fields).filter((f:any)=>f.type==='meter').length>1)throw Error('Use somente um campo de horímetro por checklist.');
  }
 }
 return raw.map(c=>({...c,...(c.stages?{stages:stagesOf(c)}:{})}));
}
export function validateAnswers(stage:ChecklistStage,raw:any,complete:boolean){
 stage=normalizeStage(stage);
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!stage.fields.some(f=>f.id===k)))throw Error('Respostas inválidas.');
 const out:Record<string,any>={};
 for(const f of stage.fields){
  const v=raw[f.id];
  if(v==null||v===''||(Array.isArray(v)&&!v.length)){if(complete&&f.required)throw Error(`Preencha: ${f.label}.`);continue;}
  if(f.type==='number'||f.type==='meter') {if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e9||(f.type==='meter'&&v<0))throw Error(`Número inválido: ${f.label}.`);}
  else if(f.type==='photo'||f.type==='signature'){if(!Array.isArray(v)||v.length>(f.type==='signature'?1:photoLimit(f))||v.some((id:any)=>typeof id!=='string'||!/^\d{1,18}$/.test(id))||new Set(v).size!==v.length)throw Error('Anexos inválidos.');}
  else {if(typeof v!=='string'||v.length>(f.type==='textarea'?30000:2000))throw Error(`Texto inválido: ${f.label}.`);
   if(f.type==='flag'&&!fieldOptions(f).includes(v))throw Error('Selecione um indicador de status válido.');
   if(f.type==='select'&&!f.options?.includes(v))throw Error(`Seleção inválida: ${f.label}.`);
   if(f.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))throw Error('Data inválida.');
   if(f.type==='time'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))throw Error('Hora inválida.');
  }
  out[f.id]=v;
 }
 return out;
}

export function validateFieldDetails(stage:ChecklistStage,raw:any={}){
 stage=normalizeStage(stage);
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!stage.fields.some(f=>f.id===k)))throw Error('Complementos de campos inválidos.');
 const result:Record<string,any>={};
 for(const f of stage.fields){const d=raw[f.id];if(d===undefined)continue;
  if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).some(k=>!['photos','comment','internalNote'].includes(k)))throw Error('Complementos inválidos.');
  const next:Record<string,any>={};
  for(const key of ['comment','internalNote'] as const){if(d[key]!==undefined){if(!f[key]||typeof d[key]!=='string'||d[key].length>30000)throw Error(`Complemento não permitido: ${f.label}.`);next[key]=d[key];}}
  if(d.photos!==undefined){if(f.type==='photo'||photoLimit(f)===0||!Array.isArray(d.photos)||d.photos.length>photoLimit(f)||d.photos.some((id:any)=>typeof id!=='string'||!/^\d{1,18}$/.test(id))||new Set(d.photos).size!==d.photos.length)throw Error(`Limite de fotos inválido: ${f.label}.`);next.photos=d.photos;}
  result[f.id]=next;
 }
 return result;
}

/** Includes reports sent before explicit receipt metadata was introduced. */
export function reportSubmission(run:any):{at:string;by:string;name?:string}|null{
 if(run?.submission)return run.submission;
 const stages=run?.template?stagesOf(run.template):[];
 if(!stages.length||!stages.every(s=>run.stages?.[s.id]?.status==='submitted'))return null;
 const sent=stages.map(s=>run.stages[s.id]).filter(s=>s.submittedAt).sort((a,b)=>String(b.submittedAt).localeCompare(String(a.submittedAt)))[0];
 return sent?{at:sent.submittedAt,by:sent.submittedBy}:null;
}

export function reportStatusLabel(run:any):string{
 if(reportSubmission(run))return 'Enviado completo';
 if(run?.partialSubmission)return 'Enviado parcial';
 if(run?.reportReturnedAt&&!run?.reportSavedAt)return 'Devolvido para edição';
 if(run?.reportSavedAt||Object.values(run?.stages||{}).some((s:any)=>s.updatedAt))return 'Salvo';
 return 'Não preenchido';
}

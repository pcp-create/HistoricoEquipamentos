"use client";
import SaveActionIcon from "./save-action-icon";
import {useState,useRef,useId} from 'react';
import {MoreVertical,Pencil} from 'lucide-react';
import {fieldTypes,stagesOf,normalizeStage,photoLimit,fieldOptions,type ChecklistTemplate,type ChecklistStage,type ChecklistGroup} from '@/lib/service-scheduling/checklists';
import ccp from '@/lib/service-scheduling/templates/ccp.json';
import './schedule-checklists.css';
const blankGroup=()=>({id:crypto.randomUUID(),name:'Novo grupo',fields:[]});
const blankStage=()=>({id:crypto.randomUUID(),name:'Nova etapa',fields:[],groups:[]});
function move<T,>(list:T[],i:number,offset:number){const result=[...list];[result[i],result[i+offset]]=[result[i+offset],result[i]];return result;}
export default function ScheduleChecklistEditor({settings,onChange,onSave,busy,attendanceTypes=[]}:any){
 const [selected,setSelected]=useState(''),[dirty,setDirty]=useState(false);
 const templates:ChecklistTemplate[]=settings.checklists,current=templates.find(c=>c.id===selected);
 function update(list:ChecklistTemplate[]){onChange({...settings,checklists:list});setDirty(true);}
 function change(next:ChecklistTemplate){update(templates.map(c=>c.id===next.id?next:c));}
 function create(template?:ChecklistTemplate){const id=crypto.randomUUID();update([...templates,template?{...structuredClone(template),id}:{id,name:'Novo checklist',prefix:'',items:[],stages:[blankStage()]}]);setSelected(id);}
 return <section className="checklist-editor">
 <div className="checklist-toolbar">{current&&<button type="button" onClick={()=>setSelected('')}>← Voltar à lista</button>}<button type="button" onClick={()=>create()}>+ Novo checklist</button><button type="button" onClick={()=>create(ccp)}>Usar modelo CCP</button></div>
 {!current&&<div className="checklist-registry checklist-model-list"><table><thead><tr><th>Prefixo</th><th>Nome</th><th>Identificador M8</th><th>Etapas</th><th>Ações</th></tr></thead><tbody>{templates.map(c=><tr key={c.id}><td>{c.prefix||'—'}</td><td>{c.name}</td><td>{c.m8Identifier||'Não configurado'}</td><td>{stagesOf(c).length}</td><td><button type="button" aria-label={`Editar checklist ${c.name}`} onClick={()=>setSelected(c.id)}><Pencil size={14}/> Editar</button></td></tr>)}</tbody></table>{!templates.length&&<p>Nenhum checklist cadastrado.</p>}</div>}
 {!current&&<section className="checklist-preventive-types"><h3>Preventivas por tipo de atendimento</h3><p>Configure horas e/ou meses para criar automaticamente a preventiva na revisão. Tipos sem intervalo atualizam apenas o horímetro, salvo quando já vinculados a uma preventiva do equipamento.</p><div className="checklist-registry"><table><thead><tr><th>Tipo de atendimento / Identificador M8</th><th>Intervalo (horas)</th><th>Intervalo (meses)</th><th>Ações</th></tr></thead><tbody>{(settings.preventiveTypes||[]).map((row:any,i:number)=>{const changeType=(patch:any)=>{onChange({...settings,preventiveTypes:settings.preventiveTypes.map((v:any,j:number)=>i===j?{...v,...patch}:v)});setDirty(true);};return <tr key={i}><td><select aria-label={`Tipo de atendimento da preventiva ${i+1}`} value={row.m8Identifier} onChange={e=>changeType({m8Identifier:e.target.value})}><option value="">Selecione</option>{Array.from(new Set<string>([...attendanceTypes,...(settings.preventiveTypes||[]).map((v:any)=>v.m8Identifier).filter(Boolean)])).map(name=><option key={name} value={name} disabled={name!==row.m8Identifier&&settings.preventiveTypes.some((v:any)=>v.m8Identifier===name)}>{name}</option>)}</select></td><td><input aria-label={`Intervalo em horas da preventiva ${i+1}`} type="number" min="0.001" max="1000000" step="0.001" value={row.hours??''} onChange={e=>changeType({hours:e.target.value===''?null:Number(e.target.value)})}/></td><td><input aria-label={`Intervalo em meses da preventiva ${i+1}`} type="number" min="1" max="1200" step="1" value={row.months??''} onChange={e=>changeType({months:e.target.value===''?null:Number(e.target.value)})}/></td><td><button type="button" aria-label={`Remover intervalo ${i+1}`} onClick={()=>{onChange({...settings,preventiveTypes:settings.preventiveTypes.filter((_:any,j:number)=>i!==j)});setDirty(true);}}>×</button></td></tr>;})}</tbody></table></div><button type="button" onClick={()=>{onChange({...settings,preventiveTypes:[...(settings.preventiveTypes||[]),{m8Identifier:'',hours:null,months:null}]});setDirty(true);}}>+ Configurar intervalo</button></section>}
 {current&&<><div className="checklist-toolbar"><label>Prefixo<input maxLength={20} value={current.prefix||''} onChange={e=>change({...current,prefix:e.target.value})}/></label><label className="checklist-grow">Nome<input maxLength={120} value={current.name} onChange={e=>change({...current,name:e.target.value})}/></label><label className="checklist-grow">Identificador M8<select aria-label="Identificador M8" value={current.m8Identifier||''} onChange={e=>change({...current,m8Identifier:e.target.value})}><option value="">Não vinculado</option>{current.m8Identifier&&!attendanceTypes.includes(current.m8Identifier)&&<option value={current.m8Identifier}>{current.m8Identifier}</option>}{attendanceTypes.map((name:string)=><option key={name} value={name}>{name}</option>)}</select></label><button type="button" onClick={()=>{update(templates.filter(c=>c.id!==current.id));setSelected('');}}>Remover modelo</button></div>
 {stagesOf(current).map((stage,i,stages)=>{
 const setStage=(s:ChecklistStage)=>change({...current,stages:stages.map((v,j)=>j===i?normalizeStage(s):v)});
 const groups=stage.groups!;
 return <details className="checklist-stage-editor" key={stage.id} open><summary><EditableTitle name={stage.name} label={`etapa ${i+1}`} onChange={name=>setStage({...stage,name})}/> <small>({groups.filter(g=>!g.direct).length>0?`${groups.filter(g=>!g.direct).length} grupos · `:""}{stage.fields.length} campos)</small></summary>
 <div className="checklist-toolbar"><button type="button" aria-label={`Subir etapa ${i+1}`} disabled={i===0} onClick={()=>change({...current,stages:move(stages,i,-1)})}>↑</button><button type="button" aria-label={`Descer etapa ${i+1}`} disabled={i===stages.length-1} onClick={()=>change({...current,stages:move(stages,i,1)})}>↓</button><button type="button" onClick={()=>change({...current,stages:stages.filter(s=>s.id!==stage.id)})}>Remover etapa</button></div>
 {groups.map((group,gi)=>{
 const setGroup=(g:ChecklistGroup)=>setStage({...stage,groups:groups.map(v=>v.id===g.id?g:v)});
 const Container=group.direct?'div':'details';
 return <Container className={group.direct?"checklist-direct-fields":"checklist-group-editor"} key={group.id} {...(group.direct?{}:{open:true})}>
 {!group.direct&&<><summary><EditableTitle name={group.name} label={`grupo ${gi+1} da etapa ${i+1}`} onChange={name=>setGroup({...group,name})}/> <small>({group.fields.length} campos)</small></summary>
 <div className="checklist-toolbar"><button type="button" aria-label={`Subir grupo ${gi+1} da etapa ${i+1}`} disabled={!gi} onClick={()=>setStage({...stage,groups:move(groups,gi,-1)})}>↑</button><button type="button" aria-label={`Descer grupo ${gi+1} da etapa ${i+1}`} disabled={gi===groups.length-1} onClick={()=>setStage({...stage,groups:move(groups,gi,1)})}>↓</button><button type="button" onClick={()=>setStage({...stage,groups:groups.filter(g=>g.id!==group.id)})}>Remover grupo</button></div></>}
 <div className="checklist-field-table">{group.fields.length>0&&<div className="checklist-field-header" aria-hidden="true"><span>Campo</span><span>Tipo</span><span>Obrigatório</span><span>Foto? / Máx.</span><span>Comentário?</span><span>Relatório?</span><span>Obs. interna?</span><span>Ações</span></div>}
 {group.fields.map((f,j)=>{
 const n=stage.fields.findIndex(v=>v.id===f.id)+1;
 const field=(next:any)=>setGroup({...group,fields:group.fields.map(v=>v.id===f.id?next:v)});
 const check=(key:'required'|'comment'|'report'|'internalNote',label:string)=><label className="checklist-required"><input aria-label={`${label}: ${f.label}`} type="checkbox" checked={key==='report'?f.report!==false:!!f[key]} onChange={e=>field({...f,[key]:e.target.checked})}/></label>;
 return <div className="checklist-field-editor" key={f.id}>
 <input aria-label={`Campo ${n} da etapa ${i+1}`} maxLength={200} value={f.label} onChange={e=>field({...f,label:e.target.value})}/>
 <select aria-label={`Tipo do campo ${n} da etapa ${i+1}`} value={f.type} onChange={e=>field({...f,type:e.target.value,options:e.target.value==='select'?['Opção 1']:e.target.value==='flag'?[]:undefined,maxPhotos:e.target.value==='photo'?(photoLimit(f)||12):f.maxPhotos})}>{Object.entries(fieldTypes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
 {check('required','Obrigatório')}
 <div className="checklist-photo-setting"><input type="checkbox" aria-label={`Fotos: ${f.label}`} checked={photoLimit(f)>0} disabled={f.type==='photo'} onChange={e=>field({...f,maxPhotos:e.target.checked?5:0})}/>{photoLimit(f)>0&&<input type="number" aria-label={`Máximo de fotos: ${f.label}`} min={1} max={30} value={photoLimit(f)} onChange={e=>field({...f,maxPhotos:Number(e.target.value)})}/>}</div>
 {check('comment','Comentário')}{check('report','Relatório')}{check('internalNote','Observação interna')}
 <div className="checklist-field-actions"><button type="button" aria-label={`Subir campo ${n} da etapa ${i+1}`} disabled={!j} onClick={()=>setGroup({...group,fields:move(group.fields,j,-1)})}>↑</button><button type="button" aria-label={`Descer campo ${n} da etapa ${i+1}`} disabled={j===group.fields.length-1} onClick={()=>setGroup({...group,fields:move(group.fields,j,1)})}>↓</button><button type="button" aria-label={`Remover campo ${n} da etapa ${i+1}`} onClick={()=>setGroup({...group,fields:group.fields.filter(v=>v.id!==f.id)})}>×</button><FieldOptions label={`Opções do campo ${n} da etapa ${i+1}`} groupId={group.id} groups={groups} onMove={id=>setStage({...stage,groups:groups.map(g=>g.id===group.id?{...g,fields:g.fields.filter(v=>v.id!==f.id)}:g.id===id?{...g,fields:[...g.fields,f]}:g)})}/></div>
 {(f.type==='select'||f.type==='flag')&&<label className="checklist-options">{f.type==='flag'?'Indicadores (um por linha)':'Opções (uma por linha)'}<textarea aria-label={`Opções do campo ${n} da etapa ${i+1}`} placeholder={f.type==='flag'?'OK\nNOK\nNA':undefined} value={fieldOptions(f).join('\n')} onChange={e=>field({...f,options:e.target.value.split('\n')})}/></label>}

 </div>;
 })}</div>{!group.direct&&<div className="checklist-add-actions"><button type="button" onClick={()=>setGroup({...group,fields:[...group.fields,{id:crypto.randomUUID(),label:'Novo campo',type:'text',required:false,report:true}]})}>+ Adicionar campo</button></div>}
 </Container>;
 })}<div className="checklist-add-actions checklist-stage-add-actions"><button type="button" onClick={()=>setStage({...stage,groups:[...groups,blankGroup()]})}>+ Adicionar grupo</button>
 <button type="button" onClick={()=>{const existing=groups.find(g=>g.direct);const field={id:crypto.randomUUID(),label:'Novo campo',type:'text',required:false,report:true};setStage({...stage,groups:existing?groups.map(g=>g.id===existing.id?{...g,fields:[...g.fields,field]}:g):[...groups,{id:crypto.randomUUID(),name:'',direct:true,fields:[field]}]});}}>+ Adicionar campo à etapa</button></div>
 </details>;
 })}<button type="button" onClick={()=>change({...current,stages:[...stagesOf(current),blankStage()]})}>+ Adicionar etapa</button></>}
 <footer className="checklist-toolbar"><span>{dirty?'Alterações não salvas':'Modelos salvos'}</span><button type="button" disabled={busy||!dirty} onClick={async()=>{if(await onSave(settings))setDirty(false);}} aria-label="Salvar checklists" title="Salvar checklists"><SaveActionIcon /></button></footer>
 </section>;
}

function FieldOptions({label,groupId,groups,onMove}:{label:string;groupId:string;groups:ChecklistGroup[];onMove:(id:string)=>void}){
 const id=useId(),panel=useRef<HTMLDivElement>(null);
 return <><button type="button" aria-label={label} title="Opções" popoverTarget={id} onClick={e=>{const rect=e.currentTarget.getBoundingClientRect();if(panel.current){panel.current.style.left=Math.max(8,Math.min(rect.right-260,window.innerWidth-268))+'px';panel.current.style.top=Math.max(8,Math.min(rect.bottom+6,window.innerHeight-150))+'px';}}}><MoreVertical size={16}/></button>
 <div id={id} ref={panel} popover="auto" className="checklist-field-menu"><label>Mover para grupo<select value={groupId} onChange={e=>{panel.current?.hidePopover();onMove(e.target.value);}}>{groups.map(g=><option key={g.id} value={g.id} disabled={g.id===groupId}>{g.direct?"Diretamente na etapa":g.name}</option>)}</select></label></div></>;
}

function EditableTitle({name,label,onChange}:{name:string;label:string;onChange:(name:string)=>void}){
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(name);
 const finished=useRef(false);
 function finish(cancel=false){if(finished.current)return;finished.current=true;const next=draft.trim();if(!cancel&&next&&next!==name)onChange(next);setEditing(false);}
 return <span className="checklist-editable-title" onClick={e=>e.stopPropagation()}>
 {editing?<input autoFocus aria-label={`Nome: ${label}`} title="Enter para confirmar; Esc para cancelar" maxLength={120} value={draft} onFocus={e=>e.target.select()} onChange={e=>setDraft(e.target.value)} onBlur={()=>finish()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();finish(e.key==='Escape');}}}/>:<><span>{name}</span><button type="button" aria-label={`Editar nome: ${label}`} title="Editar nome" onClick={e=>{e.preventDefault();finished.current=false;setDraft(name);setEditing(true);}}><Pencil size={12}/></button></>}
 </span>;
}

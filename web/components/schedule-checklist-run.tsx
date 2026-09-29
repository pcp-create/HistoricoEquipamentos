"use client";
import {checklistProgress,progressLabels,checklistCounts} from '@/lib/service-scheduling/checklist-progress';
import SaveActionIcon from "./save-action-icon";
import {useState,useEffect,useRef} from 'react';
import {stagesOf,groupsOf,photoLimit,fieldOptions,type ChecklistField} from '@/lib/service-scheduling/checklists';
import {apiFetch} from '@/lib/client-api-cache';
import {DictationText,SignatureInput} from './checklist-inputs';
import './schedule-checklists.css';
export default function ScheduleChecklistRun({operation,data,mutate,busy,dirty,renderActions,compact=false,readOnly=false}:any){
 const drafts=useRef<Record<string,()=>any>>({});
 const run=operation.document.checklistRun,template=run?.template||data.settings.document.checklists.find((c:any)=>c.id===operation.document.checklistId);
 if(!template)return null;
 const canWork=data.canEditSettings||operation.document.responsible===data.email||operation.document.support.includes(data.email);
 const locked=readOnly||busy||dirty||['completed','reviewed','awaiting_review'].includes(operation.status);
 return <section className="checklist-run"><h4>{template.prefix?template.prefix+' — ':''}{template.name}</h4>{compact?<details className="checklist-report-context"><summary>Equipamento e orientações</summary><p>{data.detail?.order?.equipamento||'Equipamento não informado'}</p><p>Preencha as etapas e salve antes de enviar. Fotos de até 3 MB cada.</p>{run&&canWork&&<a href={`/api/service-scheduling/checklist-pdf?operationId=${operation.id}`} target="_blank" rel="noreferrer">Gerar PDF do checklist</a>}</details>:<><p>Preencha os grupos de cada etapa. Salve o rascunho ao terminar. Depois, utilize Enviar relatório ao final do checklist. Fotos de até 3 MB cada.</p><p>Equipamento: {data.detail?.order?.equipamento||'Selecione o equipamento da OS ao registrar o horímetro.'}</p>
 {run&&canWork&&<a href={`/api/service-scheduling/checklist-pdf?operationId=${operation.id}`} target="_blank" rel="noreferrer">Gerar PDF do checklist</a>}</>}
 {stagesOf(template).map(stage=><Stage key={operation.id+':'+stage.id} stage={stage} operation={operation} data={data} mutate={mutate} locked={locked} readOnly={readOnly} canWork={canWork} register={(id:string,get:any)=>{if(get)drafts.current[id]=get;else delete drafts.current[id];}}/>)}
 {renderActions?.(()=>mutate({action:'report_save',operationId:operation.id,version:operation.version,stages:Object.values(drafts.current).map(get=>get()).filter(Boolean)}),()=>Object.values(drafts.current).map(get=>get()).filter(Boolean))}
 </section>;
}
function Progress({fields,answers}: {fields:ChecklistField[],answers:Record<string,any>}) {
 const status=checklistProgress(fields,answers);
 return <span className={'checklist-progress checklist-progress-'+status} role="img" aria-label={progressLabels[status]} title={progressLabels[status]}/>;
}
function Stage({stage,operation,data,mutate,locked,readOnly,canWork,register}:any){
 const run=operation.document.checklistRun,saved=run?.stages[stage.id]||{status:'pending',answers:{}};
 const [answers,setAnswers]=useState<Record<string,any>>(saved.answers),[details,setDetails]=useState<Record<string,any>>(saved.details||{}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const equipment=data.detail?.equipment_links||[];
 const [equipmentId,setEquipmentId]=useState(run?.equipmentId||(equipment.length===1?String(equipment[0].equipment_id):''));
 const [meterDate,setMeterDate]=useState(run?.meterDate||new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}));
 useEffect(()=>{setAnswers(saved.answers);setDetails(saved.details||{});},[JSON.stringify(saved)]);
 useEffect(()=>{register(stage.id,()=>saved.status==='released'?{stageId:stage.id,answers,details,equipmentId,meterDate}:null);return()=>register(stage.id,null);});
 const edited=JSON.stringify(answers)!==JSON.stringify(saved.answers)||JSON.stringify(details)!==JSON.stringify(saved.details||{});
 const disabled=locked||busy||!canWork||saved.status!=='released';
 const answer=(id:string,v:any)=>setAnswers(a=>({...a,[id]:v}));
 const detail=(id:string,key:string,v:any)=>setDetails(d=>({...d,[id]:{...d[id],[key]:v}}));
 async function act(action:string){setError('');setBusy(true);try{await mutate({action,operationId:operation.id,version:operation.version,stageId:stage.id,answers,details,equipmentId,meterDate});}finally{setBusy(false);}}
 async function upload(f:ChecklistField,files:File[],extra=false){if(!files.length)return;setError('');setBusy(true);let ids=[...((extra?details[f.id]?.photos:answers[f.id])||[])];try{
  const limit=!extra&&f.type==='signature'?1:photoLimit(f);
  if(ids.length+files.length>limit)throw Error(`Este campo permite até ${limit} ${f.type==='signature'&&!extra?'assinatura':'fotos'}.`);
  for(const file of files){if(file.size>3*1024*1024)throw Error('Cada imagem deve ter no máximo 3 MB.');const form=new FormData();form.set('file',file);form.set('operationId',operation.id);form.set('stageId',stage.id);form.set('fieldId',f.id);const res=await apiFetch('/api/service-scheduling/photos',{method:'POST',body:form});const b=await res.json();if(!res.ok)throw Error(b.error);ids.push(b.id);if(extra)detail(f.id,'photos',[...ids]);else answer(f.id,[...ids]);}
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function photos(f:ChecklistField,extra=false){const ids=extra?details[f.id]?.photos||[]:answers[f.id]||[];return <div className="checklist-photo-input"><label className="checklist-answer">{extra?'Fotos — '+f.label:'Selecionar fotos'}<input aria-label={`Selecionar fotos: ${f.label}`} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{void upload(f,Array.from(e.target.files||[]),extra);e.target.value='';}}/></label><small>Selecione várias fotos de uma vez · {ids.length}/{photoLimit(f)}</small><div className="checklist-photos">{ids.map((id:string)=><div key={id}><a target="_blank" rel="noreferrer" href={'/api/service-scheduling/photos/'+id}><img src={'/api/service-scheduling/photos/'+id} alt={f.label}/></a><button type="button" className="checklist-photo-remove" aria-label="Remover foto" title="Remover foto" onClick={()=>extra?detail(f.id,'photos',ids.filter((x:string)=>x!==id)):answer(f.id,ids.filter((x:string)=>x!==id))}><span aria-hidden="true">×</span></button></div>)}</div></div>;}
 const groups=groupsOf(stage);
 const count={filled:groups.filter(g=>g.fields.length>0&&checklistCounts(g.fields,answers).filled===g.fields.length).length,total:groups.length};
 return <details className="checklist-stage-response"><summary><span className="checklist-summary-title">{stage.name} <small className="checklist-stage-count" aria-label={`${count.filled} de ${count.total} grupos concluídos`}>({count.filled}/{count.total})</small></span><span className="checklist-stage-status">{{pending:'Não liberada',released:'Em preenchimento',submitted:'Enviada'}[saved.status as string]}{edited?' · Não salvo':''}</span><Progress fields={groupsOf(stage).flatMap(g=>g.fields)} answers={answers}/></summary>
 {saved.status==='pending'?<p>Esta etapa ainda não foi liberada para preenchimento.</p>:<fieldset disabled={disabled}>
 {groups.map(group=>{const itemCount=checklistCounts(group.fields,answers);const Container=group.direct?'div':'details';return <Container className={group.direct?'checklist-direct-fields':'checklist-response-group'} key={group.id}>{!group.direct&&<summary><span className="checklist-summary-title">{group.name} <small className="checklist-stage-count" aria-label={`${itemCount.filled} de ${itemCount.total} itens preenchidos`}>({itemCount.filled}/{itemCount.total})</small></span><Progress fields={group.fields} answers={answers}/></summary>}<div className="checklist-answers">{group.fields.map(f=>{
 const v=answers[f.id]??'',label=f.label+(f.required?' *':'');
 return <div key={f.id} className={['textarea','photo','signature'].includes(f.type)||f.comment||f.internalNote||photoLimit(f)>0?'checklist-answer-wide':''}>
 {f.type==='textarea'?<><span className="checklist-field-title">{label}</span><DictationText label={label} value={v} disabled={disabled} onChange={s=>answer(f.id,s)}/></>:
 f.type==='signature'?<><span className="checklist-field-title">{label}</span><SignatureInput label={label} ids={answers[f.id]||[]} disabled={disabled} onClear={()=>answer(f.id,[])} onUpload={file=>upload(f,[file])}/></>:
 f.type==='photo'?<><span className="checklist-field-title">{label}</span>{photos(f)}</>:
 f.type==='flag'?<div className="checklist-status-field"><span className="checklist-field-title">{label}</span><div className="checklist-status-options" role="radiogroup" aria-label={label}>{fieldOptions(f).map(option=><label key={option} className={'checklist-status-option'+(v===option?' selected':'')}><input type="radio" name={operation.id+':'+stage.id+':'+f.id} value={option} checked={v===option} disabled={disabled} onChange={()=>answer(f.id,option)}/><span>{option}</span></label>)}</div></div>:
 <label className="checklist-answer">{label}{f.type==='select'?<select value={v} onChange={e=>answer(f.id,e.target.value)}><option value="">Selecione</option>{fieldOptions(f).map(x=><option key={x} value={x}>{x}</option>)}</select>:<input type={f.type==='number'||f.type==='meter'?'number':f.type==='date'||f.type==='time'?f.type:'text'} min={f.type==='meter'?0:undefined} step={f.type==='number'||f.type==='meter'?'any':undefined} value={v} onChange={e=>answer(f.id,(f.type==='number'||f.type==='meter')&&e.target.value!==''?Number(e.target.value):e.target.value)}/>}</label>}
 {f.type==='meter'&&<><label className="checklist-answer">Equipamento da OS<select className="checklist-equipment-select" value={equipmentId} disabled={disabled||!!run?.equipmentId} onChange={e=>setEquipmentId(e.target.value)}><option value="">Selecione o equipamento</option>{equipment.map((e:any)=><option key={e.equipment_id} value={String(e.equipment_id)}>{e.name} · {e.serial||'Sem série'}</option>)}</select></label><label className="checklist-answer">Data da leitura<input type="date" value={meterDate} onChange={e=>setMeterDate(e.target.value)}/></label><small>A leitura atualiza o equipamento e a preventiva configurada somente após a revisão do relatório. {equipment.length===0?'Vincule primeiro um equipamento à OS.':''}</small></>}
 {f.type!=='photo'&&photoLimit(f)>0&&photos(f,true)}
 {f.comment&&<div className="checklist-field-extra"><span>Comentário</span><DictationText label={'Comentário — '+f.label} value={details[f.id]?.comment||''} disabled={disabled} onChange={s=>detail(f.id,'comment',s)}/></div>}
 {f.internalNote&&<div className="checklist-field-extra"><span>Observação interna · Não aparece no PDF</span><DictationText label={'Observação interna — '+f.label} value={details[f.id]?.internalNote||''} disabled={disabled} onChange={s=>detail(f.id,'internalNote',s)}/></div>}
 </div>;
 })}</div></Container>;})}
 </fieldset>}
 {error&&<p role="alert">{error}</p>}
 <div className="checklist-toolbar">{saved.status==='pending'&&data.canEditSettings&&<button type="button" disabled={locked||busy} onClick={()=>void act('checklist_release')}>Liberar etapa para o técnico</button>}{!readOnly&&saved.status==='released'&&canWork&&<><button type="button" disabled={disabled} onClick={()=>void act('checklist_save')} aria-label="Salvar rascunho da etapa" title="Salvar rascunho da etapa"><SaveActionIcon /></button></>}{saved.status==='submitted'&&data.canEditSettings&&<button type="button" disabled={locked||busy} onClick={()=>void act('checklist_reopen')}>Reabrir para correção</button>}</div>
 </details>;
}

"use client";
import {operationMeterEquipment,unlinkedMeterMessage} from "@/lib/service-scheduling/meter-equipment";
import {useChecklistDraft} from './use-checklist-draft';
import {reportDraftKey,reportDraftSignature} from '@/lib/service-scheduling/report-draft';
import {uploadReportPhoto} from "@/lib/upload-report-photo";
import {nativePortal} from "@/lib/native-portal";
import RequiredMarker from "./required-marker";
import ReportPhotoPicker from "./report-photo-picker";
import EquipmentMeterReference from "./equipment-meter-reference";
import {prepareReportPhoto} from "@/lib/prepare-report-photo";
import {checklistProgress,progressLabels,checklistCounts} from '@/lib/service-scheduling/checklist-progress';
import { ChevronRight, Plus, Minus } from "lucide-react";
import SaveActionIcon from "./save-action-icon";
import {useState,useEffect,useRef,useId} from 'react';
import {validateAnswers,validateFieldDetails,validateAlertComments,hasAlertComment,requiresAlertComment,stagesOf,groupsOf,photoLimit,isStatusField,fieldOptions,type ChecklistField} from '@/lib/service-scheduling/checklists';
import {apiFetch} from '@/lib/client-api-cache';
import {DictationText,SignatureInput} from './checklist-inputs';
import './schedule-checklists.css';
function scrollOpenedChecklist(event:React.SyntheticEvent<HTMLElement>) {
  if(event.target!==event.currentTarget)return;

  const block=event.currentTarget as HTMLDetailsElement;
  if(!block.open)return;
  requestAnimationFrame(()=>{
    if(!block.open||!block.isConnected)return;
    const screen=block.closest(".field-report-screen");
    const header=screen?.querySelector(".field-report-header");
    if(screen&&header){
      const top=block.getBoundingClientRect().top-header.getBoundingClientRect().bottom-8;
      screen.scrollBy({top,behavior:"smooth"});
    }else block.scrollIntoView({block:"start",behavior:"smooth"});
  });

}
export default function ScheduleChecklistRun({operation,data,mutate,busy,dirty,renderActions,compact=false,readOnly=false}:any){
 const drafts=useRef<Record<string,{get:()=>any;beginSave:(snapshot:any)=>void}>>({});
 const [pendingStages,setPendingStages]=useState<Record<string,boolean>>({}),[isSaving,setIsSaving]=useState(false);
 const [completeStages,setCompleteStages]=useState<Record<string,boolean>>({});
 const hasPending=Object.values(pendingStages).some(Boolean);
 const stageAccordionName=useId();
 const section=useRef<HTMLElement>(null);
 const latest=useRef<any>({});latest.current={operation,data,mutate,busy,dirty,readOnly,renderActions};
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),saving=useRef<Promise<any>|null>(null);
 const [autoStatus,setAutoStatus]=useState('');
 function collect(changedOnly=false){return Object.values(drafts.current).map(({get})=>get()).filter(d=>d&&(!changedOnly||d.changed)).map(({changed,...payload}:any)=>payload);}
 async function saveReport(automatic=false):Promise<any>{
  if(saving.current){await saving.current;return automatic?false:saveReport(false);}
  const current=latest.current;
  if(current.busy||current.dirty||current.readOnly||!current.renderActions)return false;
  const stages=collect(true);if(!stages.length)return true;
  if(automatic)setAutoStatus('Salvando rascunho automaticamente…');
  for(const stage of stages)drafts.current[stage.stageId]?.beginSave(stage);
  setIsSaving(true);
  const pending=Promise.resolve(current.mutate({action:'report_save',operationId:current.operation.id,version:current.operation.version,stages},{background:automatic}));saving.current=pending;
  try{const result=await pending;if(automatic)setAutoStatus(result===false?'Rascunho mantido no aparelho. Use Salvar para tentar novamente.':'Rascunho salvo automaticamente.');return result;}
  catch{setAutoStatus('Rascunho mantido no aparelho. Use Salvar para tentar novamente.');return false;}
  finally{saving.current=null;setIsSaving(false);}
 }
 function autoSave(){
  if(!latest.current.renderActions)return;
  if(timer.current)clearTimeout(timer.current);
  timer.current=setTimeout(()=>{timer.current=null;if(latest.current.busy||saving.current){autoSave();return;}void saveReport(true);},350);
 }
 useEffect(()=>{const element=section.current;if(!element)return;const toggle=()=>autoSave();element.addEventListener('toggle',toggle,true);return()=>element.removeEventListener('toggle',toggle,true);});
 useEffect(()=>{const flush=()=>autoSave();window.addEventListener('rj-report-persist',flush);return()=>{window.removeEventListener('rj-report-persist',flush);if(timer.current)clearTimeout(timer.current);};},[operation.id]);

 const run=operation.document.checklistRun,template=run?.template||data.settings.document.checklists.find((c:any)=>c.id===operation.document.checklistId);
 if(!template)return null;
 const canWork=data.canEditSettings||operation.document.responsible===data.email||operation.document.support.includes(data.email);
 const locked=readOnly||busy||dirty||['completed','reviewed','awaiting_review'].includes(operation.status);
 return <section ref={section} className="checklist-run"><h4>{template.prefix?template.prefix+' — ':''}{template.name}</h4>{compact?null:<><p>Preencha os grupos de cada etapa. O rascunho é preservado neste aparelho durante o preenchimento. Depois, utilize Enviar relatório ao final do checklist. Fotos de até 20 MB cada, reduzidas automaticamente antes do envio.</p><p>Equipamento: {operation.document.equipment?.name||data.detail?.order?.equipamento||'Selecione o equipamento da OS ao registrar o horímetro.'}</p>
 {run&&canWork&&['reviewed','completed'].includes(operation.status)&&<a href={`/api/service-scheduling/checklist-pdf?operationId=${operation.id}`} target="_blank" rel="noreferrer">Gerar PDF do checklist</a>}</>}
 {stagesOf(template).map(stage=><Stage key={operation.id+':'+stage.id+':'+(run?.reportReturnedAt||'')} stageAccordionName={stageAccordionName} draftContext={reportDraftSignature({template:template.id,stage,returned:run?.reportReturnedAt||'',checklistId:operation.document.checklistId})} stage={stage} operation={operation} data={data} mutate={mutate} locked={locked} readOnly={readOnly} canWork={canWork} showStageSave={!renderActions} onCompleteChange={(id:string,complete:boolean)=>setCompleteStages(previous=>previous[id]===complete?previous:{...previous,[id]:complete})} onPendingChange={(id:string,changed:boolean)=>setPendingStages(previous=>previous[id]===changed?previous:{...previous,[id]:changed})} register={(id:string,get:any,beginSave:any)=>{if(get)drafts.current[id]={get,beginSave};else delete drafts.current[id];}}/>)}
 {autoStatus&&<p className="checklist-autosave-status" role="status">{autoStatus}</p>}
 {renderActions?.(()=>saveReport(false),()=>collect(),{pending:hasPending,saving:isSaving,complete:stagesOf(template).every(stage=>completeStages[stage.id]),waitForSave:async()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}if(saving.current)await saving.current;}})}
 </section>;
}
function Progress({fields,answers,details}: {fields:ChecklistField[],answers:Record<string,any>,details:Record<string,any>}) {
 const status=checklistProgress(fields,answers,details);
 return <span className={'checklist-progress checklist-progress-'+status} role="img" aria-label={progressLabels[status]} title={progressLabels[status]}/>;
}
function Stage({draftContext,stageAccordionName,stage,operation,data,mutate,locked,readOnly,canWork,showStageSave,register,onPendingChange,onCompleteChange}:any){
 const groupAccordionName=useId();
 const run=operation.document.checklistRun,saved=run?.stages[stage.id]||{status:'pending',answers:{}};
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const equipment=data.detail?.equipment_links||[];
 const collectsMeter=!!operationMeterEquipment(operation.document);
 const savedEquipment=collectsMeter?String(run?.equipmentId||operationMeterEquipment(operation.document)):'';
 const savedMeterDate=run?.meterDate||new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
 const draft=useChecklistDraft(data.email?reportDraftKey(data.email,operation.id,stage.id):'',draftContext,{answers:saved.answers||{},details:saved.details||{},equipmentId:savedEquipment,meterDate:savedMeterDate},!readOnly&&canWork&&saved.status==='released'&&!['completed','reviewed','awaiting_review'].includes(operation.status));
 const {answers,details,equipmentId,meterDate}=draft.value;
 const setEquipmentId=(equipmentId:string)=>draft.update({equipmentId});
 const setMeterDate=(meterDate:string)=>draft.update({meterDate});
 const selectedEquipment=equipment.find((e:any)=>String(e.equipment_id)===String(equipmentId));
 const equipmentDescription=selectedEquipment
  ? String(selectedEquipment.equipment_id)+' - '+selectedEquipment.name+(selectedEquipment.serial&&!String(selectedEquipment.name).includes(String(selectedEquipment.serial))?' - SÉRIE '+selectedEquipment.serial:'')
  : operation.document.equipment?.name||data.detail?.order?.equipamento||equipmentId;

 useEffect(()=>{register(stage.id,()=>saved.status==='released'?{stageId:stage.id,...draft.current.current,changed:draft.changed}:null,(snapshot:any)=>{const {stageId,...value}=snapshot;draft.beginSave(value);});return()=>register(stage.id,null);});
 const edited=draft.changed;
 let complete=saved.status!=='pending';
 try{validateAnswers(stage,answers,true);validateFieldDetails(stage,details);validateAlertComments(stage,answers,details);
 if(groupsOf(stage).some(group=>group.fields.some(field=>field.type==='meter'&&answers[field.id]!=null))&&collectsMeter&&(!equipmentId||!meterDate))complete=false;
 }catch{complete=false;}
 useEffect(()=>{onCompleteChange(stage.id,complete);},[stage.id,complete]);
 useEffect(()=>{onPendingChange(stage.id,saved.status==='released'&&edited);},[stage.id,edited,saved.status]);
 useEffect(()=>()=>onPendingChange(stage.id,false),[stage.id]);
 const disabled=locked||busy||!canWork||saved.status!=='released';
 const answer=(id:string,v:any)=>draft.update({answers:{...draft.current.current.answers,[id]:v}});
 const detail=(id:string,key:string,v:any)=>draft.update({details:{...draft.current.current.details,[id]:{...draft.current.current.details[id],[key]:v}}});
 async function act(action:string){setError('');setBusy(true);try{await mutate({action,operationId:operation.id,version:operation.version,stageId:stage.id,answers,details,equipmentId,meterDate});}finally{setBusy(false);}}
 async function upload(f:ChecklistField,files:File[],extra=false){if(!files.length)return;setError('');setBusy(true);let ids=f.type==='signature'&&!extra?[]:[...((extra?details[f.id]?.photos:answers[f.id])||[])];try{
  const limit=!extra&&f.type==='signature'?1:photoLimit(f);
  if(ids.length+files.length>limit)throw Error(`Este campo permite até ${limit} ${f.type==='signature'&&!extra?'assinatura':'fotos'}.`);
  const failures:string[]=[];
  for(const file of files){
   try{
    const form=new FormData();form.set('file',await prepareReportPhoto(file));form.set('operationId',operation.id);form.set('stageId',stage.id);form.set('fieldId',f.id);
    ids.push(await uploadReportPhoto(form,apiFetch,!nativePortal()));
    if(extra)detail(f.id,'photos',[...ids]);else answer(f.id,[...ids]);
   }catch(e){failures.push(`${file.name}: ${(e as Error).message}`);}
  }
  if(failures.length)throw Error(failures.join(' '));
  return true;
 }catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}}
 function photos(f:ChecklistField,extra=false){const ids=extra?details[f.id]?.photos||[]:answers[f.id]||[];return <div className="checklist-photo-input"><ReportPhotoPicker label={f.label} requiredMissing={ids.length===0&&((!extra&&f.type==='photo'&&!!f.required)||(extra&&isStatusField(f.type)&&String(answers[f.id]).trim().toUpperCase()==='NOK'))} disabled={disabled} onSelect={files=>void upload(f,files,extra)}/><small>Selecione várias fotos de uma vez · {ids.length}/{photoLimit(f)}</small><div className="checklist-photos">{ids.map((id:string)=><div key={id}><a target="_blank" rel="noreferrer" href={'/api/service-scheduling/photos/'+id}><img src={'/api/service-scheduling/photos/'+id} alt={f.label}/></a><button type="button" className="checklist-photo-remove" aria-label="Remover foto" title="Remover foto" onClick={()=>extra?detail(f.id,'photos',ids.filter((x:string)=>x!==id)):answer(f.id,ids.filter((x:string)=>x!==id))}><span aria-hidden="true">×</span></button></div>)}</div></div>;}
 const groups=groupsOf(stage);
 const count={filled:groups.filter(g=>g.fields.length>0&&checklistCounts(g.fields,answers).filled===g.fields.length).length,total:groups.length};
 return <details name={stageAccordionName} onToggle={scrollOpenedChecklist} className="checklist-stage-response"><summary><ChevronRight className="checklist-stage-toggle" size={17} aria-hidden="true"/><span className="checklist-summary-title">{stage.name} <small className="checklist-stage-count" aria-label={`${count.filled} de ${count.total} grupos concluídos`}>({count.filled}/{count.total})</small>{edited&&<span className="checklist-unsaved-inline"><span aria-hidden="true"> · </span>Não salvo</span>}</span><Progress fields={groupsOf(stage).flatMap(g=>g.fields)} answers={answers} details={details}/></summary>
 {saved.status==='pending'?<p>Esta etapa ainda não foi liberada para preenchimento.</p>:<div className="checklist-stage-groups">
 {groups.map(group=>{const itemCount=checklistCounts(group.fields,answers);const Container=group.direct?'div':'details';return <Container {...(!group.direct ? {name:groupAccordionName, onToggle:scrollOpenedChecklist} : {})} className={group.direct?'checklist-direct-fields':'checklist-response-group'} key={group.id}>{!group.direct&&<summary key="group-heading"><span className="checklist-group-toggle" aria-hidden="true"><Plus className="checklist-group-plus" size={14}/><Minus className="checklist-group-minus" size={14}/></span><span className="checklist-summary-title">{group.name} <small className="checklist-stage-count" aria-label={`${itemCount.filled} de ${itemCount.total} itens preenchidos`}>({itemCount.filled}/{itemCount.total})</small></span><Progress fields={group.fields} answers={answers} details={details}/></summary>}<fieldset key="group-fields" className="checklist-answers" disabled={disabled}>{group.fields.map(f=>{
 const v=answers[f.id]??'',label=f.label+(f.required?' *':''),fieldLabel=<>{f.label}{f.required&&<> <RequiredMarker/></>}</>;
 return <div key={f.id} className={['textarea','photo','signature'].includes(f.type)||f.comment||f.internalNote||photoLimit(f)>0?'checklist-answer-wide':''}>
 {f.type==='textarea'?<><span className="checklist-field-title">{fieldLabel}</span><DictationText label={label} value={v} disabled={disabled} onChange={s=>answer(f.id,s)}/></>:
 f.type==='signature'?<><span className="checklist-field-title">{fieldLabel}</span><SignatureInput label={label} ids={answers[f.id]||[]} disabled={disabled} onClear={()=>answer(f.id,[])} onUpload={file=>upload(f,[file])}/></>:
 f.type==='photo'?<><span className="checklist-field-title">{fieldLabel}</span>{photos(f)}</>:
 isStatusField(f.type)?<div className="checklist-status-field"><span className="checklist-field-title">{fieldLabel}</span><div className="checklist-status-options" role="radiogroup" aria-label={label}>{fieldOptions(f).map(option=><label key={option} className={'checklist-status-option'+(v===option?' selected':'')+(v===option&&requiresAlertComment(f,option)?' status-alert-selected':'')}><input type="radio" name={operation.id+':'+stage.id+':'+f.id} value={option} checked={v===option} disabled={disabled} onChange={()=>answer(f.id,option)}/><span>{option}</span></label>)}</div></div>:
 <label className="checklist-answer">{fieldLabel}{f.type==='select'?<select value={v} onChange={e=>answer(f.id,e.target.value)}><option value="">Selecione</option>{fieldOptions(f).map(x=><option key={x} value={x}>{x}</option>)}</select>:<input type={f.type==='number'||f.type==='meter'?'number':f.type==='date'||f.type==='time'?f.type:'text'} min={f.type==='meter'?0:undefined} step={f.type==='number'||f.type==='meter'?'any':undefined} value={v} onChange={e=>answer(f.id,(f.type==='number'||f.type==='meter')&&e.target.value!==''?Number(e.target.value):e.target.value)}/>}</label>}
 {f.type==='meter'&&!collectsMeter&&<small className="checklist-meter-note">{unlinkedMeterMessage}</small>}
 {f.type==='meter'&&collectsMeter&&<>
 <EquipmentMeterReference equipmentId={equipmentId}/>
 <small className="checklist-meter-note">{equipmentId
  ? 'A leitura de horímetro será atualizada ao equipamento '+equipmentDescription+'.'
  : equipment.length ? 'Selecione o equipamento que receberá a leitura de horímetro.' : 'Vincule um equipamento à OS para registrar a leitura de horímetro.'}</small>
 {!run?.equipmentId&&(equipment.length>1||operation.document.equipmentUnassigned)&&equipment.length>0&&<label className="checklist-answer">Equipamento que receberá a leitura<select className="checklist-equipment-select" value={equipmentId} disabled={disabled} onChange={e=>setEquipmentId(e.target.value)}><option value="">Selecione o equipamento</option>{equipment.map((e:any)=><option key={e.equipment_id} value={String(e.equipment_id)}>{e.name} · {e.serial||'Sem série'}</option>)}</select></label>}
 <label className="checklist-answer">Data da leitura<input type="date" value={meterDate} onChange={e=>setMeterDate(e.target.value)}/></label>
 <small className="checklist-meter-note">A atualização do equipamento e da preventiva ocorre após a revisão do relatório.</small>
 </>}
 {String(v).trim().toUpperCase()==='NOK'&&isStatusField(f.type)&&<p role="note">Foto obrigatória do item a substituir. Informe no comentário qual item deve ser trocado e a referência, se houver.</p>}
 {f.type!=='photo'&&photoLimit(f)>0&&photos(f,true)}
 {(f.comment||hasAlertComment(f))&&<div className="checklist-field-extra"><span>Comentário{requiresAlertComment(f,v)&&<> <RequiredMarker/></>}</span><DictationText required={requiresAlertComment(f,v)} label={'Comentário — '+f.label} value={details[f.id]?.comment||''} disabled={disabled} onChange={s=>detail(f.id,'comment',s)}/></div>}
 {f.internalNote&&<div className="checklist-field-extra"><span>Observação interna · Somente no relatório de orçamento</span><DictationText label={'Observação interna — '+f.label} value={details[f.id]?.internalNote||''} disabled={disabled} onChange={s=>detail(f.id,'internalNote',s)}/></div>}
 </div>;
 })}</fieldset></Container>;})}
 </div>}
 {draft.storageError&&<p role="alert">{draft.storageError}</p>}
 {error&&<p role="alert">{error}</p>}
 <div className="checklist-toolbar">{saved.status==='pending'&&data.canEditSettings&&<button type="button" disabled={locked||busy} onClick={()=>void act('checklist_release')}>Liberar etapa para o técnico</button>}{showStageSave&&edited&&!readOnly&&saved.status==='released'&&canWork&&<><button type="button" disabled={disabled} onClick={()=>void act('checklist_save')} aria-label="Salvar rascunho da etapa" title="Salvar rascunho da etapa"><SaveActionIcon /></button></>}{saved.status==='submitted'&&data.canEditSettings&&<button type="button" disabled={locked||busy} onClick={()=>void act('checklist_reopen')}>Reabrir para correção</button>}</div>
 </details>;
}

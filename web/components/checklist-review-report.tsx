"use client";
import {useState,useEffect,useRef} from 'react';
import {stagesOf} from '@/lib/service-scheduling/checklists';
import ReviewChecklistField,{ReviewFlags} from './review-checklist-field';
import { reportFieldValue } from "@/lib/service-scheduling/checklist-report";
import { technicalReport } from "@/lib/service-scheduling/technical-report";
import { operationNumber } from "@/lib/service-scheduling/operation-number";
export default function ChecklistReviewReport({ operation, data, busy=false, disabled=false, mutate, onDirtyChange }: any) {
  const savedRun=operation.document.checklistRun;
  const [draft,setDraft]=useState<any>(null),[uploads,setUploads]=useState(0);
  const draftRef=useRef<any>(null),uploadCount=useRef(0);
  const editable=!!mutate&&data.canEditSettings&&operation.status==='awaiting_review';
  const run=draft||savedRun;
  const edited=!!draft&&JSON.stringify(draft)!==JSON.stringify(savedRun);
  useEffect(()=>{setDraft(null);draftRef.current=null;onDirtyChange?.(false);},[operation.version]);
  function change(stageId:string,fieldId:string,key:string,value:any){
    const next=structuredClone(draftRef.current||savedRun),stage=next.stages[stageId];
    if(key==='meterDate')next.meterDate=value;
    else if(key==='value')stage.answers={...stage.answers,[fieldId]:value};
    else stage.details={...stage.details,[fieldId]:{...stage.details?.[fieldId],[key]:value}};
    draftRef.current=next;setDraft(next);onDirtyChange?.(JSON.stringify(next)!==JSON.stringify(savedRun)||uploads>0);
  }
  function uploading(active:boolean){uploadCount.current+=active?1:-1;setUploads(uploadCount.current);onDirtyChange?.(uploadCount.current>0||!!draftRef.current);}
  async function save(){
    const stages=stagesOf(run.template).filter(stage=>JSON.stringify(run.stages[stage.id])!==JSON.stringify(savedRun.stages[stage.id])||run.meterDate!==savedRun.meterDate&&stage.fields.some(f=>f.type==='meter')).map(stage=>({stageId:stage.id,answers:run.stages[stage.id].answers,details:run.stages[stage.id].details||{},equipmentId:run.equipmentId,meterDate:run.meterDate}));
    if(await mutate({action:'checklist_review_save',operationId:operation.id,version:operation.version,stages})){setDraft(null);draftRef.current=null;onDirtyChange?.(false);}
  }
  if (!run) return <p>O relatório desta operação ainda não foi preenchido.</p>;
  const report = technicalReport({...operation,document:{...operation.document,checklistRun:run}}, data.detail?.order || {}, data.users || [], data.fieldSessions || [], data.fieldEvents || [], data.events || []);
  return <article className="checklist-review-report">
    {editable&&<div className="review-edit-toolbar"><span>{edited?'Alterações não salvas':'Corrija os campos abaixo e salve antes de concluir a revisão.'}</span><button type="button" disabled={busy||disabled||!edited||uploads>0} onClick={()=>void save()}>Salvar correções</button>{edited&&<button type="button" disabled={busy||uploads>0} onClick={()=>{setDraft(null);draftRef.current=null;onDirtyChange?.(false);}}>Descartar alterações</button>}</div>}
    <header className="technical-report-banner">
      <img src="/logo-rj.png" alt="RJ Compressores"/>
      <div><h3>RELATÓRIO TÉCNICO</h3><p>{run.template.name}</p></div>
      <div className="technical-report-order"><span>OS Nº</span><strong>{data.detail?.order?.numero_sequencia || data.schedule.order_id}/{operationNumber(operation.position)}</strong></div>
    </header>
    {report.map(stage => <section key={stage.id} className="review-report-stage">
      <h4><span className="technical-report-number">{stage.number}</span>{stage.name}</h4>
      {stage.groups.map((group, index) => <section key={index} className="review-report-group">
        {group.name && <h5>{group.name}</h5>}
        {stage.id==='events'&&!group.name ? <table className="review-report-time-table">
          <thead><tr><th scope="col">Data e hora</th><th scope="col">Apontamento</th><th scope="col">Responsável</th></tr></thead>
          <tbody>{group.fields.map(field=><tr key={field.id}><td>{field.label}</td><td>{reportFieldValue(field)}</td><td>{field.responsible||'—'}</td></tr>)}</tbody>
        </table> : <dl>{group.fields.map(field => {
          const definition=stagesOf(run.template).find(s=>s.id===stage.id)?.fields.find(f=>f.id===field.id);
          return <div key={field.id} className="review-report-row">
          <dt>{field.label}</dt>
          <dd>{editable&&definition?<ReviewChecklistField field={definition} value={run.stages[stage.id]?.answers?.[field.id]} details={run.stages[stage.id]?.details?.[field.id]||{}} disabled={busy||disabled} operationId={operation.id} stageId={stage.id} meterDate={run.meterDate} onUploading={uploading} onValue={(v:any)=>change(stage.id,field.id,'value',v)} onDetail={(key:string,v:any)=>change(stage.id,field.id,key,v)} onMeterDate={(v:string)=>change(stage.id,field.id,'meterDate',v)}/>:<>
            {field.options?<ReviewFlags label={field.label} options={field.options} value={field.value}/>:<span>{reportFieldValue(field)}</span>}
            {field.comment && <p className="review-report-comment"><strong>Comentário:</strong> {field.comment}</p>}
            {field.photos.length > 0 && <div className="review-report-photos">{field.photos.map((id: string, index: number) => <a key={`${id}-${index}`} href={`/api/service-scheduling/photos/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer" aria-label={`Abrir ${field.type === "signature" ? "assinatura" : "foto"} de ${field.label}`}><img src={`/api/service-scheduling/photos/${encodeURIComponent(id)}`} alt={`${field.label} — ${index + 1}`} loading="lazy"/></a>)}</div>}
          </>}</dd>
        </div>;})}</dl>}
      </section>)}
    </section>)}
    <footer className="technical-report-end"><strong>RJ Compressores</strong><span>Relatório técnico · Gestão Integrada</span></footer>
  </article>;
}

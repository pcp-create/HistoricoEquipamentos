'use client';
import {useEffect,useState} from 'react';
import {stageOptions} from '@/lib/workshop/model';
import {workshopStageTime,stageDuration} from '@/lib/workshop/stage-time';
export default function WorkshopStageTime({visit,detail=false}:{visit:any;detail?:boolean}){
 const [now,setNow]=useState(()=>Date.now());useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(t);},[]);
 const timing=workshopStageTime(visit,now),automatic=visit.effective_stage==='parts'&&visit.stage!=='parts',options=stageOptions(visit.source);
 if(!detail)return <small className="ws-stage-time" title="Soma dos períodos registrados nesta etapa, incluindo retornos.">{automatic?'Etapa manual acumulada':'Acumulado na etapa'}: {timing.currentSince===null&&!timing.currentMs?'Sem histórico suficiente':stageDuration(timing.currentMs)}</small>;
 return <section className="ws-stage-durations"><h3>Tempo acumulado por etapa</h3><p>Os retornos à mesma etapa são somados. O tempo total na oficina continua desde a entrada.</p>{automatic&&<p>Aguardando peça é um sinal da OS. Os tempos abaixo acompanham as etapas registradas na ficha.</p>}<dl>{options.filter(s=>(timing.totals[s.id]||0)>0||s.id===visit.stage).map(s=><div key={s.id}><dt>{s.label}{s.id===visit.stage&&<small>Etapa atual{timing.currentSince!==null?' · desde '+new Date(timing.currentSince).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):''}</small>}</dt><dd>{timing.totals[s.id]?stageDuration(timing.totals[s.id]):'Sem período registrado'}</dd></div>)}</dl>{timing.unknownMs>0&&<p className="ws-helper">Período sem etapa comprovada: {stageDuration(timing.unknownMs)}. A planilha informa a situação, mas não a data de cada mudança; esse período não foi atribuído a uma etapa.</p>}</section>;
}

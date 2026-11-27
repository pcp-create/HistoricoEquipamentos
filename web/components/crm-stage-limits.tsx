'use client';
import {useEffect,useState} from 'react';
import {Save} from 'lucide-react';
import {crmApi} from './crm-api';
import ActionNotice from './action-notice';
import {crmStageDefinitions,type StageLimits} from '../lib/crm/stage-limits';
type Field={value:string;unit:string};
function fieldsFor(limits:StageLimits) {
 return Object.fromEntries(Object.entries(limits).map(([key,minutes])=>{
  const unit=minutes%1440===0?'1440':minutes%60===0?'60':'1';
  return [key,{value:String(minutes/Number(unit)),unit}];
 }));
}
export default function CrmStageLimits() {
 const [data,setData]=useState<{limits:StageLimits;version:number}|null>(null);
 const [fields,setFields]=useState<Record<string,Field>>({});
 const [error,setError]=useState(''),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false);
 async function load() {const result=await crmApi('?stageLimits=1');setData(result);setFields(fieldsFor(result.limits));setError('');}
 useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
 function change(key:string,part:Partial<Field>) {
  setSaved(false);setFields(old=>({...old,[key]:{...(old[key]||{value:'',unit:'60'}),...part}}));
 }
 async function save() {
  setBusy(true);setSaved(false);setError('');
  try {
   const limits=Object.fromEntries(Object.entries(fields).filter(([,f])=>f.value.trim()!=='').map(([key,f])=>[key,Number(f.value)*Number(f.unit)]));
   const result=await crmApi('',{action:'save-stage-limits',limits,version:data?.version});
   setData(result);setFields(fieldsFor(result.limits));setSaved(true);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="results-panel crm-stage-settings">
  <h2>Tempos por etapa</h2>
  <p>Defina o tempo máximo em cada etapa. A contagem usa tempo corrido, incluindo fins de semana. Deixe o campo vazio para não monitorar.</p>
  <p>Ao ultrapassar o limite, o contador e o card ficam vermelhos. O responsável recebe um aviso por WhatsApp por dia, até a mudança de etapa ou encerramento. O usuário precisa estar ativo e ter WhatsApp cadastrado.</p>
  <p>Propostas: responsável da tarefa do processo, revisor ou vendedor; em criação, autor da proposta. Oportunidades: responsável da oportunidade.</p>
  {error&&<><ActionNotice type="error" onClose={()=>setError('')}>{error}</ActionNotice><button type="button" onClick={()=>void load().catch(e=>setError(e.message))}>Recarregar configuração</button></>}
  {saved&&<p role="status">Tempos salvos.</p>}
  {!data?<p>Carregando tempos…</p>:<form onSubmit={e=>{e.preventDefault();void save();}}>
   <fieldset disabled={busy}>
   {Object.entries(crmStageDefinitions).map(([kind,stages])=><section key={kind}>
    <h3>{kind==='proposal'?'Propostas':'Oportunidades'}</h3>
    <div className="table-scroll"><table><thead><tr><th>Etapa / status</th><th>Tempo máximo</th><th>Unidade</th></tr></thead><tbody>
    {stages.map(([stage,label,active])=>{
     const key=kind+':'+stage,field=fields[key]||{value:'',unit:'60'};
     return <tr key={key}><th scope="row">{label}</th>{active?<><td><input aria-label={'Tempo máximo · '+(kind==='proposal'?'Proposta':'Oportunidade')+' · '+label} type="number" min="1" step="1" max={Math.floor(5256000/Number(field.unit))} placeholder="Sem limite" value={field.value} onChange={e=>change(key,{value:e.target.value})}/></td><td><select aria-label={'Unidade · '+kind+' · '+label} value={field.unit} onChange={e=>change(key,{unit:e.target.value})}><option value="1">Minutos</option><option value="60">Horas</option><option value="1440">Dias</option></select></td></>:<td colSpan={2}>Encerrada — sem alertas de atraso</td>}</tr>;
    })}
    </tbody></table></div>
   </section>)}
   <button className="button primary" type="submit"><Save size={16}/>{busy?'Salvando…':'Salvar tempos'}</button>
   </fieldset>
  </form>}
 </section>;
}

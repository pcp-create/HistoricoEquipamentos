"use client";
import {clearApiCache} from "@/lib/client-api-cache";
import {useEffect,useState} from 'react';
import {flowAreas} from '@/lib/service-scheduling/flow-responsibility-model';
const endpoint='/api/service-scheduling/flow-responsibilities';
async function request(body?:unknown){const r=await fetch(endpoint,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível salvar.');if(body)clearApiCache();return data;}
export function FlowAreaSelect({id,area,name}:{id:string|number;area:string;name:string}){
 const [value,setValue]=useState(area),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>setValue(area),[area]);
 return <div><select aria-label={'Responsável Status Fluxo · '+name} value={value} disabled={busy} onChange={async e=>{const next=e.target.value;setBusy(true);setError('');try{await request({action:'status',id,area:next});setValue(next);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{flowAreas.map(a=><option key={a}>{a}</option>)}</select>{busy&&<small role="status">Salvando…</small>}{error&&<p role="alert">{error}</p>}</div>;
}
export default function ScheduleFlowResponsibilities(){
 const [data,setData]=useState<any>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;request().then(d=>{if(active)setData(d)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false};},[]);
 return <section><h3>Atribuição de tratativas</h3><p>Defina o usuário que receberá as tarefas da programação de cada área. A área de cada Status Fluxo pode ser alterada em Cadastros → Status Fluxo.</p><p>Ao mudar o fluxo da OS, as tarefas das operações revisadas são direcionadas ao responsável configurado, mantendo o mesmo número e histórico. Sem usuário definido, não há encaminhamento automático.</p>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}{!data?<p>Carregando responsáveis…</p>:<table className="operations-table"><thead><tr><th>Área responsável</th><th>Usuário responsável pelas tratativas</th></tr></thead><tbody>{data.areas.map((row:any)=><tr key={row.area}><td>{row.area}</td><td><select aria-label={'Usuário de '+row.area} value={row.recipient} disabled={!!busy} onChange={async e=>{const recipient=e.target.value;setBusy(row.area);setError('');setMessage('');try{setData(await request({action:'recipient',area:row.area,recipient}));setMessage('Responsável de '+row.area+' salvo.');}catch(e){setError((e as Error).message);}finally{setBusy('');}}}><option value="">Sem encaminhamento automático</option>{row.recipient&&!data.users.some((u:any)=>u.email===row.recipient)&&<option value={row.recipient} disabled>Usuário inativo · {row.recipient}</option>}{data.users.map((u:any)=><option key={u.email} value={u.email}>{u.display_name||u.email}</option>)}</select></td></tr>)}</tbody></table>}</section>;
}

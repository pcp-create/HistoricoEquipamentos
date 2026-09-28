"use client";
import {useEffect,useRef,useState} from "react";
import {X} from "lucide-react";
import {apiFetch} from "@/lib/client-api-cache";
import {EquipmentTaskLinks} from "./tasks-dashboard";
const labels:Record<string,string>={id:"Código",name:"Nome",brand:"Marca",model:"Modelo",serial:"Número de série",blocked:"Bloqueado",present:"Ativo no cadastro",collected_at:"Última coleta",rental:"Máquina de locação",internal_code:"Código interno",ownership:"Classificação",hoursDay:"Horas por dia",daysYear:"Dias por ano",meter:"Horímetro",meterDate:"Data do horímetro",notes:"Observações",hours:"Intervalo em horas",months:"Intervalo em meses",lastDate:"Última intervenção",lastMeter:"Horímetro da intervenção",lastOrder:"Última OS",description:"Descrição",items:"Materiais e serviços",quantity:"Quantidade",unit:"Unidade",code:"Código",productId:"Código do produto",company:"Empresa",company_id:"Empresa",status:"Status",date:"Data",dueDate:"Vencimento",remaining:"Dias restantes",contract:"Contrato",label:"Situação",start:"Início",end:"Fim",document:"Informações",after:"Dados registrados",before:"Dados anteriores",intervention:"Intervenção",action:"Ação",planName:"Plano",quoteNumber:"Número do orçamento",client:"Cliente",kind:"Tipo",display_name:"Responsável",created_at:"Registrado em",created_by:"Registrado por",updated_at:"Atualizado em",updated_by:"Atualizado por",forecast:"Previsão",rentalStatus:"Situação de locação",usage:"Utilização",total:"Total",total_geral:"Total",cliente_nome:"Cliente",tipo_nome:"Tipo de OS",documentNumber:"Documento",city:"Cidade",state:"Estado",trade_name:"Nome fantasia"};
function value(v:any):string {
 if(v==null || v==="") return "Não informado";
 if(typeof v==="boolean") return v?"Sim":"Não";
 if(typeof v==="string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v)) {const d=new Date(v.length===10?v+"T12:00:00Z":v); if(!isNaN(d.getTime()))return d.toLocaleString("pt-BR",v.length===10?{dateStyle:"short",timeZone:"America/Sao_Paulo"}:{dateStyle:"short",timeStyle:"short",timeZone:"America/Sao_Paulo"});}
 return ({own:"Próprio",customer:"Cliente",unknown:"Não classificado"} as Record<string,string>)[String(v)]||String(v);
}
function Fields({data}:{data:any}) {
 if(!data || typeof data!=="object") return <p>{value(data)}</p>;
 return <dl className="equipment-preview-fields">{Object.entries(data).filter(([key])=>!["version","quoteId","plan_id","method","key","quote_deleted_at"].includes(key)).map(([key,v])=><div key={key}><dt>{labels[key]||key}</dt><dd>{Array.isArray(v)?(v.length?v.map((item,i)=><Fields key={i} data={item}/>):"Nenhum registro"):v && typeof v==="object"?<Fields data={v}/>:value(v)}</dd></div>)}</dl>;
}
export default function EquipmentDetailsDrawer({id,onClose}:{id:string;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const [data,setData]=useState<any>(null),[error,setError]=useState("");
 useEffect(()=>{const el=dialog.current;el?.showModal(); const controller=new AbortController();
 (async()=>{try{const r=await apiFetch('/api/equipment-management?id='+encodeURIComponent(id),{signal:controller.signal});const b=await r.json();if(!r.ok)throw Error(b.error||"Falha ao carregar equipamento.");setData(b);}catch(e){if(!controller.signal.aborted)setError((e as Error).message);}})();
 const previous=document.body.style.overflow;document.body.style.overflow="hidden";
 return()=>{controller.abort();el?.close();document.body.style.overflow=previous;};},[id]);
 return <dialog ref={dialog} className="equipment-preview-drawer" aria-labelledby="equipment-preview-title" onCancel={e=>{e.preventDefault();onClose();}}>
 <header><div><small>EQUIPAMENTO · {id}</small><h2 id="equipment-preview-title">{data?.equipment.name||"Detalhes do equipamento"}</h2></div><button type="button" aria-label="Fechar detalhes do equipamento" onClick={onClose}><X size={20}/></button></header>
 {error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status">Carregando equipamento…</p>}
 {data&&<>
 <section><h3>Cadastro do equipamento</h3><Fields data={data.equipment}/></section>
 <section><h3>Clientes vinculados</h3>{data.clients.length?data.clients.map((c:any)=><Fields key={c.id} data={{...c,document:c.document||"Não informado"}}/>):<p>Sem cliente vinculado.</p>}</section>
 <section><h3>Operação e horímetro</h3><Fields data={data.settings.document}/><Fields data={{updated_at:data.settings.updated_at,updated_by:data.settings.updated_by}}/></section>
 <section><h3>Tarefas em aberto</h3><EquipmentTaskLinks equipment={id}/></section>

 </>}
 </dialog>;
}

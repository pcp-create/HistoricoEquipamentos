import {AlertTriangle} from 'lucide-react';
import {companyName} from '@/lib/company-names';
import './equipment-warranty-alert.css';
export default function EquipmentWarrantyDetails({warranty,links=true}:{warranty:any;links?:boolean}){
 const date=(day:string)=>day?.split('-').reverse().join('/');
 const orderLink=(o:any)=>links?<a href={`/historico?createdCompany=${o.company}&createdOrder=${o.orderId}`} target="_blank" rel="noreferrer">OS {o.number} · {companyName(o.company)}</a>:<span>OS {o.number} · {companyName(o.company)}</span>;
 return <aside className="equipment-warranty-alert" role="note" aria-label="Alerta de garantia do equipamento">
  <AlertTriangle size={18} aria-hidden="true"/>
  <div><strong>Equipamento com atendimento dentro do período de garantia</strong>
   <p>{orderLink(warranty)} · Abertura/emissão: {date(warranty.startedAt)}. Garantia até <b>{date(warranty.expiresAt)}</b>{warranty.period?` (${warranty.period})`:''}.</p>
   <p>Última OS do equipamento: {orderLink(warranty.lastOrder)} · {date(warranty.lastOrder.startedAt)}.</p>
   {warranty.periodSource==='registry'&&<p>Prazo calculado pelo cadastro do tipo de atendimento. Confira a condição aplicada na OS anterior.</p>}
   <p>Avalie se o atendimento solicitado se enquadra na garantia. Este aviso não altera o tipo da OS.</p>
  </div>
 </aside>;
}

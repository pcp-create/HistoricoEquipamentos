"use client";
import type {ReactNode} from "react";
import type {SalesVisit} from "@/lib/visits/model";
import {ChevronDown} from "lucide-react";

export default function VisitListRow({visit,customer,seller,date,children}:{visit:SalesVisit;customer:string;seller?:string;date:string;children:ReactNode}) {
 const status={scheduled:'Agendada',completed:'Realizada',cancelled:'Cancelada'}[visit.status];
 return <article className="sales-visit sales-visit-row">
  <details>
   <summary className={"sales-visit-summary"+(seller?" has-seller":"")}>
    <strong className="sales-visit-customer">{customer}</strong>
    {seller&&<span className="sales-visit-seller">{seller}</span>}
    <time dateTime={visit.scheduled_at}>{date}</time>
    <span className={'sales-badge '+(visit.status==='completed'?'current':visit.status==='cancelled'?'neutral':'scheduled')}>{status}</span>
    <span className="sales-visit-expand"><span>Detalhes</span><ChevronDown size={16}/></span>
   </summary>
   <div className="sales-visit-details">{children}</div>
  </details>
 </article>;
}

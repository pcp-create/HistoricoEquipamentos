"use client";
import {useEffect,useRef,useState,useId} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import type { ReservedOrder } from '@/lib/product-values';
import { companyName } from '@/lib/company-names';
import OrderDetailLink from './order-detail-link';
export default function ProductReservations({orders,showCompany=false}:{orders?:ReservedOrder[];showCompany?:boolean}){
 const [open,setOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null),title=useId();
 useEffect(()=>{if(open)dialog.current?.showModal();},[open]);
 if(!orders?.length)return null;
 const unique=[...new Map(orders.map(o=>[`${o.company_id}:${o.order_id}`,o])).values()];
 const count=`(${unique.length}) ${unique.length===1?'OS':'OSs'}`;
 return <><span className="product-reservations">Empenhado em: <button type="button" className="product-reservations-trigger" aria-haspopup="dialog" onClick={e=>{e.stopPropagation();setOpen(true);}}>{count}</button>.</span>
 {open&&createPortal(<dialog ref={dialog} className="product-reservations-dialog" aria-labelledby={title} onClose={()=>setOpen(false)} onClick={e=>e.stopPropagation()}>
 <header><h3 id={title}>OSs com empenho ({unique.length})</h3><button type="button" className="icon-button" aria-label="Fechar empenhos" onClick={()=>dialog.current?.close()}><X size={18}/></button></header>
 <p>Selecione uma OS para consultar os detalhes e as observações.</p>
 <ul>{unique.map(o=><li key={`${o.company_id}:${o.order_id}`}>
 {o.imported?<OrderDetailLink id={o.order_id} company={o.company_id} number={o.order_number}/>:<span title="OS ainda não importada">OS {o.order_number} (não importada)</span>}
 <span className="product-reservation-context"><span className="product-reservation-customer" title={o.customer||"Cliente não informado"}>{o.customer||"Cliente não informado"}</span><span className="product-reservation-equipment" title={o.equipment||"Equipamento não informado"}>{o.equipment||"Equipamento não informado"}</span></span>
 {showCompany&&<span className="product-reservation-company">{companyName(o.company_id)}</span>}
 </li>)}</ul>
 </dialog>,document.body)}</>;
}

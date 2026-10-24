"use client";
import OrderSearchSelect from './order-search-select';
import type {VisitCustomer} from '@/lib/visits/model';
export default function SalesCustomerSelect({customers,value,onChange,fullBase=false,onSelectCustomer}:{fullBase?:boolean;onSelectCustomer?:(customer:VisitCustomer)=>void;customers:VisitCustomer[];value:string;onChange:(key:string)=>void}){
 const selected=customers.find(c=>c.key===value);
 return <div className="sales-customer-select"><label>Cliente</label><OrderSearchSelect label="Cliente" endpoint={fullBase ? "/api/visits/customers" : undefined} value={value} placeholder="Selecione ou pesquise o cliente" selectedLabel={selected?`${selected.name}${selected.tradeName ? ' ('+selected.tradeName+')' : ''} · ${selected.city}/${selected.uf}`:undefined} options={customers.map(c=>({id:c.key,displayId:c.key.startsWith('m8:')?c.key.slice(3):'',name:c.name,tradeName:c.tradeName,detail:`${c.city}/${c.uf} · ${c.document||''}`}))} onChange={row=>{if(row.data)onSelectCustomer?.(row.data);onChange(row.id)}}/></div>
}

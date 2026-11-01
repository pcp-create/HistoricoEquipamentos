import {projectionPeriodLabels} from '@/lib/sales-projection/period-labels';
import Link from 'next/link';
import {ArrowUpRight} from 'lucide-react';
import type {Summary} from '@/lib/sales-projection/model';
export const detailedCompanyColumns:[keyof Summary,string][]=[['projection','Projeção'],['contractBilled','Fat. contratos'],['salesBilled','Fat. OSs'],['other','Fat. outros'],['returns','Devoluções'],['billed','Faturado líquido'],['pending','A faturar']];
export const summaryCompanyColumns:[keyof Summary,string][]=[['projection','Projeção'],['billed','Faturado líquido'],['pending','A faturar'],['contractPending','Contratos pendentes']];
const money=(value:number)=>value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const percent=(value:number,total:number)=>total?((value/total)*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'—';
export default function ProjectionCompanyResults({rows,total,period,detailed=false}:{rows:Summary[];total:Summary;period:string;detailed?:boolean}){
 const periodLabels=projectionPeriodLabels(period);
 const columns=(detailed?detailedCompanyColumns:summaryCompanyColumns).map(([key,label])=>[key,key==='pending'?periodLabels.pending:label] as [keyof Summary,string]);
 return <section className={'sp-panel sp-company-results'+(detailed?' sp-company-detailed':' sp-company-summary')}>
  <div className="sp-panel-heading"><div><h2>Resultado por empresa</h2><p>{detailed?'Composição do faturamento, devoluções e saldo da projeção por empresa.':'Projeção, faturamento e saldo por empresa.'}</p></div><span className="sp-unit">VALORES EM R$</span></div>
  <div className="sp-table-scroll"><table className="sp-table"><thead><tr><th>Empresa</th>{columns.map(([key,label])=><th key={key} data-column={key}>{label}{key==='returns'&&<span className="sp-minus"> (−)</span>}</th>)}<th>Realizado</th></tr></thead>
   <tbody>{rows.map(row=><tr key={row.company}><th>{row.name}</th>{columns.map(([key])=><td key={key} data-column={key} className={key==='returns'?'sp-red':key==='billed'?'sp-green':''}>{key==='other'&&Number(row[key])<0?<Link className="sp-other-review" href={`/comercial/vendas?period=${period}&company=${row.company}&billing=partial&returnTo=acompanhamento`} title="Conferir OS com possíveis faturamentos parciais">{money(Number(row[key]))} <ArrowUpRight size={12}/></Link>:money(Number(row[key]))}</td>)}<td><div className="sp-realized"><span>{percent(row.billed,row.projection)}</span><div className="sp-track"><i style={{width:`${Math.max(0,Math.min(100,row.projection?row.billed/row.projection*100:0))}%`}}/></div></div></td></tr>)}</tbody>
   <tfoot><tr><th>Total</th>{columns.map(([key])=><td key={key} data-column={key}>{money(Number(total[key]))}</td>)}<td>{percent(total.billed,total.projection)}</td></tr></tfoot>
  </table></div>
  {detailed&&<p className="sp-footnote">Faturamento outros = notas de venda − contratos faturados − OS faturadas. Pode ser negativo quando essas bases apresentam diferenças de classificação ou atualização. Devoluções são descontadas uma única vez do faturado líquido.</p>}
 </section>;
}

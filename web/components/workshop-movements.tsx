'use client';
import {useEffect,useMemo,useState,useRef} from 'react';
import {BarChart3,ArrowDownLeft,ArrowUpRight} from 'lucide-react';
import {localDay,workshopEvolution,type Grain,type VisitMovement} from '@/lib/workshop/movements';
import './workshop-movements.css';
export default function WorkshopMovements({visits}:{visits:VisitMovement[]}){
 const chartRef=useRef<HTMLDivElement>(null);
 const [availableWidth,setAvailableWidth]=useState(900);
 const today=localDay(new Date().toISOString());
 const [grain,setGrain]=useState<Grain>('month'),[start,setStart]=useState(today.slice(0,4)+'-01-01'),[end,setEnd]=useState(today);
 const invalid=!start||!end||start>end||Date.parse(end)-Date.parse(start)>3660*86400000;
 const rows=useMemo(()=>invalid?[]:workshopEvolution(visits,start,end,grain),[visits,start,end,grain,invalid]);
 useEffect(()=>{const element=chartRef.current;if(!element)return;const observer=new ResizeObserver(([entry])=>setAvailableWidth(entry.contentRect.width));observer.observe(element);return()=>observer.disconnect();},[invalid]);
 const entries=rows.reduce((n,r)=>n+r.entries,0),exits=rows.reduce((n,r)=>n+r.exits,0),max=Math.max(1,...rows.flatMap(r=>[r.entries,r.exits,r.occupancy]));
 const chartWidth=Math.max(600,rows.length*70,availableWidth);
 useEffect(()=>{const element=chartRef.current;if(element)element.scrollLeft=element.scrollWidth;},[rows,chartWidth,availableWidth,invalid]);
 const chartHeight=Math.max(280,Math.min(380,availableWidth*.23));
 const bottom=chartHeight-50, plotHeight=chartHeight-85;
 const ceiling=Math.ceil(max/4)*4;
 const step=(chartWidth-70)/Math.max(1,rows.length);
 const xAt=(i:number)=>45+step*(i+.5);
 const yAt=(value:number)=>bottom-value/ceiling*plotHeight;
 const barWidth=Math.min(28,step*.2);
 const adjustments=rows.reduce((sum,r)=>sum+r.adjustments,0);
 const label=(day:string)=>grain==='year'?day.slice(0,4):grain==='month'?day.slice(0,7).split('-').reverse().join('/'):day.split('-').reverse().join('/');
 return <section className="wm-panel" aria-label="Entradas e saídas da oficina">
  <div className="wm-heading"><div><h2><BarChart3 size={20}/> Entradas × saídas</h2><p>Movimentação de máquinas no período selecionado.</p></div><div className="wm-grain" role="group" aria-label="Agrupamento">{([['year','Ano'],['month','Mês'],['week','Semana'],['day','Dia']] as const).map(([value,text])=><button type="button" key={value} aria-pressed={grain===value} onClick={()=>setGrain(value)}>{text}</button>)}</div></div>
  <div className="wm-filters"><label>De<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Até<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
  {invalid?<p role="alert">Selecione um intervalo válido de até dez anos.</p>:<>
   <div className="wm-totals"><article><span><ArrowDownLeft size={16}/> Entradas</span><strong>{entries}</strong></article><article><span><ArrowUpRight size={16}/> Saídas</span><strong>{exits}</strong></article><article><span>Saldo de movimentação</span><strong>{entries-exits>0?'+':''}{entries-exits}</strong></article></div>
   <p className="wm-balance"><strong>Conciliação do período:</strong> {rows[0]?.opening||0} máquinas no início + {entries} entradas − {exits} saídas{adjustments>0&&<> − <strong className="wm-adjustment">{adjustments} ajustes de conferência</strong></>} = <strong>{rows.at(-1)?.occupancy||0} máquinas em oficina</strong>.</p>
   <div className="wm-legend"><span className="wm-entry">Entradas</span><span className="wm-exit">Saídas</span><span className="wm-occupancy">Máquinas em oficina ao fim do período</span></div>
   <p className="wm-interval">{start.split('-').reverse().join('/')} a {end.split('-').reverse().join('/')} · Período completo</p>
   <div ref={chartRef} className="wm-scroll wm-plot" tabIndex={0} role="region" aria-label="Gráfico de entradas, saídas e máquinas em oficina">
    <svg className="wm-evolution" viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{width:chartWidth,minWidth:chartWidth,height:chartHeight}} role="img" aria-label="Barras de entradas e saídas e linha de máquinas em oficina">
     <defs>
      <linearGradient id="wm-entry-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3188cf"/><stop offset="100%" stopColor="#b0d4f0"/></linearGradient>
      <linearGradient id="wm-exit-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#199982"/><stop offset="100%" stopColor="#a5ded2"/></linearGradient>
      <linearGradient id="wm-area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#bf8427" stopOpacity=".13"/><stop offset="100%" stopColor="#bf8427" stopOpacity="0"/></linearGradient>
     </defs>
     {[0,1,2,3,4].map(n=><g key={n}><line x1="45" x2={chartWidth-15} y1={yAt(ceiling*n/4)} y2={yAt(ceiling*n/4)} stroke="#e4ebf2" strokeDasharray={n?'3 5':undefined}/><text x="32" y={yAt(ceiling*n/4)+4} textAnchor="end" fontSize="11" fill="#8799aa">{ceiling*n/4}</text></g>)}
     {rows.length>0&&<polygon fill="url(#wm-area-fill)" points={`${xAt(0)},${bottom} ${rows.map((r,i)=>`${xAt(i)},${yAt(r.occupancy)}`).join(' ')} ${xAt(rows.length-1)},${bottom}`}/>}
     {rows.map((r,i)=><g key={r.date} className="wm-period" tabIndex={0} aria-label={`${label(r.startDate)} até ${label(r.endDate)}: ${r.entries} entradas, ${r.exits} saídas, ${r.occupancy} em oficina, ${r.adjustments} ajustes de conferência`}>
      <title>{`${label(r.startDate)} a ${label(r.endDate)}
Entradas: ${r.entries}
Saídas: ${r.exits}
Em oficina: ${r.occupancy}
Saldo inicial: ${r.opening}
Ajustes de conferência: ${r.adjustments}`}</title>
      <rect className="wm-hover-band" x={xAt(i)-step/2+3} y="12" width={step-6} height={bottom-12} rx="8" fill="#24699f" opacity="0"/>
      <rect x={xAt(i)-barWidth-3} y={yAt(r.entries)} width={barWidth} height={bottom-yAt(r.entries)} rx="4" fill="url(#wm-entry-fill)"/>
      <rect x={xAt(i)+3} y={yAt(r.exits)} width={barWidth} height={bottom-yAt(r.exits)} rx="4" fill="url(#wm-exit-fill)"/>
      <text x={xAt(i)-barWidth/2-3} y={yAt(r.entries)-7} textAnchor="middle" fontSize="11" fontWeight="600" fill="#24699f" paintOrder="stroke" stroke="white" strokeWidth="3">{r.entries}</text>
      <text x={xAt(i)+barWidth/2+3} y={yAt(r.exits)-7} textAnchor="middle" fontSize="11" fontWeight="600" fill="#16806c" paintOrder="stroke" stroke="white" strokeWidth="3">{r.exits}</text>
      <text x={xAt(i)} y={bottom+23} textAnchor="middle" fontSize="11" fill="#526d85">{label(grain==='week'?r.startDate:r.date)}</text>
      {r.adjustments>0&&<text x={xAt(i)} y={bottom+(grain==='week'?49:39)} textAnchor="middle" fontSize="10" fontWeight="600" fill="#8b529e">−{r.adjustments} ajustes</text>}
      {grain==='week'&&<text x={xAt(i)} y={bottom+39} textAnchor="middle" fontSize="9" fill="#8799aa">até {label(r.endDate)}</text>}
     </g>)}
     <polyline pointerEvents="none" fill="none" stroke="#b77819" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={rows.map((r,i)=>`${xAt(i)},${yAt(r.occupancy)}`).join(' ')}/>
     {rows.map((r,i)=><g key={r.date} pointerEvents="none"><circle cx={xAt(i)} cy={yAt(r.occupancy)} r="5" fill="white" stroke="#b77819" strokeWidth="2.5"/><text x={xAt(i)} y={yAt(r.occupancy)-13} textAnchor="middle" fontSize="12" fontWeight="600" fill="#98630e" paintOrder="stroke" stroke="white" strokeWidth="4">{r.occupancy}</text></g>)}
    </svg>
   </div>
   {!entries&&!exits&&<p>Nenhuma movimentação registrada no período e filtros selecionados.</p>}
   <details className="wm-data"><summary>Ver dados em tabela</summary><div className="wm-scroll"><table><thead><tr><th>Período</th><th>Saldo inicial</th><th>Entradas</th><th>Saídas</th><th>Ajustes de conferência (−)</th><th>Saldo de movimentação</th><th>Em oficina no fim do período</th></tr></thead><tbody>{rows.map(r=><tr key={r.date}><td>{label(r.startDate)} a {label(r.endDate)}</td><td>{r.opening}</td><td>{r.entries}</td><td>{r.exits}</td><td>{r.adjustments}</td><td>{r.entries-r.exits}</td><td>{r.occupancy}</td></tr>)}</tbody></table></div></details>
  </>}
  <p className="wm-note">Respeita os filtros de oficina, frota e pesquisa. Cada permanência conta uma entrada e, quando registrada, uma saída. Ajustes de conferência não são saídas físicas. Semanas começam na segunda-feira; datas no horário de Brasília. A linha inclui permanências anteriores ao intervalo e desconta saídas e ajustes de conferência na data registrada. O histórico depende das datas disponíveis, inclusive as importadas da planilha.</p>
 </section>;
}

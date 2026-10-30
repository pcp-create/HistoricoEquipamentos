'use client';
import {useEffect,useState,type RefObject} from 'react';
import type {MovementAxisGroup} from '@/lib/workshop/movement-axis';
/** Only the grouped labels re-render while scrolling; the chart series stay unchanged. */
export default function WorkshopMovementAxis({months,years,chartRef,step,top,chartWidth,availableWidth}:{months:MovementAxisGroup[];years:MovementAxisGroup[];chartRef:RefObject<HTMLDivElement|null>;step:number;top:number;chartWidth:number;availableWidth:number}){
 const [viewport,setViewport]=useState({left:0,width:0});
 useEffect(()=>{
  const element=chartRef.current;if(!element)return;let frame=0;
  const read=()=>{frame=0;setViewport(previous=>previous.left===element.scrollLeft&&previous.width===element.clientWidth?previous:{left:element.scrollLeft,width:element.clientWidth});};
  const onScroll=()=>{if(!frame)frame=requestAnimationFrame(read);};
  read();element.addEventListener('scroll',onScroll,{passive:true});
  return ()=>{element.removeEventListener('scroll',onScroll);cancelAnimationFrame(frame);};
 },[chartRef,chartWidth,availableWidth,months,years]);
 const band=(groups:MovementAxisGroup[],level:number,kind:string)=>groups.map((group,index)=>{
  const left=45+step*group.first,right=45+step*(group.last+1),visibleLeft=Math.max(left,viewport.left),visibleRight=Math.min(right,viewport.left+viewport.width);
  const textWidth=group.label.length*6+12;
  const x=Math.max(visibleLeft+textWidth/2,Math.min((left+right)/2,visibleRight-textWidth/2));
  return <g key={group.key} className={`wm-axis-${kind}`} data-period={group.key} aria-label={`${kind==='month'?'Mês':'Ano'}: ${group.title}`}>
   {index>0&&<line x1={left} x2={left} y1={top+level*28+9} y2={top+level*28+19} stroke="#dce4ec" strokeWidth="1"/>}
   {visibleRight-visibleLeft>=textWidth&&<text x={x} y={top+level*28+18} textAnchor="middle" fontSize="11" fill={kind==='year'?'#8293a3':'#526d85'} fontWeight={kind==='year'?400:500}>{group.label}</text>}
  </g>;
 });
 return <g className="wm-calendar-axis">{months.length>0&&band(months,0,'month')}{band(years,months.length?1:0,'year')}</g>;
}

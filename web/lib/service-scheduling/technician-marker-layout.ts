/** Spread overlapping people around their GPS point, without changing stored coordinates. */
export function technicianMarkerLayout<T>(items:T[],project:(item:T)=>{x:number;y:number},labelWidth:(item:T)=>number){
 const points=items.map(item=>({item,...project(item),width:Math.max(44,labelWidth(item)+42)}));
 type Position={item:T;x:number;y:number;originalX:number;originalY:number;width:number;side:'left'|'right';centerX:number;centerY:number;spread:boolean};
 const placed:Position[]=[];
 const bounds=(p:Position)=>p.side==='left'?[p.x-p.width,p.x+11]:[p.x-11,p.x+p.width];
 const overlaps=(a:Position,b:Position)=>{const [left,right]=bounds(a),[otherLeft,otherRight]=bounds(b);return Math.abs(a.y-b.y)<36&&left<otherRight&&otherLeft<right;};
 const remaining=new Set(points);
 while(remaining.size){
  const first=remaining.values().next().value!;remaining.delete(first);
  const group=[first];
  for(let i=0;i<group.length;i++)for(const other of remaining){
   if(Math.hypot(other.x-group[i].x,other.y-group[i].y)<=24){group.push(other);remaining.delete(other);}
  }
  const centerX=group.reduce((sum,p)=>sum+p.x,0)/group.length,centerY=group.reduce((sum,p)=>sum+p.y,0)/group.length;
  const spread=group.length>1;
  let candidates:Position[]=[];
  for(let attempt=0;;attempt++){
   const radius=Math.max(40,group.length*8)+attempt*12;
   candidates=group.map((p,i)=>{
    const angle=(group.length===2?0:-Math.PI/2+Math.PI/group.length)+i*2*Math.PI/group.length;
    const x=spread?centerX+Math.cos(angle)*radius:p.x;
    const y=spread?centerY+Math.sin(angle)*radius:p.y+attempt*36;
    return {item:p.item,x,y,width:p.width,originalX:p.x,originalY:p.y,centerX,centerY,spread,side:spread&&x<centerX-1?'left' as const:'right' as const};
   });
   if(candidates.every((p,i)=>!placed.some(other=>overlaps(p,other))&&!candidates.slice(0,i).some(other=>overlaps(p,other))))break;
  }
  placed.push(...candidates);
 }
 return points.map(point=>placed.find(p=>p.item===point.item)!);
}

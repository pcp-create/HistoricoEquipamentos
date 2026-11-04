import { test } from 'node:test';
import assert from 'node:assert/strict';
import { technicianMarkerLayout } from '../lib/service-scheduling/technician-marker-layout';
test('separates colocated and nearby technicians with labels, preserving distant GPS positions', () => {
  const items = [{x:100,y:100},{x:100,y:100},{x:104,y:103},{x:800,y:100}];
  const before = structuredClone(items);
  const positions = technicianMarkerLayout(items, p => p, () => 160);
  assert.equal(positions.length, 4);
  for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
    const a=positions[i],b=positions[j];
    const left=(p:typeof a)=>p.side==='left'?p.x-p.width:p.x-11;
    const right=(p:typeof a)=>p.side==='left'?p.x+11:p.x+p.width;
    assert.ok(Math.abs(a.y-b.y)>=36 || right(a)<=left(b) || right(b)<=left(a));
  }
  assert.deepEqual(items,before);
  assert.equal(positions[3].x,800);
  assert.equal(positions[3].y,100);
  assert.deepEqual(positions,technicianMarkerLayout(items,p=>p,()=>160));
});

test('colocated people surround the center and retain their original GPS anchor',()=>{
 for(const count of [2,3,4,12]){
  const items=Array.from({length:count},(_,id)=>({id,x:300,y:200}));
  const positions=technicianMarkerLayout(items,p=>p,()=>140);
  assert(positions.every(p=>p.spread&&p.originalX===300&&p.originalY===200&&p.centerX===300&&p.centerY===200));
  assert(positions.every(p=>Math.hypot(p.x-300,p.y-200)>=40-1e-9));
  assert(positions.some(p=>p.x<300));assert(positions.some(p=>p.x>300));
  assert(Math.abs(positions.reduce((sum,p)=>sum+p.x,0)/count-300)<0.001);
  assert(Math.abs(positions.reduce((sum,p)=>sum+p.y,0)/count-200)<0.001);
 }
});

test('ten colocated people stay close to the central point',()=>{
 const items=Array.from({length:10},(_,id)=>({id,x:300,y:200}));
 const positions=technicianMarkerLayout(items,p=>p,()=>160);
 assert(positions.every(p=>Math.hypot(p.x-300,p.y-200)<=120));
});

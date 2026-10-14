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
    assert.ok(Math.abs(a.y-b.y)>=36 || a.x+a.width<=b.x || b.x+b.width<=a.x);
  }
  assert.deepEqual(items,before);
  assert.equal(positions[3].x,800);
  assert.equal(positions[3].y,100);
  assert.deepEqual(positions,technicianMarkerLayout(items,p=>p,()=>160));
});

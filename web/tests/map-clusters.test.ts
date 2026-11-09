import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterMapPoints, nextClusterExpansionZoom } from "../lib/service-scheduling/map-clusters";
test("zoom merges nearby OSs, separates distinct locations and keeps identical points together", () => {
  const orders = [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 0, y: 0 },
    { id: 3, x: 20, y: 0 },
    { id: 4, x: 300, y: 0 },
  ];
  const wide = clusterMapPoints(orders, (p) => p, 52);
  assert.deepEqual(
    wide.map((g) => g.items.map((i) => i.id)),
    [[1, 2, 3], [4]],
  );
  const near = clusterMapPoints(
    orders,
    (p) => ({ x: p.x * 8, y: p.y * 8 }),
    52,
  );
  assert.deepEqual(
    near.map((g) => g.items.map((i) => i.id)),
    [[1, 2], [3], [4]],
  );
  assert.deepEqual(
    clusterMapPoints(orders, (p) => p, 0).map((g) => g.items.length),
    [2, 1, 1],
  );
  assert.equal(
    wide.reduce((n, g) => n + g.items.length, 0),
    orders.length,
  );
});

test('cluster clicks skip unchanged zooms, open one partial level and eventually spread colocated people',()=>{
 const items=[{x:0},{x:0},{x:1},{x:20}];
 const project=(item:{x:number},zoom:number)=>({x:item.x*2**(zoom-5),y:0});
 const zoom=nextClusterExpansionZoom(items,project,3,15,60);
 assert.equal(zoom,7);
 const groups=clusterMapPoints(items,item=>project(item,zoom),60);
 assert.deepEqual(groups.map(group=>group.items.length),[3,1]);
 assert.equal(nextClusterExpansionZoom(groups[0].items,project,zoom,15,60),11);
 assert.equal(nextClusterExpansionZoom(items.slice(0,2),project,3,15,60),15);
});

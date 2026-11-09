/** Groups screen-near points at the current zoom. Exact coordinates remain together. */
export function clusterMapPoints<T>(
  items: T[],
  project: (item: T) => { x: number; y: number },
  radius: number,
) {
  const groups: {
    items: T[];
    x: number;
    y: number;
    anchorX: number;
    anchorY: number;
  }[] = [];
  for (const item of items) {
    const p = project(item);
    const group = groups.find(
      (g) => Math.hypot(g.anchorX - p.x, g.anchorY - p.y) <= radius,
    );
    if (group) {
      const n = group.items.length;
      group.x = (group.x * n + p.x) / (n + 1);
      group.y = (group.y * n + p.y) / (n + 1);
      group.items.push(item);
    } else
      groups.push({
        items: [item],
        x: p.x,
        y: p.y,
        anchorX: p.x,
        anchorY: p.y,
      });
  }
  return groups;
}

/** Skip zoom levels that leave the clicked group unchanged; open one grouping level per click. */
export function nextClusterExpansionZoom<T>(items:T[],project:(item:T,zoom:number)=>{x:number;y:number},currentZoom:number,openZoom=15,radius=60){
 for(let zoom=Math.floor(currentZoom)+1;zoom<openZoom;zoom++){
  if(clusterMapPoints(items,item=>project(item,zoom),radius).length>1)return zoom;
 }
 return Math.max(currentZoom,openZoom);
}

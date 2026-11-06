import defaults from '../sales-projection/flow-owners.json';
export const flowAreas=['Comercial','Planejamento','Almoxarifado','Compras','Faturamento','Outro'] as const;
export function defaultFlowArea(id: string|number,name='') {
 return Object.entries(defaults).find(([key])=>key===name||key.split(' - ')[0]===String(id))?.[1]||'Outro';
}
export function flowAreaFromRows(rows: any[],id: unknown,name='') {
 const key=String(id||/^\d+/.exec(name)?.[0]||'');
 return rows.find(row=>String(row.id)===key)?.area||defaultFlowArea(key,name);
}

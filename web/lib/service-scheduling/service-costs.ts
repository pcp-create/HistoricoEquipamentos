export function isMaintenancePackage(service: any) {
  const name = String(service.servico_nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  return String(service.servico_id) === '15720' || name === 'SERVICO DE MANUTENCAO PCT';
}
export function maintenanceCost(service: any, services: any[], labor: number | null): number | null {
  if(labor == null) return null;
  const items=services.filter(isMaintenancePackage);
  const index=items.findIndex(s=>String(s.id_m8)===String(service.id_m8)&&String(s.item_company)===String(service.item_company)&&String(s.item_order)===String(service.item_order));
  if(index<0)return null;
  const cents=Math.round(labor*100),share=Math.floor(cents/items.length);
  return (share+(index<cents%items.length?1:0))/100;
}


// Linked orders contribute costs, but their sales are not revenue of the main order.
export function primaryOrderRevenue(items: any[]): number {
  return items.filter(item => !item.source_linked)
    .reduce((total, item) => total + Number(item.valor_total || 0), 0);
}

/** ERP equipment IDs identify records; the OS description contains the visible asset code. */
export function operationEquipmentLabel(document:any,order:any){
 if(document.equipmentUnassigned===true)return 'Sem equipamento específico';
 const selected=String(document.equipmentId||'');
 const orderId=order?.produto_equipamento_id??order?.payload?.produtoEquipamentoId;
 if(!selected || (orderId!=null && selected===String(orderId)))return order?.equipamento||'';
 if(document.equipment?.label)return document.equipment.label;
 return selected ? [selected,document.equipment?.name].filter(Boolean).join(' · ') : '';
}

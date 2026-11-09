/** Shared naming for email attachments, exports and OS attachments. */
const clean=(value:unknown)=>String(value??'').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
export function orderServiceName(order:any){
 const name=String(order.tipo_nome||order.payload?.tipoNome||'').trim();
 const parts=name.split(/\s+-\s+/).map((p:string)=>p.trim()).filter(Boolean);
 const service=parts.length>=3?parts.slice(1,-1).join(' - '):parts.length===2&&/^[A-Z\d.]{1,8}$/.test(parts[0])?parts[1]:name;
 return service.toUpperCase()==='GAS'?'GARANTIA DE SERVIÇO':service;
}
export function reportEquipmentParts(order:any,document:any){
 if(document.equipmentUnassigned)return {model:'Sem equipamento específico',serial:'',description:'Sem equipamento específico'};
 const equipment=document.equipment||{};
 const useOrder=!document.equipmentId||String(document.equipmentId)===String(order.produto_equipamento_id||order.payload?.produtoEquipamentoId||'');
 const label=String(equipment.label||equipment.name||(useOrder?order.equipamento:'')||'');
 const serial=String(equipment.serial||/s[eé]rie\s*[:\-]?\s*(.+)$/i.exec(label)?.[1]||(useOrder?(order.numero_serie||order.serie):'')||'').trim();
 const parts=label.split(/\s+[-–—]\s+/).filter(p=>!/^s[eé]rie\b/i.test(p)&&!/^\d+$/.test(p)&&!/^\d+(?:[.,]\d+)?(?:\/\d+)*\s*(?:v|hz|kw|hp|cv|bar)(?:\b|\/)/i.test(p));
 const candidate=(parts.at(-1)||label).replace(/\s*[-–—]?\s*s[eé]rie\s*[:\-]?.*$/i,'').trim();
 const model=String(equipment.model||(useOrder?order.modelo_equipamento:'')||(/([A-Z][A-Z\d.+/\-]*\s*\d[\w.+/\-]*(?:\s+[A-Z]+)?)$/i.exec(candidate)?.[1])||candidate).trim();
 const description=parts.filter(p=>p!=='ZZ').join(' - ').replace(/\s*[-–—]?\s*s[eé]rie\s*[:\-]?.*$/i,'').trim()||model;
 return {model,serial,description};
}
export function summaryReportFilename(order:any,operations:any[],fallbackOrder?:string){
 const unique=(values:string[])=>[...new Set(values.filter(Boolean))].join(' + ');
 const assets=operations.map(op=>{const {model,serial}=reportEquipmentParts(order,op.document||{});return [clean(model),serial?'SÉRIE '+clean(serial):''].filter(Boolean).join(' - ');});
 if(!assets.length&&order.equipamento){const {model,serial}=reportEquipmentParts(order,{});assets.push([clean(model),serial?'SÉRIE '+clean(serial):''].filter(Boolean).join(' - '));}
 const number=clean(order.numero_sequencia||fallbackOrder||order.order_id);
 const client=clean(order.cliente_nome||order.cliente_razao_social||'Cliente não informado').split(' ').slice(0,2).join(' ');
 return ['OS '+number,client,clean(orderServiceName(order)),unique(assets)].filter(Boolean).join(' - ').slice(0,200).trim()+'.pdf';
}
export function pdfAttachmentHeader(filename: string) {
  const fallback = filename.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`;
}

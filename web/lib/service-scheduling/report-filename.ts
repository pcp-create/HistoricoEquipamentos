/** Customer-facing summary filenames shared by downloads and task attachments. */
export function summaryReportFilename(order: any, operations: any[], fallbackOrder?: string) {
  const clean = (value: unknown) => String(value ?? '').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))].join(' + ');
  const services: string[] = [], assets: string[] = [];
  for (const operation of operations) {
    const doc = operation.document || {};
    const template = doc.checklistRun?.template;
    const service = template?.prefix || doc.serviceType || template?.name || '';
    const prefix = /^([A-Z0-9]{2,12})(?:\s*[-–—]|$)/.exec(service)?.[1];
    services.push(clean(template?.prefix || prefix || String(service).split(/\s+/).filter(word => !['de','da','do','das','dos','e'].includes(word.toLowerCase())).map(word => word[0]).join('')).toUpperCase());
    if (doc.equipmentUnassigned) { assets.push('Sem equipamento específico'); continue; }
    const equipment = doc.equipment || {};
    const label = String(equipment.label || equipment.name || (!doc.equipmentId ? order.equipamento : '') || '');
    const parts = label.split(/\s+[-–—]\s+/);
    const serial = equipment.serial || /s[eé]rie\s*[:\-]?\s*(.+)$/i.exec(label)?.[1] || (!doc.equipmentId ? order.numero_serie || order.serie : '');
    const model = equipment.model || (!doc.equipmentId ? order.modelo_equipamento : '') || (parts.length > 1 ? parts.filter(part => !/^s[eé]rie\b/i.test(part)).at(-1) : label);
    assets.push([clean(model), serial ? 'Série ' + clean(serial) : ''].filter(Boolean).join(' '));
  }
  const number = clean(order.numero_sequencia || fallbackOrder || order.order_id);
  const client = clean(order.cliente_nome || order.cliente_razao_social || 'Cliente não informado');
  return (`OS ${number} - ` + [client, unique(services), unique(assets)].filter(Boolean).join(' ')).slice(0, 200).trim() + '.pdf';
}
export function pdfAttachmentHeader(filename: string) {
  const fallback = filename.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`;
}

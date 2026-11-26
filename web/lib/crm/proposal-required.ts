export function validProposalDate(value:unknown){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}

export function missingProposalFields(draft:any,equipmentRequired=true,lead=false){
 const fields:Record<string,string>={company:'Empresa',customer:'Cliente',serviceType:'Tipo Atendimento',seller:'Vendedor',payment:'Condição de Pagamento',expected:'Data Entrega Prevista',delivery:'Data Entrega',situation:'Situação Ordem Serviço',flowStatus:'Status Fluxo',freight:'Frete',notes:'Observações'};
 if(equipmentRequired)fields.equipment='Equipamento';
 if(lead)delete fields.customer;
 const missing=Object.entries(fields).filter(([key])=>['expected','delivery'].includes(key)?!validProposalDate(draft?.[key]):typeof draft?.[key]!=='string'||!draft[key].trim()).map(([key])=>key);
 if(draft?.commercial?.backupEnabled==='yes'&&draft.commercial.backupRentalIncluded==='yes'&&!draft.commercial.backupRentalValue?.trim())missing.push('backupRentalValue');
 return missing;
}
export const proposalFieldNames:Record<string,string>={company:'Empresa',customer:'Cliente',equipment:'Equipamento',serviceType:'Tipo Atendimento',seller:'Vendedor',payment:'Condição de Pagamento',expected:'Data Entrega Prevista',delivery:'Data Entrega',situation:'Situação Ordem Serviço',flowStatus:'Status Fluxo',freight:'Frete',notes:'Observações',backupRentalValue:'Valor da locação embutida'};

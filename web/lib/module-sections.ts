/** A parent permission grants every section; section permissions grant only that section. */
export type ModuleSection={id:string;name:string;paths:string[]};
const section=(parent:string,id:string,name:string,...paths:string[]):ModuleSection=>({id:parent+':'+id,name,paths});
export const MODULE_SECTIONS:Record<string,ModuleSection[]>={
 crm:[
  section('crm','projecao','Projeção de Vendas','/comercial/projecao','/api/sales-projection'),
  section('crm','evolucao','Gráfico de Evolução','/comercial/evolucao','/api/billing-evolution'),
  section('crm','contratos','Contratos','/comercial/contratos'),
  section('crm','vendas','Vendas','/comercial/vendas','/comercial/resumo','/comercial/parciais','/comercial/acompanhamento','/api/commercial'),
  section('crm','orcamentos','Histórico Orçamentos M8','/orcamentos','/api/m8-quotes'),
  section('crm','propostas','Rascunhos de propostas','/orcamentos/novo','/api/quotes'),
  section('crm','oportunidades','CRM','/crm','/api/crm'),
  section('crm','catalogo','Catálogo do fabricante','/fabricante','/api/manufacturer'),
 ],
 'assistencia-tecnica':[
  section('assistencia-tecnica','ordens','Ordens de Serviço','/historico','/OrdemServico','/api/history'),
  section('assistencia-tecnica','programacao','Programação de OSs','/programacao','/api/service-scheduling'),
  section('assistencia-tecnica','ocorrencias','B.O','/bo','/api/equipment-occurrences'),
  section('assistencia-tecnica','vibracao','Gerar Relatório Análise de Vibração','/analise-vibracao','/api/vibration-reports'),
  section('assistencia-tecnica','vazamentos','Gerar Relatório Caça Vazamento','/caca-vazamento','/api/leakage-reports'),
  section('assistencia-tecnica','catalogo','Catálogo do fabricante','/fabricante','/api/manufacturer'),
 ],
 suprimentos:[
  section('suprimentos','materiais','Análise e consulta de materiais','/analise-materiais','/api/material-analysis'),
  section('suprimentos','catalogo','Catálogo do fabricante','/fabricante','/api/manufacturer'),
 ],
 equipamentos:[
  section('equipamentos','preventivas','Controle de Manutenções','/equipamentos/preventivas','/api/preventive-reports'),
  section('equipamentos','inspecoes','Controle de Inspeções','/equipamentos/inspecoes','/api/inspections'),
  section('equipamentos','locacao','Controle de locação','/equipamentos/locacao','/api/rental','/api/rental-reports'),
  section('equipamentos','clientes','Cliente / Equipamento','/equipamentos/clientes'),
 ],
 configuracoes:[
  section('configuracoes','catalogo','Catálogo do fabricante','/configuracoes','/api/catalog-configuration'),
  section('configuracoes','cadastros','Cadastros','/configuracoes/cadastros'),
  section('configuracoes','crm','Tipos de Oportunidades / Tipos de Proposta','/configuracoes/cadastros/crm'),
  section('configuracoes','divisao','Divisão Comercial','/configuracoes/cadastros/divisao-comercial'),
  section('configuracoes','sincronismos','Pendências de sincronização M8','/configuracoes/cadastros/sincronismos'),
  section('configuracoes','cargos','Tipos de Cargo','/configuracoes/cadastros/tipos-cargo','/api/contact-job-types'),
 ],
};
export function sectionIds(parent:string){return (MODULE_SECTIONS[parent]||[]).map(s=>s.id);}
export function hasModuleAccess(permissions:string[],parent:string){
 return permissions.includes(parent)||sectionIds(parent).some(id=>permissions.includes(id));
}
export function sectionSelected(permissions:string[],parent:string,id:string){return permissions.includes(parent)||permissions.includes(id);}
export function toggleModule(permissions:string[],parent:string){
 const children=sectionIds(parent),all=permissions.includes(parent)||(children.length>0&&children.every(id=>permissions.includes(id)));
 const remaining=permissions.filter(id=>id!==parent&&!children.includes(id));
 return all?remaining:[...remaining,parent];
}
export function toggleSection(permissions:string[],parent:string,id:string){
 const children=sectionIds(parent);
 if(!children.includes(id))return permissions;
 const selected=children.filter(child=>sectionSelected(permissions,parent,child));
 const next=selected.includes(id)?selected.filter(child=>child!==id):[...selected,id];
 const remaining=permissions.filter(p=>p!==parent&&!children.includes(p));
 return [...remaining,...(next.length===children.length?[parent]:next)];
}
export function sectionsForPath(path:string):string[]{
 const matches=Object.values(MODULE_SECTIONS).flat().flatMap(section=>section.paths.filter(root=>path===root||path.startsWith(root+'/')).map(root=>({id:section.id,length:root.length})));
 const longest=Math.max(0,...matches.map(m=>m.length));
 return matches.filter(m=>m.length===longest).map(m=>m.id);
}

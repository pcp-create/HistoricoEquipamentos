import {MODULE_SECTIONS,hasModuleAccess,sectionsForPath} from './module-sections';
/** Stable identifiers shared by administration, navigation and server authorization. */
export const USER_MODULES = [
 {id:'crm',name:'Comercial'}, {id:'assistencia-tecnica',name:'Assistência Técnica'},
 {id:'portal-tecnico',name:'Portal técnico'}, {id:'visitas',name:'Visitas'},
 {id:'gestao-visitas',name:'Gestão de Visitas'}, {id:'suprimentos',name:'Suprimentos'}, {id:'equipamentos',name:'Gestão de Equipamentos'},
 {id:'tarefas',name:'Tarefas'}, {id:'oficina',name:'Gestão de Oficina'}, {id:'almoxarifado',name:'Almoxarifado'},
 {id:'calendario',name:'Calendário geral'}, {id:'administracao',name:'Administração'}, {id:'configuracoes',name:'Configurações'},
] as const;
export const moduleIds:string[]=[...USER_MODULES.map(m=>m.id),...Object.values(MODULE_SECTIONS).flat().map(s=>s.id)];
export function userModules(user:any):string[]{
 if(user?.enabled===false)return [];
 // NULL retains legacy access until an administrator explicitly configures the profile.
 const configured=Array.isArray(user?.modules)?user.modules.map((id:unknown)=>id==='tecnico'?'portal-tecnico':id==='programacao'?'assistencia-tecnica':id).filter((id:unknown)=>typeof id==='string'&&moduleIds.includes(id)):USER_MODULES.map(m=>m.id).filter(id=>(!['administracao','configuracoes'].includes(id)||user?.role==='admin')&&(id!=='gestao-visitas'||['admin','manager'].includes(user?.role)));
 // Administrative accounts must retain access to manage permissions.
 return user?.role==='admin'?Array.from(new Set<string>([...configured,'administracao'])):configured;
}
export function jobTitles(user:any):string[]{return Array.isArray(user?.job_titles)?user.job_titles: user?.job_title?[user.job_title]:[];}
export function hasJob(user:any,job:'technician'|'seller'){
 return jobTitles(user).some(title=>job==='technician'?/^(técnico|tecnico)$/i.test(title.trim()):/^vendedor(a)?$/i.test(title.trim()));
}
export function canParticipate(user:any,job:'technician'|'seller'){
 return user?.enabled!==false&&hasJob(user,job)&&userModules(user).includes(job==='technician'?'portal-tecnico':'visitas');
}
export function modulesForPath(path:string):string[]{
 path=path.split('?')[0];
 if(/^\/(api\/)?(session|activity|user-photo|password|auth|login|privacidade)(\/|$)/.test(path)||path.endsWith('/entrar'))return [];
 const api=path.split('/')[2];
 if(path.startsWith('/api/')){
  const shared:Record<string,string[]>={
   'calendar':['calendario','visitas','gestao-visitas','portal-tecnico','tarefas'],
   'customer-registry':['crm','visitas','gestao-visitas'], 'customer-contacts':['crm','visitas','gestao-visitas','assistencia-tecnica'], 'contact-sync':['crm','visitas','gestao-visitas','assistencia-tecnica'],
   'customer-fleet':['equipamentos','visitas','gestao-visitas','assistencia-tecnica','crm'], 'products':['suprimentos','crm','assistencia-tecnica','portal-tecnico','almoxarifado','oficina'],
   'registries':['configuracoes','crm','visitas','gestao-visitas','assistencia-tecnica','equipamentos','suprimentos','oficina'],
   'service-orders':['crm','assistencia-tecnica'], 'orders':['crm','assistencia-tecnica'], 'localities':['assistencia-tecnica','portal-tecnico','visitas'],
   'task-settings':['tarefas','administracao'], 'task-stages':['tarefas','administracao'], 'task-territories':['tarefas','visitas','gestao-visitas','administracao'],
   'inspections':['assistencia-tecnica','equipamentos'], 'preventive-reports':['assistencia-tecnica','equipamentos'], 'rental-reports':['equipamentos'], 'dsu':['assistencia-tecnica'],
  };
  if(/^\/api\/products\/[^/]+\/[^/]+\/images(?:\/|$)/.test(path))return [...shared.products,'equipamentos'];
  if(/^\/api\/visits\/photos\/[^/]+\/?$/.test(path))return ['visitas','gestao-visitas','tarefas'];
  if(shared[api])return shared[api];
  // These read APIs supply shared selectors and images; their own write/admin checks remain in effect.
  if(api==='users')return [];
  if(path.startsWith('/api/service-scheduling/photos'))return ['assistencia-tecnica','portal-tecnico'];
 }
 if(/^\/(visitas\/gestao|api\/visits\/management)(\/|$)/.test(path))return ['gestao-visitas'];
 if(path.startsWith('/modulos/'))return [path.split('/')[2]];
 const roots:[RegExp,string[]][]=[
 [/^\/(configuracoes|api\/contact-job-types|api\/catalog-configuration)(\/|$)/,['configuracoes']],
 [/^\/(tecnico|api\/field)(\/|$)/,['portal-tecnico']],
 [/^\/(visitas|api\/visits)(\/|$)/,['visitas','gestao-visitas']],
 [/^\/(administracao|api\/admin)(\/|$)/,['administracao']],
 [/^\/(comercial|crm|orcamentos|api\/crm|api\/quotes|api\/m8-quotes|api\/billing-evolution|api\/sales-projection|api\/commercial)(\/|$)/,['crm']],
 [/^\/(programacao|historico|OrdemServico|bo|analise-vibracao|caca-vazamento|api\/service-scheduling|api\/history|api\/equipment-occurrences|api\/vibration-reports|api\/leakage-reports)(\/|$)/,['assistencia-tecnica']],
 [/^\/(equipamentos|api\/equipment-management|api\/equipment|api\/rental)(\/|$)/,['equipamentos']],
 [/^\/(tarefas|api\/tasks)(\/|$)/,['tarefas']],
 [/^\/(oficina|api\/workshop)(\/|$)/,['oficina']],
 [/^\/(almoxarifado|api\/warehouse)(\/|$)/,['almoxarifado']],
 [/^\/(calendario|api\/calendar)(\/|$)/,['calendario']],
 [/^\/(analise-materiais|api\/material-analysis)(\/|$)/,['suprimentos']],
 [/^\/(fabricante|api\/manufacturer)(\/|$)/,['suprimentos','crm','assistencia-tecnica']],
 ];
 return roots.find(([pattern])=>pattern.test(path))?.[1]||[];
}
export function canManageContactJobTypes(user:any){return user?.enabled===true&&canOpenPath(userModules(user),'/configuracoes/cadastros/tipos-cargo');}
export function canOpenPath(modules:string[],path:string){
 path=path.split('?')[0];
 if(path==='/api/contact-job-types')return true;
 if(path.startsWith('/modulos/'))return hasModuleAccess(modules,path.split('/')[2]);
 const sections=sectionsForPath(path);
 if(sections.length){
  if(sections.some(id=>modules.includes(id)||modules.includes(id.split(':')[0])))return true;
  // Shared APIs retain access for other operational modules that consume them.
  if(path.startsWith('/api/')){
   const parents=sections.map(id=>id.split(':')[0]);
   return modulesForPath(path).some(id=>!parents.includes(id)&&hasModuleAccess(modules,id));
  }
  return false;
 }
 const required=modulesForPath(path);
 return !required.length||required.some(id=>path.startsWith('/api/')?hasModuleAccess(modules,id):modules.includes(id));
}

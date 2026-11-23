"use client";
import {MODULE_SECTIONS,sectionSelected,toggleModule,toggleSection} from '@/lib/module-sections';
import SupportPicker from './support-picker';
import {USER_MODULES,jobTitles,userModules} from '@/lib/user-modules';
export function AccessSwitch({label,checked,disabled=false,onChange}:{label:string;checked:boolean;disabled?:boolean;onChange:()=>void}){
 return <button className="employee-access-row" type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}>
 <span className="employee-access-toggle" aria-hidden="true"><span/></span>
 <span className="employee-access-name">{label}</span>
 </button>;
}
export default function EmployeeAccessPicker({value,onChange,users=[],section='all'}:{value:any;onChange:(value:any)=>void;users?:any[];section?:'all'|'jobs'|'modules'}){
 const jobs=jobTitles(value),modules=userModules(value);
 const choices=Array.from(new Set(['Técnico','Vendedor','Planejador','Administrativo','Gestor',...users.flatMap(jobTitles),...jobs]));
 const setModules=(modules:string[])=>onChange({...value,modules});
 return <div className="employee-access-picker">
 {section!=='modules'&&<fieldset><legend>Cargos</legend>
 <div className="employee-jobs-picker"><SupportPicker
 label="Adicionar cargos" filterLabel="Pesquisar cargo" placeholder="Pesquisar cargo..."
 emptyLabel="Nenhum cargo encontrado." removeLabel="Remover cargo"
 users={choices.map(job=>({email:job,display_name:job}))} selected={jobs}
 onCreate={(job:string)=>onChange({...value,job_titles:Array.from(new Set([...jobs,job]))})}
 onChange={(job_titles:string[])=>onChange({...value,job_titles})}/></div>
 </fieldset>}
 {section!=='jobs'&&<fieldset><legend>Módulos disponíveis</legend><p>Selecione o módulo inteiro ou expanda para escolher somente os submódulos desejados.</p><div className="employee-access-slicers employee-module-columns">{USER_MODULES.map(module=>{
 const children=MODULE_SECTIONS[module.id]||[];
 const count=children.filter(child=>sectionSelected(modules,module.id,child.id)).length;
 const all=modules.includes(module.id)||(children.length>0&&count===children.length);
 return <div className="employee-module-group" key={module.id}>
 {children.length?<><button type="button" className="employee-access-row" role="checkbox" aria-checked={all?true:count?'mixed':false} aria-label={module.name} onClick={()=>setModules(toggleModule(modules,module.id))}>
 <span className="employee-access-toggle" aria-hidden="true"><span/></span><span className="employee-access-name">{module.name}</span>
 </button><details><summary>Submódulos <span>{count}/{children.length}</span></summary><div className="employee-submodules">
 {children.map(child=><AccessSwitch key={child.id} label={child.name} checked={sectionSelected(modules,module.id,child.id)} onChange={()=>setModules(toggleSection(modules,module.id,child.id))}/>)}
 </div></details></>:<AccessSwitch label={module.name} disabled={value.role==='admin'&&module.id==='administracao'} checked={modules.includes(module.id)} onChange={()=>setModules(toggleModule(modules,module.id))}/>}
 </div>;
 })}</div>{value.role==='admin'&&<p>Administradores mantêm acesso à Administração para gerenciar os perfis.</p>}</fieldset>}
 </div>;
}

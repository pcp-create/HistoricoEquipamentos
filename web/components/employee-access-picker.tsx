"use client";
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
 const toggle=(key:string,current:string[],id:string)=>onChange({...value,[key]:current.includes(id)?current.filter(v=>v!==id):[...current,id]});
 return <div className="employee-access-picker">
 {section!=='modules'&&<fieldset><legend>Cargos</legend>
 <div className="employee-jobs-picker"><SupportPicker
 label="Adicionar cargos" filterLabel="Pesquisar cargo" placeholder="Pesquisar cargo..."
 emptyLabel="Nenhum cargo encontrado." removeLabel="Remover cargo"
 users={choices.map(job=>({email:job,display_name:job}))} selected={jobs}
 onCreate={(job:string)=>onChange({...value,job_titles:Array.from(new Set([...jobs,job]))})}
 onChange={(job_titles:string[])=>onChange({...value,job_titles})}/></div>
 </fieldset>}
 {section!=='jobs'&&<fieldset><legend>Módulos disponíveis</legend><p>Os cargos identificam as funções. Os módulos definem onde o funcionário pode acessar e participar.</p><div className="employee-access-slicers employee-module-columns">{USER_MODULES.map(module=><AccessSwitch key={module.id} label={module.name} disabled={value.role==='admin'&&module.id==='administracao'} checked={modules.includes(module.id)} onChange={()=>toggle('modules',modules,module.id)}/>)}</div>{value.role==='admin'&&<p>Administradores mantêm acesso à Administração para gerenciar os perfis.</p>}</fieldset>}
 </div>;
}

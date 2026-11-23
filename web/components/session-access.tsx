"use client";
import {createContext,useContext,useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
import {canOpenPath} from '@/lib/user-modules';
type Access={admin:boolean;visitManager:boolean;displayName:string;cacheScope?:string;cacheUser?:string;modules?:string[];jobTitles?:string[];checkedAt?:string;accessUpdatedAt?:string};
// Apply the same administrative invariant to SSR, cached and refreshed snapshots.
function normalizeAccess(value:Access):Access{
 return value.admin===true&&Array.isArray(value.modules)
  ?{...value,modules:Array.from(new Set([...value.modules,'administracao']))}
  :value;
}
const SessionAccess=createContext<Access>({admin:false,visitManager:false,displayName:''});
export function SessionAccessProvider({access,children}:{access:Access;children:React.ReactNode}){
 const [current,setCurrent]=useState(()=>normalizeAccess(access)),path=usePathname();
 useEffect(()=>{if(access.checkedAt)setCurrent(normalizeAccess(access));},[access]);
 useEffect(()=>{
  let stopped=false,busy=false;
  const save=(value:Access)=>{if(stopped)return;value=normalizeAccess(value);setCurrent(value);if(value.cacheScope)try{sessionStorage.setItem('rj-access:'+(value.cacheUser||value.cacheScope),JSON.stringify(value));}catch{}};
  if(access.checkedAt)save(access);
  else if(access.cacheUser||access.cacheScope)try{const saved=JSON.parse(sessionStorage.getItem('rj-access:'+(access.cacheUser||access.cacheScope))||'null');if((saved?.cacheUser||saved?.cacheScope)===(access.cacheUser||access.cacheScope)&&Array.isArray(saved.modules))setCurrent(normalizeAccess(saved));}catch{}
  const refresh=async()=>{
   if(busy||document.visibilityState!=='visible')return;busy=true;
   try{
    const response=await fetch('/api/session-access',{cache:'no-store'});
    if(response.ok){const value=await response.json();if(access.cacheUser&&value.cacheUser&&access.cacheUser!==value.cacheUser){window.location.reload();return;}if(Array.isArray(value.modules)&&value.cacheScope)save(value);}
    else if(response.status===401){if(access.cacheUser||access.cacheScope)try{sessionStorage.removeItem('rj-access:'+(access.cacheUser||access.cacheScope));}catch{};save({admin:false,visitManager:false,displayName:'',modules:[],checkedAt:new Date().toISOString()});}
   }catch{/* Keep the last confirmed access on transient failures. */}finally{busy=false;}
  };
  if(!access.checkedAt)void refresh();
  const timer=setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);
  return()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
 },[access.cacheScope,access.cacheUser]);
 const denied=Array.isArray(current.modules)&&!!current.checkedAt&&!canOpenPath(current.modules,path);
 return <SessionAccess.Provider value={current}>{denied?<main className="module-home-main"><h1>Módulo não habilitado</h1><p>Seu perfil não possui acesso a este módulo. Solicite a liberação ao administrador.</p><a href="/">Ver meus módulos</a></main>:children}</SessionAccess.Provider>;
}
export function useSessionAccess(){return useContext(SessionAccess);}

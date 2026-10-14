"use client";
import { createContext, useContext, useEffect } from "react";
const SessionAccess = createContext({ admin: false, displayName: "", modules: [] as string[] });
export function SessionAccessProvider({ access, children }: { access: { admin: boolean; displayName: string; modules: string[]; mustChangePassword?: boolean }; children: React.ReactNode }) {
  useEffect(()=>{
    if(!access.displayName || access.mustChangePassword)return;
    const check=async()=>{if(document.visibilityState!=="visible")return;try{const r=await fetch("/api/activity",{method:"POST"});if(r.status===403&&(await r.json()).mustChangePassword)window.location.assign("/trocar-senha");}catch{}};
    const timer=setInterval(check,60000);
    return()=>clearInterval(timer);
  },[access.displayName,access.mustChangePassword]);
  return <SessionAccess.Provider value={access}>{children}</SessionAccess.Provider>;
}
export function useSessionAccess() { return useContext(SessionAccess); }

import { useEffect, useState, type ReactNode } from "react";
import ChangePassword from "./change-password";

export default function NativePasswordGate({children}: {children: ReactNode}) {
  const [state,setState]=useState<"loading"|"ready"|"password"|"error">("loading");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;
    if(!navigator.onLine){setState("ready");return;}
    setState("loading");
    fetch("/api/session",{cache:"no-store"}).then(async response=>{
      if(response.status===401){location.assign("/tecnico/entrar");return;}
      if(!response.ok){if(active)setState(response.status===403?"error":"ready");return;}
      const body=await response.json();
      if(active)setState(body.mustChangePassword ? "password":"ready");
    }).catch(()=>{if(active)setState("ready");});
    return()=>{active=false;};
  },[retry]);
  if(state==="password")return <ChangePassword/>;
  if(state==="ready")return children;
  return <main className="field-app"><h1>Portal Técnico RJ</h1>{state==="loading"?<p role="status">Verificando seu acesso…</p>:<><p role="alert">Não foi possível verificar seu acesso. Seus registros permanecem salvos no aparelho.</p><button onClick={()=>setRetry(n=>n+1)}>Tentar novamente</button></>}</main>;
}

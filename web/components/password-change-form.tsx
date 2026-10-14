"use client";
import { useState, type FormEvent } from "react";
export default function PasswordChangeForm() {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError("");
    const form=new FormData(event.currentTarget);
    const password=String(form.get("password")||""),confirmation=String(form.get("confirmation")||"");
    if(password.length<6){setError("A senha deve ter pelo menos 6 caracteres.");return;}
    if(password!==confirmation){setError("As senhas não coincidem.");return;}
    setBusy(true);
    try{
      const response=await fetch("/api/session/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({currentPassword:form.get("currentPassword"),password,confirmation})});
      const result=await response.json();if(!response.ok)throw Error(result.error);
      window.location.assign("/login?passwordChanged=1");
    }catch(e){setError((e as Error).message);setBusy(false);}
  }
  return <main className="password-change-screen">
    <section className="password-change-card" role="dialog" aria-modal="true" aria-labelledby="password-change-title">
      <h1 id="password-change-title">Cadastre uma nova senha</h1>
      <p>Para continuar, substitua a senha inicial ou redefinida pelo administrador. Use pelo menos 6 caracteres.</p>
      <form onSubmit={save}>
        <label>Senha atual<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={256} disabled={busy}/></label>
        <label>Nova senha<input name="password" type="password" autoComplete="new-password" minLength={6} maxLength={128} required disabled={busy}/></label>
        <label>Confirmar nova senha<input name="confirmation" type="password" autoComplete="new-password" minLength={6} maxLength={128} required disabled={busy}/></label>
        {error&&<p className="error" role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>{busy?"Salvando…":"Salvar nova senha"}</button>
        <button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{const r=await fetch("/api/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"logout"})});if(!r.ok)throw Error("Não foi possível sair.");window.location.assign("/login");}catch(e){setError((e as Error).message);setBusy(false);}}}>Sair</button>
      </form>
    </section>
  </main>;
}

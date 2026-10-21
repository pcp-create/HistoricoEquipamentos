"use client";
import {useEffect,useState,type FormEvent} from 'react';
import {LockKeyhole} from 'lucide-react';
import {passwordValidation} from '@/lib/password-policy';
export default function ChangePassword(){
 const [ready,setReady]=useState(false);
 useEffect(()=>setReady(true),[]);
 const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent){e.preventDefault();const invalid=passwordValidation(password,confirmation);if(invalid){setError(invalid);return}setBusy(true);setError('');try{const r=await fetch('/api/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password,confirmation})});const b=await r.json();if(!r.ok)throw Error(b.error);
 const next=new URLSearchParams(location.search).get('next');
 location.assign(location.pathname==='/alterar-senha'?(next?.startsWith('/')&&!next.startsWith('//')&&!next.includes('\\')&&!next.startsWith('/alterar-senha')?next:'/'):location.href);
 }catch(e){setError((e as Error).message);setBusy(false)}}
 return <main style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:24,background:'#f4f7fa'}}><form onSubmit={submit} style={{width:'100%',maxWidth:440,padding:28,background:'white',border:'1px solid #d6e2ed',borderRadius:16,display:'grid',gap:16}}>
 <img src="/logo-rj.png" alt="RJ Compressores" style={{maxWidth:130}} onError={e=>{e.currentTarget.style.display='none'}}/>
 <LockKeyhole size={28}/><h1 style={{margin:0,fontSize:24}}>Defina sua nova senha</h1><p>Para continuar, substitua a senha inicial por uma senha pessoal diferente de 123456, com 6 a 128 caracteres.</p>
 <label>Nova senha<input style={{width:'100%',marginTop:6}} disabled={!ready || busy} required type="password" autoComplete="new-password" minLength={6} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <label>Confirmar nova senha<input style={{width:'100%',marginTop:6}} disabled={!ready || busy} required type="password" autoComplete="new-password" minLength={6} maxLength={128} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
 {error&&<p role="alert" style={{color:'#b33842'}}>{error}</p>}
 <button disabled={!ready || busy} type="submit">{busy?'Salvando…':'Salvar nova senha'}</button>
 <button disabled={!ready || busy} type="button" onClick={async()=>{await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});location.assign('/login')}}>Sair</button>
 </form></main>
}

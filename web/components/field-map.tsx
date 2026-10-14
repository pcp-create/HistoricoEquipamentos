"use client";
import {useEffect,useRef,useState} from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
const labels:Record<string,string>={done:'Executada',executing:'Em execução',overdue:'Em atraso',planned:'Programada'};
const colors:Record<string,string>={done:'#16834a',executing:'#2563eb',overdue:'#dc2626',planned:'#64748b'};
const date=(value:string)=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
export function useAutomaticFieldLocation(enabled:boolean) {
 const [locationMessage,setLocationMessage]=useState('');
 useEffect(()=>{
  if(!enabled)return;
  let disposed=false,busy=false,last=0;
  const update=()=>{
   if(disposed||busy||document.visibilityState!=='visible'||Date.now()-last<600000)return;
   if(!navigator.geolocation){setLocationMessage('Localização indisponível neste navegador.');return}
   busy=true;last=Date.now();
   navigator.geolocation.getCurrentPosition(async p=>{
    if(disposed){busy=false;return}
    try{const r=await fetch('/api/field/map',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,at:new Date(p.timestamp).toISOString()})});if(!r.ok)throw Error('Não foi possível registrar a posição.');last=Date.now();setLocationMessage('Posição atualizada em '+date(new Date(p.timestamp).toISOString()))}
    catch(e){setLocationMessage((e as Error).message)}finally{busy=false}
   },()=>{busy=false;if(!disposed){setLocationMessage('Permita a localização para compartilhar sua posição.')}},{enableHighAccuracy:true,timeout:20000,maximumAge:30000});
  };
  update();const timer=setInterval(update,60000);document.addEventListener('visibilitychange',update);
  return()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',update)};
 },[enabled]);
 return locationMessage;
}
export default function FieldMap({visible}:{visible:boolean}) {
 const [data,setData]=useState<any>(null),[mode,setMode]=useState('technicians'),[error,setError]=useState('');
 const container=useRef<HTMLDivElement>(null),map=useRef<Leaflet.Map|null>(null);
 async function refresh(){try{const r=await fetch('/api/field/map',{cache:'no-store'});const b=await r.json();if(!r.ok)throw Error(b.error);setData(b);setError('')}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void refresh();const t=setInterval(()=>{if(document.visibilityState==='visible')void refresh()},60000);return()=>clearInterval(t)},[]);
 useEffect(()=>{
  if(!visible||!container.current)return;
  let disposed=false;
  import('leaflet').then(L=>{
   if(disposed||!container.current)return;
   const m=L.map(container.current).setView([-27,-50],6);map.current=m;
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19,referrerPolicy:'origin'}).addTo(m);
   const points:Leaflet.LatLngExpression[]=[];
   for(const item of data?.[mode]||[]){
    if(typeof item.latitude!=='number'||typeof item.longitude!=='number')continue;
    const point:Leaflet.LatLngExpression=[item.latitude,item.longitude];points.push(point);
    const popup=document.createElement('div');const title=document.createElement('strong');title.textContent=item.name||'Técnico';popup.append(title);
    const info=document.createElement('p');info.textContent=mode==='technicians'?`${item.online?'Online':'Offline'} · ${item.source} · ${date(item.located_at)} (Brasília) · precisão ${Math.round(item.accuracy)} m`: `${labels[item.status]} · ${item.address} · ${item.precision}`;popup.append(info);
    L.circleMarker(point,{radius:10,color:'#fff',weight:2,fillColor:mode==='technicians'?(item.online?'#0f766e':'#dc2626'):colors[item.status],fillOpacity:1}).addTo(m).bindPopup(popup);
   }
   if(points.length)m.fitBounds(L.latLngBounds(points),{padding:[30,30],maxZoom:14});
  }).catch(()=>setError('Não foi possível carregar o mapa.'));
  return()=>{disposed=true;map.current?.remove();map.current=null};
 },[visible,data,mode]);
 if(!visible)return null;
 return <section className="field-map" aria-label="Mapa da equipe e programação">
  <nav className="field-view-switch" aria-label="Conteúdo do mapa"><button aria-pressed={mode==='technicians'} onClick={()=>setMode('technicians')}>Técnicos</button><button aria-pressed={mode==='orders'} onClick={()=>setMode('orders')}>OSs</button></nav>
  <p>Atualização da posição a cada 10 minutos com o portal aberto e autorizado. A última posição permanece disponível ao ficar offline ou fechar o portal.</p>
  {error&&<p role="alert">{error}</p>}
  {mode==='technicians'&&<p>🟢 Online · 🔴 Offline — última posição registrada. Offline após 15 minutos sem atividade ou ao sair do sistema.</p>}
  {mode==='orders'&&<p>🟢 Executadas · 🔵 Em execução · 🔴 Em atraso · ⚪ Programadas</p>}
  <div ref={container} style={{height:'min(65vh, 560px)',minHeight:320,borderRadius:12,zIndex:0}}/>
  {!data&&!error&&<p>Carregando posições…</p>}
  {data&&!data[mode].length&&<p>{mode==='orders'?'Nenhuma OS na sua programação.':'Nenhum técnico cadastrado.'}</p>}
  <ul>{(data?.[mode]||[]).map((item:any)=><li key={item.id}><strong>{item.name||'Técnico'}</strong> — {mode==='technicians'?`${item.online?'Online':'Offline'} · ${item.located_at?`${item.source}: ${date(item.located_at)} (Brasília)${Date.now()-Date.parse(item.located_at)>1200000?' · Posição desatualizada':''}`:'Sem localização registrada'}`:`${labels[item.status]} · ${item.address}`}{mode==='orders'&&(item.latitude==null||item.longitude==null)&&' · Sem coordenadas; posicione a localidade na programação de serviços.'}</li>)}</ul>
 </section>;
}

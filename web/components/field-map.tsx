"use client";
import { customerMapLabel } from "@/lib/service-scheduling/customer-map-label";
import {useEffect,useRef,useState} from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './field-map.css';
import './map-customer-label.css';
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
    const popup=document.createElement('div');popup.className='field-technician-card';
    const line=(label:string,value:string)=>{const p=document.createElement('p');const b=document.createElement('b');b.textContent=label+': ';p.append(b,document.createTextNode(value));popup.append(p)};
    const title=document.createElement('strong');title.textContent=item.name||'Técnico';popup.append(title);
    if(mode==='technicians') {
     popup.className='field-technician-card';
     const avatar=document.createElement('span');avatar.className='field-technician-avatar';avatar.textContent=(item.name||'T').split(/\s+/).filter(Boolean).slice(0,2).map((s:string)=>s[0]).join('');avatar.setAttribute('aria-hidden','true');popup.prepend(avatar);
     if(item.has_photo){const photo=document.createElement('img');photo.src='/api/users/photo?email='+encodeURIComponent(item.id);photo.alt='Foto de '+(item.name||'técnico');photo.className='field-technician-photo';photo.width=46;photo.height=46;photo.addEventListener('error',()=>photo.replaceWith(avatar));avatar.replaceWith(photo)}
     const statusLine=document.createElement('p');const statusLabel=document.createElement('b');statusLabel.textContent='Status: ';const statusValue=document.createElement('span');statusValue.textContent=item.online?'Online':'Offline';if(item.online)statusValue.className='field-technician-online';statusLine.append(statusLabel,statusValue);popup.append(statusLine);
     const phone=String(item.phone||'').replace(/[^0-9+]/g,'');
     if(phone){const p=document.createElement('p');p.append('Telefone: ');const a=document.createElement('a');a.href='tel:'+phone;a.textContent=item.phone;p.append(a);popup.append(p)}else line('Telefone','Não cadastrado');
     line('Cargo',item.job_title||'Técnico');if(item.department)line('Setor',item.department);
     line('Última atividade',item.last_seen_at?date(item.last_seen_at)+' (Brasília)':'Não registrada');
     line('Última posição',date(item.located_at)+' (Brasília)');
     line('Origem',item.source);line('Precisão',Math.round(item.accuracy)+' m');
     const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=`Mostrar OSs pendentes (${item.pendingOrders?.length||0})`;details.append(summary);
     const list=document.createElement('ul');for(const order of item.pendingOrders||[]){const li=document.createElement('li');li.textContent=`OS ${order.number} · ${order.customer||'Cliente não informado'} · ${order.date?order.date.split('-').reverse().join('/'):'Sem data'}`;list.append(li)}
     if(!list.children.length){const p=document.createElement('p');p.textContent='Nenhuma OS pendente enviada ao técnico.';details.append(p)}else details.append(list);
     popup.append(details);
    }else{
     const icon=document.createElement('span');icon.className='field-technician-avatar';icon.textContent='OS';icon.setAttribute('aria-hidden','true');popup.prepend(icon);
     line('Status',labels[item.status]||'Programada');
     line('Endereço',item.address||'Não informado');
     if(item.precision)line('Localização',item.precision);
    }
    if(mode==='technicians') {
     const marker=document.createElement('div');marker.className='field-person-marker '+(item.online?'is-online':'is-offline');
     const person=document.createElement('span');person.className='field-person-symbol';person.setAttribute('aria-hidden','true');
     person.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M7.5 7.5a4.5 4.5 0 0 1 9 0h.5a.75.75 0 0 1 0 1.5H7a.75.75 0 0 1 0-1.5h.5zM8 10h8v.5a4 4 0 0 1-8 0V10zM9 16l3 2 3-2c3 .5 5 2.5 5 5v1H4v-1c0-2.5 2-4.5 5-5z"/></svg>';
     const name=document.createElement('span');name.className='field-person-name';name.textContent=item.name||'Técnico';
     marker.append(person,name);
     L.marker(point,{icon:L.divIcon({html:marker,className:'field-person-icon',iconSize:[32,32],iconAnchor:[16,16],popupAnchor:[0,-18]}),title:`${item.name||'Técnico'} — ${item.online?'Online':'Offline'}`,alt:item.name||'Técnico',riseOnHover:true}).addTo(m).bindPopup(popup,{maxWidth:360,minWidth:220});
    }else{
     const customerLabel=document.createElement('span');customerLabel.textContent=customerMapLabel(item.customer);
     L.circleMarker(point,{radius:10,color:'#fff',weight:2,fillColor:colors[item.status],fillOpacity:1}).addTo(m).bindPopup(popup,{maxWidth:360,minWidth:220}).bindTooltip(customerLabel,{permanent:true,direction:'right',offset:[12,0],className:'map-customer-label',opacity:1});
    }
   }
   if(points.length)m.fitBounds(L.latLngBounds(points),{padding:[30,30],maxZoom:14});
  }).catch(()=>setError('Não foi possível carregar o mapa.'));
  return()=>{disposed=true;map.current?.remove();map.current=null};
 },[visible,data,mode]);
 if(!visible)return null;
 return <section className="field-map" aria-label="Mapa da equipe e programação">
  {error&&<p role="alert">{error}</p>}
  {mode==='technicians'&&<p>🟢 Online · 🔴 Offline — última posição registrada. Offline após 15 minutos sem atividade ou ao sair do sistema.</p>}
  {mode==='orders'&&<p>🟢 Executadas · 🔵 Em execução · 🔴 Em atraso · ⚪ Programadas</p>}
  <div className="field-map-canvas">
   <nav className="field-map-tabs" aria-label="Conteúdo do mapa">
    <button type="button" aria-pressed={mode==='technicians'} onClick={()=>setMode('technicians')}>Técnicos</button>
    <button type="button" aria-pressed={mode==='orders'} onClick={()=>setMode('orders')}>OSs</button>
   </nav>
   <div ref={container} style={{height:'min(65vh, 560px)',minHeight:320,borderRadius:12,zIndex:0}}/>
  </div>
  {!data&&!error&&<p>Carregando posições…</p>}
  {data&&!data[mode].length&&<p>{mode==='orders'?'Nenhuma OS na sua programação.':'Nenhum técnico cadastrado.'}</p>}
  <ul>{(data?.[mode]||[]).map((item:any)=><li key={item.id}><strong>{item.name||'Técnico'}</strong> — {mode==='technicians'?`${item.online?'Online':'Offline'} · ${item.located_at?`${item.source}: ${date(item.located_at)} (Brasília)${Date.now()-Date.parse(item.located_at)>1200000?' · Posição desatualizada':''}`:'Sem localização registrada'}`:`${labels[item.status]} · ${item.address}`}{mode==='orders'&&(item.latitude==null||item.longitude==null)&&' · Sem coordenadas; posicione a localidade na programação de serviços.'}</li>)}</ul>
 </section>;
}

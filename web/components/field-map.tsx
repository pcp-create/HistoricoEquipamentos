"use client";
import {lastSeen} from "@/lib/last-seen";
import { technicianMarkerLayout } from "@/lib/service-scheduling/technician-marker-layout";
import { clusterMapPoints } from "@/lib/service-scheduling/map-clusters";
import { customerMapLabel, singleCustomerLabel } from "@/lib/service-scheduling/customer-map-label";
import {useEffect,useRef,useState} from 'react';
import {nativePortal} from '@/lib/native-portal';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './field-map.css';
import './map-customer-label.css';
const labels:Record<string,string>={done:'Executada',executing:'Em execução',overdue:'Em atraso',planned:'Programada'};
const colors:Record<string,string>={done:'#16834a',executing:'#2563eb',overdue:'#dc2626',planned:'#64748b'};

export function useAutomaticFieldLocation(enabled:boolean) {
 const [locationMessage,setLocationMessage]=useState('');
 useEffect(()=>{
  if(!enabled)return;
  let disposed=false,busy=false,last=0;
  const update=()=>{
   if(disposed||busy||document.visibilityState!=='visible'||Date.now()-last<300000)return;
   if(!navigator.geolocation){setLocationMessage('Localização indisponível neste navegador.');return}
   busy=true;
   const collect=()=>navigator.geolocation.getCurrentPosition(async p=>{
    if(disposed){busy=false;return}
    try{const r=await fetch('/api/field/map',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,at:new Date(p.timestamp).toISOString()})});if(!r.ok)throw Error('Não foi possível registrar a posição.');last=Date.now();setLocationMessage('')}
    catch(e){setLocationMessage((e as Error).message)}finally{busy=false}
   },()=>{busy=false;if(!disposed){setLocationMessage('Permita a localização para compartilhar sua posição.')}},{enableHighAccuracy:true,timeout:30000,maximumAge:30000});
   if(nativePortal())void nativePortal()!.connection().then(online=>{if(online)collect();else busy=false}).catch(()=>{busy=false});else if(navigator.onLine)collect();else busy=false;
  };
  const resume=()=>{last=0;update();};
  update();const timer=setInterval(update,300000);document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);window.addEventListener('rj-network-change',resume);
  return()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);window.removeEventListener('rj-network-change',resume)};
 },[enabled]);
 return locationMessage;
}
export default function FieldMap({visible}:{visible:boolean}) {
 const [data,setData]=useState<any>(null),[mode,setMode]=useState('technicians'),[error,setError]=useState('');
 const container=useRef<HTMLDivElement>(null),map=useRef<Leaflet.Map|null>(null);
 async function refresh(){try{const r=await fetch('/api/field/map',{cache:'no-store'});const b=await r.json();if(!r.ok)throw Error(b.error);setData(b);setError('')}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void refresh();const t=setInterval(()=>{if(document.visibilityState==='visible')void refresh()},300000);const resumed=()=>{if(document.visibilityState==='visible')void refresh()};document.addEventListener("visibilitychange",resumed);window.addEventListener("rj-network-change",resumed);return()=>{clearInterval(t);document.removeEventListener("visibilitychange",resumed);window.removeEventListener("rj-network-change",resumed)}},[]);
 useEffect(()=>{if(visible)void refresh()},[visible]);
 useEffect(()=>{
  if(!visible||!container.current)return;
  let disposed=false;
  let resize:ResizeObserver|undefined;
  import('leaflet').then(L=>{
   if(disposed||!container.current)return;
   const m=L.map(container.current).setView([-27,-50],6);map.current=m;
   resize=new ResizeObserver(()=>{if(!disposed)m.invalidateSize({pan:false})});resize.observe(container.current);
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19,referrerPolicy:'origin'}).addTo(m);
   const points:Leaflet.LatLngExpression[]=[];
   const entries:{point:Leaflet.LatLngExpression;marker:Leaflet.Layer;popup:HTMLElement;name:string;customerId?:string;status:string;address:string;number:string}[]=[];
   const markers=L.layerGroup().addTo(m);
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
     line('Visto por último',lastSeen(item.last_seen_at));line('Precisão',Math.round(item.accuracy)+' m');
     const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=`Mostrar OSs pendentes (${item.pendingOrders?.length||0})`;details.append(summary);
     const list=document.createElement('ul');for(const order of item.pendingOrders||[]){const li=document.createElement('li');li.textContent=`OS ${order.number} · ${order.customer||'Cliente não informado'} · ${order.date?order.date.split('-').reverse().join('/'):'Sem data'}`;list.append(li)}
     if(!list.children.length){const p=document.createElement('p');p.textContent='Nenhuma OS pendente enviada ao técnico.';details.append(p)}else details.append(list);
     popup.append(details);
    }else{
     title.textContent=customerMapLabel(item.customer);
     const icon=document.createElement('span');icon.className='field-technician-avatar';icon.textContent='OS';icon.setAttribute('aria-hidden','true');popup.prepend(icon);
     line('Endereço',item.address||'Não informado');
     line('OS '+(item.number||item.id),labels[item.status]||'Programada');
     if(item.precision)line('Localização',item.precision);
    }
    let pin:Leaflet.Layer;
    if(mode==='technicians') {
     const marker=document.createElement('div');marker.className='field-person-marker '+(item.online?'is-online':'is-offline');
     const person=document.createElement('span');person.className='field-person-symbol';person.setAttribute('aria-hidden','true');
     const name=document.createElement('span');name.className='field-person-name';name.textContent=item.name||'Técnico';
     marker.append(person,name);
     pin=L.marker(point,{icon:L.divIcon({html:marker,className:'field-person-icon',iconSize:[22,22],iconAnchor:[11,11],popupAnchor:[0,-13]}),title:`${item.name||'Técnico'} — ${item.online?'Online':'Offline'}`,alt:item.name||'Técnico',riseOnHover:true}).bindPopup(popup,{maxWidth:360,minWidth:220,autoPanPaddingTopLeft:L.point(10,80),autoPanPaddingBottomRight:L.point(10,10)});
    }else{
     const customerLabel=document.createElement('span');customerLabel.textContent=customerMapLabel(item.customer);
     pin=L.circleMarker(point,{radius:10,color:'#fff',weight:2,fillColor:colors[item.status],fillOpacity:1}).bindPopup(popup,{maxWidth:360,minWidth:220}).bindTooltip(customerLabel,{permanent:true,direction:'right',offset:[12,0],className:'map-customer-label',opacity:1});
    }
    entries.push({point,marker:pin,popup,address:item.address||'Não informado',number:String(item.number||item.id),customerId:item.customerId,status:item.status,name:mode==='technicians'?(item.name||'Técnico'):customerMapLabel(item.customer)});
   }
   const draw=()=>{
    markers.clearLayers();
    if(mode==='technicians'){
     const canvas=document.createElement('canvas');const context=canvas.getContext('2d');if(context)context.font='600 12px Arial';
     const positions=technicianMarkerLayout(entries,e=>m.project(e.point,m.getZoom()),e=>context?.measureText(e.name).width||e.name.length*8);
     for(const p of positions){
      const position=m.unproject([p.x,p.y],m.getZoom());
      if(p.x!==p.originalX||p.y!==p.originalY)L.polyline([p.item.point,position],{color:'#64748b',weight:1,dashArray:'3 4',interactive:false}).addTo(markers);
      (p.item.marker as Leaflet.Marker).setLatLng(position).addTo(markers);
     }
     return;
    }
    const groups=clusterMapPoints(entries,e=>m.project(e.point,m.getZoom()),m.getZoom()>=18?0:52);
    for(const group of groups){
     if(group.items.length===1){markers.addLayer(group.items[0].marker);continue}
     const count=document.createElement('span');count.className='field-map-cluster';count.textContent=String(group.items.length);
     if(mode==='orders'){
      const statuses=[...new Set(group.items.map(e=>e.status))].sort();
      count.style.background=colors[statuses[0]];
      if(statuses.length>1){
       count.textContent='';count.style.background='transparent';
       const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');svg.classList.add('field-cluster-segments');
       let angle=-Math.PI/2;
       for(const status of statuses){const end=angle+Math.PI*2/statuses.length;const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('fill',colors[status]);path.setAttribute('d',`M50 50 L${50+50*Math.cos(angle)} ${50+50*Math.sin(angle)} A50 50 0 ${end-angle>Math.PI?1:0} 1 ${50+50*Math.cos(end)} ${50+50*Math.sin(end)} Z`);svg.append(path);
        const label=document.createElementNS(svg.namespaceURI,'text');const middle=(angle+end)/2;label.setAttribute('x',String(50+27*Math.cos(middle)));label.setAttribute('y',String(50+27*Math.sin(middle)));label.setAttribute('text-anchor','middle');label.setAttribute('dominant-baseline','central');label.setAttribute('fill','white');label.setAttribute('font-size','30');label.setAttribute('font-weight','700');label.textContent=String(group.items.filter(e=>e.status===status).length);svg.append(label);angle=end;
       }count.append(svg);
      }
     }
     const cluster=L.marker(m.unproject([group.x,group.y]),{icon:L.divIcon({html:count,className:'field-map-cluster-icon',iconSize:[36,36],iconAnchor:[18,18]}),title:`${group.items.length} ${mode==='technicians'?'técnicos':'OSs'}`}).addTo(markers);
     if(mode==='orders'){
      const customer=singleCustomerLabel(group.items.map(e=>({customerId:e.customerId,customer:e.name})));
      if(customer){const label=document.createElement('span');label.textContent=customer;cluster.bindTooltip(label,{permanent:true,direction:'right',offset:[22,0],className:'map-customer-label',opacity:1})}
     }
     const distinct=new Set(group.items.map(e=>m.latLngToLayerPoint(e.point).toString())).size>1;
     if(distinct&&m.getZoom()<19&&(mode!=='orders'||!singleCustomerLabel(group.items.map(e=>({customerId:e.customerId,customer:e.name})))))cluster.on('click',()=>m.fitBounds(L.latLngBounds(group.items.map(e=>e.point)),{padding:[60,60],maxZoom:Math.min(19,m.getZoom()+3)}));
     else if(mode==='orders'){
      const list=document.createElement('div');list.className='field-technician-card';
      const sections=new Map<string,HTMLElement>();
      for(const entry of group.items){
       const key=JSON.stringify([entry.customerId||entry.name,entry.address]);
       let section=sections.get(key);
       if(!section){section=document.createElement('section');const title=document.createElement('strong');title.textContent=entry.name;const address=document.createElement('p');address.textContent='Endereço: '+entry.address;section.append(title,address);sections.set(key,section);list.append(section)}
       const row=document.createElement('p');const number=document.createElement('b');number.textContent='OS '+entry.number+' · ';const status=document.createElement('span');status.textContent=labels[entry.status]||'Programada';status.style.color=colors[entry.status];row.append(number,status);section.append(row);
      }
      cluster.bindPopup(list,{maxWidth:360,minWidth:220});
     }else{
      const list=document.createElement('div');list.className='field-cluster-list';
      for(const entry of group.items){const button=document.createElement('button');button.type='button';button.textContent=entry.name;button.addEventListener('click',()=>m.openPopup(entry.popup,entry.point,{maxWidth:360,minWidth:220}));list.append(button)}
      cluster.bindPopup(list);
     }
    }
   };
   if(points.length)m.fitBounds(L.latLngBounds(points),{padding:[30,30],maxZoom:14});
   draw();m.on('zoomend',draw);
  }).catch(()=>setError('Não foi possível carregar o mapa.'));
  return()=>{disposed=true;resize?.disconnect();map.current?.remove();map.current=null};
 },[visible,data,mode]);
 if(!visible)return null;
 return <section className="field-map" aria-label="Mapa da equipe e programação">
  {error&&<p role="alert">{error}</p>}
  <div className="field-map-canvas">
   <div className="field-map-legend" aria-label="Legenda do mapa">
    {(mode==='technicians' ? [['#16834a','Online'],['#dc2626','Offline']] : [['#2563eb','Em execução'],['#dc2626','Em atraso'],['#64748b','Programadas']]).map(([color,label])=><span key={label}><i style={{background:color}} aria-hidden="true"/>{label}</span>)}
   </div>
   <nav className="field-map-tabs" aria-label="Conteúdo do mapa">
    <button type="button" aria-pressed={mode==='technicians'} onClick={()=>setMode('technicians')}>Técnicos</button>
    <button type="button" aria-pressed={mode==='orders'} onClick={()=>setMode('orders')}>OSs</button>
   </nav>
   <div ref={container} className="field-map-surface"/>
   {!data&&!error&&<p className="field-map-notice">Carregando posições…</p>}
   {data&&!data[mode].length&&<p className="field-map-notice">{mode==='orders'?'Nenhuma OS na sua programação.':'Nenhum técnico cadastrado.'}</p>}
  </div>


 </section>;
}

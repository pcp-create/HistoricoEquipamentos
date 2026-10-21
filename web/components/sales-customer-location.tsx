"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MapPin, Pencil, Save, X, LocateFixed } from "lucide-react";
import type { VisitCustomer } from "@/lib/visits/model";
import "leaflet/dist/leaflet.css";
export default function SalesCustomerLocation({ customer, onSaved, draft = false, onPoint, children }: {children?:ReactNode;customer: VisitCustomer; onSaved: () => Promise<void>; draft?: boolean; onPoint?: (point:[number,number])=>void}) {
  const root=useRef<HTMLDivElement>(null);
  const [editing,setEditing]=useState(draft),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [point,setPoint]=useState<[number,number] | null>(customer.latitude !== null && customer.longitude !== null ? [customer.latitude,customer.longitude] : null);
  const [resolvedAddress,setResolvedAddress]=useState<{city:string;uf:string;address:string}|null>(null);
  const [addressStatus,setAddressStatus]=useState("");
  const latitude=point?.[0],longitude=point?.[1];
  useEffect(()=>{
    setResolvedAddress(null);setAddressStatus("");
    if(draft || customer.address?.trim() || latitude==null || longitude==null)return;
    const controller=new AbortController();
    setAddressStatus("Buscando endereço pelo ponto do mapa…");
    const timer=setTimeout(async()=>{
      try{
        const r=await fetch('/api/visits/location-search',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({action:'reverse',latitude,longitude})});
        const b=await r.json();if(!r.ok)throw Error();if(controller.signal.aborted)return;
        setResolvedAddress(b.address || null);
        setAddressStatus(b.address?.address ? "Endereço aproximado identificado pelo mapa." : "Não foi possível identificar a rua neste ponto do mapa.");
      }catch{if(!controller.signal.aborted)setAddressStatus("Não foi possível consultar o endereço pelo mapa. Tente novamente ao selecionar o cliente.");}
    },300);
    return()=>{clearTimeout(timer);controller.abort()};
  },[draft,customer.key,customer.address,latitude,longitude]);
  const editingRef=useRef(draft);
  const pointCallback=useRef(onPoint);pointCallback.current=onPoint;
  const selectedPointRef=useRef(point);
  const publishPoint=(p:[number,number])=>{
    const old=selectedPointRef.current;
    if(old && Math.abs(old[0]-p[0])<1e-9 && Math.abs(old[1]-p[1])<1e-9)return;
    selectedPointRef.current=p;setPoint(p);pointCallback.current?.(p);
  };
  const putRef=useRef<((p:[number,number])=>void) | null>(null);
  const [query,setQuery]=useState("");
  const [searching,setSearching]=useState(false);
  const [locating,setLocating]=useState(false);
  const [mapReady,setMapReady]=useState(false);
  const locationRequest=useRef(0);
  function useCurrentLocation(){
    if(locating || !mapRef.current)return;
    setError("");
    if(!navigator.geolocation){setError("Este navegador não oferece localização. Busque o endereço ou marque o ponto no mapa.");return;}
    const request=++locationRequest.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position=>{
      if(request!==locationRequest.current || !mapRef.current)return;
      setLocating(false);
      const p:[number,number]=[position.coords.latitude,position.coords.longitude];
      if(!Number.isFinite(p[0]) || Math.abs(p[0])>85 || !Number.isFinite(p[1]) || Math.abs(p[1])>180){setError("Localização inválida. Marque o ponto no mapa.");return;}
      putRef.current?.(p);mapRef.current.setView(p,16,{animate:false});publishPoint(p);setResults([]);setSearched(false);
    },failure=>{
      if(request!==locationRequest.current)return;
      setLocating(false);
      setError(failure.code===1?"Permita o acesso à localização nas configurações do navegador ou marque o ponto no mapa.":failure.code===3?"A localização demorou para responder. Tente novamente ou marque o ponto no mapa.":"Não foi possível obter a localização. Verifique o GPS ou marque o ponto no mapa.");
    },{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  }
  const [results,setResults]=useState<{label:string;latitude:number;longitude:number}[]>([]);
  const [searched,setSearched]=useState(false);
  async function searchAddress(){
    if(searching)return;setSearching(true);setError("");setResults([]);setSearched(false);
    try{const r=await fetch("/api/visits/location-search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query})});const b=await r.json();if(!r.ok)throw Error(b.error);setResults(b.results);setSearched(true);}catch(e){setError((e as Error).message)}finally{setSearching(false)}
  }
  const markerRef=useRef<import("leaflet").Marker | null>(null);
  const mapRef=useRef<import("leaflet").Map | null>(null);
  useEffect(()=>{
    let closed=false;let resize:ResizeObserver | undefined;
    void import("leaflet").then(L=>{
      if(closed || !root.current)return;
      const original: [number,number] | null=customer.latitude !== null && customer.longitude !== null ? [customer.latitude,customer.longitude] : null;
      const map=L.map(root.current,{scrollWheelZoom:true}).setView(original || [-14.2,-51.9],original?15:4);mapRef.current=map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,referrerPolicy:"origin",attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
      const put=(latlng:[number,number])=>{
        if(markerRef.current)markerRef.current.setLatLng(latlng);
        else {
          const icon=document.createElement("span");icon.className="sales-location-pin";
          markerRef.current=L.marker(latlng,{interactive:false,opacity:editingRef.current?0:1,icon:L.divIcon({className:"sales-location-marker",html:icon,iconSize:[24,24],iconAnchor:[12,26]})}).addTo(map);
        }
      };
      putRef.current=put;setMapReady(true);
      if(original)put(original);
      let choosing=false;
      map.on("dragstart zoomstart",()=>{if(editingRef.current)choosing=true;});
      map.on("moveend",()=>{
        if(!editingRef.current || !choosing)return;choosing=false;
        const center=map.getCenter().wrap();
        const p:[number,number]=[Math.max(-85,Math.min(85,center.lat)),center.lng];
        put(p);publishPoint(p);
      });
      resize=new ResizeObserver(()=>map.invalidateSize());resize.observe(root.current);
    }).catch(()=>{if(!closed)setError("Não foi possível carregar o mapa.");});
    return()=>{closed=true;locationRequest.current++;resize?.disconnect();mapRef.current?.remove();mapRef.current=null;markerRef.current=null;putRef.current=null;};
  },[customer.key,customer.latitude,customer.longitude]);
  const edit=(value:boolean)=>{
    if(value && selectedPointRef.current)mapRef.current?.setView(selectedPointRef.current,mapRef.current.getZoom(),{animate:false});
    editingRef.current=value;setEditing(value);markerRef.current?.setOpacity(value?0:1);
  };
  const cancel=()=>{
    edit(false);setError("");
    if(customer.latitude !== null && customer.longitude !== null){const p:[number,number]=[customer.latitude,customer.longitude];selectedPointRef.current=p;setPoint(p);markerRef.current?.setLatLng(p);mapRef.current?.setView(p,15);}
    else{selectedPointRef.current=null;setPoint(null);markerRef.current?.remove();markerRef.current=null;}
  };
  async function save(){
    if(!point || busy)return;setBusy(true);setError("");
    try{
      const r=await fetch("/api/visits",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"location",customer_key:customer.key,latitude:point[0],longitude:point[1],version:customer.locationVersion ?? 0})});
      const b=await r.json();if(!r.ok)throw Error(b.error);edit(false);await onSaved();
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <section className="sales-customer-location" aria-label="Localização do cliente">
    <div className="sales-location-heading"><strong><MapPin size={16}/>Localização do cliente</strong>
      {!draft && !editing && <button type="button" onClick={()=>edit(true)}><Pencil size={15}/>Alterar localização</button>}
    </div>
    {editing && <div className="sales-location-search">
      <label>Buscar endereço ou cidade<input value={query} onChange={e=>{setQuery(e.target.value);setResults([]);setSearched(false)}} placeholder="Ex.: Rua XV de Novembro, Lages, SC" onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void searchAddress()}}} /></label>
      <div className="sales-location-search-actions"><button type="button" disabled={searching || locating || query.trim().length<3} onClick={()=>void searchAddress()}>{searching?"Buscando…":"Buscar no mapa"}</button>
      {draft && <button type="button" disabled={locating || searching || !mapReady} onClick={useCurrentLocation}><LocateFixed size={16}/>{locating?"Localizando…":"Usar localização atual"}</button>}</div>
      {results.length>0 && <ul>{results.map((result,i)=><li key={i}><button type="button" onClick={()=>{const p:[number,number]=[result.latitude,result.longitude];putRef.current?.(p);mapRef.current?.setView(p,15,{animate:false});publishPoint(p);setResults([]);setSearched(false);}}>{result.label}</button></li>)}</ul>}
      {searched && !results.length && <p role="status">Nenhum local encontrado. Tente informar a cidade e o estado.</p>}
    </div>}
    <div className="sales-location-map-frame">
      <div ref={root} className="sales-customer-mini-map" />
      {editing && <div className="sales-location-center" aria-label="Ponto fixo no centro do mapa"><span className="sales-location-pin" /></div>}
    </div>
    {!draft && !point && <p className="sales-muted">Cliente sem posição cadastrada. Selecione “Alterar localização” e mova o mapa até o local desejado.</p>}
    {editing && <><p className="sales-muted">Arraste o mapa até que o local desejado fique sob o marcador central. {draft ? "A posição será salva junto com o cadastro do Lead e o agendamento." : "A alteração será salva para este cliente no módulo Visitas."}</p>
      {!draft && <div className="sales-actions"><button type="button" disabled={busy} onClick={cancel}><X size={16}/>Cancelar</button><button type="button" className="sales-primary" disabled={busy || !point} onClick={()=>void save()}><Save size={16}/>{busy?"Salvando…":"Salvar localização"}</button></div>}</>}
    {error && <p className="sales-error" role="alert">{error}</p>}
    {!draft && <section className="sales-lead-address" aria-label="Endereço do cliente">
      <div className="sales-lead-address-heading"><strong>Endereço do cliente</strong></div>
      <dl><div><dt>Cidade / UF</dt><dd>{[resolvedAddress?.city || customer.city,resolvedAddress?.uf || customer.uf].filter(Boolean).join(" / ") || "Não informado"}</dd></div>
      <div><dt>Endereço</dt><dd>{customer.address || resolvedAddress?.address || "Endereço não identificado"}</dd></div></dl>
      {addressStatus && <p className="sales-muted" role="status">{addressStatus}</p>}
    </section>}
    {children}
  </section>;
}

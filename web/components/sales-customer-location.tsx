"use client";
import { useEffect, useRef, useState } from "react";
import { MapPin, Pencil, Save, X } from "lucide-react";
import type { VisitCustomer } from "@/lib/visits/model";
import "leaflet/dist/leaflet.css";
export default function SalesCustomerLocation({ customer, onSaved, draft = false, onPoint }: {customer: VisitCustomer; onSaved: () => Promise<void>; draft?: boolean; onPoint?: (point:[number,number])=>void}) {
  const root=useRef<HTMLDivElement>(null);
  const [editing,setEditing]=useState(draft),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [point,setPoint]=useState<[number,number] | null>(customer.latitude !== null && customer.longitude !== null ? [customer.latitude,customer.longitude] : null);
  const editingRef=useRef(draft);
  const pointCallback=useRef(onPoint);pointCallback.current=onPoint;
  const putRef=useRef<((p:[number,number])=>void) | null>(null);
  const [query,setQuery]=useState("");
  const [searching,setSearching]=useState(false);
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
          markerRef.current=L.marker(latlng,{draggable:editingRef.current,icon:L.divIcon({className:"sales-location-marker",html:icon,iconSize:[24,24],iconAnchor:[12,26]})}).addTo(map);
          markerRef.current.on("dragend",()=>{const p=markerRef.current!.getLatLng();setPoint([p.lat,p.lng]);pointCallback.current?.([p.lat,p.lng]);});
        }
      };
      putRef.current=put;
      if(original)put(original);
      map.on("click",e=>{if(!editingRef.current)return;put([e.latlng.lat,e.latlng.lng]);setPoint([e.latlng.lat,e.latlng.lng]);pointCallback.current?.([e.latlng.lat,e.latlng.lng]);});
      resize=new ResizeObserver(()=>map.invalidateSize());resize.observe(root.current);
    }).catch(()=>{if(!closed)setError("Não foi possível carregar o mapa.");});
    return()=>{closed=true;resize?.disconnect();mapRef.current?.remove();mapRef.current=null;markerRef.current=null;putRef.current=null;};
  },[customer.key,customer.latitude,customer.longitude]);
  const edit=(value:boolean)=>{editingRef.current=value;setEditing(value);if(value)markerRef.current?.dragging?.enable();else markerRef.current?.dragging?.disable();};
  const cancel=()=>{
    edit(false);setError("");
    if(customer.latitude !== null && customer.longitude !== null){const p:[number,number]=[customer.latitude,customer.longitude];setPoint(p);markerRef.current?.setLatLng(p);mapRef.current?.setView(p,15);}
    else{setPoint(null);markerRef.current?.remove();markerRef.current=null;}
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
    {customer.address && <p className="sales-muted">{customer.address} · {customer.city}/{customer.uf}</p>}
    {editing && <div className="sales-location-search">
      <label>Buscar endereço ou cidade<input value={query} onChange={e=>{setQuery(e.target.value);setResults([]);setSearched(false)}} placeholder="Ex.: Rua XV de Novembro, Lages, SC" onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void searchAddress()}}} /></label>
      <button type="button" disabled={searching || query.trim().length<3} onClick={()=>void searchAddress()}>{searching?"Buscando…":"Buscar no mapa"}</button>
      {results.length>0 && <ul>{results.map((result,i)=><li key={i}><button type="button" onClick={()=>{const p:[number,number]=[result.latitude,result.longitude];putRef.current?.(p);mapRef.current?.setView(p,15);setPoint(p);pointCallback.current?.(p);setResults([]);setSearched(false);}}>{result.label}</button></li>)}</ul>}
      {searched && !results.length && <p role="status">Nenhum local encontrado. Tente informar a cidade e o estado.</p>}
    </div>}
    <div ref={root} className="sales-customer-mini-map" />
    {!draft && !point && <p className="sales-muted">Cliente sem posição cadastrada. Selecione “Alterar localização” e marque o ponto no mapa.</p>}
    {editing && <><p className="sales-muted">Clique no mapa ou arraste o marcador até o local correto. {draft ? "A posição será salva junto com o cadastro do Lead e o agendamento." : "A alteração será salva para este cliente no módulo Visitas."}</p>
      {!draft && <div className="sales-actions"><button type="button" disabled={busy} onClick={cancel}><X size={16}/>Cancelar</button><button type="button" className="sales-primary" disabled={busy || !point} onClick={()=>void save()}><Save size={16}/>{busy?"Salvando…":"Salvar localização"}</button></div>}</>}
    {error && <p className="sales-error" role="alert">{error}</p>}
  </section>;
}

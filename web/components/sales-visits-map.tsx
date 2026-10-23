"use client";
import { CalendarCheck2, Users, Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { VisitCustomer, SalesVisit, VisitSellerLocation } from "@/lib/visits/model";
import { lastSeen } from "@/lib/last-seen";
import { healthLabels } from "@/lib/visits/model";
import "leaflet/dist/leaflet.css";
import "./map-customer-label.css";
import { clusterMapPoints } from "@/lib/service-scheduling/map-clusters";
import { customerMapLabel } from "@/lib/service-scheduling/customer-map-label";
function scheduledIcon() {
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  for(const [key,value] of Object.entries({viewBox:"0 0 24 24",width:"16",height:"16",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":"true"}))svg.setAttribute(key,value);
  const path=document.createElementNS("http://www.w3.org/2000/svg","path");path.setAttribute("d","M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M9 16l2 2 4-4");svg.append(path);return svg;
}
const noSellers: VisitSellerLocation[] = [];
export default function SalesVisitsMap({
  sellers = noSellers,
  customerActionLabel,
  onEquipment,
  customers,
  visits,
  onSelect,
}: {
  customerActionLabel?: string;
  onEquipment?: (customer: VisitCustomer, equipment: NonNullable<VisitCustomer["equipment"]>[number]) => void;
  sellers?: VisitSellerLocation[];
  customers: VisitCustomer[];
  visits: SalesVisit[];
  onSelect: (c: VisitCustomer) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const [mapReady, setMapReady] = useState(0);
  const [showTerritories, setShowTerritories] = useState(false);
  const [territories, setTerritories] = useState<any>(null);
  const [territoryError, setTerritoryError] = useState("");
  const [territoryLoading, setTerritoryLoading] = useState(false);
  const sellerNames = [...new Set<string>(territories?.sellers || [])].sort();
  const sellerColor = (name: string) => name === "Sem vendedor" ? "#708090" : `hsl(${(sellerNames.indexOf(name) * 137.508 + 215) % 360} 65% 43%)`;
  useEffect(() => {
    if (!showTerritories || territories) return;
    const controller = new AbortController();
    setTerritoryLoading(true); setTerritoryError("");
    fetch("/api/service-scheduling/territories", {signal:controller.signal, cache:"no-store"})
      .then(async r => { const b = await r.json(); if (!r.ok) throw Error(b.error || "Não foi possível carregar a divisão comercial."); if (!controller.signal.aborted) {
          const features = b.features.map((feature: any) => ({...feature, properties:{...feature.properties, seller:feature.properties.seller_name || feature.properties.seller}}));
          setTerritories({...b, features, sellers:[...new Set(features.map((feature: any) => feature.properties.seller))]});
        } })
      .catch(e => { if (!controller.signal.aborted) setTerritoryError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setTerritoryLoading(false); });
    return () => controller.abort();
  }, [showTerritories, territories]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showTerritories || !territories) return;
    let disposed = false;
    let layer: import("leaflet").GeoJSON | undefined;
    void import("leaflet").then(L => {
      if (disposed) return;
      layer = L.geoJSON(territories, {
        style: f => ({color:sellerColor(f?.properties.seller),weight:0.7,opacity:0.65,fillOpacity:0.22}),
        onEachFeature: (f, polygon) => {
          const label = document.createElement("span");
          label.textContent = `${f.properties.city}/${f.properties.uf} · ${f.properties.seller}`;
          polygon.bindTooltip(label,{sticky:true});
        },
        attribution:'Municípios: <a href="https://github.com/tbrugz/geodata-br">Geodata BR / IBGE</a>',
      }).addTo(map);
      layer.bringToBack();
    });
    return () => { disposed = true; layer?.remove(); };
  }, [showTerritories, territories, mapReady]);
  const [showNames, setShowNames] = useState(true);
  const mapped = customers.filter(
    (c) => c.latitude !== null && c.longitude !== null,
  );
  const callbacks = useRef({onSelect, onEquipment});
  callbacks.current = {onSelect, onEquipment};
  const fitted = useRef(false);
  useEffect(() => {
    let closed = false;
    let observer: ResizeObserver | undefined;
    void import("leaflet").then(L => {
      if (closed || !root.current) return;
      const map = L.map(root.current).setView([-27, -50], 6);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        referrerPolicy: "origin", maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      setMapReady(value => value + 1);
      observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(root.current);
    });
    return () => {
      closed = true;
      observer?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      fitted.current = false;
    };
  }, []);
  // Refresh overlays without recreating tiles or resetting the user's zoom/pan.
  const contentKey = JSON.stringify({customers, visits, sellers});
  useEffect(() => {
    const activeMap = mapRef.current;
    if (!activeMap) return;
    const m: import("leaflet").Map = activeMap;
    let closed = false;
    let cleanup: (() => void) | undefined;
    void import("leaflet").then(L => {
      if (closed) return;
      const located = customers.filter(c => c.latitude !== null && c.longitude !== null);
      const scheduled = new Map<string, SalesVisit>();
      for (const v of visits) {
        if (v.status === "scheduled" && (!scheduled.has(v.customer_key) || v.scheduled_at < scheduled.get(v.customer_key)!.scheduled_at)) scheduled.set(v.customer_key, v);
      }
      const colors = {overdue:"#bd454b",due:"#ad7918",current:"#258463"};
      const layer = L.layerGroup().addTo(m);
      let expandedLocation: string | null = null;
      function drawClusters() {
        layer.eachLayer(item => { item.unbindTooltip(); item.unbindPopup(); });
        layer.clearLayers();
        m.eachLayer(item => { if (item instanceof L.Tooltip) m.removeLayer(item); });
        m.getPane("tooltipPane")?.replaceChildren();
        const groups = clusterMapPoints(located, c => m.project([c.latitude!,c.longitude!], m.getZoom()), m.getZoom() >= 18 ? 0 : 52);
        const displayed = groups.flatMap(cluster => {
          const key = `${cluster.items[0].latitude},${cluster.items[0].longitude}`;
          const same = cluster.items.every(c => `${c.latitude},${c.longitude}` === key);
          if (!same || key !== expandedLocation || cluster.items.length < 2) return [{...cluster, spread:false}];
          const columns = Math.max(2, Math.min(cluster.items.length, Math.floor((m.getSize().x - 40) / 140)));
          return cluster.items.map((c,i) => ({...cluster,items:[c],spread:true,
            x:cluster.x + (i % columns - (Math.min(columns,cluster.items.length - Math.floor(i/columns)*columns)-1)/2)*140,
            y:cluster.y + Math.floor(i/columns)*95,
          }));
        });
        for (const cluster of displayed) {
          const group = cluster.items;
          const size = group.length >= 100 ? 42 : group.length >= 10 ? 36 : 30;
          const distinct = new Set(group.map(c=>`${c.latitude},${c.longitude}`)).size > 1;
          const counts = {overdue:0,due:0,current:0};
          for (const c of group) counts[c.health]++;
          const segments: string[] = []; let start = 0;
          for (const status of ["overdue","due","current"] as const) {
            if (!counts[status]) continue;
            const end = start + counts[status]/group.length*100;
            segments.push(`${colors[status]} ${start}% ${end}%`); start=end;
          }
          const icon = document.createElement("span");
          icon.style.width = icon.style.height = `${size}px`;
          icon.style.background = `conic-gradient(${segments.join(",")})`;
          const number = document.createElement("b");
          number.className = "sales-map-count";
          number.textContent = group.length > 1 ? String(group.length) : scheduled.has(group[0].key) ? "" : "●";
          if(group.length===1 && scheduled.has(group[0].key))number.append(scheduledIcon());
          if (group.length === 1 && scheduled.has(group[0].key)) number.setAttribute("data-scheduled", "true");
          icon.append(number);
          const hasScheduled = group.some(c=>scheduled.has(c.key));
          if(group.length>1 && hasScheduled){const badge=document.createElement("i");badge.className="sales-map-scheduled-badge";badge.append(scheduledIcon());icon.append(badge)}
          if(cluster.spread) L.polyline([[group[0].latitude!,group[0].longitude!],m.unproject([cluster.x,cluster.y],m.getZoom())],{color:"#71899e",weight:1,dashArray:"3 4",interactive:false}).addTo(layer);
          const marker = L.marker(m.unproject([cluster.x,cluster.y],m.getZoom()),{icon:L.divIcon({className:group.length === 1 ? "sales-map-marker sales-map-pin" : "sales-map-marker",html:icon,iconSize:[size,size],iconAnchor:group.length === 1 ? [size/2,size+6] : [size/2,size/2],popupAnchor:group.length === 1 ? [0,-size] : [0,0]})}).addTo(layer);
          const description = Object.entries(counts).filter(([,count])=>count).map(([key,count])=>`${healthLabels[key as keyof typeof counts]}: ${count}`).join(" · ");
          marker.getElement()?.setAttribute("aria-label",group.length>1 ? `${group.length} clientes agrupados. ${description}` : customerMapLabel(group[0].name));
          marker.getElement()?.setAttribute("title",description);
          if(group.length===1){
            const label=document.createElement("span");label.textContent=customerMapLabel(group[0].name);
            L.tooltip({permanent:true,direction:cluster.spread?"bottom":"right",offset:cluster.spread?[0,18]:[size/2+4,-size/2-6],className:cluster.spread?"map-customer-label sales-map-spread-label":"map-customer-label",opacity:1}).setLatLng(marker.getLatLng()).setContent(label).addTo(layer);
          }
          if(distinct){
            marker.on("click",()=>m.fitBounds(group.map(c=>[c.latitude!,c.longitude!] as [number,number]),{padding:[60,60],maxZoom:Math.min(19,m.getZoom()+3)}));
          }else if(group.length > 1){
            marker.on("click",()=>{expandedLocation=`${group[0].latitude},${group[0].longitude}`;drawClusters()});
          }else{
            const popup=document.createElement("div");popup.className="sales-map-customers";
            for(const c of group){
              const section=document.createElement("section");
              const title=document.createElement("strong");title.textContent=c.name;section.append(title);
              const status=document.createElement("span");status.className="sales-badge " + c.health;status.textContent=healthLabels[c.health];section.append(status);
              const location=document.createElement("p");location.className="sales-popup-location";location.textContent=[c.city,c.uf].filter(Boolean).join(" / ");section.append(location);
              const equipment=c.equipment || [];
              const count=document.createElement("p");count.className="sales-popup-equipment-count";count.textContent=`${equipment.length} equipamento${equipment.length === 1 ? "" : "s"} cadastrado${equipment.length === 1 ? "" : "s"}`;section.append(count);
              const list=document.createElement("ul");list.className="sales-popup-equipment-list";list.hidden=true;
              for(const item of equipment){
                const li=document.createElement("li");const name=document.createElement("button");name.type="button";name.className="sales-equipment-name";name.disabled=!onEquipment;name.onclick=()=>callbacks.current.onEquipment?.(c,item);name.textContent=`${item.id} · ${item.name}`;li.append(name);
                const info=document.createElement("span");info.textContent=`Modelo: ${item.model || "Não informado"} · Série: ${item.serial || "Não informada"}`;li.append(info);
                const reading=document.createElement("span");reading.textContent=`Último horímetro: ${item.meter == null ? "Não informado" : item.meter.toLocaleString("pt-BR") + " h"} · Coleta: ${item.meterDate ? item.meterDate.split("-").reverse().join("/") : "Não registrada"}`;li.append(reading);
                const collect=document.createElement("button");collect.type="button";collect.className="sales-meter-icon";collect.title="Registrar horímetro atual";collect.setAttribute("aria-label","Registrar horímetro atual");
                const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
                for(const [key,value] of Object.entries({viewBox:"0 0 24 24",width:"18",height:"18",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":"true"})) svg.setAttribute(key,value);
                const path=document.createElementNS("http://www.w3.org/2000/svg","path");path.setAttribute("d","m12 14 4-4 M3.34 19a10 10 0 1 1 17.32 0Z");svg.append(path);collect.append(svg);collect.onclick=()=>callbacks.current.onEquipment?.(c,item);if(onEquipment)li.append(collect);list.append(li);
              }
              const actions=document.createElement("div");actions.className="sales-popup-actions";
              if(equipment.length){const toggle=document.createElement("button");toggle.type="button";toggle.textContent="Ver equipamentos";toggle.setAttribute("aria-expanded","false");toggle.onclick=()=>{list.hidden=!list.hidden;toggle.textContent=list.hidden?"Ver equipamentos":"Ocultar equipamentos";toggle.setAttribute("aria-expanded",String(!list.hidden));marker.getPopup()?.update()};actions.append(toggle)}
              section.append(list);
              const visit=scheduled.get(c.key);
              if(visit){const date=document.createElement("p");date.textContent="Agendada: "+new Date(visit.scheduled_at).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"});section.append(date)}
              const button=document.createElement("button");button.textContent=customerActionLabel || (onEquipment?"Ver cliente / agendar":"Ver cliente");button.className="sales-popup-primary";button.onclick=()=>callbacks.current.onSelect(c);actions.append(button);section.append(actions);popup.append(section);
            }
            marker.bindPopup(popup,{className:"sales-customer-popup",minWidth:240,maxWidth:320,maxHeight:350});
          }
        }
      }
      const sellerLayer = L.layerGroup().addTo(m);
      const positionedSellers = sellers.filter(s => s.latitude !== null && s.longitude !== null);
      for (const seller of positionedSellers) {
        const icon = document.createElement("span");
        icon.className = "sales-seller-avatar" + (seller.online ? " online" : "");
        icon.textContent = seller.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();
        const marker = L.marker([seller.latitude!,seller.longitude!], { zIndexOffset:1000,
          icon:L.divIcon({className:"sales-seller-marker",html:icon,iconSize:[36,36],iconAnchor:[18,18]}) }).addTo(sellerLayer);
        const label=document.createElement("span");label.textContent=`Vendedor · ${seller.name}`;
        marker.bindTooltip(label,{direction:"top",offset:[0,-18]});
        marker.getElement()?.setAttribute("aria-label",`Vendedor ${seller.name}`);
        const popup=document.createElement("div");popup.className="sales-map-customers";
        const title=document.createElement("strong");title.textContent=seller.name;popup.append(title);
        for(const text of [seller.online ? "Online" : "Offline",
          `Visto por último: ${seller.last_seen_at ? lastSeen(seller.last_seen_at) : "Não registrado"}`,
          `Localização atualizada: ${seller.located_at ? lastSeen(seller.located_at) : "Não registrada"}`]){
          const p=document.createElement("p");p.textContent=text;popup.append(p);
        }
        marker.bindPopup(popup,{className:"sales-customer-popup"});
      }
      const bounds = [...located.map(c=>[c.latitude!,c.longitude!] as [number,number]),
        ...positionedSellers.map(s=>[s.latitude!,s.longitude!] as [number,number])];
      if(bounds.length && !fitted.current) { m.fitBounds(bounds,{padding:[30,30],maxZoom:13}); fitted.current = true; }
      drawClusters();
      const zoom = () => { expandedLocation = null; drawClusters(); };
      m.on("zoomend", zoom);
      cleanup = () => { m.off("zoomend", zoom); layer.remove(); sellerLayer.remove(); };
    });
    return () => { closed = true; cleanup?.(); };
  }, [contentKey, mapReady, customerActionLabel]);
  return (
    <section className={`sales-panel${showNames ? "" : " sales-map-hide-names"}`}>
      <div className="sales-map-options">
      <label className="sales-map-name-toggle">
        <input type="checkbox" checked={showNames} onChange={e => setShowNames(e.target.checked)} />
        <span>Exibir nome do cliente</span>
      </label>
      <label className="sales-map-name-toggle">
        <input type="checkbox" checked={showTerritories} onChange={e => setShowTerritories(e.target.checked)} />
        <span>Divisão Comercial</span>
      </label>
      </div>
      {showTerritories && <div className="sales-territory-legend">
        {territoryLoading && <p role="status">Carregando municípios…</p>}
        {territoryError && <p role="alert">{territoryError}</p>}
        {sellerNames.map(name => <span key={name}><i style={{background:sellerColor(name)}} />{name}</span>)}
        {territories && !territories.features.length && <p>Nenhum município disponível.</p>}
        {!!territories?.missing?.length && <details><summary>{territories.missing.length} municípios sem limite disponível</summary>{territories.missing.join(", ")}</details>}
      </div>}
      <div className="sales-map-guide">
        <strong>Legenda do mapa</strong>
        <div className="sales-map-legend">
          <span><i className="sales-legend-dot overdue"/>Visita vencida</span>
          <span><i className="sales-legend-dot due"/>Próxima do vencimento</span>
          <span><i className="sales-legend-dot current"/>Visita em dia</span>
          <span><CalendarCheck2 size={17}/>Visita agendada</span>
          <span><Users size={17}/>Vendedores (iniciais)</span>
        </div>
        <details className="sales-map-help"><summary><Info size={16}/>Como usar o mapa e localização</summary><p>Os números nos marcadores indicam clientes agrupados. Clique para ampliar ou consultar.</p>
        {sellers.some(s=>s.latitude===null || s.longitude===null) && <p>{sellers.filter(s=>s.latitude===null || s.longitude===null).length} vendedor(es) sem localização disponível. Permita o acesso à localização no navegador para exibir a posição.</p>}
        </details>
      </div>
      {/* Leaflet manages classes on this element; keep its React className stable. */}
      <div ref={root} className="sales-map" />
      <p className="sales-muted">
        {mapped.length} clientes com posição cadastrada.{" "}
        {customers.length - mapped.length} sem posição disponível; continuam
        acessíveis na lista. As posições utilizam os dados existentes do mapa.
      </p>
    </section>
  );
}

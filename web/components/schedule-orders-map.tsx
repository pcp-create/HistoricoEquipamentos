"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { clusterMapPoints } from "@/lib/service-scheduling/map-clusters";
import { apiFetch } from "@/lib/client-api-cache";
import {
  positionLabel,
  addressIdentity,
  localityText,
  validPoint,
  type Locality,
} from "@/lib/service-scheduling/map-model";
import {
  scheduleStatus,
  scheduleStatusNames,
} from "@/lib/service-scheduling/model";
import "leaflet/dist/leaflet.css";
import "./schedule-orders-map.css";
type MapEntry = {
  id: string;
  localities: Locality[];
  selectedAddressId: string | null;
  reason: string;
};
type MapData = { geocodingAvailable: boolean; schedules: MapEntry[] };
export default function ScheduleOrdersMap({ schedules }: { schedules: any[] }) {
  const [showTerritories, setShowTerritories] = useState(false);
  const [territories, setTerritories] = useState<any>(null);
  const [territoryError, setTerritoryError] = useState("");
  const [territoryLoading, setTerritoryLoading] = useState(false);
  const [seller, setSeller] = useState("");
  const [municipality, setMunicipality] = useState<any>(null);
  const [editingSeller, setEditingSeller] = useState(false);
  const [municipalitySeller, setMunicipalitySeller] = useState("");
  const [savingSeller, setSavingSeller] = useState(false);
  const savingSellerRef = useRef(false);
  const [sellerMessage, setSellerMessage] = useState("");
  const sellerChanged = !!municipality && municipalitySeller !== (municipality.seller === "Sem vendedor" ? "" : municipality.seller);
  async function saveMunicipalitySeller() {
    if (!municipality || !sellerChanged || savingSellerRef.current) return;
    savingSellerRef.current = true;
    setSavingSeller(true);
    setSellerMessage("");
    try {
      const r = await apiFetch("/api/service-scheduling/territories", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:municipality.id,version:municipality.version,seller:municipalitySeller})});
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      setTerritories((current: any) => ({...current,sellers:sellerNames,features:current.features.map((feature: any) => feature.properties.id === result.id ? {...feature,properties:{...feature.properties,version:result.version,seller:result.seller || "Sem vendedor"}} : feature)}));
      setMunicipality((current: any) => ({...current,version:result.version,seller:result.seller || "Sem vendedor"}));
      setEditingSeller(false);
      setSellerMessage("Vendedor atualizado.");
    } catch (e) { setSellerMessage(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { savingSellerRef.current = false; setSavingSeller(false); }
  }

  const sellerNames: string[] = [...new Set<string>(territories?.sellers || (territories?.features || []).map((f: any) => f.properties.seller))].sort();
  const sellerColor = (name: string) => name === "Sem vendedor" ? "#708090" : `hsl(${(sellerNames.indexOf(name) * 137.508 + 215) % 360} 65% 43%)`;
  useEffect(() => {
    if (!showTerritories || territories) return;
    const controller = new AbortController();
    setTerritoryLoading(true);
    setTerritoryError("");
    apiFetch("/api/service-scheduling/territories", { signal: controller.signal, cache: "reload" })
      .then(async r => { const b = await r.json(); if (!r.ok) throw Error(b.error); if (!controller.signal.aborted) setTerritories(b); })
      .catch(e => { if (!controller.signal.aborted) setTerritoryError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setTerritoryLoading(false); });
    return () => controller.abort();
  }, [showTerritories, territories]);
  const [refresh, setRefresh] = useState(0);
  const attempted = useRef(new Set<string>());
  const autoRequest = useRef<AbortController | null>(null);
  const [locating, setLocating] = useState(false);
  useEffect(() => () => autoRequest.current?.abort(), []);
  const [data, setData] = useState<MapData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [day, setDay] = useState(""),
    [status, setStatus] = useState(""),
    [editing, setEditing] = useState<{
      scheduleId: string;
      addressId: string;
    } | null>(null);
  const [latitude, setLatitude] = useState(""),
    [longitude, setLongitude] = useState("");
  const canvas = useRef<HTMLDivElement>(null),
    map = useRef<Leaflet.Map | null>(null),
    lib = useRef<typeof Leaflet | null>(null),
    layers = useRef<Leaflet.LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const territoryLayer = useRef<Leaflet.GeoJSON | null>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const editor = useRef(editing);
  editor.current = editing;
  const ids = schedules
    .map((s) => String(s.id))
    .sort()
    .join(",");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    apiFetch("/api/service-scheduling/map", {
      signal: controller.signal,
      cache: "reload",
    })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        if (!controller.signal.aborted) {
          setData(b);
          setError("");
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [ids, refresh]);
  const summaryOrders = useMemo(() => schedules.filter((s) =>
    !day || (s.calendar_operations || []).some((o: any) => (o.dates || [o.date]).includes(day)),
  ), [schedules, day]);
  const visible = useMemo(
    () =>
      schedules
        .filter(
          (s) =>
            (!status || s.programming_status === status) &&
            (!day ||
              (s.calendar_operations || []).some((o: any) =>
                (o.dates || [o.date]).includes(day),
              )),
        )
        .map((s) => {
          const entry = data?.schedules.find((e) => e.id === String(s.id));
          const address = entry?.localities.find(
            (a) => a.address_id === entry.selectedAddressId,
          );
          return { ...s, entry, address };
        }),
    [schedules, data, day, status],
  );
  const located = visible.filter(
    (s) => s.address && validPoint(s.address.latitude, s.address.longitude),
  );
  useEffect(() => {
    let disposed = false;
    let resize: ResizeObserver | undefined;
    import("leaflet")
      .then((L) => {
        if (disposed || !canvas.current) return;
        lib.current = L;
        const m = L.map(canvas.current, { scrollWheelZoom: true }).setView(
          [-15.8, -47.9],
          4,
        );
        map.current = m;
        L.tileLayer(
          process.env.NEXT_PUBLIC_MAP_TILE_URL ||
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            // OSM requires a Referer. Override the site-wide same-origin policy
            // only for map tiles, sending the origin without paths or query data.
            referrerPolicy: "origin",
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        ).addTo(m);
        layers.current = L.layerGroup().addTo(m);
        m.on("click", (e: Leaflet.LeafletMouseEvent) => {
          if (editor.current && !busyRef.current) {
            setLatitude(e.latlng.lat.toFixed(6));
            setLongitude(e.latlng.lng.toFixed(6));
          }
        });
        resize = new ResizeObserver(() => m.invalidateSize());
        resize.observe(canvas.current);
        setReady(true);
      })
      .catch(() =>
        setError("Não foi possível carregar o mapa. Recarregue a página."),
      );
    return () => {
      disposed = true;
      resize?.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const L = lib.current, m = map.current;
    if (!ready || !L || !m || !showTerritories || !territories) return;
    const layer = L.geoJSON(territories, {
      filter: f => !seller || f.properties.seller === seller,
      style: f => ({ color: sellerColor(f?.properties.seller), weight: m.getZoom() < 9 ? 0.4 : 0.7, opacity: 0.65, fillOpacity: 0.22 }),
      onEachFeature: (f, polygon) => {
        const label = document.createElement("span");
        label.textContent = `${f.properties.city}/${f.properties.uf} · ${f.properties.seller}`;
        polygon.bindTooltip(label, { sticky: true });
        polygon.on("click", () => {
          if (editor.current || savingSellerRef.current) return;
          setEditingSeller(false);
          setMunicipality((current: any) =>
            current?.id === f.properties.id ? null : f.properties,
          );
          setMunicipalitySeller(f.properties.seller === "Sem vendedor" ? "" : f.properties.seller);
          setSellerMessage("");
        });

      },
      attribution: 'Municípios: <a href="https://github.com/tbrugz/geodata-br">Geodata BR / IBGE</a>',
    }).addTo(m);
    territoryLayer.current = layer;
    layer.bringToBack();
    if (layer.getBounds().isValid() && !editor.current) m.fitBounds(layer.getBounds(), { padding: [30, 30] });
    return () => { territoryLayer.current = null; layer.remove(); };
  }, [ready, showTerritories, territories, seller]);
  useEffect(() => {
    const layer = territoryLayer.current, m = map.current;
    if (!layer || !m) return;
    const updateBorders = () => {
      layer.setStyle(f => {
        const selected = !!municipality && f?.properties.id === municipality.id;
        return {
          color: selected ? "#2563a6" : sellerColor(f?.properties.seller),
          fillColor: selected ? "#93c5fd" : sellerColor(f?.properties.seller),
          weight: selected ? 2.5 : m.getZoom() < 9 ? 0.4 : 0.7,
          opacity: selected ? 1 : 0.65,
          fillOpacity: selected ? 0.55 : 0.22,
        };
      });
      layer.eachLayer(polygon => {
        const path = polygon as Leaflet.Path & { feature?: { properties: { id: string } } };
        if (municipality && path.feature?.properties.id === municipality.id) path.bringToFront();
      });
    };
    updateBorders();
    m.on("zoomend", updateBorders);
    return () => { m.off("zoomend", updateBorders); };
  }, [ready, showTerritories, territories, seller, municipality]);
  const mapSignature = JSON.stringify(
    located.map((s) => [
      s.id,
      s.programming_status,
      s.address,
      s.calendar_operations,
    ]),
  );
  useEffect(() => {
    const L = lib.current,
      m = map.current,
      layer = layers.current;
    if (!ready || !L || !m || !layer) return;
    function drawClusters() {
      if (!L || !m || !layer) return;
      layer.clearLayers();
      const groups = clusterMapPoints(
        located,
        (s) =>
          m.project([s.address.latitude, s.address.longitude], m.getZoom()),
        m.getZoom() >= 18 ? 0 : 52,
      );
      for (const cluster of groups) {
        const group = cluster.items;
        const center = m.unproject([cluster.x, cluster.y], m.getZoom());
        const distinct =
          new Set(
            group.map((s) => `${s.address.latitude},${s.address.longitude}`),
          ).size > 1;
        const size =
          group.length > 1
            ? group.length >= 100
              ? 42
              : group.length >= 10
                ? 36
                : 32
            : 20;
        const icon = document.createElement("span");
        const counts: Record<string, number> = {};
        for (const order of group)
          counts[order.programming_status] =
            (counts[order.programming_status] || 0) + 1;
        const markerStatus = scheduleStatus(counts);
        icon.className = `schedule-map-pin operation-status ${markerStatus}`;
        icon.style.width = icon.style.height = `${size}px`;
        const statuses = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
        if (statuses.length > 1) {
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          svg.setAttribute("viewBox", "0 0 100 100");
          svg.setAttribute("aria-hidden", "true");
          svg.classList.add("schedule-map-segments");
          let angle = -Math.PI / 2;
          for (const [status, quantity] of statuses) {
            const end = angle + (1 / statuses.length) * Math.PI * 2;
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("class", `operation-status ${status}`);
            path.setAttribute("fill", "currentColor");
            path.setAttribute("d", `M50 50 L${50 + 50 * Math.cos(angle)} ${50 + 50 * Math.sin(angle)} A50 50 0 ${end - angle > Math.PI ? 1 : 0} 1 ${50 + 50 * Math.cos(end)} ${50 + 50 * Math.sin(end)} Z`);
            svg.appendChild(path);
            const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
            const middle = (angle + end) / 2;
            label.setAttribute("x", String(50 + 27 * Math.cos(middle)));
            label.setAttribute("y", String(50 + 27 * Math.sin(middle)));
            label.setAttribute("class", "schedule-map-segment-count");
            label.textContent = String(quantity);
            svg.appendChild(label);
            angle = end;
          }
          icon.appendChild(svg);
        }
        if (group.length > 1 && statuses.length === 1) {
          const count = document.createElement("span");
          count.className = "schedule-map-count";
          count.textContent = String(group.length);
          icon.appendChild(count);
        }
        const markerLabel =
          group.length > 1
            ? `${group.length} OSs ${distinct ? "nesta região. Clique para aproximar" : "neste local"}`
            : `OS ${group[0].numero_sequencia || group[0].order_id}`;
        const popup = document.createElement("div");
        popup.className = "schedule-map-popup";
        for (const s of group) {
          const link = document.createElement("a");
          link.href = "/programacao?id=" + encodeURIComponent(s.id);
          link.textContent = `OS ${s.numero_sequencia || s.order_id} · ${s.cliente_nome || "Cliente não informado"}`;
          popup.appendChild(link);
          const info = document.createElement("p");
          info.textContent = [
            scheduleStatusNames[s.programming_status] || "Pendente",
            ...(s.calendar_operations || []).map((o: any) =>
              [o.date?.split("-").reverse().join("/"), o.time, o.responsible]
                .filter(Boolean)
                .join(" · "),
            ),
          ].join("\n");
          popup.appendChild(info);
          const addr = document.createElement("small");
          addr.textContent =
            localityText(s.address) +
            " · " +
            positionLabel(s.address.precision);
          const addressRow = document.createElement("div");
          addressRow.className = "schedule-map-popup-address";
          addressRow.appendChild(addr);
          const adjust = document.createElement("button");
          adjust.type = "button";
          adjust.className = "schedule-map-adjust-icon";
          adjust.setAttribute("aria-label", "Ajustar posição");
          adjust.title = "Ajustar posição no mapa";
          const locationIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          locationIcon.setAttribute("viewBox", "0 0 24 24");
          locationIcon.setAttribute("width", "20");
          locationIcon.setAttribute("height", "20");
          locationIcon.setAttribute("fill", "none");
          locationIcon.setAttribute("stroke", "currentColor");
          locationIcon.setAttribute("stroke-width", "1.8");
          locationIcon.setAttribute("stroke-linecap", "round");
          locationIcon.setAttribute("stroke-linejoin", "round");
          locationIcon.setAttribute("aria-hidden", "true");
          for (const d of ["M12 21s-7-6-7-12a7 7 0 0 1 14 0", "M14 18l6-6 2 2-6 6-3 1 1-3Z", "M14 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0"]) {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", d);
            locationIcon.appendChild(path);
          }
          adjust.appendChild(locationIcon);
          adjust.addEventListener("click", () => {
            if (busyRef.current) return;
            m?.closePopup();
            edit(s);
          });
          addressRow.appendChild(adjust);
          popup.appendChild(addressRow);
          if (s.entry?.localities.length > 1) {
            const select = document.createElement("select");
            select.setAttribute("aria-label", `Localidade da OS ${s.numero_sequencia || s.order_id}`);
            for (const a of s.entry.localities as Locality[]) {
              const option = document.createElement("option");
              option.value = a.address_id;
              option.textContent = `${a.address_type || "Endereço"} · ${localityText(a)}`;
              select.appendChild(option);
            }
            select.value = s.address.address_id;
            select.addEventListener("change", () => {
              if (busyRef.current) return;
              m?.closePopup();
              setEditing(null);
              void change({ action: "select", scheduleId: String(s.id), addressId: select.value });
            });
            popup.appendChild(select);
          }
        }
        const marker = L.marker(center, {
          icon: L.divIcon({
            html: icon,
            className: "schedule-map-marker",
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
        }).addTo(layer);
        if (distinct)
          marker.on("click", () =>
            m.fitBounds(
              group.map(
                (s) =>
                  [s.address.latitude, s.address.longitude] as [number, number],
              ),
              { padding: [60, 60], maxZoom: Math.min(19, m.getZoom() + 3) },
            ),
          );
        else marker.bindPopup(popup);
        marker.getElement()?.setAttribute("aria-label", markerLabel);
        marker.getElement()?.setAttribute("title", statuses.map(([status, quantity]) =>
          `${scheduleStatusNames[status] || "Pendente"}: ${quantity}`,
        ).join(" · "));
      }
    }
    if (located.length)
      m.fitBounds(
        located.map(
          (s) => [s.address.latitude, s.address.longitude] as [number, number],
        ),
        {
          padding: [45, 45],
          maxZoom: located.every((s) => s.address.precision === "city")
            ? 11
            : located.every((s) =>
                  ["city", "postcode", "district"].includes(
                    s.address.precision,
                  ),
                )
              ? 13
              : 15,
        },
      );
    drawClusters();
    m.on("zoomend", drawClusters);
    return () => {
      m.off("zoomend", drawClusters);
      layer.clearLayers();
    };
  }, [ready, mapSignature]);
  useEffect(() => {
    const L = lib.current,
      m = map.current;
    const lat = Number(latitude.replace(",", ".")),
      lng = Number(longitude.replace(",", "."));
    if (
      !L ||
      !m ||
      !editing ||
      !latitude ||
      !longitude ||
      !validPoint(lat, lng)
    )
      return;
    const marker = L.circleMarker([lat, lng], {
      color: "#df7e13",
      radius: 10,
    }).addTo(m);
    return () => {
      marker.remove();
    };
  }, [editing, latitude, longitude, ready]);
  useEffect(() => {
    if (!data?.geocodingAvailable || loading || busy || editing) return;
    const target = visible.find(
      (s) =>
        s.address &&
        !validPoint(s.address.latitude, s.address.longitude) &&
        !attempted.current.has(
          `${s.address.person_id}:${s.address.address_id}:${addressIdentity(s.address)}`,
        ),
    );
    if (!target) return;
    const key = `${target.address.person_id}:${target.address.address_id}:${addressIdentity(target.address)}`;
    attempted.current.add(key);
    const controller = new AbortController();
    autoRequest.current = controller;
    setLocating(true);
    void change(
      {
        action: "geocode",
        scheduleId: String(target.id),
        addressId: target.address.address_id,
      },
      controller.signal,
    ).finally(() => {
      if (!controller.signal.aborted) setLocating(false);
    });
  }, [data, visible, loading, busy, editing]);
  async function change(body: any, signal?: AbortSignal) {
    setBusy(true);
    if (!signal) setError("");
    try {
      const r = await apiFetch("/api/service-scheduling/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      if (signal?.aborted) return;
      setData(b);
      if (body.action === "manual") setEditing(null);
    } catch (e) {
      if (!signal?.aborted)
        setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  function edit(s: any) {
    if (!s.address || busyRef.current) return;
    setError("");
    setEditing({ scheduleId: String(s.id), addressId: s.address.address_id });
    setLatitude(s.address.latitude == null ? "" : String(s.address.latitude));
    setLongitude(
      s.address.longitude == null ? "" : String(s.address.longitude),
    );
  }
  return (
    <section className="schedule-map" aria-label="Mapa da programação">
      <div className="schedule-map-toolbar">
        <label>
          Data das operações
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        <label>
          Status da OS
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {[...new Set(schedules.map((s) => s.programming_status))].map(
              (v) => (
                <option key={v} value={v}>
                  {scheduleStatusNames[v] || v}
                </option>
              ),
            )}
          </select>
        </label>
        <button
          onClick={() => {
            setDay("");
            setStatus("");
          }}
        >
          Limpar data e status
        </button>
        <span aria-live="polite">
          {located.length} de {visible.length} OSs no mapa
        </span>
      </div>
      <button
        disabled={loading || busy}
        onClick={() => setRefresh((n) => n + 1)}
      >
        Atualizar localidades
      </button>
      {loading && <p role="status">Carregando localidades…</p>}
      {locating && <p role="status">Localizando endereços das OSs no mapa…</p>}
      {error && (
        <p role="alert" className="schedule-map-error">
          {error}
        </p>
      )}
      {!loading && data && !data.geocodingAvailable && (
        <p className="muted">
          Você pode marcar as localidades no mapa. A busca automática de
          endereços depende da configuração do serviço de localização.
        </p>
      )}
      {editing && (
        <form
          className="schedule-map-edit"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && latitude.trim() && longitude.trim() && validPoint(Number(latitude.replace(",", ".")), Number(longitude.replace(",", "."))))
              void change({
                ...editing,
                action: "manual",
                latitude: Number(latitude.replace(",", ".")),
                longitude: Number(longitude.replace(",", ".")),
              });
          }}
        >
          <strong>Marcar localidade</strong>
          <span>
            Clique no mapa ou informe as coordenadas. A posição será
            compartilhada pelas OSs deste endereço.
          </span>
          <label>
            Latitude
            <input
              required
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label>
            Longitude
            <input
              required
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <button disabled={busy || !latitude.trim() || !longitude.trim() || !validPoint(Number(latitude.replace(",", ".")), Number(longitude.replace(",", ".")))}>
            Salvar posição
          </button>
          <button type="button" onClick={() => setEditing(null)}>
            Cancelar
          </button>
        </form>
      )}
      <div className="schedule-map-layout">
        <div
          ref={canvas}
          className="schedule-map-canvas"
          data-editing={editing ? "true" : undefined}
          aria-label="Mapa interativo de localidades"
        />
        <aside className="schedule-map-summary" aria-label="Resumo das OSs por status">
          <h3>OSs da programação</h3>
          <button type="button" className="schedule-map-summary-total" aria-pressed={!status} onClick={() => setStatus("")}><span>Total</span><strong>{summaryOrders.length}</strong></button>
          <div className="schedule-map-status-filters">
            {Object.entries(scheduleStatusNames).map(([key, name]) => (
              <button type="button" key={key} aria-pressed={status === key} onClick={() => setStatus(status === key ? "" : key)}>
                <span><span className={`schedule-map-status-dot operation-status ${key}`} aria-hidden="true" />{name}</span>
                <strong>{summaryOrders.filter((s) => (s.programming_status || "pending") === key).length}</strong>
              </button>
            ))}
          </div>
          <small>Clique em um status para filtrar. Inclui OSs sem posição no mapa.</small>
          <hr />
          <button type="button" aria-pressed={showTerritories} onClick={() => setShowTerritories(!showTerritories)}>Divisão comercial</button>
          {showTerritories && <div className="schedule-map-territories">
            {municipality ? <form className="schedule-territory-editor" onSubmit={e => { e.preventDefault(); void saveMunicipalitySeller(); }}>
              <strong>{municipality.city}/{municipality.uf}</strong>
              <span>Vendedor do município</span>
              <div className="schedule-territory-seller-row">
                {editingSeller ? <select autoFocus aria-label="Vendedor do município" value={municipalitySeller} disabled={savingSeller} onChange={e => {setMunicipalitySeller(e.target.value);setSellerMessage("");}}>
                  <option value="">Sem vendedor</option>
                  {sellerNames.filter(name => name !== "Sem vendedor").map(name => <option key={name}>{name}</option>)}
                </select> : <span>{municipality.seller}</span>}
                <button type="button" className="schedule-territory-seller-icon" disabled={savingSeller}
                  aria-label={sellerChanged ? "Confirmar alteração do vendedor" : "Editar vendedor"}
                  title={sellerChanged ? "Confirmar alteração" : "Editar vendedor"}
                  onClick={() => {if (sellerChanged) void saveMunicipalitySeller(); else setEditingSeller(!editingSeller);}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {sellerChanged ? <path d="m5 12 4 4L19 6" /> : <><path d="m16 3 5 5-12 12-6 1 1-6Z" /><path d="m14 5 5 5" /></>}
                  </svg>
                </button>
              </div>
              {sellerMessage && <p role="status">{sellerMessage}</p>}
            </form> : <p>Clique em um município no mapa para editar o vendedor aqui.</p>}

            {territoryLoading && <p role="status">Carregando municípios…</p>}
            {territoryError && <p role="alert">{territoryError}</p>}
            {territories && <>
              <label>Vendedor<select aria-label="Vendedor" value={seller} onChange={e => setSeller(e.target.value)}><option value="">Todos os vendedores</option>{sellerNames.map(name => <option key={name}>{name}</option>)}</select></label>
              {sellerNames.map(name => <div key={name}><span style={{ background: sellerColor(name) }} />{name} · {territories.features.filter((f: any) => f.properties.seller === name).length}</div>)}
              {!territories.features.length && <p>Nenhum município disponível.</p>}
              {!!territories.missing.length && <details><summary>{territories.missing.length} municípios sem limite disponível</summary>{territories.missing.join(", ")}</details>}
              <small>Áreas por vendedor; círculos por status da OS.</small>
            </>}
          </div>}
        </aside>
      </div>
      {!loading && !visible.length && <p>Nenhuma OS corresponde aos filtros.</p>}
      {visible.some((s) => !s.address || !validPoint(s.address.latitude, s.address.longitude)) && (
        <details className="schedule-map-pending">
          <summary>OSs sem posição no mapa ({visible.length - located.length})</summary>
        <div className="schedule-map-list">
          {!loading && !visible.length && (
            <p>Nenhuma OS corresponde aos filtros.</p>
          )}
          {visible.filter((s) => !s.address || !validPoint(s.address.latitude, s.address.longitude)).map((s) => (
            <article key={s.id} className="schedule-map-card">
              <a href={"/programacao?id=" + s.id}>
                <strong>OS {s.numero_sequencia || s.order_id}</strong>
              </a>
              <span>{s.cliente_nome || "Cliente não informado"}</span>
              <small className={"operation-status " + s.programming_status}>
                {scheduleStatusNames[s.programming_status] || "Pendente"}
              </small>
              {(s.calendar_operations || []).map((o: any, i: number) => (
                <small key={i}>
                  {[
                    o.date?.split("-").reverse().join("/"),
                    o.time,
                    o.responsible || "Sem responsável",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              ))}
              {s.entry?.localities.length > 0 ? (
                <label>
                  Localidade
                  <select
                    aria-label={
                      "Localidade da OS " + (s.numero_sequencia || s.order_id)
                    }
                    value={s.entry.selectedAddressId || ""}
                    disabled={busy}
                    onChange={(e) => {
                      setEditing(null);
                      void change({
                        action: "select",
                        scheduleId: String(s.id),
                        addressId: e.target.value,
                      });
                    }}
                  >
                    <option value="" disabled>
                      Selecione a localidade
                    </option>
                    {s.entry.localities.map((a: Locality) => (
                      <option key={a.address_id} value={a.address_id}>
                        {a.address_type || "Endereço"} · {localityText(a)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <small>Localidade ainda não coletada.</small>
              )}
              {s.address && (
                <>
                  <small>{localityText(s.address)}</small>
                  <small>
                    {validPoint(s.address.latitude, s.address.longitude)
                      ? positionLabel(s.address.precision)
                      : "Ainda sem posição no mapa"}
                  </small>
                  <div className="schedule-map-actions">
                    {validPoint(s.address.latitude, s.address.longitude) && (
                      <button
                        onClick={() =>
                          map.current?.setView(
                            [s.address.latitude, s.address.longitude],
                            s.address.precision === "city"
                              ? 11
                              : ["postcode", "district"].includes(
                                    s.address.precision,
                                  )
                                ? 13
                                : 16,
                          )
                        }
                      >
                        Ver no mapa
                      </button>
                    )}
                    {data?.geocodingAvailable &&
                      !validPoint(s.address.latitude, s.address.longitude) && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            change({
                              action: "geocode",
                              scheduleId: String(s.id),
                              addressId: s.address.address_id,
                            })
                          }
                        >
                          Localizar endereço
                        </button>
                      )}
                    <button disabled={busy} onClick={() => edit(s)}>
                      {validPoint(s.address.latitude, s.address.longitude)
                        ? "Ajustar posição"
                        : "Marcar no mapa"}
                    </button>
                  </div>
                </>
              )}
              {!s.address && s.entry?.localities.length > 0 && (
                <small>{s.entry.reason}</small>
              )}
            </article>
          ))}
        </div>
        </details>
      )}
      <p className="schedule-map-legend">
        Círculos seguem as cores dos status da programação. Clique para ver as
        OSs. Grupos com status diferentes têm cores divididas com a quantidade de OSs em cada status.
        {located.some((s) => s.address.provider === "geoapify") && (
          <>
            {" "}
            Localização por <a href="https://www.geoapify.com/">Geoapify</a>.
          </>
        )}
      </p>
    </section>
  );
}

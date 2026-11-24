"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { MapPin } from "lucide-react";
import { nativePortal } from "@/lib/native-portal";

type GateState = "checking" | "requesting" | "allowed" | "denied" | "unavailable" | "prompt";

/** The native app manages location permissions itself; this gate is for browsers. */
export default function FieldLocationGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [entered, setEntered] = useState(false);
  const mounted = useRef(false);
  const requestPending = useRef(false);
  const permission = useRef<PermissionStatus | null>(null);
  const update = useCallback((next: GateState) => {
    if (!mounted.current) return;
    if (next === "allowed") setEntered(true);
    setState(next);
  }, []);

  const requestLocation = useCallback(() => {
    if (requestPending.current) return;
    if (!navigator.geolocation) { update("unavailable"); return; }
    requestPending.current = true;
    update("requesting");
    navigator.geolocation.getCurrentPosition(
      () => { requestPending.current = false; update("allowed"); },
      async (error) => {
        requestPending.current = false;
        // GPS may be unavailable even though the user has granted permission.
        let current = permission.current?.state;
        if (!current && navigator.permissions?.query) {
          try { current = (await navigator.permissions.query({ name: "geolocation" })).state; } catch { /* Unsupported permission query. */ }
        }
        update(current === "granted" ? "allowed" : error.code === 1 ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
    );
  }, [update]);

  useEffect(() => {
    mounted.current = true;
    if (nativePortal()) { update("allowed"); return () => { mounted.current = false; }; }
    let disposed = false;
    let status: PermissionStatus | null = null;
    const onChange = () => {
      if (!status || disposed) return;
      if (status.state === "granted") update("allowed");
      else if (status.state === "denied") update("denied");
      else update("prompt");
    };
    const initialize = async () => {
      if (!navigator.geolocation) { update("unavailable"); return; }
      try {
        if (navigator.permissions?.query) {
          status = await navigator.permissions.query({ name: "geolocation" });
          if (disposed) return;
          permission.current = status;
          status.addEventListener("change", onChange);
          if (status.state === "granted" || status.state === "denied") { onChange(); return; }
        }
      } catch { /* Ask directly if the Permissions API is unavailable. */ }
      if (!disposed) requestLocation();
    };
    const onVisible = () => { if (document.visibilityState === "visible") onChange(); };
    void initialize();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      disposed = true;
      mounted.current = false;
      status?.removeEventListener("change", onChange);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      permission.current = null;
    };
  }, [requestLocation, update]);

  const allowed = state === "allowed";
  return <>
    {entered && <div inert={!allowed || undefined} aria-hidden={!allowed || undefined} style={!allowed ? { display: "none" } : undefined}>{children}</div>}
    {!allowed && <main className="field-app field-location-gate">
      <section className="field-location-gate-card" aria-labelledby="field-location-title">
        <MapPin size={30} aria-hidden="true" />
        <h1 id="field-location-title">Localização necessária</h1>
        <p>Para utilizar o Portal Técnico, permita o acesso à localização neste navegador.</p>
        {(state === "checking" || state === "requesting") ? <p role="status">Aguardando a autorização do navegador…</p> : <>
          {state === "denied" && <p role="alert">A localização está bloqueada. Abra as configurações do site pelo ícone ao lado do endereço, permita a localização e volte ao portal. Se necessário, habilite também a localização do dispositivo.</p>}
          {state === "unavailable" && <p role="alert">Não foi possível solicitar a localização. Verifique se o GPS está ligado e se o portal foi aberto por uma conexão segura (HTTPS).</p>}
          <button type="button" onClick={requestLocation}><MapPin size={17} /> Permitir localização</button>
        </>}
      </section>
    </main>}
  </>;
}

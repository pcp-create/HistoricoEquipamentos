"use client";
import { useState, useEffect } from "react";
import { CalendarPlus, CalendarMinus } from "lucide-react";
import { apiFetch } from "@/lib/client-api-cache";
export default function ScheduleOrderButton({
  company,
  orderId,
}: {
  company: number;
  orderId: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [scheduled, setScheduled] = useState(false), [ready, setReady] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setReady(false);
    apiFetch(`/api/service-scheduling?company=${company}&orderId=${orderId}`, {signal:controller.signal}).then(async r => {const b=await r.json();if(!r.ok)throw Error(b.error);setScheduled(!!b.schedule?.active);setReady(true);}).catch(e=>{if(e.name!=="AbortError")setError(e.message)});
    return () => controller.abort();
  }, [company,orderId]);
  return (
    <span className="schedule-order-entry">
      <button
        type="button"
        disabled={busy || !ready}
        onClick={async () => {
          const removing = scheduled;
          setBusy(true);
          setScheduled(!removing);
          setError("");
          try {
            const r = await apiFetch("/api/service-scheduling", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: removing ? "remove_schedule" : "include",
                company,
                orderId: String(orderId),
              }),
            });
            const b = await r.json();
            if (!r.ok) throw Error(b.error);
            window.dispatchEvent(new Event("service-schedule-updated"));
            if (!removing) window.location.assign("/programacao?id=" + b.schedule.id);
          } catch (e) {
            setScheduled(removing);
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {scheduled ? <CalendarMinus size={16} /> : <CalendarPlus size={16} />}
        {!ready ? "Consultando programação…" : scheduled ? "Remover programação" : "Programar OS"}
      </button>
      {error && <small role="alert">{error}</small>}
    </span>
  );
}

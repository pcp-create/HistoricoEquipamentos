"use client";
import { useEffect, useState } from "react";
type Entry = {id: string; created_by: string; created_at: string; state: string; next_step: number; change: { before: string; after: string; reason: string }};
const day = (value: string) => value ? value.slice(0,10).split("-").reverse().join("/") : "Não informada";
export default function OrderDeliveryHistory({ company, order }: {company: string; order: string}) {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setRows(null); setError(""); setBusy(true);
    async function load() {
      try {
        const response = await fetch("/api/service-orders?" + new URLSearchParams({deliveryHistory:"1",company,order}), {cache:"no-store",signal:controller.signal});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar o histórico.");
        if (!controller.signal.aborted) setRows(data.rows);
      } catch(e) { if (!controller.signal.aborted) setError((e as Error).message); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }
    void load();
    return () => controller.abort();
  }, [company, order]);
  if (busy) return null;
  if (error) return <p role="alert">{error}</p>;
  if (!rows?.length) return null;
  return <details className="order-delivery-history">
    <summary>Histórico da entrega prevista</summary>
    <p>Alterações registradas pelo portal com justificativa.</p>
    {rows?.map(row => <article key={row.id} style={{borderTop:"1px solid #dce6ef",padding:"12px 0",overflowWrap:"anywhere"}}>
      <strong>{day(row.change.before)} → {day(row.change.after)}</strong>
      <p style={{whiteSpace:"pre-wrap"}}>{row.change.reason}</p>
      <small>{new Date(row.created_at).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})} · {row.created_by}<br/>
        {row.state === "complete" || row.next_step > 0 ? "Entrega atualizada no ERP" : row.state === "rejected" ? "Alteração recusada" : row.state === "uncertain" ? "Confirmação pendente no ERP" : "Envio em andamento"}
      </small>
    </article>)}
  </details>;
}

"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Detail } from "@/lib/sales-projection/model";
import type { OrderDraft } from "@/lib/service-orders/model";

type Source = { version: string; draft: OrderDraft; labels: { flowStatus: string } };
async function api(query = "", body?: unknown) {
  const response = await fetch("/api/service-orders" + query, body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível acessar a OS.");
  return data;
}
export default function OrderQuickEdit({ row, field, onClose, onStart, onResult }: {
  row: Detail; field: "expected" | "flowStatus"; onClose: () => void; onStart: () => void; onResult: (result: { value?: string; error?: string }) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [options, setOptions] = useState<{id: string; name: string}[]>([]);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const company = String(row.fields?.sourceCompany || row.company);
  const title = field === "expected" ? "Entrega prevista" : "Status do fluxo";
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    Promise.all([
      api(`?edit=1&company=${company}&order=${encodeURIComponent(row.id)}`),
      field === "flowStatus" ? api("?lookup=metadata") : Promise.resolve(null),
    ]).then(([data, meta]) => {
      if (!active) return;
      setSource(data);
      setValue(data.draft[field] || "");
      setOptions((meta?.registries || []).filter((r: {kind: string}) => r.kind === "flow-statuses"));
    }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [company, row.id, field]);
  async function save() {
    if (!source || busy || submitted) return;
    setBusy(true); setError("");
    const id = crypto.randomUUID();
    setSubmitted(true);
    onStart();
    onClose();
    try {
      let result = await api("", { action: "edit-prepare", id, company, order: row.id,
        version: source.version, draft: { ...source.draft, [field]: value } });
      while (result.state === "ready") result = await api("", { action: "edit-advance", id });
      if (result.state !== "complete") throw new Error(result.message || "Envio não confirmado. Confira a OS no ERP antes de tentar novamente.");
      onResult({
        value: field === "expected" ? value : options.find((o) => String(o.id) === value)?.name || source.labels.flowStatus,
        error: result.localSynced === false ? result.message || "Salvo no ERP. Aguardando sincronização local." : undefined,
      });
    } catch (e) {
      onResult({ error: (e instanceof Error ? e.message : "Não foi possível confirmar o envio.") + " Reabra a edição para conferir os dados atuais." });
    }
  }
  return <dialog ref={dialog} className="cr-quick-dialog" onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="cr-quick-heading"><h2>{title} · OS {row.id}</h2><button type="button" className="button" aria-label="Fechar edição" disabled={busy} onClick={onClose}><X size={18}/></button></div>
    {!source && !error && <p role="status">Carregando dados atuais do ERP…</p>}
    {error && <p role="alert">{error}</p>}
    {source && <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <label>{title}
        {field === "expected" ? <input type="date" required value={value} disabled={busy || submitted} onChange={(e) => setValue(e.target.value)}/> :
          <select aria-label={title} required value={value} disabled={busy || submitted} onChange={(e) => setValue(e.target.value)}>
            <option value="">Selecione</option>
            {source.draft.flowStatus && !options.some((o) => String(o.id) === source.draft.flowStatus) && <option value={source.draft.flowStatus}>{source.labels.flowStatus}</option>}
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>}
      </label>
      <div className="cr-quick-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>Cancelar</button>
        <button className="button primary" disabled={busy || submitted || value === source.draft[field]}>{busy ? "Salvando…" : "Salvar no ERP"}</button></div>
    </form>}
  </dialog>;
}

"use client";
import { useEffect, useState } from "react";
import { estimatedMaterialCost, orderLaborHours } from "@/lib/order-profit";
type Calculation = {
  document: {
    calculated_by_name?: string;
    revenue: number;
    materials: number;
    hours: number;
    hourlyRate: number;
    labor: number;
    cost: number;
    profit: number;
    margin: number | null;
  };
  version: number;
  calculated_at: string;
  calculated_by: string;
};
const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default function OrderProfitPanel({
  company,
  id,
  materials,
  services,
  complete,
}: {
  company: string;
  id: string;
  materials: Record<string, unknown>[];
  services: Record<string, unknown>[];
  complete: boolean;
}) {
  const [saved, setSaved] = useState<Calculation | null>(null),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState(false),
    [error, setError] = useState("");
  const [cost, setCost] = useState(""),
    [hours, setHours] = useState("");
  const endpoint = `/api/orders/${company}/${id}/profit`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        setSaved(body.calculation);
        setLoaded(true);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [endpoint]);
  function edit() {
    const value = estimatedMaterialCost(materials, complete).amount;
    const qty = orderLaborHours(services, complete);
    setCost(value === null ? "" : value.toFixed(2));
    setHours(qty === null ? "" : String(qty));
    setEditing(true);
    setOpen(true);
    setError("");
  }
  async function calculate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materials: cost,
          hours,
          version: saved?.version ?? null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setSaved(body.calculation);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="order-profit">
      {saved && (
        <p>
          Já calculado em{" "}
          {new Date(saved.calculated_at).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}{" "}
          ·{" "}
          {saved.document.calculated_by_name &&
          saved.document.calculated_by_name !== saved.calculated_by
            ? `${saved.document.calculated_by_name} · ${saved.calculated_by}`
            : saved.calculated_by}
        </p>
      )}
      <button
        type="button"
        className="primary"
        disabled={!loaded || busy}
        onClick={() =>
          saved ? setOpen(!open) : open ? setOpen(false) : edit()
        }
      >
        {open
          ? "Ocultar cálculo"
          : saved
            ? "Ver lucro calculado"
            : "Calcular lucro da OS"}
      </button>
      {error && <p role="alert">{error}</p>}
      {open && (
        <>
          <h4>Lucro bruto estimado</h4>
          {editing ? (
            <div>
              <label>
                Custo total dos materiais (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cost}
                  disabled={busy}
                  onChange={(e) => setCost(e.target.value)}
                />
              </label>
              <label>
                Horas de mão de obra
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={hours}
                  disabled={busy}
                  onChange={(e) => setHours(e.target.value)}
                />
              </label>
              <p>
                Mão de obra: R$ 40,00/hora. Materiais usam o custo médio atual
                quando disponível. Confira os valores; campos vazios precisam
                ser preenchidos.
              </p>
              <button
                type="button"
                className="primary"
                disabled={busy || !cost.trim() || !hours.trim()}
                onClick={calculate}
              >
                {busy ? "Salvando…" : "Calcular e salvar"}
              </button>
              {saved && (
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  Cancelar
                </button>
              )}
            </div>
          ) : (
            saved && (
              <>
                <dl>
                  <div>
                    <dt>Valor da OS no cálculo</dt>
                    <dd>{money(saved.document.revenue)}</dd>
                  </div>
                  <div>
                    <dt>Custo dos materiais</dt>
                    <dd>{money(saved.document.materials)}</dd>
                  </div>
                  <div>
                    <dt>
                      Mão de obra · {saved.document.hours} h ×{" "}
                      {money(saved.document.hourlyRate)}
                    </dt>
                    <dd>{money(saved.document.labor)}</dd>
                  </div>
                  <div>
                    <dt>Custo total estimado</dt>
                    <dd>{money(saved.document.cost)}</dd>
                  </div>
                  <div>
                    <dt>Lucro bruto estimado</dt>
                    <dd>{money(saved.document.profit)}</dd>
                  </div>
                  <div>
                    <dt>Margem sobre a venda</dt>
                    <dd>
                      {saved.document.margin === null
                        ? "—"
                        : saved.document.margin.toLocaleString("pt-BR", {
                            maximumFractionDigits: 2,
                          }) + "%"}
                    </dd>
                  </div>
                </dl>
                <button type="button" className="button" onClick={edit}>
                  Recalcular lucro da OS
                </button>
              </>
            )
          )}
          <p>
            O resultado fica salvo até ser recalculado. Estimativa com custo
            médio atual, sem impostos e outras despesas não informadas. Itens
            excluídos ou reprovados não entram na referência de custo.
          </p>
        </>
      )}
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import type { OrderItem } from "@/lib/service-orders/model";
import type { AverageCost } from "@/lib/crm/product-cost-model";
import { RefreshCw } from "lucide-react";
export default function CrmProductCosts({
  company,
  items,
  onCosts,
}: {
  company: string;
  items: OrderItem[];
  onCosts: (company: string, costs: AverageCost[]) => void;
}) {
  const callback = useRef(onCosts);
  callback.current = onCosts;
  const [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const codes = [
      ...new Set(items.filter((i) => i.kind === "material").map((i) => i.code)),
    ]
      .sort()
      .join(","),
    units = items
      .filter((i) => i.kind === "material")
      .map((i) => i.quote?.unit || "")
      .join("|");
  useEffect(() => {
    if (!company || !codes) return;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    fetch(
      "/api/crm?" + new URLSearchParams({ productCosts: "1", company, codes }),
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.rows))
          throw Error(
            body.error || "Não foi possível consultar os custos médios.",
          );
        if (!controller.signal.aborted) callback.current(company, body.rows);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [company, codes, units, refresh]);
  if (!codes) return null;
  return (
    <div className="crm-cost-refresh">
      <small>
        {busy
          ? "Consultando custos médios dos produtos…"
          : "Produtos: custo médio da empresa da proposta."}
      </small>
      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={() => setRefresh((n) => n + 1)}
      >
        <RefreshCw size={14} />
        Atualizar custos médios
      </button>
      {error && (
        <p role="alert" className="crm-error">
          {error} Os valores exibidos podem estar desatualizados.
        </p>
      )}
    </div>
  );
}

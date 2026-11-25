"use client";
import { useEffect, useRef, useState } from "react";
import type { OrderDraft } from "@/lib/service-orders/model";
import { taxKey } from "@/lib/crm/product-terms";
import ActionNotice from "./action-notice";
export default function CrmProductTaxes({
  draft,
  onChange,
  disabled = false,
}: {
  draft: OrderDraft;
  onChange: (draft: OrderDraft) => void;
  disabled?: boolean;
}) {
  const [types, setTypes] = useState<{ id: string; name: string }[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const latest = useRef(draft);
  latest.current = draft;
  const fingerprint = (d: OrderDraft) =>
    JSON.stringify(
      d.items.map((i) => taxKey(d, i)),
    );
  useEffect(() => {
    const controller = new AbortController();
    setTypes([]);
    if (!draft.company) return;
    fetch(
      "/api/crm?" +
        new URLSearchParams({ taxTypes: "1", company: draft.company }),
      { signal: controller.signal },
    )
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok || !Array.isArray(b.rows))
          throw Error(b.error || "Não foi possível carregar os tipos fiscais.");
        if (!controller.signal.aborted) setTypes(b.rows);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [draft.company]);
  async function simulate() {
    setBusy(true);
    setError("");
    const key = fingerprint(draft);
    try {
      const r = await fetch("/api/crm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "simulate-taxes", draft }),
        }),
        b = await r.json();
      if (!r.ok)
        throw Error(b.error || "Não foi possível calcular os impostos.");
      if (fingerprint(latest.current) !== key) {
        setError(
          "Os produtos foram alterados durante o cálculo. Calcule os impostos novamente.",
        );
        return;
      }
      const byKey = new Map<string, OrderDraft["items"][number]["taxes"]>(
        b.draft.items
          .filter((i: OrderDraft["items"][number]) => i.taxes)
          .map((i: OrderDraft["items"][number]) => [i.taxes!.key, i.taxes]),
      );
      onChange({
        ...latest.current,
        items: latest.current.items.map((i) => ({
          ...i,
          taxes: byKey.get(taxKey(latest.current, i)),
        })),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="crm-form-grid"
      aria-label="Impostos e entrega dos produtos"
    >
      <label>
        Tipo de orçamento fiscal (M8)
        <select
          disabled={disabled || busy}
          value={draft.commercial?.taxBudgetType || ""}
          onChange={(e) =>
            onChange({
              ...draft,
              commercial: {
                ...draft.commercial,
                taxBudgetType: e.target.value,
              },
            })
          }
        >
          <option value="">Selecione para calcular os impostos</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Prazo sem estoque (dias úteis)
        <input
          type="number"
          min="0"
          max="9999"
          step="1"
          disabled={disabled}
          value={draft.commercial?.deliveryDays || ""}
          onChange={(e) =>
            onChange({
              ...draft,
              commercial: { ...draft.commercial, deliveryDays: e.target.value },
            })
          }
        />
      </label>
      <div>
        <button
          type="button"
          disabled={disabled || busy || !draft.commercial?.taxBudgetType}
          onClick={() => void simulate()}
        >
          {busy ? "Calculando impostos…" : "Calcular impostos"}
        </button>
        <p className="data-note">
          Simulação por produto em reais. Ao salvar e gerar o PDF, os impostos
          são recalculados no M8. As alíquotas não são retornadas pela
          integração.
        </p>
      </div>
      {error && (
        <ActionNotice type="error" onClose={() => setError("")}>
          {error}
        </ActionNotice>
      )}
    </section>
  );
}

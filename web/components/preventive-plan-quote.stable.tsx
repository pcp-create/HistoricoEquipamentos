"use client";
import { apiFetch } from "@/lib/client-api-cache";
import { useEffect, useRef, useState } from "react";
import { companyName } from "@/lib/company-names";
export default function PreventivePlanQuote({
  equipment,
  plan,
  clients,
  onClose,
}: {
  equipment: string;
  plan: any;
  clients: { id: string; name: string; priority: number }[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef("");
  const [client, setClient] = useState(
    clients.length === 1 || clients[0]?.priority === 0 ? clients[0].id : "",
  );
  const [company, setCompany] = useState("1"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    request.current = crypto.randomUUID();
    dialog.current?.showModal();
  }, []);
  async function generate() {
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/api/equipment-management/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipment,
          planId: plan.id,
          version: plan.version,
          company,
          clientId: client,
          requestId: request.current,
        }),
      });
      if (response.status === 401) {
        window.location.assign(
          "/login?next=" +
            encodeURIComponent(
              window.location.pathname + window.location.search,
            ),
        );
        return;
      }
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "Não foi possível gerar o orçamento.");
      window.location.assign(`/orcamentos?id=${encodeURIComponent(result.id)}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="quote-catalog-dialog preventive-quote-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="plan-quote-title"
    >
      <header>
        <h2 id="plan-quote-title">Gerar orçamento</h2>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={onClose}
        >
          Fechar
        </button>
      </header>
      <p>
        <strong>{plan.document.name}</strong> ·{" "}
        {plan.document.items?.length || 0} materiais e serviços
      </p>
      <p>
        O rascunho será salvo e aberto na aba Orçamentos. Confira os valores da
        última venda do cliente/equipamento e ajuste os itens antes de enviar ao
        cliente. Na ausência de histórico compatível, usamos o preço do cadastro
        M8.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          generate();
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Empresa
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              {["1", "2", "27404"].map((id) => (
                <option key={id} value={id}>
                  {companyName(id)}
                </option>
              ))}
            </select>
          </label>
          {clients.length ? (
            <label>
              Cliente
              <select
                required
                value={client}
                onChange={(e) => setClient(e.target.value)}
              >
                <option value="">Selecione o cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p>
              Sem cliente vinculado. Selecione o cliente no rascunho antes de
              concluir o orçamento.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="catalog-editor-actions">
            <button
              className="catalog-save-button"
              disabled={!plan.document.items?.length}
            >
              {busy
                ? "Salvando rascunho…"
                : "Salvar rascunho e abrir orçamento"}
            </button>
          </div>
        </fieldset>
      </form>
    </dialog>
  );
}

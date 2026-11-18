"use client";
import { useEffect, useRef, useState } from "react";
import { crmApi } from "./crm-api";

/** Missing fiscal setup is resolved before requesting the customer-facing PDF. */
export default function CrmProposalPdf({
  proposal,
  disabled,
  locked,
  onSaved,
  onError,
}: {
  proposal: any;
  disabled: boolean;
  locked: boolean;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [choosing, setChoosing] = useState(false),
    [types, setTypes] = useState<{ id: string; name: string }[]>([]),
    [selected, setSelected] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    sending = useRef(false);
  useEffect(() => {
    if (choosing) dialog.current?.showModal();
  }, [choosing]);
  async function download() {
    const response = await fetch(
      "/api/crm/pdf?" + new URLSearchParams({ id: proposal.id }),
      { cache: "no-store" },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw Error(
        body.error || "Não foi possível gerar o PDF. Tente novamente.",
      );
    }
    if (!response.headers.get("content-type")?.includes("application/pdf"))
      throw Error("O servidor não retornou um PDF válido.");
    const url = URL.createObjectURL(await response.blob()),
      link = document.createElement("a");
    link.href = url;
    link.download = `proposta-${proposal.number}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function generate(saveType = false) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    onError("");
    let saved = false;
    try {
      const missing =
        proposal.document.items.some((i: any) => i.kind === "material") &&
        !proposal.document.commercial?.taxBudgetType;
      if (missing && !saveType) {
        if (locked)
          throw Error(
            "Conclua o envio pendente da OS antes de definir o tipo fiscal desta proposta.",
          );
        const result = await crmApi(
          "?" +
            new URLSearchParams({
              taxTypes: "1",
              company: proposal.document.company,
            }),
        );
        if (!Array.isArray(result.rows) || !result.rows.length)
          throw Error(
            "Nenhum tipo de orçamento fiscal ativo foi encontrado no M8.",
          );
        setTypes(result.rows);
        setSelected("");
        setChoosing(true);
        return;
      }
      if (saveType) {
        if (!types.some((t) => t.id === selected))
          throw Error("Selecione o tipo de orçamento fiscal.");
        await crmApi("", {
          action: "save-proposal",
          id: proposal.id,
          version: proposal.version,
          typeId: proposal.type_id,
          title: proposal.title,
          status: proposal.status,
          names: proposal.names,
          draft: {
            ...proposal.document,
            commercial: {
              ...proposal.document.commercial,
              taxBudgetType: selected,
            },
          },
        });
        saved = true;
        setChoosing(false);
      }
      await download();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      if (saved) await onSaved().catch((e) => onError(e.message));
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="button"
        disabled={disabled || busy}
        title={
          disabled ? "Salve a proposta para gerar o PDF atualizado." : undefined
        }
        onClick={() => void generate()}
      >
        {busy ? "Preparando PDF…" : "Gerar PDF da proposta"}
      </button>
      {choosing && (
        <dialog
          ref={dialog}
          className="crm-order-type-dialog"
          aria-label="Configurar impostos da proposta"
          onCancel={(e) => {
            if (busy) e.preventDefault();
            else setChoosing(false);
          }}
        >
          <h2>Impostos da proposta</h2>
          <p>
            Selecione o tipo de orçamento fiscal do M8 para calcular os impostos
            dos produtos. A seleção será salva nesta proposta.
          </p>
          <label>
            Tipo de orçamento fiscal
            <select
              aria-label="Tipo de orçamento fiscal para o PDF"
              disabled={busy}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Selecione</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="crm-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => setChoosing(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || !selected}
              onClick={() => void generate(true)}
            >
              {busy ? "Calculando impostos…" : "Salvar tipo fiscal e gerar PDF"}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}

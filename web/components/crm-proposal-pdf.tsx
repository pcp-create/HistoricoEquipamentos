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
  const [preview, setPreview] = useState("");
  const refreshAfterPreview = useRef(false);
  function closePreview() {
    setPreview("");
    if (refreshAfterPreview.current) {
      refreshAfterPreview.current = false;
      void onSaved().catch(e => onError(e.message));
    }
  }
  const previewDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (preview) previewDialog.current?.showModal();
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);
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
    setPreview(URL.createObjectURL(await response.blob()));
  }
  async function generate(saveType = false) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    onError("");
    let saved = false, displayed = false;
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
      displayed = true;
      refreshAfterPreview.current = saved;
    } catch (e) {
      onError((e as Error).message);
    } finally {
      if (saved && !displayed) await onSaved().catch((e) => onError(e.message));
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
      {preview && (
        <dialog ref={previewDialog} aria-label="Pré-visualização da proposta"
          onCancel={closePreview}
          style={{ width: "95vw", maxWidth: "1400px", height: "90dvh", padding: "16px", border: "1px solid #cbd5e1", borderRadius: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
            <strong>Proposta PROP-{proposal.number}</strong>
            <div className="crm-actions">
              <a className="button" href={preview} download={`proposta-${proposal.number}.pdf`}>Baixar PDF</a>
              <button type="button" aria-label="Fechar pré-visualização" onClick={closePreview}>Fechar</button>
            </div>
          </div>
          <iframe title="PDF da proposta" src={preview} style={{ width: "100%", height: "calc(100% - 65px)", border: 0 }} />
        </dialog>
      )}
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

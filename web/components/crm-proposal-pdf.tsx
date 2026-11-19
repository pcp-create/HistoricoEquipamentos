"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Download, FileText, Receipt } from "lucide-react";
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
  const [options, setOptions] = useState(false);
  const exportControl = useRef<HTMLDivElement>(null);
  const exportButton = useRef<HTMLButtonElement>(null);
  const optionsId = useId();
  useEffect(() => {
    if (!options) return;
    function outside(event: PointerEvent) {
      if (!exportControl.current?.contains(event.target as Node)) setOptions(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOptions(false);
        exportButton.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [options]);
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
  async function download(includeTaxes: boolean) {
    const response = await fetch(
      "/api/crm/pdf?" + new URLSearchParams({ id: proposal.id, taxes: includeTaxes ? "1" : "0" }),
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
  async function generate(saveType = false, includeTaxes = true) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    onError("");
    let saved = false, displayed = false;
    try {
      const missing =
        proposal.document.items.some((i: any) => i.kind === "material") &&
        !proposal.document.commercial?.taxBudgetType;
      if (includeTaxes && missing && !saveType) {
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
      await download(includeTaxes);
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
      <div className="crm-pdf-export" ref={exportControl}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setOptions(false);
        }}>
        <button ref={exportButton} type="button" className="button crm-pdf-export-trigger"
          disabled={disabled || busy} aria-expanded={options} aria-controls={optionsId}
          title={disabled ? "Salve a proposta para gerar o PDF atualizado." : undefined}
          onClick={() => setOptions(value => !value)}>
          <Download size={18} aria-hidden="true" />
          {busy ? "Preparando PDF…" : "Exportar PDF"}
          <ChevronDown size={15} aria-hidden="true" />
        </button>
        {options && <div id={optionsId} className="crm-pdf-export-options" role="group" aria-label="Opções de exportação">
          <button type="button" aria-label="Gerar Proposta com Impostos"
            onClick={() => { setOptions(false); void generate(false, true); }}>
            <Receipt size={20} aria-hidden="true" />
            <span><strong>Gerar Proposta com Impostos</strong><small>Calcula e exibe os impostos dos produtos.</small></span>
          </button>
          <button type="button" aria-label="Gerar Proposta sem Impostos"
            onClick={() => { setOptions(false); void generate(false, false); }}>
            <FileText size={20} aria-hidden="true" />
            <span><strong>Gerar Proposta sem Impostos</strong><small>Gera a proposta sem calcular ou exibir impostos.</small></span>
          </button>
        </div>}
      </div>
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

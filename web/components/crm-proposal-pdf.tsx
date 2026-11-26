"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Download, FileText, Receipt } from "lucide-react";

/** Fiscal setup is resolved server-side from the proposal type catalog. */
export default function CrmProposalPdf({
  proposal,
  disabled,
  onError,
}: {
  proposal: any;
  disabled: boolean;
  locked: boolean;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
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
  function closePreview() { setPreview(""); }
  const previewDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (preview) previewDialog.current?.showModal();
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);
  const sending = useRef(false);
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
  async function generate(includeTaxes: boolean) {
    if(sending.current)return;
    sending.current=true;setBusy(true);onError("");
    try{await download(includeTaxes);}catch(e){onError((e as Error).message);}
    finally{sending.current=false;setBusy(false);}
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
          onClick={() => proposal.workflow?.state === 'sent' ? void generate(true) : setOptions(value => !value)}>
          <Download size={18} aria-hidden="true" />
          {busy ? "Preparando PDF…" : proposal.workflow?.state === 'sent' ? "PDF enviado" : "Exportar PDF"}
          {proposal.workflow?.state !== 'sent' && <ChevronDown size={15} aria-hidden="true" />}
        </button>
        {options && <div id={optionsId} className="crm-pdf-export-options" role="group" aria-label="Opções de exportação">
          <button type="button" aria-label="Gerar Proposta com Impostos"
            disabled={!!proposal.lead_id} title={proposal.lead_id?'Vincule a oportunidade a um cliente no M8 para calcular impostos.':undefined}
            onClick={() => { setOptions(false); void generate(true); }}>
            <Receipt size={20} aria-hidden="true" />
            <span><strong>Gerar Proposta com Impostos</strong><small>{proposal.lead_id?'Disponível após vincular um cliente no M8.':'Calcula e exibe os impostos dos produtos.'}</small></span>
          </button>
          <button type="button" aria-label="Gerar Proposta sem Impostos"
            onClick={() => { setOptions(false); void generate(false); }}>
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

    </>
  );
}

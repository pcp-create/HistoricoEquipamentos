"use client";
import { useEffect, useRef, useState } from "react";
import { Mail, MessageCircle, CheckCheck, Download, Send } from "lucide-react";
import { crmApi } from "./crm-api";

export default function CrmProposalDelivery({
  proposal,
  onEmail,
  onClose,
  onSent,
}: {
  proposal: any;
  onEmail: () => void;
  onClose: () => void;
  onSent: () => Promise<void>;
}) {
  const ready = proposal.workflow?.state === "reviewed";
  const dialog = useRef<HTMLDialogElement>(null),
    working = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [taxes, setTaxes] = useState(!proposal.lead_id);
  const [message, setMessage] = useState(() => `Olá! Tudo bem?

Segue nossa proposta comercial PROP-${proposal.number}${proposal.title ? ` — ${proposal.title}` : ''}, em PDF, para sua avaliação.

Ficamos à disposição para esclarecer dúvidas e ajustar o que for necessário.

Atenciosamente,
RJ Compressores`);
  const [prepared, setPrepared] = useState<{
      deliveryId: string;
      filename: string;
      file: File;
      url: string;
    } | null>(null),
    [opened, setOpened] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(
    () => () => {
      if (prepared) URL.revokeObjectURL(prepared.url);
    },
    [prepared],
  );
  async function prepare(channel: "whatsapp" | "manual") {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await crmApi("", {
        action: "prepare-external-delivery",
        id: proposal.id,
        version: proposal.version,
        channel,
        includeTaxes: taxes,
      });
      if (channel === "manual") {
        await crmApi("", {
          action: "confirm-external-delivery",
          id: proposal.id,
          deliveryId: result.deliveryId,
          confirmed: true,
        });
        await onSent();
        onClose();
      } else {
        const file = new File(
          [Uint8Array.from(atob(result.pdf), (c) => c.charCodeAt(0))],
          result.filename,
          { type: "application/pdf" },
        );
        setPrepared({
          deliveryId: result.deliveryId,
          filename: result.filename,
          file,
          url: URL.createObjectURL(file),
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function share() {
    if (!prepared || working.current) return;
    setError("");
    try {
      if (navigator.canShare?.({ files: [prepared.file] }) && navigator.share) {
        working.current = true;
        setBusy(true);
        await navigator.share({
          files: [prepared.file],
          title: `Proposta PROP-${proposal.number}`,
          text: message,
        });
        setOpened(true);
      } else {
        const a = document.createElement("a");
        a.href = prepared.url;
        a.download = prepared.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.open(
          "https://wa.me/?text=" +
            encodeURIComponent(message),
          "_blank",
          "noopener,noreferrer",
        );
        setOpened(true);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setError(
          "Não foi possível compartilhar. Baixe o PDF e anexe-o no WhatsApp.",
        );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function confirm() {
    if (!prepared || working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      await crmApi("", {
        action: "confirm-external-delivery",
        id: proposal.id,
        deliveryId: prepared.deliveryId,
        confirmed: true,
      });
      await onSent();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="crm-dialog crm-proposal-flow-dialog"
      aria-label="Enviar proposta ao cliente"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2>{prepared ? "Enviar via WhatsApp" : "Enviar proposta ao cliente"}</h2>
      {!ready && (
        <p>
          Conclua a revisão na etapa Revisada antes de registrar ou enviar a
          proposta ao cliente.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {!prepared ? (
        <>
          <div className="crm-delivery-options">
            <button type="button" disabled={busy || !ready} onClick={onEmail}>
              <Mail size={22} />
              <span>
                <strong>Enviar via e-mail</strong>
                <small>
                  Selecionar destinatários e enviar a proposta por e-mail.
                </small>
              </span>
            </button>
            <button
              type="button"
              disabled={busy || !ready}
              onClick={() => void prepare("whatsapp")}
            >
              <MessageCircle size={22} />
              <span>
                <strong>Enviar via WhatsApp</strong>
                <small>Preparar o PDF e abrir o compartilhamento.</small>
              </span>
            </button>
            <button
              type="button"
              disabled={busy || !ready}
              onClick={() => void prepare("manual")}
            >
              <CheckCheck size={22} />
              <span>
                <strong>Proposta já enviada</strong>
                <small>Registrar como enviada, sem enviar uma mensagem.</small>
              </span>
            </button>
          </div>
          <button
            type="button"
            className="crm-delivery-tax-switch"
            role="switch"
            aria-checked={taxes}
            disabled={busy || !!proposal.lead_id}
            onClick={() => setTaxes(value => !value)}
          >
            <span className="crm-delivery-tax-track" aria-hidden="true"><span /></span>
            <span>Incluir impostos no PDF do WhatsApp ou no registro da proposta já enviada</span>
          </button>
        </>
      ) : (
        <>
          <p>
            PDF preparado: <strong>{prepared.filename}</strong>
          </p>
          <p>
            No celular, selecione o WhatsApp no compartilhamento. No computador,
            anexe o PDF baixado à conversa.
          </p>
          <label className="crm-whatsapp-message">
            Mensagem para o cliente
            <textarea rows={8} value={message} disabled={busy} onChange={e => setMessage(e.target.value)} />
          </label>
          <div className="crm-actions crm-whatsapp-share-actions">
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => void share()}
            >
              <Send size={16} />
              Abrir WhatsApp
            </button>
            <a
              className="button"
              href={prepared.url}
              download={prepared.filename}
              onClick={() => setOpened(true)}
            >
              <Download size={16} />
              Baixar PDF
            </a>
          </div>
        </>
      )}
      {prepared && <p className="crm-whatsapp-confirm-note">Após enviar ao cliente, confirme abaixo para atualizar o status.</p>}
      <div className="crm-actions crm-delivery-footer">
        <button type="button" className="button" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        {busy && <span role="status">Processando…</span>}
        {prepared && <button type="button" className="button primary" disabled={busy || !opened} onClick={() => void confirm()}><CheckCheck size={16} />Já enviei pelo WhatsApp</button>}
      </div>
    </dialog>
  );
}

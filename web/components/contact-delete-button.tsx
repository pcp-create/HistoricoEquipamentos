"use client";
import ActionNotice from "./action-notice";
import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
export default function ContactDeleteButton({
  customer,
  contact,
  onDeleted,
  disabled = false,
  iconOnly = false,
  className,
}: {
  customer: string;
  contact: any;
  onDeleted: () => void;
  disabled?: boolean;
  iconOnly?: boolean;
  className?: string;
}) {
  const sending = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function remove() {
    if (
      sending.current ||
      !window.confirm(
        'Excluir o contato "' +
          contact.name +
          '" do sistema? O histórico das visitas será preservado. O cadastro no M8 não será excluído.',
      )
    )
      return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/customer-contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          contactId: contact.id,
          version: contact.job_version,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error || "Não foi possível excluir o contato.");
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className={className}
        title={busy ? "Excluindo contato…" : "Excluir contato"}
        aria-busy={busy}
        disabled={disabled || busy}
        aria-label={"Excluir contato " + contact.name}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void remove();
        }}
      >
        <Trash2 size={15} />
        {!iconOnly && (busy ? "Excluindo…" : "Excluir")}
      </button>
      {error && <ActionNotice type="error" onClose={()=>setError('')}>{error}</ActionNotice>}
    </>
  );
}
